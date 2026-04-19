import { z } from 'zod';
import { supabase, supabaseAdmin } from '@/lib/db/supabase';
import {
  buildRecommendations,
  buildTopDiagnoses,
  calculateAnnualAverageIncome,
  calculateAvailableMoney,
  calculateExtendedMRF,
  calculateImmediateMRF,
  calculateMonthlyOFH,
  calculateRegularIncome,
  calculateWeeklyOFH
} from '@/lib/financial/engine';
import { calculateFinancialPressure, generateFinancialInsight } from '@/lib/finance/financialPressure';
import { calculateFinancialRadar, type FinancialRadar } from '@/lib/finance/financialRadar';
import { calculateFinancialStatus, type FinancialStatus } from '@/lib/finance/financialStatus';
import { getPriorityDiagnostics, type PriorityDiagnostic } from '@/lib/finance/priorityDiagnostics';
import { buildHouseholdRecommendationContext } from '@/lib/finance/recommendationContext';
import type { TransactionIntent } from '@/lib/ai/transactionInterpreter';
import { buildInitialIndicators, onboardingPayloadSchema, type OnboardingPayload } from '@/lib/onboarding/flow';

const DEV_FALLBACK_PROFILE_ID = '00000000-0000-4000-8000-000000000001';

export const onboardingSchema = onboardingPayloadSchema;

export const simulationSchema = z.object({
  strategy: z.enum(['pagar_deuda', 'fortalecer_fondo', 'guardar_efectivo', 'mixta', 'apartar_meta']),
  amount: z.number().positive()
});

export const conversationalPayloadSchema = z.object({
  rawText: z.string().min(1),
  confirmed: z.boolean().default(false)
});

export const movementEditSchema = z.object({
  movementId: z.string().min(1),
  description: z.string().trim().min(1, 'La descripción es obligatoria.'),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0.'),
  sourceAccountId: z.string().min(1).nullable().optional(),
  destinationAccountId: z.string().min(1).nullable().optional()
});

export const movementDeleteSchema = z.object({
  movementId: z.string().min(1)
});

const accountTypeValues = ['operativa', 'fondo', 'inversion', 'deuda', 'por_cobrar', 'operational_cash', 'savings_fund', 'investment', 'credit_card', 'loan', 'receivable'] as const;

const managedAccountTypeValues = ['operational_cash', 'savings_fund', 'investment', 'credit_card', 'loan', 'receivable'] as const;

export const accountTypeSchema = z.enum(managedAccountTypeValues);

export const accountUpsertSchema = z.object({
  accountId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'El nombre es obligatorio.'),
  type: accountTypeSchema,
  balance: z.coerce.number().min(0, 'El saldo o monto debe ser mayor o igual a 0.'),
  periodicPayment: z.coerce.number().min(0, 'El pago periódico debe ser mayor o igual a 0.').nullable().optional(),
  paymentDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  counterparty: z.string().trim().nullable().optional()
});

export const accountDeactivateSchema = z.object({
  accountId: z.string().uuid()
});

export const accountUpdateSchema = accountUpsertSchema.extend({
  accountId: z.string().uuid()
});

export type AccountOption = {
  id: string;
  name: string;
  type: string;
};

export type ManagedAccount = AccountOption & {
  balance: number;
  isActive: boolean;
  periodicPayment: number | null;
  paymentDay: number | null;
  counterparty: string | null;
};

export type RegistrationSetupStatus = {
  hasHousehold: boolean;
  accounts: AccountOption[];
};

export type MovementHistoryItem = {
  id: string;
  fecha: string;
  tipoMovimiento: string;
  categoria: string;
  descripcion: string;
  monto: number;
  cuentaOrigen: string | null;
  cuentaDestino: string | null;
  puedeEditar: boolean;
  motivoNoEditable: string | null;
};

export type MovementsHistoryData = {
  hasHousehold: boolean;
  movements: MovementHistoryItem[];
};

type JournalLine = {
  accountId: string | null;
  type: 'debit' | 'credit';
  category: string;
  amount: number;
};

type SupportedMovementAction = TransactionIntent['action'];

type StoredMovementDescriptor = {
  action: SupportedMovementAction;
  amount: number;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
};

type AccountState = AccountOption & {
  householdId: string;
  balance: number;
};

type DashboardData = {
  hasHousehold: boolean;
  monthlyOFH: number;
  weeklyOFH: number;
  availableMoney: number;
  diagnoses: string[];
  recommendations: string[];
  financialPressure: {
    requiredMoney: number;
    availableMoney: number;
    gap: number;
    status: 'healthy' | 'warning' | 'critical';
    breakdown: {
      debts: number;
      fixedExpenses: number;
      operationalEstimate: number;
    };
  } | null;
  financialInsight: {
    explanation: string;
    topCauses: string[];
    suggestions: string[];
  } | null;
  financialRadar: FinancialRadar | null;
  financialStatus: FinancialStatus | null;
  priorityDiagnostics: PriorityDiagnostic[];
};

type SupabaseClientLike = typeof supabaseAdmin;

function logDebug(message: string, payload?: Record<string, unknown>) {
  console.info(`[onboarding-debug] ${message}`, payload ?? {});
}

async function getProfileIdFromExistingMembership(client: SupabaseClientLike) {
  const { data, error } = await client
    .from('household_members')
    .select('profile_id,household_id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  logDebug('Lookup profile desde household_members', {
    rawResult: data ?? null,
    error: error?.message ?? null
  });

  if (error) return undefined;
  return data?.profile_id as string | undefined;
}

async function getAnyExistingProfileId(client: SupabaseClientLike) {
  const { data, error } = await client.from('profiles').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  logDebug('Lookup profile desde profiles', {
    rawResult: data ?? null,
    error: error?.message ?? null
  });

  if (error) return undefined;
  return data?.id as string | undefined;
}

async function getAuthProfileId(client: SupabaseClientLike) {
  const auth = (client as unknown as { auth?: { getUser?: () => Promise<{ data?: { user?: { id?: string } }; error?: { message?: string } }> } }).auth;
  if (!auth?.getUser) return undefined;

  const { data, error } = await auth.getUser();
  logDebug('Lookup profile desde auth', {
    profileId: data?.user?.id ?? null,
    error: error?.message ?? null
  });

  if (error || !data?.user?.id) return undefined;
  return data.user.id;
}

async function resolveActiveProfileId(client: SupabaseClientLike) {
  const fromDevEnv = process.env.DEV_PROFILE_ID;
  if (fromDevEnv) {
    return { activeProfileId: fromDevEnv, source: 'env_dev_profile_id' as const };
  }

  const fromPublicDevEnv = process.env.NEXT_PUBLIC_DEV_PROFILE_ID;
  if (fromPublicDevEnv) {
    return { activeProfileId: fromPublicDevEnv, source: 'env_next_public_dev_profile_id' as const };
  }

  const fromAuth = await getAuthProfileId(client);
  if (fromAuth) {
    return { activeProfileId: fromAuth, source: 'auth' as const };
  }

  const fromMembership = await getProfileIdFromExistingMembership(client);
  if (fromMembership) {
    return { activeProfileId: fromMembership, source: 'membership' as const };
  }

  const existingProfile = await getAnyExistingProfileId(client);
  if (existingProfile) {
    return { activeProfileId: existingProfile, source: 'profiles' as const };
  }

  return { activeProfileId: DEV_FALLBACK_PROFILE_ID, source: 'fallback' as const };
}

export async function getOrCreateActiveProfileId(client: SupabaseClientLike = supabaseAdmin) {
  const { activeProfileId, source } = await resolveActiveProfileId(client);

  const { data: existingProfile, error: lookupError } = await client
    .from('profiles')
    .select('id')
    .eq('id', activeProfileId)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`No fue posible resolver el perfil activo: ${lookupError.message}`);
  }

  if (!existingProfile?.id) {
    const { error: upsertError } = await client.from('profiles').upsert({
      id: activeProfileId,
      full_name: 'Usuario local'
    });

    if (upsertError) {
      throw new Error(`No fue posible crear el perfil activo: ${upsertError.message}`);
    }
  }

  logDebug('Perfil activo resuelto', { activeProfileId, source });
  return activeProfileId;
}

export async function getDefaultHouseholdId(client: SupabaseClientLike = supabaseAdmin) {
  const profileId = await getOrCreateActiveProfileId(client);

  const { data: membership, error } = await client
    .from('household_members')
    .select('household_id,profile_id')
    .eq('profile_id', profileId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  logDebug('Query household_members por profile_id', {
    profileId,
    rawResult: membership ?? null,
    error: error?.message ?? null
  });

  if (error) {
    throw new Error(`No fue posible resolver el hogar del perfil: ${error.message}`);
  }

  const householdId = membership?.household_id as string | undefined;
  logDebug('Hogar por perfil resuelto', {
    profileId,
    householdId: householdId ?? null,
    readMode: householdId ? 'db_result' : 'fallback_empty'
  });
  return householdId;
}

export async function hasOnboardingForActiveProfile() {
  const householdId = await getDefaultHouseholdId();
  return Boolean(householdId);
}

export async function createHouseholdOnboarding(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input: OnboardingPayload = onboardingPayloadSchema.parse(rawInput);
  const profileId = await getOrCreateActiveProfileId(client);

  const existingHouseholdId = await getDefaultHouseholdId(client);
  if (existingHouseholdId) {
    logDebug('Onboarding omitido porque ya existe hogar para perfil', { profileId, existingHouseholdId });
    const indicators = buildInitialIndicators(input);
    return {
      householdId: existingHouseholdId,
      indicators
    };
  }

  const { data: household, error: householdError } = await client
    .from('households')
    .insert({ name: input.householdName })
    .select('id')
    .single();

  if (householdError || !household?.id) {
    throw new Error(householdError?.message ?? 'No fue posible crear el hogar.');
  }

  const householdId = household.id as string;

  const { error: membershipError } = await client.from('household_members').insert({
    household_id: householdId,
    profile_id: profileId,
    role: 'owner'
  });

  if (membershipError) {
    throw new Error(`No fue posible vincular el perfil al hogar: ${membershipError.message}`);
  }

  const accountPayload = [
    ...input.operationalAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'operativa', balance: (item.saldoInicial ?? 0).toFixed(2), is_active: true })),
    ...input.fundAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'fondo', balance: (item.saldoInicial ?? 0).toFixed(2), is_active: true })),
    ...input.debtAccounts.map((item) => ({
      household_id: householdId,
      name: item.nombre,
      type: 'deuda',
      balance: (item.saldoInicial ?? 0).toFixed(2),
      periodic_payment: item.pagoPeriodico ? item.pagoPeriodico.toFixed(2) : null,
      payment_day: item.diaPago ?? null,
      is_active: true
    })),
    ...input.receivables.map((item) => ({
      household_id: householdId,
      name: item.nombre,
      type: 'por_cobrar',
      balance: item.monto.toFixed(2),
      counterparty: item.contraparte,
      is_active: true
    }))
  ];

  if (accountPayload.length > 0) {
    const { error } = await client.from('accounts').insert(accountPayload);
    if (error) throw new Error(error.message);
  }

  const incomePayload = [
    ...input.regularIncomes.map((item) => ({ household_id: householdId, name: `${item.nombre} (${item.periodicidad ?? 'mensual'})`, amount: item.monto.toFixed(2), recurring: true })),
    ...input.extraordinaryIncomes.map((item) => ({ household_id: householdId, name: `${item.nombre}${item.mesEsperado ? ` (mes ${item.mesEsperado})` : ''}`, amount: item.monto.toFixed(2), recurring: false }))
  ];

  if (incomePayload.length > 0) {
    const { error } = await client.from('income_sources').insert(incomePayload);
    if (error) throw new Error(error.message);
  }

  const obligationsPayload = [
    ...input.fixedExpenses.map((item) => ({
      household_id: householdId,
      name: item.nombre,
      amount: item.monto.toFixed(2),
      due_day: null as number | null
    })),
    ...input.debtAccounts
      .filter((item) => (item.pagoPeriodico ?? 0) > 0)
      .map((item) => ({
        household_id: householdId,
        name: `Pago ${item.nombre}`,
        amount: (item.pagoPeriodico ?? 0).toFixed(2),
        due_day: item.diaPago ?? null
      }))
  ];

  if (obligationsPayload.length > 0) {
    const { error } = await client.from('obligations').insert(obligationsPayload);
    if (error) throw new Error(error.message);
  }

  if (input.variableSpending.length > 0) {
    const { error } = await client.from('variable_spending_profiles').insert(
      input.variableSpending.map((item) => ({
        household_id: householdId,
        category: item.nombre,
        monthly_estimate: item.monto.toFixed(2)
      }))
    );

    if (error) throw new Error(error.message);
  }

  if (input.receivables.length > 0) {
    const { error } = await client.from('receivables').insert(
      input.receivables.map((item) => ({
        household_id: householdId,
        counterparty: item.contraparte || item.nombre,
        original_amount: item.monto.toFixed(2),
        pending_amount: item.monto.toFixed(2),
        status: 'activo'
      }))
    );

    if (error) throw new Error(error.message);
  }

  const indicators = buildInitialIndicators(input);
  const { data: snapshot, error: snapshotError } = await client
    .from('financial_snapshots')
    .insert({
      household_id: householdId,
      period_type: 'onboarding_inicial',
      payload: JSON.stringify(indicators)
    })
    .select('id')
    .single();

  if (snapshotError) throw new Error(snapshotError.message);

  logDebug('Onboarding persistido correctamente', {
    profileId,
    householdId,
    insertedAccounts: accountPayload.length,
    snapshotId: snapshot?.id ?? null
  });

  return {
    householdId,
    indicators
  };
}


function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSnapshotPayload(rawPayload: unknown): DashboardData {
  const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : (rawPayload as Record<string, unknown>);

  const monthlyOFH = toFiniteNumber(payload?.monthlyOFH, 0);
  const weeklyOFH = toFiniteNumber(payload?.weeklyOFH, calculateWeeklyOFH(monthlyOFH));
  const availableMoney = toFiniteNumber(payload?.availableMoney, 0);
  const diagnoses = Array.isArray(payload?.diagnoses) ? payload.diagnoses.filter((x: unknown): x is string => typeof x === 'string') : [];
  const recommendations = Array.isArray(payload?.recommendations) ? payload.recommendations.filter((x: unknown): x is string => typeof x === 'string') : [];
  const rawFinancialPressure =
    payload && typeof payload.financialPressure === 'object' && payload.financialPressure !== null
      ? (payload.financialPressure as Record<string, unknown>)
      : null;
  const normalizedStatus = rawFinancialPressure?.status;
  const rawBreakdown =
    rawFinancialPressure && typeof rawFinancialPressure.breakdown === 'object' && rawFinancialPressure.breakdown !== null
      ? (rawFinancialPressure.breakdown as Record<string, unknown>)
      : null;
  const financialPressure =
    rawFinancialPressure && (normalizedStatus === 'healthy' || normalizedStatus === 'warning' || normalizedStatus === 'critical')
      ? {
          requiredMoney: toFiniteNumber(rawFinancialPressure.requiredMoney, 0),
          availableMoney: toFiniteNumber(rawFinancialPressure.availableMoney, 0),
          gap: toFiniteNumber(rawFinancialPressure.gap, 0),
          status: normalizedStatus,
          breakdown: {
            debts: toFiniteNumber(rawBreakdown?.debts, 0),
            fixedExpenses: toFiniteNumber(rawBreakdown?.fixedExpenses, 0),
            operationalEstimate: toFiniteNumber(rawBreakdown?.operationalEstimate, 0)
          }
        }
      : null;
  const rawFinancialInsight =
    payload && typeof payload.financialInsight === 'object' && payload.financialInsight !== null
      ? (payload.financialInsight as Record<string, unknown>)
      : null;
  const financialInsight =
    rawFinancialInsight && typeof rawFinancialInsight.explanation === 'string'
      ? {
          explanation: rawFinancialInsight.explanation,
          topCauses: Array.isArray(rawFinancialInsight.topCauses)
            ? rawFinancialInsight.topCauses.filter((x: unknown): x is string => typeof x === 'string')
            : [],
          suggestions: Array.isArray(rawFinancialInsight.suggestions)
            ? rawFinancialInsight.suggestions.filter((x: unknown): x is string => typeof x === 'string')
            : []
        }
      : null;
  const rawFinancialInput =
    payload && typeof payload.financialInput === 'object' && payload.financialInput !== null
      ? (payload.financialInput as Record<string, unknown>)
      : null;
  const recurringObligationsMonthly =
    toFiniteNumber(rawFinancialInput?.fixedExpenses, 0)
    + toFiniteNumber(rawFinancialInput?.debtPayments, 0)
    + toFiniteNumber(rawFinancialInput?.avgVariableExpenses, 0);
  const financialStatus = calculateFinancialStatus({
    regularIncomeMonthly: toFiniteNumber(rawFinancialInput?.regularIncomeMonthly, payload?.regularIncomeMonthly as number ?? 0),
    annualExtraIncome: toFiniteNumber(rawFinancialInput?.annualExtraIncome, 0),
    recurringObligationsMonthly,
    debtPaymentsMonthly: toFiniteNumber(rawFinancialInput?.debtPayments, rawBreakdown?.debts),
    debtBalance: toFiniteNumber(rawFinancialInput?.debtBalance, 0),
    protectedSavings: toFiniteNumber(rawFinancialInput?.liquidFunds, 0) + toFiniteNumber(rawFinancialInput?.liquidInvestments, 0),
    operativeMoney: toFiniteNumber(rawFinancialInput?.operativeMoney, payload?.availableMoney as number ?? 0)
  });

  const priorityDiagnostics = getPriorityDiagnostics({
    radar: null,
    financialStatus,
    financialPressure,
    existingDiagnoses: diagnoses
  });

  return {
    hasHousehold: true,
    monthlyOFH,
    weeklyOFH,
    availableMoney,
    diagnoses: diagnoses.length ? diagnoses : ['Sin diagnósticos disponibles por el momento.'],
    recommendations: recommendations.length ? recommendations : ['Aún no hay recomendaciones; registra movimientos para enriquecer el análisis.'],
    financialPressure,
    financialInsight,
    financialRadar: null,
    financialStatus,
    priorityDiagnostics
  };
}

export async function getDashboardData(client: SupabaseClientLike = supabaseAdmin): Promise<DashboardData> {
  const householdId = await getDefaultHouseholdId(client);
  logDebug('Dashboard household resolution', { householdId: householdId ?? null });

  if (!householdId) {
    logDebug('Dashboard fallback', { reason: 'no_household' });
    return {
      hasHousehold: false,
      monthlyOFH: 0,
      weeklyOFH: 0,
      availableMoney: 0,
      diagnoses: ['Completa tu onboarding para obtener diagnóstico.'],
      recommendations: ['Configura hogar, cuentas e ingresos iniciales para activar recomendaciones.'],
      financialPressure: null,
      financialInsight: null,
      financialRadar: null,
      financialStatus: null,
      priorityDiagnostics: []
    };
  }

  const { data } = await client
    .from('financial_snapshots')
    .select('payload')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  logDebug('Dashboard snapshot lookup', { householdId, snapshotFound: Boolean(data?.payload) });

  if (!data?.payload) {
    logDebug('Dashboard fallback', { reason: 'no_snapshot', householdId });
    return {
      hasHousehold: true,
      monthlyOFH: 0,
      weeklyOFH: 0,
      availableMoney: 0,
      diagnoses: ['Sin snapshot financiero inicial todavía.'],
      recommendations: ['Finaliza onboarding para generar indicadores automáticos.'],
      financialPressure: null,
      financialInsight: null,
      financialRadar: null,
      financialStatus: null,
      priorityDiagnostics: []
    };
  }

  const parsed = normalizeSnapshotPayload(data.payload);

  let recommendationContext = null;
  try {
    recommendationContext = await buildHouseholdRecommendationContext(householdId, client);
  } catch (error) {
    logDebug('Priority diagnostics context fallback', {
      householdId,
      reason: error instanceof Error ? error.message : 'unknown'
    });
  }

  const financialRadar = recommendationContext?.projected.radar ?? await getFinancialRadar(householdId, client);
  parsed.financialRadar = financialRadar;
  parsed.priorityDiagnostics = getPriorityDiagnostics({
    radar: parsed.financialRadar,
    financialStatus: recommendationContext?.projected.status ?? parsed.financialStatus,
    financialPressure: parsed.financialPressure,
    recommendationContext,
    existingDiagnoses: parsed.diagnoses
  });
  return parsed;
}

export async function getFinancialRadar(householdId?: string, client: SupabaseClientLike = supabaseAdmin): Promise<FinancialRadar | null> {
  const resolvedHouseholdId = householdId ?? await getDefaultHouseholdId(client);
  if (!resolvedHouseholdId) return null;

  try {
    const recommendationContext = await buildHouseholdRecommendationContext(resolvedHouseholdId, client);
    return recommendationContext.projected.radar;
  } catch (error) {
    logDebug('Radar context fallback', {
      householdId: resolvedHouseholdId,
      reason: error instanceof Error ? error.message : 'unknown'
    });
  }

  const [accountsResult, obligationsResult, variableSpendingResult, groupsResult] = await Promise.all([
    client.from('accounts').select('name,type,balance').eq('household_id', resolvedHouseholdId).eq('is_active', true),
    client.from('obligations').select('name,amount,due_day').eq('household_id', resolvedHouseholdId),
    client.from('variable_spending_profiles').select('monthly_estimate').eq('household_id', resolvedHouseholdId),
    client.from('transaction_groups').select('id').eq('household_id', resolvedHouseholdId)
  ]);
  const groupIds = ((groupsResult.data ?? []) as Array<{ id: string }>).map((group) => group.id);
  const transactionsResult = groupIds.length
    ? await client
        .from('transactions')
        .select('type,amount,happened_at')
        .in('group_id', groupIds)
        .order('happened_at', { ascending: false })
        .limit(60)
    : { data: [], error: null };

  const accounts = ((accountsResult.data ?? []) as Array<{ name?: string | null; type: string; balance: string | number }>)
    .map((account) => ({
      name: account.name ?? '',
      type: account.type,
      balance: toFiniteNumber(account.balance, 0)
    }));

  const obligations = ((obligationsResult.data ?? []) as Array<{ name?: string; amount: string | number; due_day: number | null }>)
    .map((obligation) => ({
      name: obligation.name ?? '',
      amount: toFiniteNumber(obligation.amount, 0),
      dueDay: obligation.due_day
    }));

  const recentTransactions = ((transactionsResult.data ?? []) as Array<{ type: string; amount: string | number; happened_at?: string | null }>)
    .map((tx) => ({
      type: tx.type,
      amount: toFiniteNumber(tx.amount, 0),
      happenedAt: tx.happened_at ?? null
    }));

  const fallbackMonthlyEstimate = ((variableSpendingResult.data ?? []) as Array<{ monthly_estimate: string | number }>)
    .reduce((acc, item) => acc + toFiniteNumber(item.monthly_estimate, 0), 0);

  return calculateFinancialRadar({
    accounts,
    obligations,
    recentTransactions,
    fallbackMonthlyEstimate
  });
}

export async function getAccountsForRegistration(client: SupabaseClientLike = supabaseAdmin): Promise<AccountOption[]> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    logDebug('Cuentas lookup fallback', { reason: 'no_household' });
    return [];
  }

  const { data } = await client
    .from('accounts')
    .select('id,name,type')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .order('name');

  const accounts = (data ?? []) as AccountOption[];
  logDebug('Cuentas lookup', { householdId, accountCount: accounts.length, readMode: 'db_result' });
  return accounts;
}

export async function getAccountsForManagement(client: SupabaseClientLike = supabaseAdmin): Promise<ManagedAccount[]> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) return [];

  const { data, error } = await client
    .from('accounts')
    .select('id,name,type,balance,is_active,periodic_payment,payment_day,counterparty')
    .eq('household_id', householdId)
    .order('type')
    .order('name');

  if (error) {
    throw new Error(`No fue posible leer cuentas del hogar: ${error.message}`);
  }

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    type: string;
    balance: string;
    is_active: boolean | null;
    periodic_payment: string | null;
    payment_day: number | null;
    counterparty: string | null;
  }>)
    .filter((account) => accountTypeValues.includes(account.type as (typeof accountTypeValues)[number]))
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: Number(account.balance),
      isActive: account.is_active !== false,
      periodicPayment: account.periodic_payment === null ? null : Number(account.periodic_payment),
      paymentDay: account.payment_day ?? null,
      counterparty: account.counterparty ?? null
    }));
}

export async function createAccount(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    throw new Error('No existe un hogar configurado para crear cuentas.');
  }

  const input = accountUpsertSchema.parse(rawInput);
  const payload = {
    household_id: householdId,
    name: input.name,
    type: input.type,
    balance: input.balance.toFixed(2),
    periodic_payment: input.periodicPayment === null || input.periodicPayment === undefined ? null : input.periodicPayment.toFixed(2),
    payment_day: input.paymentDay ?? null,
    counterparty: input.counterparty?.trim() ? input.counterparty.trim() : null,
    is_active: true
  };

  const { error } = await client.from('accounts').insert(payload);
  if (error) {
    throw new Error(`No fue posible crear la cuenta: ${error.message}`);
  }

  await recalculateIndicators(householdId);
}

export async function updateAccount(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    throw new Error('No existe un hogar configurado para editar cuentas.');
  }

  const input = accountUpdateSchema.parse(rawInput);
  const payload = {
    name: input.name,
    type: input.type,
    balance: input.balance.toFixed(2),
    periodic_payment: input.periodicPayment === null || input.periodicPayment === undefined ? null : input.periodicPayment.toFixed(2),
    payment_day: input.paymentDay ?? null,
    counterparty: input.counterparty?.trim() ? input.counterparty.trim() : null
  };

  const { error } = await client
    .from('accounts')
    .update(payload)
    .eq('id', input.accountId)
    .eq('household_id', householdId);

  if (error) {
    throw new Error(`No fue posible actualizar la cuenta: ${error.message}`);
  }

  await recalculateIndicators(householdId);
}

export async function deactivateAccount(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    throw new Error('No existe un hogar configurado para desactivar cuentas.');
  }

  const input = accountDeactivateSchema.parse(rawInput);
  const { error } = await client
    .from('accounts')
    .update({ is_active: false })
    .eq('id', input.accountId)
    .eq('household_id', householdId);

  if (error) {
    throw new Error(`No fue posible desactivar la cuenta: ${error.message}`);
  }

  await recalculateIndicators(householdId);
}

export async function getRegistrationSetupStatus(client: SupabaseClientLike = supabaseAdmin): Promise<RegistrationSetupStatus> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    logDebug('Registro setup fallback', { reason: 'no_household' });
    return {
      hasHousehold: false,
      accounts: []
    };
  }

  const accounts = await getAccountsForRegistration(client);
  logDebug('Registro setup', { householdId, accountCount: accounts.length, readMode: 'db_result' });
  return {
    hasHousehold: true,
    accounts
  };
}

function inferMovementType(lines: Array<{ type: string; category: string }>) {
  const has = (type: string, category: string) => lines.some((line) => line.type === type && line.category === category);

  if (has('debit', 'deuda')) return 'Pago de deuda';
  if (has('debit', 'por_cobrar')) return 'Préstamo otorgado';
  if (has('credit', 'por_cobrar')) return 'Pago recibido';
  if (has('debit', 'ahorro_meta')) return 'Aporte a objetivo';
  if (has('debit', 'entrada_cuenta')) return 'Ingreso';
  if (has('credit', 'salida_cuenta')) return 'Gasto';

  const debitLine = lines.find((line) => line.type === 'debit');
  const creditLine = lines.find((line) => line.type === 'credit');
  if (debitLine?.category && creditLine?.category && debitLine.category === creditLine.category) {
    return 'Transferencia';
  }

  return 'Movimiento';
}

function inferStoredMovementCategory(lines: Array<{ category: string }>) {
  const isSystemCategory = (category: string) =>
    category === 'entrada_cuenta' || category === 'salida_cuenta' || category.startsWith('sistema_');

  const userLevelCategory = lines.find((line) => Boolean(line.category) && !isSystemCategory(line.category));
  if (userLevelCategory?.category) return userLevelCategory.category;

  return null;
}

function inferSemanticMovementCategory(action: SupportedMovementAction | null, lines: Array<{ category: string }>) {
  if (action === 'prestamo_otorgado') return 'prestamo_otorgado';
  if (action === 'pago_recibido') return 'pago_recibido';
  if (action === 'pago_deuda') return 'pago_deuda';
  if (action === 'transferencia') return 'transferencia';
  if (action === 'objetivo_aporte') return 'objetivo_aporte';

  return inferStoredMovementCategory(lines) ?? 'general';
}

function inferMovementAction(lines: Array<{ type: string; category: string }>): SupportedMovementAction | null {
  const has = (type: string, category: string) => lines.some((line) => line.type === type && line.category === category);

  if (has('debit', 'deuda')) return 'pago_deuda';
  if (has('debit', 'por_cobrar')) return 'prestamo_otorgado';
  if (has('credit', 'por_cobrar')) return 'pago_recibido';
  if (has('debit', 'ahorro_meta')) return 'objetivo_aporte';
  if (has('debit', 'entrada_cuenta')) return 'ingreso';
  if (has('credit', 'salida_cuenta')) return 'gasto';

  const debitLine = lines.find((line) => line.type === 'debit');
  const creditLine = lines.find((line) => line.type === 'credit');
  if (debitLine?.category && creditLine?.category && debitLine.category === creditLine.category) {
    return 'transferencia';
  }

  return null;
}

type GroupAccountContext = {
  groupNote?: string | null;
  sourceAccountName: string | null;
  destinationAccountName: string | null;
  action: SupportedMovementAction | null;
  householdAccounts: Array<{ id: string; name: string; type: string }>;
};

function inferCounterpartyAccountFromNote(
  note: string | null | undefined,
  candidateAccounts: Array<{ id: string; name: string }>
) {
  if (!note?.trim() || !candidateAccounts.length) return null;
  const normalizedNote = note.toLowerCase();

  const matchedByLength = [...candidateAccounts]
    .sort((left, right) => right.name.length - left.name.length)
    .find((account) => normalizedNote.includes(account.name.toLowerCase()));

  return matchedByLength ?? null;
}

function reconstructMovementAccounts({
  groupNote,
  sourceAccountName,
  destinationAccountName,
  action,
  householdAccounts
}: GroupAccountContext) {
  if (!action) {
    return { sourceAccountName, destinationAccountName };
  }

  if (destinationAccountName && sourceAccountName) {
    return { sourceAccountName, destinationAccountName };
  }

  if (action === 'prestamo_otorgado') {
    const receivableAccount = inferCounterpartyAccountFromNote(
      groupNote,
      householdAccounts.filter((account) => isReceivableType(account.type))
    );
    return {
      sourceAccountName,
      destinationAccountName: destinationAccountName ?? receivableAccount?.name ?? null
    };
  }

  if (action === 'pago_recibido') {
    const receivableAccount = inferCounterpartyAccountFromNote(
      groupNote,
      householdAccounts.filter((account) => isReceivableType(account.type))
    );
    return {
      sourceAccountName: sourceAccountName ?? receivableAccount?.name ?? null,
      destinationAccountName
    };
  }

  return { sourceAccountName, destinationAccountName };
}

export async function getMovementsHistory(client: SupabaseClientLike = supabaseAdmin): Promise<MovementsHistoryData> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    return {
      hasHousehold: false,
      movements: []
    };
  }

  const { data: groupsData } = await client
    .from('transaction_groups')
    .select('id,note,created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });

  const groups = (groupsData ?? []) as Array<{ id: string; note?: string | null; created_at: string }>;
  if (!groups.length) {
    return {
      hasHousehold: true,
      movements: []
    };
  }

  const groupIds = groups.map((group) => group.id);
  const { data: txData } = await client
    .from('transactions')
    .select('id,group_id,account_id,type,category,amount,happened_at')
    .in('group_id', groupIds);

  const transactions = (txData ?? []) as Array<{
    id: string;
    group_id: string;
    account_id: string | null;
    type: string;
    category: string;
    amount: string;
    happened_at?: string;
  }>;

  const { data: accountsData } = await client
    .from('accounts')
    .select('id,name,type')
    .eq('household_id', householdId);

  const householdAccounts = (accountsData ?? []) as Array<{ id: string; name: string; type: string }>;
  const accountById = new Map(householdAccounts.map((account) => [account.id, account.name]));

  const movements = groups.map<MovementHistoryItem>((group) => {
    const lines = transactions.filter((tx) => tx.group_id === group.id);
    const action = inferMovementAction(lines);
    const debitLine = lines.find((tx) => tx.type === 'debit');
    const creditLine = lines.find((tx) => tx.type === 'credit');
    const happenedAt = lines.find((tx) => Boolean(tx.happened_at))?.happened_at ?? group.created_at;
    const baseSourceAccountName = creditLine?.account_id ? accountById.get(creditLine.account_id) ?? null : null;
    const baseDestinationAccountName = debitLine?.account_id ? accountById.get(debitLine.account_id) ?? null : null;
    const reconstructedAccounts = reconstructMovementAccounts({
      groupNote: group.note,
      sourceAccountName: baseSourceAccountName,
      destinationAccountName: baseDestinationAccountName,
      action,
      householdAccounts
    });

    return {
      id: group.id,
      fecha: happenedAt,
      tipoMovimiento: inferMovementType(lines),
      categoria: inferSemanticMovementCategory(action, lines),
      descripcion: group.note?.trim() ? group.note : 'Movimiento sin descripción',
      monto: Number(debitLine?.amount ?? creditLine?.amount ?? 0),
      cuentaOrigen: reconstructedAccounts.sourceAccountName,
      cuentaDestino: reconstructedAccounts.destinationAccountName,
      puedeEditar: Boolean(action),
      motivoNoEditable: action ? null : 'Este tipo de movimiento aún no se puede editar de forma segura.'
    };
  });

  movements.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return {
    hasHousehold: true,
    movements
  };
}

function findAccountIdByName(accounts: AccountOption[], name?: string) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  const account = accounts.find((item) => item.name.toLowerCase().includes(normalized) || normalized.includes(item.name.toLowerCase()));
  return account?.id ?? null;
}

function toMonthlyAmount(amount: number, periodicity = 'mensual') {
  const periodicityFactor: Record<string, number> = {
    semanal: 52 / 12,
    quincenal: 2,
    mensual: 1,
    bimestral: 0.5,
    trimestral: 1 / 3,
    anual: 1 / 12
  };

  return amount * (periodicityFactor[periodicity] ?? 1);
}

function inferPeriodicityFromIncomeName(name: string) {
  const match = name.match(/\((semanal|quincenal|mensual|bimestral|trimestral|anual)\)/i);
  return match?.[1]?.toLowerCase() ?? 'mensual';
}

function applyDelta(deltaByAccountId: Map<string, number>, accountId: string | null | undefined, delta: number) {
  if (!accountId || delta === 0) return;
  deltaByAccountId.set(accountId, (deltaByAccountId.get(accountId) ?? 0) + delta);
}

function isDebtType(type: string) {
  return type === 'deuda' || type === 'credit_card' || type === 'loan';
}

function isReceivableType(type: string) {
  return type === 'por_cobrar' || type === 'receivable';
}

function isOperationalType(type: string) {
  return type === 'operativa' || type === 'operational_cash';
}

function isSavingsFundType(type: string) {
  return type === 'fondo' || type === 'savings_fund';
}

function isInvestmentType(type: string) {
  return type === 'inversion' || type === 'investment';
}

function buildAccountBalanceDeltas(intent: TransactionIntent, source?: AccountState, destination?: AccountState) {
  const deltaByAccountId = new Map<string, number>();

  switch (intent.action) {
    case 'gasto':
      if (source && isDebtType(source.type)) {
        applyDelta(deltaByAccountId, source.id, intent.amount);
      } else {
        applyDelta(deltaByAccountId, source?.id, -intent.amount);
      }
      break;
    case 'ingreso':
      applyDelta(deltaByAccountId, destination?.id, intent.amount);
      break;
    case 'transferencia':
      applyDelta(deltaByAccountId, source?.id, -intent.amount);
      applyDelta(deltaByAccountId, destination?.id, intent.amount);
      break;
    case 'pago_deuda':
      if (source && !isDebtType(source.type)) {
        applyDelta(deltaByAccountId, source.id, -intent.amount);
      }
      if (destination && isDebtType(destination.type)) {
        applyDelta(deltaByAccountId, destination.id, -intent.amount);
      } else if (source && isDebtType(source.type)) {
        applyDelta(deltaByAccountId, source.id, -intent.amount);
      }
      break;
    case 'prestamo_otorgado':
      applyDelta(deltaByAccountId, source?.id, -intent.amount);
      if (destination && isReceivableType(destination.type)) {
        applyDelta(deltaByAccountId, destination.id, intent.amount);
      }
      break;
    case 'pago_recibido':
      applyDelta(deltaByAccountId, destination?.id, intent.amount);
      if (source && isReceivableType(source.type)) {
        applyDelta(deltaByAccountId, source.id, -intent.amount);
      }
      break;
    case 'objetivo_aporte':
      applyDelta(deltaByAccountId, source?.id, -intent.amount);
      applyDelta(deltaByAccountId, destination?.id, intent.amount);
      break;
    default:
      break;
  }

  return deltaByAccountId;
}

async function getHouseholdAccounts(householdId: string) {
  const { data, error } = await supabaseAdmin
    .from('accounts')
    .select('id,name,type,balance,household_id,is_active')
    .eq('household_id', householdId);

  if (error) {
    throw new Error(`No fue posible leer cuentas del hogar: ${error.message}`);
  }

  return ((data ?? []) as Array<{ id: string; name: string; type: string; balance: string; household_id: string; is_active?: boolean | null }>)
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      householdId: row.household_id,
      balance: Number(row.balance)
    }));
}

function resolveStoredMovementDescriptor(lines: Array<{ type: string; category: string; account_id: string | null; amount: string }>): StoredMovementDescriptor | null {
  const action = inferMovementAction(lines);
  if (!action) return null;

  const debitLine = lines.find((line) => line.type === 'debit');
  const creditLine = lines.find((line) => line.type === 'credit');
  const amount = Number(debitLine?.amount ?? creditLine?.amount ?? 0);

  return {
    action,
    amount,
    sourceAccountId: creditLine?.account_id ?? null,
    destinationAccountId: debitLine?.account_id ?? null
  };
}

function buildBalanceDeltasFromStoredMovement(
  movement: StoredMovementDescriptor,
  accounts: AccountState[],
  multiplier: 1 | -1
) {
  const source = movement.sourceAccountId ? accounts.find((account) => account.id === movement.sourceAccountId) : undefined;
  const destination = movement.destinationAccountId ? accounts.find((account) => account.id === movement.destinationAccountId) : undefined;

  const deltas = buildAccountBalanceDeltas(
    {
      action: movement.action,
      amount: movement.amount,
      category: movement.action,
      description: 'movimiento',
      sourceAccount: source?.name,
      destinationAccount: destination?.name,
      missingFields: [],
      humanConfirmation: 'movimiento'
    },
    source,
    destination
  );

  for (const [accountId, delta] of deltas.entries()) {
    deltas.set(accountId, delta * multiplier);
  }

  return deltas;
}

async function persistAccountDeltas(householdId: string, deltas: Map<string, number>) {
  if (!deltas.size) return;
  const accounts = await getHouseholdAccounts(householdId);

  for (const [accountId, delta] of deltas.entries()) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account || delta === 0) continue;

    const { error } = await supabaseAdmin
      .from('accounts')
      .update({ balance: (account.balance + delta).toFixed(2) })
      .eq('id', account.id)
      .eq('household_id', householdId);

    if (error) {
      throw new Error(`No fue posible actualizar saldo de la cuenta ${account.name}: ${error.message}`);
    }
  }
}

async function applyAccountBalanceUpdates(householdId: string, intent: TransactionIntent) {
  const accounts = await getHouseholdAccounts(householdId);
  const source = accounts.find((account) => findAccountIdByName(accounts, intent.sourceAccount) === account.id);
  const destination = accounts.find((account) => findAccountIdByName(accounts, intent.destinationAccount) === account.id);
  const deltas = buildAccountBalanceDeltas(intent, source, destination);
  await persistAccountDeltas(householdId, deltas);
}

function buildJournalEntries(intent: TransactionIntent, accounts: AccountOption[]): JournalLine[] {
  const sourceId = findAccountIdByName(accounts, intent.sourceAccount);
  const destinationId = findAccountIdByName(accounts, intent.destinationAccount);

  switch (intent.action) {
    case 'gasto':
      return [
        { accountId: null, type: 'debit', category: intent.category, amount: intent.amount },
        { accountId: sourceId, type: 'credit', category: 'salida_cuenta', amount: intent.amount }
      ];
    case 'ingreso':
      return [
        { accountId: destinationId, type: 'debit', category: 'entrada_cuenta', amount: intent.amount },
        { accountId: null, type: 'credit', category: intent.category, amount: intent.amount }
      ];
    case 'transferencia':
      return [
        { accountId: destinationId, type: 'debit', category: intent.category, amount: intent.amount },
        { accountId: sourceId, type: 'credit', category: intent.category, amount: intent.amount }
      ];
    case 'pago_deuda':
      if (!sourceId || !destinationId) {
        throw new Error('El pago de deuda requiere cuenta origen y cuenta destino.');
      }
      return [
        { accountId: destinationId, type: 'debit', category: 'deuda', amount: intent.amount },
        { accountId: sourceId, type: 'credit', category: 'salida_cuenta', amount: intent.amount }
      ];
    case 'prestamo_otorgado':
      return [
        { accountId: null, type: 'debit', category: 'por_cobrar', amount: intent.amount },
        { accountId: sourceId, type: 'credit', category: 'salida_cuenta', amount: intent.amount }
      ];
    case 'pago_recibido':
      return [
        { accountId: destinationId, type: 'debit', category: 'entrada_cuenta', amount: intent.amount },
        { accountId: null, type: 'credit', category: 'por_cobrar', amount: intent.amount }
      ];
    case 'objetivo_aporte':
      return [
        { accountId: destinationId, type: 'debit', category: 'ahorro_meta', amount: intent.amount },
        { accountId: sourceId, type: 'credit', category: 'salida_cuenta', amount: intent.amount }
      ];
    default:
      return [];
  }
}

export async function saveConversationalTransaction(
  intent: TransactionIntent,
  options?: {
    happenedAt?: string;
  }
) {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) {
    throw new Error('No existe un hogar configurado para registrar movimientos.');
  }

  const accounts = await getAccountsForRegistration();
  const lines = buildJournalEntries(intent, accounts);

  const { data: group, error: groupError } = await supabaseAdmin
    .from('transaction_groups')
    .insert({
      household_id: householdId,
      source: 'conversacional',
      note: intent.description
    })
    .select('id')
    .single();

  if (groupError || !group?.id) {
    throw new Error(groupError?.message ?? 'No fue posible crear el grupo de transacción.');
  }

  const happenedAt = options?.happenedAt ?? new Date().toISOString();
  const transactionsPayload = lines.map((line) => ({
    group_id: group.id,
    account_id: line.accountId,
    type: line.type,
    category: line.category,
    amount: line.amount.toFixed(2),
    happened_at: happenedAt
  }));

  const { error: txError } = await supabaseAdmin.from('transactions').insert(transactionsPayload);

  if (txError) {
    throw new Error(txError.message);
  }

  await applyAccountBalanceUpdates(householdId, intent);
  await recalculateIndicators(householdId);
}

async function getStoredMovementForEdition(householdId: string, movementId: string) {
  const { data: group, error: groupError } = await supabaseAdmin
    .from('transaction_groups')
    .select('id,note')
    .eq('id', movementId)
    .eq('household_id', householdId)
    .maybeSingle();

  if (groupError) {
    throw new Error(`No fue posible leer el movimiento: ${groupError.message}`);
  }

  if (!group?.id) {
    throw new Error('No se encontró el movimiento solicitado.');
  }

  const { data: txData, error: txError } = await supabaseAdmin
    .from('transactions')
    .select('id,group_id,account_id,type,category,amount')
    .eq('group_id', group.id);

  if (txError) {
    throw new Error(`No fue posible leer las transacciones del movimiento: ${txError.message}`);
  }

  const lines = (txData ?? []) as Array<{
    id: string;
    group_id: string;
    account_id: string | null;
    type: string;
    category: string;
    amount: string;
  }>;

  if (!lines.length) {
    throw new Error('El movimiento no tiene transacciones asociadas.');
  }

  const descriptor = resolveStoredMovementDescriptor(lines);
  if (!descriptor) {
    throw new Error('Este movimiento aún no se puede editar de forma segura.');
  }

  return { group, lines, descriptor };
}

export async function updateMovement(rawInput: unknown) {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) {
    throw new Error('No existe un hogar configurado para editar movimientos.');
  }

  const input = movementEditSchema.parse(rawInput);
  const { group, lines, descriptor: previousMovement } = await getStoredMovementForEdition(householdId, input.movementId);

  const sourceAccountId = input.sourceAccountId ?? previousMovement.sourceAccountId;
  const destinationAccountId = input.destinationAccountId ?? previousMovement.destinationAccountId;
  const nextMovement: StoredMovementDescriptor = {
    action: previousMovement.action,
    amount: input.amount,
    sourceAccountId,
    destinationAccountId
  };

  if (previousMovement.action === 'transferencia' && (!sourceAccountId || !destinationAccountId)) {
    throw new Error('La transferencia requiere cuenta origen y destino.');
  }

  if (previousMovement.action === 'ingreso' && !destinationAccountId) {
    throw new Error('El ingreso requiere una cuenta destino.');
  }

  if (['gasto', 'pago_deuda', 'prestamo_otorgado', 'objetivo_aporte'].includes(previousMovement.action) && !sourceAccountId) {
    throw new Error('Este movimiento requiere cuenta origen.');
  }

  const accounts = await getHouseholdAccounts(householdId);
  const reverseDeltas = buildBalanceDeltasFromStoredMovement(previousMovement, accounts, -1);
  await persistAccountDeltas(householdId, reverseDeltas);

  const updates = lines.map((line) => {
    const nextAccountId =
      line.type === 'credit' && line.account_id
        ? sourceAccountId
        : line.type === 'debit' && line.account_id
          ? destinationAccountId
          : line.account_id;

    return supabaseAdmin
      .from('transactions')
      .update({
        account_id: nextAccountId ?? null,
        amount: input.amount.toFixed(2)
      })
      .eq('id', line.id)
      .eq('group_id', group.id);
  });

  await Promise.all(
    updates.map(async (query) => {
      const { error } = await query;
      if (error) throw new Error(`No fue posible actualizar transacciones del movimiento: ${error.message}`);
    })
  );

  const { error: groupUpdateError } = await supabaseAdmin
    .from('transaction_groups')
    .update({ note: input.description })
    .eq('id', group.id)
    .eq('household_id', householdId);

  if (groupUpdateError) {
    throw new Error(`No fue posible actualizar la descripción del movimiento: ${groupUpdateError.message}`);
  }

  const applyDeltas = buildBalanceDeltasFromStoredMovement(nextMovement, accounts, 1);
  await persistAccountDeltas(householdId, applyDeltas);
  await recalculateIndicators(householdId);
}

export async function deleteMovement(rawInput: unknown) {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) {
    throw new Error('No existe un hogar configurado para eliminar movimientos.');
  }

  const input = movementDeleteSchema.parse(rawInput);
  const { group, descriptor } = await getStoredMovementForEdition(householdId, input.movementId);
  const accounts = await getHouseholdAccounts(householdId);

  const reverseDeltas = buildBalanceDeltasFromStoredMovement(descriptor, accounts, -1);
  await persistAccountDeltas(householdId, reverseDeltas);

  const { error: txDeleteError } = await supabaseAdmin.from('transactions').delete().eq('group_id', group.id);
  if (txDeleteError) {
    throw new Error(`No fue posible eliminar transacciones del movimiento: ${txDeleteError.message}`);
  }

  const { error: groupDeleteError } = await supabaseAdmin
    .from('transaction_groups')
    .delete()
    .eq('id', group.id)
    .eq('household_id', householdId);

  if (groupDeleteError) {
    throw new Error(`No fue posible eliminar el movimiento: ${groupDeleteError.message}`);
  }

  await recalculateIndicators(householdId);
}

export async function recalculateIndicators(householdId: string) {
  const { data: groups } = await supabaseAdmin.from('transaction_groups').select('id').eq('household_id', householdId);
  const groupIds = (groups ?? []).map((group) => group.id as string);
  const { data: transactionsData } = groupIds.length
    ? await supabaseAdmin.from('transactions').select('type,category,amount,happened_at').in('group_id', groupIds)
    : { data: [] as Array<{ type: string; category: string; amount: string; happened_at: string }> };
  const parsed = (transactionsData ?? []) as Array<{ type: string; category: string; amount: string; happened_at: string }>;

  const totalExpenses = parsed
    .filter((item) => item.type === 'debit' && item.category !== 'entrada_cuenta')
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const totalIncome = parsed
    .filter((item) => item.type === 'credit' && item.category.startsWith('ingreso'))
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const accountList = await getHouseholdAccounts(householdId);
  const operativeMoney = accountList
    .filter((item) => isOperationalType(item.type))
    .reduce((acc, item) => acc + item.balance, 0);
  const liquidFunds = accountList
    .filter((item) => isSavingsFundType(item.type))
    .reduce((acc, item) => acc + item.balance, 0);
  const liquidInvestments = accountList
    .filter((item) => isInvestmentType(item.type))
    .reduce((acc, item) => acc + item.balance, 0);
  const debtBalance = accountList
    .filter((item) => isDebtType(item.type))
    .reduce((acc, item) => acc + item.balance, 0);

  const { data: incomeSources } = await supabaseAdmin
    .from('income_sources')
    .select('name,amount,recurring')
    .eq('household_id', householdId);

  const incomes = (incomeSources ?? []) as Array<{ name: string; amount: string; recurring: boolean }>;
  const regularIncomeMonthly = calculateRegularIncome(
    incomes
      .filter((item) => item.recurring)
      .reduce((acc, item) => acc + toMonthlyAmount(Number(item.amount), inferPeriodicityFromIncomeName(item.name)), 0)
  );
  const annualExtraIncome = incomes
    .filter((item) => !item.recurring)
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const { data: obligations } = await supabaseAdmin
    .from('obligations')
    .select('name,amount')
    .eq('household_id', householdId);
  const obligationsList = (obligations ?? []) as Array<{ name: string; amount: string }>;
  const debtPayments = obligationsList
    .filter((item) => item.name.toLowerCase().startsWith('pago '))
    .reduce((acc, item) => acc + Number(item.amount), 0);
  const fixedExpenses = obligationsList
    .filter((item) => !item.name.toLowerCase().startsWith('pago '))
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const { data: variableProfiles } = await supabaseAdmin
    .from('variable_spending_profiles')
    .select('monthly_estimate')
    .eq('household_id', householdId);
  const variableSeries = ((variableProfiles ?? []) as Array<{ monthly_estimate: string }>).map((item) => Number(item.monthly_estimate));
  const avgVariableExpenses = variableSeries.reduce((acc, value) => acc + value, 0);

  const { data: receivables } = await supabaseAdmin
    .from('receivables')
    .select('pending_amount,status')
    .eq('household_id', householdId);
  const receivablesOutstanding = ((receivables ?? []) as Array<{ pending_amount: string; status: string }>)
    .filter((item) => item.status !== 'cerrado')
    .reduce((acc, item) => acc + Number(item.pending_amount), 0);

  const financialInput = {
    fixedExpenses,
    avgVariableExpenses,
    debtPayments,
    periodicExpensesMonthlyEquivalent: 0,
    safetyMarginPct: 10,
    regularIncomeMonthly,
    annualExtraIncome,
    operativeMoney,
    liquidFunds,
    liquidInvestments,
    debtBalance,
    totalFixedExpenses: fixedExpenses,
    variableSeries,
    reservesUsageLastMonth: 0,
    receivablesOutstanding
  };

  const monthlyOFH = calculateMonthlyOFH(financialInput);
  const weeklyOFH = calculateWeeklyOFH(monthlyOFH);
  const annualAverageMonthlyIncome = calculateAnnualAverageIncome(regularIncomeMonthly, annualExtraIncome);
  const immediateMRF = calculateImmediateMRF(monthlyOFH, operativeMoney, liquidFunds);
  const extendedMRF = calculateExtendedMRF(monthlyOFH, operativeMoney, liquidFunds, liquidInvestments);
  const availableMoney = calculateAvailableMoney(operativeMoney);
  const diagnoses = buildTopDiagnoses(financialInput);
  const recommendations = buildRecommendations(diagnoses);
  const financialPressure = calculateFinancialPressure({
    accounts: accountList,
    debts: obligationsList
      .filter((item) => item.name.toLowerCase().startsWith('pago '))
      .map((item) => ({ periodicPayment: Number(item.amount) })),
    fixedExpenses,
    recentTransactions: parsed.map((item) => ({
      amount: Number(item.amount),
      category: item.category,
      type: item.type,
      happenedAt: item.happened_at
    }))
  });

  const shouldGenerateInsight = process.env.FINANCIAL_INSIGHT_AUTO === 'true';
  const financialInsight = shouldGenerateInsight
    ? await generateFinancialInsight(
        financialPressure,
        parsed
          .filter((item) => item.type === 'debit')
          .slice(-5)
          .map((item) => ({
            amount: Number(item.amount),
            category: item.category,
            type: item.type,
            happenedAt: item.happened_at
          }))
      )
    : null;

  await supabaseAdmin.from('financial_snapshots').insert({
    household_id: householdId,
    period_type: 'conversacional',
    payload: JSON.stringify({
      monthlyOFH,
      weeklyOFH,
      regularIncomeMonthly,
      annualAverageMonthlyIncome,
      immediateMRF,
      extendedMRF,
      availableMoney,
      diagnoses,
      recommendations,
      financialPressure,
      financialInsight,
      financialInput,
      totals: { totalIncome, totalExpenses, receivablesOutstanding }
    })
  });
}
