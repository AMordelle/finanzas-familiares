import { z } from 'zod';
import { calculateFlowTarget, FLOW_PERIOD_TYPES, type FlowPeriodType, type FlowTargetType } from '@/lib/flows/targets';
import { supabaseAdmin } from '@/lib/db/supabase';
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
import type { HouseholdRecommendationContext } from '@/lib/finance/recommendationContext';
import { transactionIntentSchema, type TransactionIntent } from '@/lib/ai/transactionInterpreter';
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
  destinationAccountId: z.string().min(1).nullable().optional(),
  category: z.string().trim().min(1, 'La categoría principal es obligatoria.').max(80).optional(),
  subcategory: z.string().trim().max(80).nullable().optional()
});

export const movementDeleteSchema = z.object({
  movementId: z.string().min(1)
});


const financialClosureTypeValues = ['weekly', 'monthly'] as const;

export const financialClosureCreateSchema = z.object({
  type: z.enum(financialClosureTypeValues, { required_error: 'El tipo de cierre es obligatorio.' }),
  periodStart: z.string().trim().min(1, 'La fecha inicial es obligatoria.'),
  periodEnd: z.string().trim().min(1, 'La fecha final es obligatoria.'),
  notes: z.string().trim().optional().nullable()
}).superRefine((value, ctx) => {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(value.periodStart)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodStart'], message: 'La fecha inicial no es válida.' });
  }
  if (!datePattern.test(value.periodEnd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEnd'], message: 'La fecha final no es válida.' });
  }
  if (datePattern.test(value.periodStart) && datePattern.test(value.periodEnd) && value.periodStart > value.periodEnd) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['periodEnd'], message: 'La fecha inicial no puede ser posterior a la fecha final.' });
  }
});

export const financialClosureActionSchema = z.object({
  closureId: z.string().min(1, 'El cierre es obligatorio.')
});


const extraWorkTypeValues = ['overtime', 'piecework', 'meals'] as const;
const extraWorkStatusValues = ['pending', 'paid'] as const;

const extraWorkEditableFieldsSchema = z.object({
  householdId: z.string().min(1, 'El hogar es obligatorio.').optional(),
  workDate: z.string().trim().min(1, 'La fecha es obligatoria.'),
  type: z.enum(extraWorkTypeValues, { required_error: 'El tipo de trabajo es obligatorio.' }),
  quantity: z.coerce.number().positive('La cantidad debe ser mayor a 0.'),
  notes: z.string().trim().optional().nullable()
});

export const extraWorkCreateSchema = extraWorkEditableFieldsSchema;

export const extraWorkUpdateSchema = extraWorkEditableFieldsSchema.extend({
  entryId: z.string().min(1, 'El registro es obligatorio.')
});

export const extraWorkEntrySchema = z.object({
  entryId: z.string().min(1, 'El registro es obligatorio.'),
  householdId: z.string().min(1, 'El hogar es obligatorio.').optional()
});

export const extraWorkPaidSchema = extraWorkEntrySchema;
export const extraWorkRestoreSchema = extraWorkEntrySchema;
export const extraWorkDeleteSchema = extraWorkEntrySchema;

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

export const accountReorderSchema = z.object({
  accountIds: z.array(z.string().uuid()).min(1, 'Debes ordenar al menos una cuenta.')
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
  displayOrder: number | null;
};

export type FinancialCategoryCatalogSubcategory = {
  id: string;
  name: string;
  key: string;
};

export type FinancialCategoryCatalogItem = {
  id: string;
  name: string;
  key: string;
  type: 'income' | 'expense' | 'both';
  noProjectable: boolean;
  subcategories: FinancialCategoryCatalogSubcategory[];
};

export type RegistrationSetupStatus = {
  hasHousehold: boolean;
  accounts: AccountOption[];
  categoryCatalog: FinancialCategoryCatalogItem[];
};

export type MovementHistoryItem = {
  id: string;
  fecha: string;
  tipoMovimiento: string;
  categoria: string;
  subcategoria?: string | null;
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



export type FinancialClosureType = (typeof financialClosureTypeValues)[number];

export type FinancialClosureAccountScope = 'operational' | 'complementary';

export type FinancialClosureAccountSnapshot = {
  accountId: string;
  accountName: string;
  accountType: string;
  accountScope: FinancialClosureAccountScope;
  openingBalance: number;
  closingBalance: number;
  difference: number;
};

export type FinancialClosureMovementSummary = {
  criteria: string;
  movementCount: number;
  incomeMovementCount: number;
  expenseMovementCount: number;
};

export type FinancialClosure = {
  id: string;
  householdId: string;
  type: FinancialClosureType;
  periodStart: string;
  periodEnd: string;
  openingTotal: number;
  closingTotal: number;
  netChange: number;
  incomeTotal: number;
  expenseTotal: number;
  netFlow: number;
  accountSnapshots: FinancialClosureAccountSnapshot[];
  movementSummary: FinancialClosureMovementSummary | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinancialClosuresData = {
  hasHousehold: boolean;
  closures: FinancialClosure[];
};

export type ExtraWorkType = (typeof extraWorkTypeValues)[number];
export type ExtraWorkStatus = (typeof extraWorkStatusValues)[number];

export type ExtraWorkEntry = {
  id: string;
  householdId: string;
  workDate: string;
  type: ExtraWorkType;
  quantity: number;
  status: ExtraWorkStatus;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExtrasSummary = {
  pendingCount: number;
  pendingOvertimeHours: number;
  pendingPieceworkUnits: number;
  pendingMealsAmount: number;
};

export type ExtrasData = {
  hasHousehold: boolean;
  householdId: string | null;
  pendingEntries: ExtraWorkEntry[];
  paidEntries: ExtraWorkEntry[];
  summary: ExtrasSummary;
};

export type MsiInstallmentStatus = 'pending' | 'paid';
export type MsiPurchaseStatus = 'active' | 'completed' | 'cancelled';
export type MsiFinancingType = 'interest_free' | 'interest_bearing';

export type MsiInstallment = {
  id: string;
  householdId: string;
  msiPurchaseId: string;
  installmentNumber: number;
  amount: number;
  dueDate: string | null;
  status: MsiInstallmentStatus;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MsiPurchase = {
  id: string;
  householdId: string;
  accountId: string;
  accountName: string;
  description: string;
  category: string;
  financingType: MsiFinancingType;
  originalAmount: number;
  totalAmount: number;
  totalFinancedAmount: number;
  interestCost: number;
  months: number;
  monthlyAmount: number;
  purchaseDate: string;
  status: MsiPurchaseStatus;
  createdAt: string;
  updatedAt: string;
  installments: MsiInstallment[];
};

export type MsiSectionSummary = {
  activePurchases: number;
  pendingOriginalTotal: number;
  pendingFinancedTotal: number;
  pendingInterestCost: number;
  pendingInstallments: number;
  paidInstallments: number;
};

export type MsiSummary = {
  activePurchases: number;
  pendingTotal: number;
  pendingInstallments: number;
  paidInstallments: number;
  interestFree: MsiSectionSummary;
  interestBearing: MsiSectionSummary;
};

export type MsiData = {
  hasHousehold: boolean;
  purchases: MsiPurchase[];
  summary: MsiSummary;
};

export const msiInstallmentActionSchema = z.object({
  installmentId: z.string().min(1, 'El pago MSI es obligatorio.')
});

export const msiPurchaseActionSchema = z.object({
  purchaseId: z.string().min(1, 'La compra a meses es obligatoria.')
});

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
  recommendationContext: HouseholdRecommendationContext | null;
};

type SupabaseClientLike = typeof supabaseAdmin;

function logDebug(message: string, payload?: Record<string, unknown>) {
  console.info(`[onboarding-debug] ${message}`, payload ?? {});
}

function logMovementsHistoryDebug(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  console.info(`[movimientos-debug] ${message}`, payload ?? {});
}

function warnMovementsHistoryDebug(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  console.warn(`[movimientos-debug] ${message}`, payload ?? {});
}

function logFinancialClosureDebug(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  console.info(`[cierre-debug] ${message}`, payload ?? {});
}

function errorFinancialClosureDebug(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  console.error(`[cierre-debug] ${message}`, payload ?? {});
}

function logConfigurationDebug(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  console.info(`[configuracion-debug] ${message}`, payload ?? {});
}

function errorConfigurationDebug(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  console.error(`[configuracion-debug] ${message}`, payload ?? {});
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
    priorityDiagnostics,
    recommendationContext: null
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
      priorityDiagnostics: [],
      recommendationContext: null
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
      priorityDiagnostics: [],
      recommendationContext: null
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
  parsed.recommendationContext = recommendationContext;
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


function mapExtraWorkEntry(row: {
  id: string;
  household_id: string;
  work_date: string;
  type: string;
  quantity: string | number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): ExtraWorkEntry {
  if (!extraWorkTypeValues.includes(row.type as ExtraWorkType)) {
    throw new Error('El tipo de extra guardado no es válido.');
  }

  if (!extraWorkStatusValues.includes(row.status as ExtraWorkStatus)) {
    throw new Error('El estado del extra guardado no es válido.');
  }

  return {
    id: row.id,
    householdId: row.household_id,
    workDate: row.work_date,
    type: row.type as ExtraWorkType,
    quantity: Number(row.quantity),
    status: row.status as ExtraWorkStatus,
    paidAt: row.paid_at ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function calculateExtrasSummary(entries: ExtraWorkEntry[]): ExtrasSummary {
  return entries.reduce<ExtrasSummary>(
    (summary, entry) => {
      if (entry.status !== 'pending') return summary;

      summary.pendingCount += 1;
      if (entry.type === 'overtime') {
        summary.pendingOvertimeHours += entry.quantity;
      } else if (entry.type === 'piecework') {
        summary.pendingPieceworkUnits += entry.quantity;
      } else if (entry.type === 'meals') {
        summary.pendingMealsAmount += entry.quantity;
      }
      return summary;
    },
    { pendingCount: 0, pendingOvertimeHours: 0, pendingPieceworkUnits: 0, pendingMealsAmount: 0 }
  );
}

function sortExtraWorkEntries(entries: ExtraWorkEntry[]) {
  return [...entries].sort((a, b) => {
    if (a.workDate !== b.workDate) return a.workDate < b.workDate ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return 0;
  });
}

function sortPaidExtraWorkEntries(entries: ExtraWorkEntry[]) {
  return [...entries].sort((a, b) => {
    const aPaidAt = a.paidAt ?? '';
    const bPaidAt = b.paidAt ?? '';
    if (aPaidAt !== bPaidAt) return aPaidAt < bPaidAt ? 1 : -1;
    if (a.workDate !== b.workDate) return a.workDate < b.workDate ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return 0;
  });
}

export async function createExtraWorkEntry(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = extraWorkCreateSchema.parse(rawInput);
  const householdId = input.householdId ?? (await getDefaultHouseholdId(client));

  if (!householdId) {
    throw new Error('El hogar es obligatorio para registrar extras.');
  }

  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from('extra_work_entries')
    .insert({
      household_id: householdId,
      work_date: input.workDate,
      type: input.type,
      quantity: input.quantity.toString(),
      status: 'pending',
      paid_at: null,
      notes,
      updated_at: now
    })
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible registrar el extra.');
  }

  return mapExtraWorkEntry(data as Parameters<typeof mapExtraWorkEntry>[0]);
}

export async function updateExtraWorkEntry(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = extraWorkUpdateSchema.parse(rawInput);
  const householdId = input.householdId ?? (await getDefaultHouseholdId(client));

  if (!householdId) {
    throw new Error('El hogar es obligatorio para editar extras.');
  }

  const notes = input.notes?.trim() ? input.notes.trim() : null;
  const updatedAt = new Date().toISOString();
  const { data, error } = await client
    .from('extra_work_entries')
    .update({
      work_date: input.workDate,
      type: input.type,
      quantity: input.quantity.toString(),
      notes,
      status: 'pending',
      updated_at: updatedAt
    })
    .eq('id', input.entryId)
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .maybeSingle();

  if (error) {
    throw new Error(`No fue posible editar el extra: ${error.message}`);
  }

  if (!data) {
    throw new Error('No se encontró el extra pendiente en este hogar.');
  }

  return mapExtraWorkEntry(data as Parameters<typeof mapExtraWorkEntry>[0]);
}

export async function getPendingExtraWorkEntries(client: SupabaseClientLike = supabaseAdmin): Promise<ExtrasData> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    return {
      hasHousehold: false,
      householdId: null,
      pendingEntries: [],
      paidEntries: [],
      summary: calculateExtrasSummary([])
    };
  }

  const { data, error } = await client
    .from('extra_work_entries')
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`No fue posible leer extras pendientes: ${error.message}`);
  }

  const { data: paidData, error: paidError } = await client
    .from('extra_work_entries')
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .eq('household_id', householdId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .order('work_date', { ascending: false });

  if (paidError) {
    throw new Error(`No fue posible leer extras pagados: ${paidError.message}`);
  }

  const pendingEntries = sortExtraWorkEntries(((data ?? []) as Parameters<typeof mapExtraWorkEntry>[0][]).map(mapExtraWorkEntry));
  const paidEntries = sortPaidExtraWorkEntries(((paidData ?? []) as Parameters<typeof mapExtraWorkEntry>[0][]).map(mapExtraWorkEntry));
  return {
    hasHousehold: true,
    householdId,
    pendingEntries,
    paidEntries,
    summary: calculateExtrasSummary(pendingEntries)
  };
}

export async function markExtraWorkEntryAsPaid(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = extraWorkPaidSchema.parse(rawInput);
  const householdId = input.householdId ?? (await getDefaultHouseholdId(client));

  if (!householdId) {
    throw new Error('El hogar es obligatorio para marcar extras como pagados.');
  }

  const paidAt = new Date().toISOString();
  const { data, error } = await client
    .from('extra_work_entries')
    .update({ status: 'paid', paid_at: paidAt, updated_at: paidAt })
    .eq('id', input.entryId)
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .maybeSingle();

  if (error) {
    throw new Error(`No fue posible marcar el extra como pagado: ${error.message}`);
  }

  if (!data) {
    throw new Error('No se encontró el extra pendiente en este hogar.');
  }

  return mapExtraWorkEntry(data as Parameters<typeof mapExtraWorkEntry>[0]);
}

export async function restoreExtraWorkEntryToPending(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = extraWorkRestoreSchema.parse(rawInput);
  const householdId = input.householdId ?? (await getDefaultHouseholdId(client));

  if (!householdId) {
    throw new Error('El hogar es obligatorio para regresar extras a pendientes.');
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await client
    .from('extra_work_entries')
    .update({ status: 'pending', paid_at: null, updated_at: updatedAt })
    .eq('id', input.entryId)
    .eq('household_id', householdId)
    .eq('status', 'paid')
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .maybeSingle();

  if (error) {
    throw new Error(`No fue posible regresar el extra a pendientes: ${error.message}`);
  }

  if (!data) {
    throw new Error('No se encontró el extra pagado en este hogar.');
  }

  return mapExtraWorkEntry(data as Parameters<typeof mapExtraWorkEntry>[0]);
}

export async function deleteExtraWorkEntry(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = extraWorkDeleteSchema.parse(rawInput);
  const householdId = input.householdId ?? (await getDefaultHouseholdId(client));

  if (!householdId) {
    throw new Error('El hogar es obligatorio para eliminar extras.');
  }

  const { data, error } = await client
    .from('extra_work_entries')
    .delete()
    .eq('id', input.entryId)
    .eq('household_id', householdId)
    .eq('status', 'pending')
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .maybeSingle();

  if (error) {
    throw new Error(`No fue posible eliminar el extra: ${error.message}`);
  }

  if (!data) {
    throw new Error('No se encontró el extra pendiente en este hogar.');
  }

  return mapExtraWorkEntry(data as Parameters<typeof mapExtraWorkEntry>[0]);
}

export async function getExtraWorkHistory(client: SupabaseClientLike = supabaseAdmin): Promise<ExtraWorkEntry[]> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) return [];

  const { data, error } = await client
    .from('extra_work_entries')
    .select('id,household_id,work_date,type,quantity,status,paid_at,notes,created_at,updated_at')
    .eq('household_id', householdId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
    .order('work_date', { ascending: false });

  if (error) {
    throw new Error(`No fue posible leer el historial de extras: ${error.message}`);
  }

  return sortPaidExtraWorkEntries(((data ?? []) as Parameters<typeof mapExtraWorkEntry>[0][]).map(mapExtraWorkEntry));
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
    .select('id,name,type,balance,is_active,periodic_payment,payment_day,counterparty,display_order')
    .eq('household_id', householdId)
    .order('type')
    .order('display_order', { ascending: true, nullsFirst: false })
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
    display_order: number | null;
  }>)
    .filter((account) => accountTypeValues.includes(account.type as (typeof accountTypeValues)[number]))
    .sort((a, b) => compareAccountsForManagement(a, b))
    .map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: Number(account.balance),
      isActive: account.is_active !== false,
      periodicPayment: account.periodic_payment === null ? null : Number(account.periodic_payment),
      paymentDay: account.payment_day ?? null,
      counterparty: account.counterparty ?? null,
      displayOrder: account.display_order ?? null
    }));
}

function compareAccountsForManagement(a: { type: string; name: string; display_order: number | null }, b: { type: string; name: string; display_order: number | null }) {
  const aGroup = normalizeAccountVisualGroup(a.type) ?? a.type;
  const bGroup = normalizeAccountVisualGroup(b.type) ?? b.type;
  if (aGroup !== bGroup) return aGroup.localeCompare(bGroup, 'es');

  const aHasOrder = a.display_order !== null && a.display_order !== undefined;
  const bHasOrder = b.display_order !== null && b.display_order !== undefined;
  if (aHasOrder && bHasOrder && a.display_order !== b.display_order) return Number(a.display_order) - Number(b.display_order);
  if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}

function normalizeAccountVisualGroup(rawType: string) {
  const aliases: Record<string, string> = {
    operativa: 'operational_cash',
    fondo: 'savings_fund',
    inversion: 'investment',
    deuda: 'loan',
    por_cobrar: 'receivable',
    operational_cash: 'operational_cash',
    savings_fund: 'savings_fund',
    investment: 'investment',
    credit_card: 'credit_card',
    loan: 'loan',
    receivable: 'receivable'
  };
  return aliases[rawType] ?? null;
}

export async function saveAccountDisplayOrder(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    throw new Error('No existe un hogar configurado para ordenar cuentas.');
  }

  const input = accountReorderSchema.parse(rawInput);
  const uniqueAccountIds = Array.from(new Set(input.accountIds));
  if (uniqueAccountIds.length !== input.accountIds.length) {
    throw new Error('La lista de orden contiene cuentas duplicadas.');
  }

  const { data: requestedData, error: requestedError } = await client
    .from('accounts')
    .select('id,household_id,type,name,display_order,balance,is_active')
    .in('id', input.accountIds);

  if (requestedError) {
    throw new Error(`No fue posible validar las cuentas: ${requestedError.message}`);
  }

  const requestedRows = (requestedData ?? []) as Array<{ id: string; household_id: string; type: string; name: string; display_order: number | null; balance: string | number; is_active: boolean | null }>;
  if (requestedRows.length !== input.accountIds.length) {
    throw new Error('Todas las cuentas del orden deben existir.');
  }

  if (requestedRows.some((account) => account.household_id !== householdId)) {
    throw new Error('No puedes ordenar cuentas de otro hogar.');
  }

  const visualGroupKeys = requestedRows.map((account) => normalizeAccountVisualGroup(account.type));
  if (visualGroupKeys.some((group) => group === null) || new Set(visualGroupKeys).size !== 1) {
    throw new Error('Solo puedes reordenar cuentas dentro del mismo grupo.');
  }

  const visualGroup = visualGroupKeys[0];
  const { data: householdAccountsData, error: householdAccountsError } = await client
    .from('accounts')
    .select('id,household_id,type,name,display_order,balance,is_active')
    .eq('household_id', householdId);

  if (householdAccountsError) {
    throw new Error(`No fue posible validar el grupo completo: ${householdAccountsError.message}`);
  }

  const householdGroupRows = ((householdAccountsData ?? []) as Array<{ id: string; household_id: string; type: string; name: string; display_order: number | null; balance: string | number; is_active: boolean | null }>)
    .filter((account) => normalizeAccountVisualGroup(account.type) === visualGroup)
    .sort((a, b) => compareAccountsForManagement(a, b));

  const requestedIdSet = new Set(input.accountIds);
  const missingGroupAccountIds = householdGroupRows
    .map((account) => account.id)
    .filter((accountId) => !requestedIdSet.has(accountId));
  const finalOrderedAccountIds = [...input.accountIds, ...missingGroupAccountIds];

  const updatedRows: Array<{ id: string; display_order: number | null }> = [];
  await Promise.all(finalOrderedAccountIds.map(async (accountId, index) => {
    const updateResult = await client
      .from('accounts')
      .update({ display_order: index }, { count: 'exact' })
      .eq('id', accountId)
      .eq('household_id', householdId)
      .select('id,display_order');

    if (updateResult.error) {
      throw new Error(`No fue posible guardar el orden: ${updateResult.error.message}`);
    }

    const rows = (updateResult.data ?? []) as Array<{ id: string; display_order: number | null }>;
    if (rows.length !== 1 || rows[0]?.display_order !== index) {
      throw new Error('No fue posible confirmar que el orden se guardó correctamente.');
    }
    updatedRows.push(rows[0]);
  }));

  return { success: true, updatedCount: updatedRows.length, orderedAccountIds: finalOrderedAccountIds };
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
      accounts: [],
      categoryCatalog: []
    };
  }

  const [accounts, categoryCatalog] = await Promise.all([
    getAccountsForRegistration(client),
    getFinancialCategoryCatalog(householdId, client)
  ]);
  logDebug('Registro setup', { householdId, accountCount: accounts.length, categoryCount: categoryCatalog.length, readMode: 'db_result' });
  return {
    hasHousehold: true,
    accounts,
    categoryCatalog
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
  const userLevelCategory = lines.find((line) => Boolean(line.category) && !isTechnicalMovementCategory(line.category));
  if (userLevelCategory?.category) return userLevelCategory.category;

  return null;
}

function isTechnicalMovementCategory(category: string | null | undefined) {
  return category === 'entrada_cuenta' || category === 'salida_cuenta' || Boolean(category?.startsWith('sistema_'));
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
  logMovementsHistoryDebug('Household resuelto para historial', { householdId: householdId ?? null });
  if (!householdId) {
    return {
      hasHousehold: false,
      movements: []
    };
  }

  const { data: groupsData } = await client
    .from('transaction_groups')
    .select('id,note,source,created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });

  const groups = (groupsData ?? []) as Array<{ id: string; note?: string | null; source?: string | null; created_at: string }>;
  logMovementsHistoryDebug('Transaction groups recuperados antes de filtrar', {
    householdId,
    groupCount: groups.length
  });
  if (!groups.length) {
    return {
      hasHousehold: true,
      movements: []
    };
  }

  const groupIds = groups.map((group) => group.id);
  const transactionChunks = [];
  for (let index = 0; index < groupIds.length; index += 100) {
    transactionChunks.push(groupIds.slice(index, index + 100));
  }

  const txData = [];
  for (const chunk of transactionChunks) {
    const { data, error } = await client
      .from('transactions')
      .select('id,group_id,account_id,type,category,subcategory,amount,happened_at')
      .in('group_id', chunk);

    if (error) {
      warnMovementsHistoryDebug('No fue posible cargar líneas transactions por group_id', {
        householdId,
        chunkSize: chunk.length,
        error: error.message
      });
      continue;
    }

    txData.push(...(data ?? []));
  }

  const transactions = (txData ?? []) as Array<{
    id: string;
    group_id: string;
    account_id: string | null;
    type: string;
    category: string;
    subcategory?: string | null;
    amount: string;
    happened_at?: string;
  }>;
  logMovementsHistoryDebug('Líneas transactions recuperadas para historial', {
    householdId,
    transactionLineCount: transactions.length
  });
  if (groups.length > 0 && transactions.length === 0) {
    warnMovementsHistoryDebug('Hay transaction_groups pero no se recuperaron líneas transactions por group_id', {
      householdId,
      groupCount: groups.length,
      groupIdSample: groupIds.slice(0, 5)
    });
  }

  const { data: accountsData } = await client
    .from('accounts')
    .select('id,name,type')
    .eq('household_id', householdId);

  const householdAccounts = (accountsData ?? []) as Array<{ id: string; name: string; type: string }>;
  const accountById = new Map(householdAccounts.map((account) => [account.id, account.name]));
  const transactionsByGroupId = transactions.reduce<Map<string, typeof transactions>>((acc, transaction) => {
    const existing = acc.get(transaction.group_id) ?? [];
    existing.push(transaction);
    acc.set(transaction.group_id, existing);
    return acc;
  }, new Map());

  logMovementsHistoryDebug('Diagnóstico de primeros grupos de historial', {
    householdId,
    builtGroupCount: groups.length,
    groups: groups.slice(0, 5).map((group) => {
      const lines = transactionsByGroupId.get(group.id) ?? [];
      const categoryDiagnostics = lines.map((line) => ({
        transactionId: line.id,
        category: line.category,
        visibility: isTechnicalMovementCategory(line.category) ? 'technical' : 'visible'
      }));
      const visibleLines = lines.filter((line) => !isTechnicalMovementCategory(line.category));

      return {
        groupId: group.id,
        note: group.note ?? null,
        source: group.source ?? null,
        created_at: group.created_at,
        lineCount: lines.length,
        categories: lines.map((line) => line.category),
        categoryDiagnostics,
        visibleLines: visibleLines.map((line) => ({
          transactionId: line.id,
          category: line.category,
          type: line.type,
          account_id: line.account_id,
          amount: line.amount
        }))
      };
    })
  });

  const movements = groups.flatMap<MovementHistoryItem>((group) => {
    const lines = transactionsByGroupId.get(group.id) ?? [];
    const visibleLines = lines.filter((tx) => !isTechnicalMovementCategory(tx.category));
    if (!visibleLines.length) return [];

    const action = inferMovementAction(lines);
    const debitLine = lines.find((tx) => tx.type === 'debit');
    const creditLine = lines.find((tx) => tx.type === 'credit');
    const visibleDebitLine = visibleLines.find((tx) => tx.type === 'debit');
    const visibleCreditLine = visibleLines.find((tx) => tx.type === 'credit');
    const amountLine = visibleDebitLine ?? visibleCreditLine ?? debitLine ?? creditLine;
    const amount = Number(amountLine?.amount ?? 0);

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

    const displayCategory = inferSemanticMovementCategory(action, lines);
    const displaySubcategory = lines.find((tx) => tx.category === displayCategory && tx.subcategory)?.subcategory ?? null;

    return [{
      id: group.id,
      fecha: happenedAt,
      tipoMovimiento: inferMovementType(lines),
      categoria: displayCategory,
      subcategoria: displaySubcategory,
      descripcion: group.note?.trim() ? group.note : 'Movimiento sin descripción',
      monto: amount,
      cuentaOrigen: reconstructedAccounts.sourceAccountName,
      cuentaDestino: reconstructedAccounts.destinationAccountName,
      puedeEditar: Boolean(action),
      motivoNoEditable: action ? null : 'Este tipo de movimiento aún no se puede editar de forma segura.'
    }];
  });

  movements.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  logMovementsHistoryDebug('Grupos visibles devueltos por historial', {
    householdId,
    visibleGroupCount: movements.length
  });

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
    case 'msi_purchase':
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
    transactionIntentSchema.parse({
      action: movement.action,
      amount: movement.amount,
      category: movement.action,
      description: 'movimiento',
      sourceAccount: source?.name,
      destinationAccount: destination?.name,
      missingFields: [],
      humanConfirmation: 'movimiento'
    }),
    source,
    destination
  );

  for (const [accountId, delta] of deltas.entries()) {
    deltas.set(accountId, delta * multiplier);
  }

  return deltas;
}


type ClosureTransactionLine = {
  id?: string;
  group_id: string;
  account_id: string | null;
  type: string;
  category: string;
  amount: string | number;
  happened_at: string;
};

type ClosureGroup = {
  id: string;
  household_id: string;
  note: string | null;
  created_at?: string;
};

const TRANSACTION_GROUP_QUERY_CHUNK_SIZE = 100;
const FINANCIAL_CLOSURE_TRANSACTION_GROUP_CHUNK_SIZE = TRANSACTION_GROUP_QUERY_CHUNK_SIZE;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoneyForStorage(value: number) {
  return roundMoney(value).toFixed(2);
}


function isMsiIntent(intent: TransactionIntent) {
  return intent.action === 'msi_purchase';
}

function isCreditAccountType(type: string | null | undefined) {
  return type === 'credit_card' || type === 'deuda' || type === 'loan';
}

function calculateMsiMonthlyAmount(totalAmount: number, months: number) {
  return roundMoney(totalAmount / months);
}

function mapMsiInstallment(row: {
  id: string;
  household_id: string;
  msi_purchase_id: string;
  installment_number: number;
  amount: string | number;
  due_date: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}): MsiInstallment {
  if (row.status !== 'pending' && row.status !== 'paid') {
    throw new Error('El estado del pago MSI guardado no es válido.');
  }

  return {
    id: row.id,
    householdId: row.household_id,
    msiPurchaseId: row.msi_purchase_id,
    installmentNumber: row.installment_number,
    amount: Number(row.amount),
    dueDate: row.due_date,
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMsiPurchase(row: {
  id: string;
  household_id: string;
  account_id: string;
  account_name?: string | null;
  description: string;
  category: string;
  total_amount: string | number;
  financing_type?: string | null;
  original_amount?: string | number | null;
  total_financed_amount?: string | number | null;
  interest_cost?: string | number | null;
  months: number;
  monthly_amount: string | number;
  purchase_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}, installments: MsiInstallment[]): MsiPurchase {
  if (!['active', 'completed', 'cancelled'].includes(row.status)) {
    throw new Error('El estado de la compra MSI guardada no es válido.');
  }

  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    accountName: row.account_name ?? 'Tarjeta sin nombre',
    description: row.description,
    category: row.category,
    financingType: (row.financing_type ?? 'interest_free') as MsiFinancingType,
    originalAmount: Number(row.original_amount ?? row.total_amount),
    totalAmount: Number(row.total_amount),
    totalFinancedAmount: Number(row.total_financed_amount ?? row.total_amount),
    interestCost: Number(row.interest_cost ?? 0),
    months: row.months,
    monthlyAmount: Number(row.monthly_amount),
    purchaseDate: row.purchase_date,
    status: row.status as MsiPurchaseStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    installments: installments.sort((a, b) => a.installmentNumber - b.installmentNumber)
  };
}

function buildMsiInstallmentPayload(householdId: string, purchaseId: string, months: number, monthlyAmount: number) {
  return Array.from({ length: months }, (_, index) => ({
    household_id: householdId,
    msi_purchase_id: purchaseId,
    installment_number: index + 1,
    amount: formatMoneyForStorage(monthlyAmount),
    due_date: null,
    status: 'pending',
    paid_at: null
  }));
}

async function createMsiPurchaseForIntent(
  intent: TransactionIntent,
  householdId: string,
  accounts: AccountOption[],
  options?: { happenedAt?: string },
  client: SupabaseClientLike = supabaseAdmin
) {
  const financingType = intent.financingType ?? 'interest_free';
  const originalAmount = Number(intent.originalAmount ?? intent.totalAmount ?? 0);
  const months = Number(intent.months ?? 0);
  const monthlyAmount = Number(intent.monthlyAmount ?? intent.amount ?? 0);
  const totalFinancedAmount = financingType === 'interest_bearing'
    ? roundMoney(monthlyAmount * months)
    : Number(intent.totalFinancedAmount ?? intent.totalAmount ?? originalAmount);
  const interestCost = financingType === 'interest_bearing'
    ? roundMoney(totalFinancedAmount - originalAmount)
    : 0;
  const sourceId = intent.sourceAccountId ?? findAccountIdByName(accounts, intent.sourceAccount);
  const sourceAccount = sourceId ? accounts.find((account) => account.id === sourceId) : null;

  if (originalAmount <= 0) throw new Error('El monto original de la compra a meses debe ser mayor a 0.');
  if (!Number.isInteger(months) || months <= 1) throw new Error('Las compras a meses deben tener más de un pago.');
  if (monthlyAmount <= 0) throw new Error('La mensualidad de la compra a meses debe ser mayor a 0.');
  if (!intent.description?.trim()) throw new Error('La descripción de la compra a meses es obligatoria.');
  if (!intent.category?.trim()) throw new Error('La categoría de la compra a meses es obligatoria.');
  if (!sourceAccount || !isCreditAccountType(sourceAccount.type)) {
    throw new Error('Las compras a meses solo pueden registrarse con tarjetas o cuentas de crédito.');
  }

  if (financingType === 'interest_free') {
    const expectedMonthlyAmount = calculateMsiMonthlyAmount(originalAmount, months);
    if (Math.abs(expectedMonthlyAmount - monthlyAmount) > 0.01) {
      throw new Error('La mensualidad MSI no coincide con el monto original y los meses.');
    }
  }
  if (financingType === 'interest_bearing' && totalFinancedAmount < originalAmount) {
    throw new Error('El total financiado no puede ser menor al monto original en una compra con intereses.');
  }

  const now = new Date().toISOString();
  const { data: purchase, error: purchaseError } = await client
    .from('msi_purchases')
    .insert({
      household_id: householdId,
      account_id: sourceAccount.id,
      description: intent.description.trim(),
      category: intent.category.trim(),
      total_amount: formatMoneyForStorage(totalFinancedAmount),
      financing_type: financingType,
      original_amount: formatMoneyForStorage(originalAmount),
      total_financed_amount: formatMoneyForStorage(totalFinancedAmount),
      interest_cost: formatMoneyForStorage(interestCost),
      months,
      monthly_amount: formatMoneyForStorage(monthlyAmount),
      purchase_date: options?.happenedAt ?? now,
      status: 'active',
      updated_at: now
    })
    .select('id')
    .single();

  if (purchaseError || !purchase?.id) {
    throw new Error(purchaseError?.message ?? 'No fue posible crear la compra MSI.');
  }

  const { error: installmentsError } = await client
    .from('msi_installments')
    .insert(buildMsiInstallmentPayload(householdId, purchase.id as string, months, monthlyAmount));

  if (installmentsError) {
    throw new Error(`No fue posible crear los pagos MSI: ${installmentsError.message}`);
  }
}

function dateRangeToTimestamps(periodStart: string, periodEnd: string) {
  return {
    start: `${periodStart}T00:00:00.000Z`,
    end: `${periodEnd}T23:59:59.999Z`
  };
}

function groupTransactionLines(lines: ClosureTransactionLine[]) {
  return lines.reduce<Record<string, ClosureTransactionLine[]>>((acc, line) => {
    acc[line.group_id] = acc[line.group_id] ?? [];
    acc[line.group_id].push(line);
    return acc;
  }, {});
}

function summarizePeriodMovements(groupedLines: Record<string, ClosureTransactionLine[]>) {
  let incomeTotal = 0;
  let expenseTotal = 0;
  let incomeMovementCount = 0;
  let expenseMovementCount = 0;

  for (const lines of Object.values(groupedLines)) {
    const action = inferMovementAction(lines);
    const debitLine = lines.find((line) => line.type === 'debit');
    const creditLine = lines.find((line) => line.type === 'credit');
    const amount = Number(debitLine?.amount ?? creditLine?.amount ?? 0);

    // Criterio conservador v2: se consideran ingresos/gastos solo los movimientos
    // clasificados como ingreso o gasto por las categorías contables existentes.
    // Transferencias internas, aportes a objetivos, préstamos y pagos de deuda no se
    // suman al flujo neto para evitar inflar ingresos/gastos del hogar.
    if (action === 'ingreso') {
      incomeTotal += amount;
      incomeMovementCount += 1;
    }
    if (action === 'gasto') {
      expenseTotal += amount;
      expenseMovementCount += 1;
    }
  }

  return {
    incomeTotal: roundMoney(incomeTotal),
    expenseTotal: roundMoney(expenseTotal),
    netFlow: roundMoney(incomeTotal - expenseTotal),
    movementSummary: {
      criteria: 'Cierre v2 cuenta solo movimientos inferidos como ingreso o gasto; transferencias internas, objetivos, préstamos y deuda quedan fuera del flujo neto.',
      movementCount: Object.keys(groupedLines).length,
      incomeMovementCount,
      expenseMovementCount
    }
  };
}

function calculatePeriodAccountDeltas(groupedLines: Record<string, ClosureTransactionLine[]>, accounts: AccountState[]) {
  const deltas = new Map<string, number>();

  for (const lines of Object.values(groupedLines)) {
    const descriptor = resolveStoredMovementDescriptor(lines.map((line) => ({
      type: line.type,
      category: line.category,
      account_id: line.account_id,
      amount: String(line.amount)
    })));
    if (!descriptor) continue;

    const movementDeltas = buildBalanceDeltasFromStoredMovement(descriptor, accounts, 1);
    for (const [accountId, delta] of movementDeltas.entries()) {
      deltas.set(accountId, (deltas.get(accountId) ?? 0) + delta);
    }
  }

  return deltas;
}

type FinancialClosureRow = {
  id: string;
  household_id: string;
  type: FinancialClosureType;
  period_start: string;
  period_end: string;
  opening_total: string | number;
  closing_total: string | number;
  net_change: string | number;
  income_total: string | number;
  expense_total: string | number;
  net_flow: string | number;
  account_snapshots: unknown;
  movement_summary: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type FinancialClosureCalculationInput = {
  householdId: string;
  type: FinancialClosureType;
  periodStart: string;
  periodEnd: string;
  notes?: string | null;
};

type FinancialClosurePersistencePayload = {
  household_id: string;
  type: FinancialClosureType;
  period_start: string;
  period_end: string;
  opening_total: string;
  closing_total: string;
  net_change: string;
  income_total: string;
  expense_total: string;
  net_flow: string;
  account_snapshots: FinancialClosureAccountSnapshot[];
  movement_summary: FinancialClosureMovementSummary;
  notes: string | null;
  updated_at: string;
};

function isOperationalClosureAccountType(type: string) {
  const normalized = type.toLowerCase().trim();

  // Dinero operativo real v2: solo cuentas que representan efectivo o dinero
  // líquido de uso diario. Incluye los nombres históricos y actuales del proyecto
  // para efectivo/cuentas operativas, y excluye explícitamente crédito, fondos,
  // inversiones, receivables, deudas y cuentas técnicas para que el resumen
  // principal responda "¿cómo terminó mi dinero operativo real?".
  const operationalTypes = new Set([
    'operativa',
    'operational_cash',
    'cash',
    'debit',
    'debit_card',
    'checking',
    'bank_account',
    'operative'
  ]);

  return operationalTypes.has(normalized);
}

export function getFinancialClosureAccountScope(accountType: string): FinancialClosureAccountScope {
  return isOperationalClosureAccountType(accountType) ? 'operational' : 'complementary';
}

function mapFinancialClosure(row: FinancialClosureRow): FinancialClosure {
  return {
    id: row.id,
    householdId: row.household_id,
    type: row.type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    openingTotal: Number(row.opening_total),
    closingTotal: Number(row.closing_total),
    netChange: Number(row.net_change),
    incomeTotal: Number(row.income_total),
    expenseTotal: Number(row.expense_total),
    netFlow: Number(row.net_flow),
    accountSnapshots: ((row.account_snapshots ?? []) as Array<FinancialClosureAccountSnapshot & { accountScope?: FinancialClosureAccountScope }>).map((snapshot) => ({
      ...snapshot,
      accountScope: snapshot.accountScope ?? getFinancialClosureAccountScope(snapshot.accountType)
    })),
    movementSummary: (row.movement_summary ?? null) as FinancialClosureMovementSummary | null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function buildFinancialClosurePayload(input: FinancialClosureCalculationInput, client: SupabaseClientLike): Promise<FinancialClosurePersistencePayload> {
  const { start, end } = dateRangeToTimestamps(input.periodStart, input.periodEnd);

  logFinancialClosureDebug('Iniciando lectura para cierre financiero', {
    householdId: input.householdId,
    start,
    end
  });

  const { data: accountsData, error: accountsError } = await client
    .from('accounts')
    .select('id,name,type,balance,household_id,is_active')
    .eq('household_id', input.householdId);

  if (accountsError) {
    throw new Error(`No fue posible leer cuentas para el cierre: ${accountsError.message}`);
  }

  const accountList = ((accountsData ?? []) as Array<{ id: string; name: string; type: string; balance: string | number; household_id: string; is_active?: boolean | null }>)
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      householdId: row.household_id,
      balance: Number(row.balance)
    }));

  const { data: groupsData, error: groupsError } = await client
    .from('transaction_groups')
    .select('id,household_id,note,created_at')
    .eq('household_id', input.householdId)
    .gte('created_at', start);

  if (groupsError) {
    throw new Error(`No fue posible leer movimientos para el cierre: ${groupsError.message}`);
  }

  const groups = (groupsData ?? []) as ClosureGroup[];
  const groupIds = groups.map((group) => group.id);
  logFinancialClosureDebug('Grupos encontrados para cierre financiero', {
    householdId: input.householdId,
    start,
    end,
    groupCount: groupIds.length
  });

  const transactionsData: ClosureTransactionLine[] = [];

  if (groupIds.length) {
    for (let index = 0; index < groupIds.length; index += FINANCIAL_CLOSURE_TRANSACTION_GROUP_CHUNK_SIZE) {
      const chunk = groupIds.slice(index, index + FINANCIAL_CLOSURE_TRANSACTION_GROUP_CHUNK_SIZE);

      logFinancialClosureDebug('Cargando chunk de transacciones para cierre financiero', {
        householdId: input.householdId,
        start,
        end,
        chunkIndex: Math.floor(index / FINANCIAL_CLOSURE_TRANSACTION_GROUP_CHUNK_SIZE) + 1,
        chunkSize: chunk.length
      });

      try {
        const { data: chunkTransactionsData, error: transactionsError } = await client
          .from('transactions')
          .select('id,group_id,account_id,type,category,amount,happened_at')
          .in('group_id', chunk)
          .gte('happened_at', start);

        if (transactionsError) {
          errorFinancialClosureDebug('Error al leer transacciones para cierre financiero', {
            householdId: input.householdId,
            start,
            end,
            chunkSize: chunk.length,
            error: transactionsError
          });
          throw new Error(`No fue posible leer transacciones para el cierre: ${transactionsError.message}`);
        }

        transactionsData.push(...((chunkTransactionsData ?? []) as ClosureTransactionLine[]));
      } catch (error) {
        errorFinancialClosureDebug('Excepción al leer transacciones para cierre financiero', {
          householdId: input.householdId,
          start,
          end,
          chunkSize: chunk.length,
          error
        });

        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`No fue posible leer transacciones para el cierre. La consulta se dividió en chunks de hasta ${FINANCIAL_CLOSURE_TRANSACTION_GROUP_CHUNK_SIZE} grupos, pero falló al cargar un chunk de ${chunk.length} grupos: ${message}`);
      }
    }
  }

  logFinancialClosureDebug('Transacciones cargadas para cierre financiero', {
    householdId: input.householdId,
    start,
    end,
    groupCount: groupIds.length,
    transactionCount: transactionsData.length
  });

  const closureLines = transactionsData.filter((line) => line.happened_at >= start);
  const periodLines = closureLines.filter((line) => line.happened_at <= end);
  const postPeriodLines = closureLines.filter((line) => line.happened_at > end);
  const groupedLines = groupTransactionLines(periodLines);
  const groupedPostPeriodLines = groupTransactionLines(postPeriodLines);
  const periodDeltas = calculatePeriodAccountDeltas(groupedLines, accountList);
  const postPeriodDeltas = calculatePeriodAccountDeltas(groupedPostPeriodLines, accountList);
  const accountSnapshots = accountList.map((account) => {
    // Reconstrucción histórica v3:
    // 1. Los saldos reales en `accounts.balance` representan el estado actual y
    //    no se modifican al calcular ni recalcular cierres.
    // 2. Para obtener el saldo real al cierre histórico, partimos del saldo
    //    actual y deshacemos únicamente los movimientos del mismo household que
    //    ocurrieron después de `periodEnd` (postPeriodDeltas). Esto conserva la
    //    lógica contable existente, incluyendo transferencias internas, y evita
    //    que todos los cierres antiguos hereden el mismo saldo actual.
    // 3. Una vez reconstruido el cierre histórico, el saldo inicial se obtiene
    //    restando el efecto neto de los movimientos dentro del periodo.
    // Los movimientos incompletos que no pueden resolverse con las reglas
    // actuales se ignoran de forma consistente tanto dentro como después del
    // periodo, igual que en el cálculo previo de snapshots.
    const closingBalance = roundMoney(account.balance - (postPeriodDeltas.get(account.id) ?? 0));
    const openingBalance = roundMoney(closingBalance - (periodDeltas.get(account.id) ?? 0));
    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      accountScope: getFinancialClosureAccountScope(account.type),
      openingBalance,
      closingBalance,
      difference: roundMoney(closingBalance - openingBalance)
    };
  });

  const operationalSnapshots = accountSnapshots.filter((account) => account.accountScope === 'operational');
  const closingTotal = roundMoney(operationalSnapshots.reduce((acc, account) => acc + account.closingBalance, 0));
  const openingTotal = roundMoney(operationalSnapshots.reduce((acc, account) => acc + account.openingBalance, 0));
  const movementTotals = summarizePeriodMovements(groupedLines);

  return {
    household_id: input.householdId,
    type: input.type,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    opening_total: formatMoneyForStorage(openingTotal),
    closing_total: formatMoneyForStorage(closingTotal),
    net_change: formatMoneyForStorage(closingTotal - openingTotal),
    income_total: formatMoneyForStorage(movementTotals.incomeTotal),
    expense_total: formatMoneyForStorage(movementTotals.expenseTotal),
    net_flow: formatMoneyForStorage(movementTotals.netFlow),
    account_snapshots: accountSnapshots,
    movement_summary: movementTotals.movementSummary,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    updated_at: new Date().toISOString()
  };
}

async function getOwnedFinancialClosureRow(householdId: string, closureId: string, client: SupabaseClientLike) {
  const { data, error } = await client
    .from('financial_closures')
    .select('id,household_id,type,period_start,period_end,opening_total,closing_total,net_change,income_total,expense_total,net_flow,account_snapshots,movement_summary,notes,created_at,updated_at')
    .eq('household_id', householdId)
    .eq('id', closureId)
    .maybeSingle();

  if (error) {
    throw new Error(`No fue posible leer el cierre financiero: ${error.message}`);
  }

  return data ? (data as FinancialClosureRow) : null;
}

export async function createFinancialClosure(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin): Promise<FinancialClosure> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    throw new Error('No existe un hogar configurado para crear cierres.');
  }

  const input = financialClosureCreateSchema.parse(rawInput);
  const payload = await buildFinancialClosurePayload({
    householdId,
    type: input.type,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    notes: input.notes
  }, client);

  const { data, error } = await client
    .from('financial_closures')
    .insert(payload)
    .select('id,household_id,type,period_start,period_end,opening_total,closing_total,net_change,income_total,expense_total,net_flow,account_snapshots,movement_summary,notes,created_at,updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible guardar el cierre financiero.');
  }

  return mapFinancialClosure(data as FinancialClosureRow);
}

export async function recalculateFinancialClosure(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin): Promise<FinancialClosure> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    throw new Error('No existe un hogar configurado para recalcular cierres.');
  }

  const input = financialClosureActionSchema.parse(rawInput);
  const existing = await getOwnedFinancialClosureRow(householdId, input.closureId, client);
  if (!existing) {
    throw new Error('No se encontró el cierre en este hogar.');
  }

  const payload = await buildFinancialClosurePayload({
    householdId,
    type: existing.type,
    periodStart: existing.period_start,
    periodEnd: existing.period_end,
    notes: existing.notes
  }, client);

  const { data, error } = await client
    .from('financial_closures')
    .update({
      opening_total: payload.opening_total,
      closing_total: payload.closing_total,
      net_change: payload.net_change,
      income_total: payload.income_total,
      expense_total: payload.expense_total,
      net_flow: payload.net_flow,
      account_snapshots: payload.account_snapshots,
      movement_summary: payload.movement_summary,
      updated_at: payload.updated_at
    })
    .eq('id', existing.id)
    .eq('household_id', householdId)
    .select('id,household_id,type,period_start,period_end,opening_total,closing_total,net_change,income_total,expense_total,net_flow,account_snapshots,movement_summary,notes,created_at,updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible recalcular el cierre financiero.');
  }

  return mapFinancialClosure(data as FinancialClosureRow);
}

export async function deleteFinancialClosure(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    throw new Error('No existe un hogar configurado para eliminar cierres.');
  }

  const input = financialClosureActionSchema.parse(rawInput);
  const existing = await getOwnedFinancialClosureRow(householdId, input.closureId, client);
  if (!existing) {
    throw new Error('No se encontró el cierre en este hogar.');
  }

  const { error } = await client
    .from('financial_closures')
    .delete()
    .eq('id', existing.id)
    .eq('household_id', householdId);

  if (error) {
    throw new Error(`No fue posible eliminar el cierre financiero: ${error.message}`);
  }
}

export async function getFinancialClosures(client: SupabaseClientLike = supabaseAdmin): Promise<FinancialClosuresData> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    return { hasHousehold: false, closures: [] };
  }

  const { data, error } = await client
    .from('financial_closures')
    .select('id,household_id,type,period_start,period_end,opening_total,closing_total,net_change,income_total,expense_total,net_flow,account_snapshots,movement_summary,notes,created_at,updated_at')
    .eq('household_id', householdId)
    .order('period_end', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`No fue posible leer cierres financieros: ${error.message}`);
  }

  return {
    hasHousehold: true,
    closures: ((data ?? []) as FinancialClosureRow[]).map(mapFinancialClosure)
  };
}

export async function getFinancialClosureDetail(closureId: string, client: SupabaseClientLike = supabaseAdmin): Promise<FinancialClosure | null> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) return null;

  const data = await getOwnedFinancialClosureRow(householdId, closureId, client);
  return data ? mapFinancialClosure(data) : null;
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
    case 'msi_purchase':
      return [
        { accountId: null, type: 'debit', category: intent.category ?? 'otros_gastos', amount: intent.amount },
        { accountId: sourceId, type: 'credit', category: 'salida_cuenta', amount: intent.amount }
      ];
    case 'ingreso':
      return [
        { accountId: destinationId, type: 'debit', category: 'entrada_cuenta', amount: intent.amount },
        { accountId: null, type: 'credit', category: intent.category ?? 'otros_gastos', amount: intent.amount }
      ];
    case 'transferencia':
      return [
        { accountId: destinationId, type: 'debit', category: intent.category ?? 'otros_gastos', amount: intent.amount },
        { accountId: sourceId, type: 'credit', category: intent.category ?? 'otros_gastos', amount: intent.amount }
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
  const movementIntent = isMsiIntent(intent)
    ? { ...intent, amount: Number(intent.monthlyAmount ?? intent.amount) }
    : intent;
  const lines = buildJournalEntries(movementIntent, accounts);

  const { data: group, error: groupError } = await supabaseAdmin
    .from('transaction_groups')
    .insert({
      household_id: householdId,
      source: 'conversacional',
      note: movementIntent.description
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
    subcategory: line.category === movementIntent.category ? movementIntent.subcategory ?? null : null,
    amount: line.amount.toFixed(2),
    happened_at: happenedAt
  }));

  const { error: txError } = await supabaseAdmin.from('transactions').insert(transactionsPayload);

  if (txError) {
    throw new Error(txError.message);
  }

  await applyAccountBalanceUpdates(householdId, movementIntent);
  if (isMsiIntent(intent)) {
    await createMsiPurchaseForIntent(movementIntent, householdId, accounts, options);
  }
  await recalculateIndicators(householdId);
}


function mergeDeltas(target: Map<string, number>, source: Map<string, number>) {
  for (const [accountId, delta] of source.entries()) {
    target.set(accountId, (target.get(accountId) ?? 0) + delta);
  }
}

async function deleteTransactionGroups(groupIds: string[]) {
  if (!groupIds.length) return;
  await supabaseAdmin.from('transactions').delete().in('group_id', groupIds);
  await supabaseAdmin.from('transaction_groups').delete().in('id', groupIds);
}

async function applyBatchAccountBalanceUpdates(householdId: string, intents: TransactionIntent[], registrationAccounts: AccountOption[]) {
  const accounts = await getHouseholdAccounts(householdId);
  const aggregateDeltas = new Map<string, number>();

  for (const intent of intents) {
    const sourceId = findAccountIdByName(registrationAccounts, intent.sourceAccount);
    const destinationId = findAccountIdByName(registrationAccounts, intent.destinationAccount);
    const source = accounts.find((account) => account.id === sourceId);
    const destination = accounts.find((account) => account.id === destinationId);
    mergeDeltas(aggregateDeltas, buildAccountBalanceDeltas(intent, source, destination));
  }

  const appliedAccountIds: string[] = [];
  try {
    for (const [accountId, delta] of aggregateDeltas.entries()) {
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
      appliedAccountIds.push(account.id);
    }
  } catch (error) {
    for (const accountId of appliedAccountIds) {
      const originalAccount = accounts.find((account) => account.id === accountId);
      if (!originalAccount) continue;
      const { error: rollbackError } = await supabaseAdmin
        .from('accounts')
        .update({ balance: originalAccount.balance.toFixed(2) })
        .eq('id', originalAccount.id)
        .eq('household_id', householdId);
      if (rollbackError && process.env.NODE_ENV === 'development') {
        console.warn('[batch-save-rollback] No fue posible revertir saldo', { accountId, error: rollbackError.message });
      }
    }
    throw error;
  }
}

export async function saveConversationalTransactionBatch(
  intents: TransactionIntent[],
  options?: {
    happenedAt?: string;
  }
) {
  if (!intents.length) {
    throw new Error('No hay movimientos para guardar.');
  }

  const householdId = await getDefaultHouseholdId();
  if (!householdId) {
    throw new Error('No existe un hogar configurado para registrar movimientos.');
  }

  const accounts = await getAccountsForRegistration();
  const happenedAt = options?.happenedAt ?? new Date().toISOString();
  const insertedGroupIds: string[] = [];

  try {
    const movementIntents = intents.map((intent) => isMsiIntent(intent) ? { ...intent, amount: Number(intent.monthlyAmount ?? intent.amount) } : intent);
    for (const intent of movementIntents) {
      const lines = buildJournalEntries(intent, accounts);
      const { data: group, error: groupError } = await supabaseAdmin
        .from('transaction_groups')
        .insert({
          household_id: householdId,
          source: 'conversacional_lote',
          note: intent.description
        })
        .select('id')
        .single();

      if (groupError || !group?.id) {
        throw new Error(groupError?.message ?? 'No fue posible crear un grupo de transacción del lote.');
      }
      insertedGroupIds.push(group.id);

      const transactionsPayload = lines.map((line) => ({
        group_id: group.id,
        account_id: line.accountId,
        type: line.type,
        category: line.category,
        subcategory: line.category === intent.category ? intent.subcategory ?? null : null,
        amount: line.amount.toFixed(2),
        happened_at: happenedAt
      }));

      const { error: txError } = await supabaseAdmin.from('transactions').insert(transactionsPayload);
      if (txError) throw new Error(txError.message);
    }

    await applyBatchAccountBalanceUpdates(householdId, movementIntents, accounts);
    for (const intent of movementIntents) {
      if (isMsiIntent(intent)) {
        await createMsiPurchaseForIntent(intent, householdId, accounts, { happenedAt });
      }
    }
    await recalculateIndicators(householdId);
  } catch (error) {
    await deleteTransactionGroups(insertedGroupIds);
    throw error;
  }
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
    .select('id,group_id,account_id,type,category,subcategory,amount')
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
    subcategory?: string | null;
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

  const categorySelection = input.category
    ? await validateCategorySelection(householdId, input.category, input.subcategory)
    : null;
  const nextCategory = categorySelection?.categoryKey ?? null;
  const subcategory = categorySelection?.subcategoryKey ?? null;

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
        category: nextCategory && line.category !== 'entrada_cuenta' && line.category !== 'salida_cuenta' ? nextCategory : line.category,
        subcategory: nextCategory && line.category !== 'entrada_cuenta' && line.category !== 'salida_cuenta' ? subcategory : null,
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


function buildEmptyMsiSectionSummary(): MsiSectionSummary {
  return {
    activePurchases: 0,
    pendingOriginalTotal: 0,
    pendingFinancedTotal: 0,
    pendingInterestCost: 0,
    pendingInstallments: 0,
    paidInstallments: 0
  };
}

function buildEmptyMsiSummary(): MsiSummary {
  return {
    activePurchases: 0,
    pendingTotal: 0,
    pendingInstallments: 0,
    paidInstallments: 0,
    interestFree: buildEmptyMsiSectionSummary(),
    interestBearing: buildEmptyMsiSectionSummary()
  };
}

export async function getMsiPurchases(client: SupabaseClientLike = supabaseAdmin): Promise<MsiData> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    return {
      hasHousehold: false,
      purchases: [],
      summary: buildEmptyMsiSummary()
    };
  }

  const { data: purchasesData, error: purchasesError } = await client
    .from('msi_purchases')
    .select('id,household_id,account_id,description,category,total_amount,financing_type,original_amount,total_financed_amount,interest_cost,months,monthly_amount,purchase_date,status,created_at,updated_at')
    .eq('household_id', householdId)
    .order('purchase_date', { ascending: false });

  if (purchasesError) {
    throw new Error(`No fue posible leer compras MSI: ${purchasesError.message}`);
  }

  const purchaseRows = (purchasesData ?? []) as Array<{
    id: string;
    household_id: string;
    account_id: string;
    description: string;
    category: string;
    total_amount: string | number;
    financing_type?: string | null;
    original_amount?: string | number | null;
    total_financed_amount?: string | number | null;
    interest_cost?: string | number | null;
    months: number;
    monthly_amount: string | number;
    purchase_date: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  const purchaseIds = purchaseRows.map((purchase) => purchase.id);
  const accountIds = Array.from(new Set(purchaseRows.map((purchase) => purchase.account_id)));

  const installmentsResult = purchaseIds.length
    ? await client
      .from('msi_installments')
      .select('id,household_id,msi_purchase_id,installment_number,amount,due_date,status,paid_at,created_at,updated_at')
      .in('msi_purchase_id', purchaseIds)
    : { data: [], error: null };

  if (installmentsResult.error) {
    throw new Error(`No fue posible leer pagos MSI: ${installmentsResult.error.message}`);
  }

  const accountsResult = accountIds.length
    ? await client.from('accounts').select('id,name').in('id', accountIds)
    : { data: [], error: null };

  if (accountsResult.error) {
    throw new Error(`No fue posible leer tarjetas MSI: ${accountsResult.error.message}`);
  }

  const accountNameById = new Map(((accountsResult.data ?? []) as Array<{ id: string; name: string }>).map((account) => [account.id, account.name]));
  const installments = ((installmentsResult.data ?? []) as Parameters<typeof mapMsiInstallment>[0][]).map(mapMsiInstallment);
  const installmentsByPurchase = installments.reduce<Record<string, MsiInstallment[]>>((acc, installment) => {
    acc[installment.msiPurchaseId] = acc[installment.msiPurchaseId] ?? [];
    acc[installment.msiPurchaseId].push(installment);
    return acc;
  }, {});

  const purchases = purchaseRows.map((purchase) => mapMsiPurchase({
    ...purchase,
    account_name: accountNameById.get(purchase.account_id) ?? null
  }, installmentsByPurchase[purchase.id] ?? []));

  const summary = purchases.reduce<MsiSummary>((acc, purchase) => {
    const section = purchase.financingType === 'interest_bearing' ? acc.interestBearing : acc.interestFree;
    if (purchase.status === 'active') {
      acc.activePurchases += 1;
      section.activePurchases += 1;
    }
    const paidCount = purchase.installments.filter((installment) => installment.status === 'paid').length;
    const pendingCount = purchase.installments.filter((installment) => installment.status === 'pending').length;
    const paidRatio = purchase.months > 0 ? paidCount / purchase.months : 0;
    const pendingOriginalAmount = roundMoney(Math.max(0, purchase.originalAmount * (1 - paidRatio)));
    const pendingFinancedAmount = purchase.installments
      .filter((installment) => installment.status === 'pending')
      .reduce((sum, installment) => sum + installment.amount, 0);
    const pendingInterestCost = roundMoney(Math.max(0, purchase.interestCost * (pendingCount / Math.max(1, purchase.months))));

    for (const installment of purchase.installments) {
      if (installment.status === 'pending') {
        acc.pendingInstallments += 1;
        section.pendingInstallments += 1;
        if (purchase.status !== 'cancelled') acc.pendingTotal += installment.amount;
      } else {
        acc.paidInstallments += 1;
        section.paidInstallments += 1;
      }
    }
    if (purchase.status !== 'cancelled') {
      section.pendingOriginalTotal += pendingOriginalAmount;
      section.pendingFinancedTotal += pendingFinancedAmount;
      section.pendingInterestCost += pendingInterestCost;
    }
    return acc;
  }, buildEmptyMsiSummary());

  summary.pendingTotal = roundMoney(summary.pendingTotal);
  summary.interestFree.pendingOriginalTotal = roundMoney(summary.interestFree.pendingOriginalTotal);
  summary.interestFree.pendingFinancedTotal = roundMoney(summary.interestFree.pendingFinancedTotal);
  summary.interestFree.pendingInterestCost = roundMoney(summary.interestFree.pendingInterestCost);
  summary.interestBearing.pendingOriginalTotal = roundMoney(summary.interestBearing.pendingOriginalTotal);
  summary.interestBearing.pendingFinancedTotal = roundMoney(summary.interestBearing.pendingFinancedTotal);
  summary.interestBearing.pendingInterestCost = roundMoney(summary.interestBearing.pendingInterestCost);
  return { hasHousehold: true, purchases, summary };
}

async function refreshMsiPurchaseStatus(householdId: string, purchaseId: string, client: SupabaseClientLike = supabaseAdmin) {
  const { data, error } = await client
    .from('msi_installments')
    .select('status')
    .eq('household_id', householdId)
    .eq('msi_purchase_id', purchaseId);

  if (error) {
    throw new Error(`No fue posible validar pagos MSI: ${error.message}`);
  }

  const statuses = (data ?? []) as Array<{ status: string }>;
  const nextStatus = statuses.length > 0 && statuses.every((installment) => installment.status === 'paid') ? 'completed' : 'active';
  const { error: updateError } = await client
    .from('msi_purchases')
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq('id', purchaseId)
    .eq('household_id', householdId);

  if (updateError) {
    throw new Error(`No fue posible actualizar la compra MSI: ${updateError.message}`);
  }
}

async function updateMsiInstallmentStatus(rawInput: unknown, status: MsiInstallmentStatus, client: SupabaseClientLike = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('No existe un hogar configurado para controlar MSI.');

  const input = msiInstallmentActionSchema.parse(rawInput);
  const { data: existing, error: readError } = await client
    .from('msi_installments')
    .select('id,household_id,msi_purchase_id')
    .eq('id', input.installmentId)
    .eq('household_id', householdId)
    .maybeSingle();

  if (readError) throw new Error(`No fue posible leer el pago MSI: ${readError.message}`);
  if (!existing) throw new Error('No se encontró el pago MSI en este hogar.');

  const now = new Date().toISOString();
  const { data, error } = await client
    .from('msi_installments')
    .update({
      status,
      paid_at: status === 'paid' ? now : null,
      updated_at: now
    })
    .eq('id', input.installmentId)
    .eq('household_id', householdId)
    .select('id,household_id,msi_purchase_id,installment_number,amount,due_date,status,paid_at,created_at,updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'No fue posible actualizar el pago MSI.');
  }

  await refreshMsiPurchaseStatus(householdId, (existing as { msi_purchase_id: string }).msi_purchase_id, client);
  return mapMsiInstallment(data as Parameters<typeof mapMsiInstallment>[0]);
}

export async function deleteMsiPurchase(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('No existe un hogar configurado para eliminar compras a meses.');

  const input = msiPurchaseActionSchema.parse(rawInput);
  const { data: existing, error: readError } = await client
    .from('msi_purchases')
    .select('id,household_id')
    .eq('id', input.purchaseId)
    .eq('household_id', householdId)
    .maybeSingle();

  if (readError) throw new Error(`No fue posible leer la compra a meses: ${readError.message}`);
  if (!existing) throw new Error('No se encontró la compra a meses en este hogar.');

  const { error: installmentsError } = await client
    .from('msi_installments')
    .delete()
    .eq('msi_purchase_id', input.purchaseId)
    .eq('household_id', householdId);

  if (installmentsError) {
    throw new Error(`No fue posible eliminar los pagos programados: ${installmentsError.message}`);
  }

  const { error: purchaseError } = await client
    .from('msi_purchases')
    .delete()
    .eq('id', input.purchaseId)
    .eq('household_id', householdId);

  if (purchaseError) {
    throw new Error(`No fue posible eliminar la compra a meses: ${purchaseError.message}`);
  }
}

export async function markMsiInstallmentAsPaid(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  return updateMsiInstallmentStatus(rawInput, 'paid', client);
}

export async function restoreMsiInstallmentToPending(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  return updateMsiInstallmentStatus(rawInput, 'pending', client);
}

export type FinancialCategoryType = 'income' | 'expense' | 'both';
export type ProjectionColumnType = 'income' | 'expense';

export type FinancialSubcategory = {
  id: string;
  householdId: string;
  financialCategoryId: string;
  name: string;
  key: string;
  isActive: boolean;
  plannedAmount?: number | null;
  plannedPeriodType?: FlowPeriodType | null;
  flowFundId?: string | null;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinancialCategory = {
  id: string;
  householdId: string;
  name: string;
  key: string;
  type: FinancialCategoryType;
  isActive: boolean;
  noProjectable: boolean;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
  subcategories: FinancialSubcategory[];
};

export type ProjectionColumn = {
  id: string;
  householdId: string;
  name: string;
  key: string;
  type: ProjectionColumnType;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
  canDelete: boolean;
  deleteBlockedReason: string | null;
  createdAt: string;
  updatedAt: string;
  categoryIds: string[];
  categories: Array<{ id: string; name: string; key: string; type: FinancialCategoryType; isActive: boolean; noProjectable: boolean }>;
};

export type ConfiguredFlow = {
  id: string; householdId: string; name: string; periodType: FlowPeriodType; targetType: FlowTargetType; manualTargetAmount: number | null; isActive: boolean; canDelete: boolean; deleteBlockedReason: string | null; targetAmount: number;
};

export type ConfigurationData = {
  hasHousehold: boolean;
  householdId: string | null;
  categories: FinancialCategory[];
  projectionColumns: ProjectionColumn[];
  flows: ConfiguredFlow[];
  categoryAudit: CategoryAuditData;
};


export type CategoryAuditStatus = 'missing_category' | 'inactive_category' | 'unassigned_projection' | 'no_projectable';

export type CategoryAuditMovement = {
  id: string;
  date: string;
  description: string;
  accountName: string | null;
  type: string;
  amount: number;
  category: string;
  subcategory: string | null;
  status: CategoryAuditStatus;
};

export type CategoryAuditGroup = {
  category: string;
  categoryName: string | null;
  status: CategoryAuditStatus;
  total: number;
  movementCount: number;
  movements: CategoryAuditMovement[];
};

export type CategoryAuditData = {
  groups: CategoryAuditGroup[];
  noProjectableGroups: CategoryAuditGroup[];
  summary: {
    problemCategoryCount: number;
    problemMovementCount: number;
    problemTotal: number;
    noProjectableMovementCount: number;
  };
};

export type WeeklyProjectionMovementDetail = {
  id: string;
  groupId: string;
  date: string;
  description: string;
  accountName: string | null;
  amount: number;
  category: string;
  categoryName: string;
  subcategory: string | null;
};

export type WeeklyProjectionCategoryDetail = {
  category: string;
  categoryName: string;
  subcategories: Array<{ subcategory: string; total: number; movements: WeeklyProjectionMovementDetail[] }>;
  total: number;
  averageWeekly: number;
  movementCount: number;
};

export type WeeklyProjectionColumnSummary = {
  columnId: string;
  columnName: string;
  columnKey: string;
  type: ProjectionColumnType;
  total: number;
  averageWeekly: number;
  weeksUsed: number;
  categories: Array<{ id: string; key: string; name: string }>;
  categoryBreakdown: WeeklyProjectionCategoryDetail[];
  subcategoryBreakdown: Array<{ subcategory: string; total: number }>;
};

export type WeeklyProjectionCell = {
  amount: number;
  movements: WeeklyProjectionMovementDetail[];
  categoryBreakdown: WeeklyProjectionCategoryDetail[];
  projectedFromAverage?: boolean;
  averageUsed?: number;
  historicalValues?: Array<{ label: string; amount: number }>;
};

export type WeeklyProjectionRow = {
  id: string;
  block: 'historical' | 'current' | 'projection';
  label: string;
  startDate: string;
  endDate: string;
  isValidHistorical: boolean;
  cells: Record<string, WeeklyProjectionCell>;
  totalIncome: number;
  totalExpense: number;
  balance: number;
  operationalMoney: number;
};

export type WeeklyProjectionSummary = {
  hasHousehold: boolean;
  hasConfiguration: boolean;
  operationalMoney: number;
  historicalWeeksUsed: number;
  averageWeeklyIncome: number;
  averageWeeklyExpense: number;
  averageWeeklyBalance: number;
  projectedOperationalMoney12Weeks: number;
  projectedChange: number;
  columns: WeeklyProjectionColumnSummary[];
  tableRows: WeeklyProjectionRow[];
  excludedWeeks: WeeklyProjectionRow[];
  unclassified: Array<{ category: string; categoryName?: string | null; total: number; movementCount: number; movements?: WeeklyProjectionMovementDetail[] }>;
  scenarioNotes: {
    activeColumns: number;
    validHistoricalWeeks: number;
    currentWeekExcluded: boolean;
    unclassifiedCategories: number;
    ignoredNoProjectableCategories: number;
  };
};

export const categoryTypeValues = ['income', 'expense', 'both'] as const;
export const projectionColumnTypeValues = ['income', 'expense'] as const;

export const normalizedKeySchema = z.string().trim().min(1).max(64).regex(/^[a-z0-9_]+$/, 'Usa solo letras, números y guiones bajos.');

export function normalizeFinancialKey(input: string | null | undefined) {
  return (input ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function normalizeAndValidateRequiredKey(value: string, label: string) {
  const key = normalizeFinancialKey(value);
  const parsed = normalizedKeySchema.safeParse(key);
  if (!parsed.success) {
    throw new Error(`${label} debe tener letras o números y usar caracteres seguros.`);
  }
  return key;
}

function normalizeAndValidateOptionalKey(value: string | null | undefined, label: string) {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  return normalizeAndValidateRequiredKey(raw, label);
}

export const financialCategoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'El nombre de la categoría es obligatorio.').max(80),
  type: z.enum(categoryTypeValues),
  noProjectable: z.boolean().default(false),
  householdId: z.string().min(1).optional()
});

export const financialCategoryUpdateSchema = financialCategoryCreateSchema.extend({
  categoryId: z.string().min(1),
  isActive: z.boolean().optional()
});

export const financialCategoryToggleSchema = z.object({ categoryId: z.string().min(1), isActive: z.boolean() });
export const financialCategoryDeleteSchema = z.object({ categoryId: z.string().min(1) });

export const financialSubcategoryCreateSchema = z.object({
  financialCategoryId: z.string().min(1),
  name: z.string().trim().min(1, 'El nombre de la subcategoría es obligatorio.').max(80),
  plannedAmount: z.coerce.number().finite().min(0).nullable().optional(),
  plannedPeriodType: z.enum(FLOW_PERIOD_TYPES).nullable().optional(),
  flowFundId: z.string().uuid().nullable().optional(),
  householdId: z.string().min(1).optional()
});

export const financialSubcategoryUpdateSchema = financialSubcategoryCreateSchema.extend({
  subcategoryId: z.string().min(1),
  isActive: z.boolean().optional()
});

export const financialSubcategoryToggleSchema = z.object({ subcategoryId: z.string().min(1), isActive: z.boolean() });
export const financialSubcategoryDeleteSchema = z.object({ subcategoryId: z.string().min(1) });

const flowBaseSchema = z.object({
  name: z.string().trim().min(1, 'El nombre del flujo es obligatorio.').max(80),
  periodType: z.enum(FLOW_PERIOD_TYPES),
  targetType: z.enum(['calculated', 'manual']),
  manualTargetAmount: z.coerce.number().finite().min(0).nullable().optional(),
  householdId: z.string().min(1).optional()
});
export const flowCreateSchema = flowBaseSchema;
export const flowUpdateSchema = flowBaseSchema.extend({ flowId: z.string().uuid(), isActive: z.boolean().optional() });
export const flowDeleteSchema = z.object({ flowId: z.string().uuid() });

export const projectionColumnCreateSchema = z.object({
  name: z.string().trim().min(1, 'El nombre de la columna es obligatorio.').max(80),
  type: z.enum(projectionColumnTypeValues),
  description: z.string().trim().max(240).nullable().optional(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  householdId: z.string().min(1).optional()
});

export const projectionColumnUpdateSchema = projectionColumnCreateSchema.extend({
  columnId: z.string().min(1),
  isActive: z.boolean().optional()
});

export const projectionColumnToggleSchema = z.object({ columnId: z.string().min(1), isActive: z.boolean() });
export const projectionColumnDeleteSchema = z.object({ columnId: z.string().min(1) });

export const projectionColumnCategoryAssignSchema = z.object({
  projectionColumnId: z.string().min(1),
  financialCategoryId: z.string().min(1)
});

export const projectionColumnCategoryRemoveSchema = projectionColumnCategoryAssignSchema;

export const categoryAuditReclassifySchema = z.object({
  movementId: z.string().min(1),
  category: z.string().trim().min(1),
  subcategory: z.string().trim().nullable().optional()
});

type FinancialSubcategoryRow = {
  id: string;
  household_id: string;
  financial_category_id: string;
  name: string;
  key: string;
  is_active: boolean;
  planned_amount?: string | number | null;
  planned_period_type?: FlowPeriodType | null;
  flow_fund_id?: string | null;
  created_at: string;
  updated_at: string;
};

type FinancialCategoryRow = {
  id: string;
  household_id: string;
  name: string;
  key: string;
  type: FinancialCategoryType;
  no_projectable?: boolean | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ProjectionColumnRow = {
  id: string;
  household_id: string;
  name: string;
  key: string;
  type: ProjectionColumnType;
  description?: string | null;
  display_order?: number | string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ProjectionAssignmentRow = { projection_column_id: string; financial_category_id: string };
type ProjectionTransactionRow = { id?: string; group_id: string; account_id?: string | null; type: string; category: string; subcategory?: string | null; amount: string | number; happened_at?: string | null };

function mapFinancialSubcategory(row: FinancialSubcategoryRow): FinancialSubcategory {
  return {
    id: row.id,
    householdId: row.household_id,
    financialCategoryId: row.financial_category_id,
    name: row.name,
    key: row.key,
    isActive: row.is_active ?? true,
    plannedAmount: row.planned_amount == null ? null : Number(row.planned_amount),
    plannedPeriodType: row.planned_period_type ?? null,
    flowFundId: row.flow_fund_id ?? null,
    canDelete: true,
    deleteBlockedReason: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFinancialCategory(row: FinancialCategoryRow, subcategories: FinancialSubcategory[] = []): FinancialCategory {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    key: row.key,
    type: row.type,
    isActive: row.is_active ?? true,
    noProjectable: row.no_projectable ?? false,
    canDelete: true,
    deleteBlockedReason: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    subcategories
  };
}

function mapProjectionColumn(row: ProjectionColumnRow, categories: ProjectionColumn['categories'] = []): ProjectionColumn {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    key: row.key,
    type: row.type,
    description: row.description ?? null,
    displayOrder: Number(row.display_order ?? 0),
    isActive: row.is_active ?? true,
    canDelete: true,
    deleteBlockedReason: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryIds: categories.map((category) => category.id),
    categories
  };
}


export async function getFinancialCategoryCatalog(householdId?: string | null, client: SupabaseClientLike = supabaseAdmin): Promise<FinancialCategoryCatalogItem[]> {
  const resolvedHouseholdId = householdId ?? await getDefaultHouseholdId(client);
  if (!resolvedHouseholdId) return [];

  const [categoriesResult, subcategoriesResult] = await Promise.all([
    client
      .from('financial_categories')
      .select('id,household_id,name,key,type,no_projectable,is_active,created_at,updated_at')
      .eq('household_id', resolvedHouseholdId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    client
      .from('financial_subcategories')
      .select('id,household_id,financial_category_id,name,key,is_active,planned_amount,planned_period_type,flow_fund_id,created_at,updated_at')
      .eq('household_id', resolvedHouseholdId)
      .eq('is_active', true)
      .order('name', { ascending: true })
  ]);

  if (categoriesResult.error) throw new Error(`No fue posible leer categorías activas: ${categoriesResult.error.message}`);
  if (subcategoriesResult.error) throw new Error(`No fue posible leer subcategorías activas: ${subcategoriesResult.error.message}`);

  const subcategoriesByCategory = ((subcategoriesResult.data ?? []) as FinancialSubcategoryRow[])
    .reduce<Record<string, FinancialCategoryCatalogSubcategory[]>>((acc, row) => {
      acc[row.financial_category_id] = [...(acc[row.financial_category_id] ?? []), { id: row.id, name: row.name, key: row.key }];
      return acc;
    }, {});

  return ((categoriesResult.data ?? []) as FinancialCategoryRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    key: row.key,
    type: row.type,
    noProjectable: row.no_projectable ?? false,
    subcategories: subcategoriesByCategory[row.id] ?? []
  }));
}

export async function validateCategorySelection(
  householdId: string,
  categoryKey: string,
  subcategoryKey?: string | null,
  client: SupabaseClientLike = supabaseAdmin
) {
  const normalizedCategoryKey = normalizeAndValidateRequiredKey(categoryKey, 'La categoría');
  const normalizedSubcategoryKey = normalizeAndValidateOptionalKey(subcategoryKey, 'La subcategoría');
  const catalog = await getFinancialCategoryCatalog(householdId, client);
  const category = catalog.find((item) => item.key === normalizedCategoryKey);

  if (!category) {
    throw new Error('La categoría seleccionada no existe o está inactiva en este hogar. Créala o actívala en Configuración.');
  }

  if (!normalizedSubcategoryKey) {
    return { categoryKey: category.key, subcategoryKey: null, category };
  }

  const subcategory = category.subcategories.find((item) => item.key === normalizedSubcategoryKey);
  if (!subcategory) {
    throw new Error('La subcategoría seleccionada no existe, está inactiva o no pertenece a la categoría elegida.');
  }

  return { categoryKey: category.key, subcategoryKey: subcategory.key, category, subcategory };
}

async function resolveInputHouseholdId(inputHouseholdId: string | undefined, client: SupabaseClientLike) {
  const householdId = inputHouseholdId ?? await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('No existe un hogar configurado para Configuración.');
  return householdId;
}

async function assertUniqueKey(table: string, householdId: string, key: string, client: SupabaseClientLike, ignoreId?: string, extra?: { field: string; value: string }) {
  let query = client.from(table).select('id').eq('household_id', householdId).eq('key', key);
  if (extra) query = query.eq(extra.field, extra.value);
  const { data, error } = await query;
  if (error) throw new Error(`No fue posible validar clave única: ${error.message}`);
  const duplicate = ((data ?? []) as Array<{ id: string }>).find((row) => row.id !== ignoreId);
  if (duplicate) throw new Error('Ya existe un registro activo con esa clave en este hogar.');
}


function createEmptyCategoryAuditData(): CategoryAuditData {
  return {
    groups: [],
    noProjectableGroups: [],
    summary: {
      problemCategoryCount: 0,
      problemMovementCount: 0,
      problemTotal: 0,
      noProjectableMovementCount: 0
    }
  };
}

function isSystemProjectionCategory(category: string) {
  return category === 'entrada_cuenta' || category === 'salida_cuenta' || category.startsWith('sistema_');
}

function getActiveProjectionCategoryIds(projectionColumns: ProjectionColumn[]) {
  const ids = new Set<string>();
  for (const column of projectionColumns) {
    if (!column.isActive) continue;
    for (const category of column.categories) ids.add(category.id);
  }
  return ids;
}

function resolveAuditStatus(category: FinancialCategory | undefined, activeProjectionCategoryIds: Set<string>): CategoryAuditStatus {
  if (!category) return 'missing_category';
  if (category.noProjectable) return 'no_projectable';
  if (!category.isActive) return 'inactive_category';
  if (!activeProjectionCategoryIds.has(category.id)) return 'unassigned_projection';
  return 'unassigned_projection';
}

function upsertAuditGroup(groups: Map<string, CategoryAuditGroup>, movement: CategoryAuditMovement, categoryName: string | null) {
  const existing = groups.get(movement.category) ?? {
    category: movement.category,
    categoryName,
    status: movement.status,
    total: 0,
    movementCount: 0,
    movements: []
  };
  existing.total += movement.amount;
  existing.movementCount += 1;
  existing.movements.push(movement);
  groups.set(movement.category, existing);
}

async function buildCategoryAuditData(
  householdId: string,
  categories: FinancialCategory[],
  projectionColumns: ProjectionColumn[],
  client: SupabaseClientLike
): Promise<CategoryAuditData> {
  const { data: groupsData, error: groupsError } = await client.from('transaction_groups').select('id,note,created_at').eq('household_id', householdId);
  if (groupsError) throw new Error(`No fue posible leer grupos de movimientos para auditoría: ${groupsError.message}`);
  const groupRows = (groupsData ?? []) as Array<{ id: string; note?: string | null; created_at?: string | null }>;
  const groupIds = groupRows.map((group) => group.id);
  if (!groupIds.length) return createEmptyCategoryAuditData();

  const { data: accountData, error: accountError } = await client.from('accounts').select('id,name,household_id').eq('household_id', householdId);
  if (accountError) throw new Error(`No fue posible leer cuentas para auditoría: ${accountError.message}`);

  const txData: Array<{ id: string; group_id: string; account_id: string | null; type: string; category: string; subcategory?: string | null; amount: string | number; happened_at?: string | null }> = [];
  for (let index = 0; index < groupIds.length; index += TRANSACTION_GROUP_QUERY_CHUNK_SIZE) {
    const chunk = groupIds.slice(index, index + TRANSACTION_GROUP_QUERY_CHUNK_SIZE);
    const { data, error } = await client
      .from('transactions')
      .select('id,group_id,account_id,type,category,subcategory,amount,happened_at')
      .in('group_id', chunk);
    if (error) throw new Error(`No fue posible leer movimientos para auditoría. Falló un chunk de ${chunk.length} grupos: ${error.message}`);
    txData.push(...((data ?? []) as typeof txData));
  }

  const categoryByKey = new Map(categories.map((category) => [category.key, category]));
  const activeProjectionCategoryIds = getActiveProjectionCategoryIds(projectionColumns);
  const accountById = new Map(((accountData ?? []) as Array<{ id: string; name: string }>).map((account) => [account.id, account.name]));
  const txByGroup = ((txData ?? []) as Array<{ id: string; group_id: string; account_id: string | null; type: string; category: string; subcategory?: string | null; amount: string | number; happened_at?: string | null }>).reduce<Record<string, Array<{ id: string; group_id: string; account_id: string | null; type: string; category: string; subcategory?: string | null; amount: string | number; happened_at?: string | null }>>>((acc, row) => {
    acc[row.group_id] = [...(acc[row.group_id] ?? []), row];
    return acc;
  }, {});

  const problemGroups = new Map<string, CategoryAuditGroup>();
  const noProjectableGroups = new Map<string, CategoryAuditGroup>();

  for (const group of groupRows) {
    const lines = txByGroup[group.id] ?? [];
    if (!lines.length) continue;
    const primaryLine = lines.find((line) => Boolean(line.category) && !isSystemProjectionCategory(line.category));
    if (!primaryLine) continue;
    const category = categoryByKey.get(primaryLine.category);
    const status = resolveAuditStatus(category, activeProjectionCategoryIds);
    if (status !== 'no_projectable' && category?.isActive && activeProjectionCategoryIds.has(category.id)) continue;

    const descriptor = resolveStoredMovementDescriptor(lines.map((line) => ({ type: line.type, category: line.category, account_id: line.account_id, amount: String(line.amount) })));
    const accountName = lines.map((line) => line.account_id).find((accountId): accountId is string => Boolean(accountId)) ?? null;
    const movement: CategoryAuditMovement = {
      id: group.id,
      date: primaryLine.happened_at ?? group.created_at ?? '',
      description: group.note || primaryLine.category,
      accountName: accountName ? accountById.get(accountName) ?? null : null,
      type: inferMovementType(lines),
      amount: descriptor?.amount ?? Number(primaryLine.amount),
      category: primaryLine.category,
      subcategory: primaryLine.subcategory ?? null,
      status
    };

    if (status === 'no_projectable') upsertAuditGroup(noProjectableGroups, movement, category?.name ?? null);
    else upsertAuditGroup(problemGroups, movement, category?.name ?? null);
  }

  const groups = [...problemGroups.values()].sort((a, b) => b.total - a.total);
  const noProjectable = [...noProjectableGroups.values()].sort((a, b) => b.total - a.total);
  return {
    groups,
    noProjectableGroups: noProjectable,
    summary: {
      problemCategoryCount: groups.length,
      problemMovementCount: groups.reduce((sum, group) => sum + group.movementCount, 0),
      problemTotal: groups.reduce((sum, group) => sum + group.total, 0),
      noProjectableMovementCount: noProjectable.reduce((sum, group) => sum + group.movementCount, 0)
    }
  };
}

async function assertCategoryHasNoProjectionAssignments(householdId: string, categoryId: string, client: SupabaseClientLike) {
  const activeColumnIds = await getActiveColumnIdsForCategory(householdId, categoryId, client);
  if (activeColumnIds.length) throw new Error('Quita primero esta categoría de las columnas de Proyección.');
}


async function applyConfigurationDeleteAvailability(
  householdId: string,
  categories: FinancialCategory[],
  projectionColumns: ProjectionColumn[],
  assignments: ProjectionAssignmentRow[],
  client: SupabaseClientLike
) {
  const groupIds = await getHouseholdTransactionGroupIds(householdId, client);
  const transactionRows: Array<{ id: string; group_id: string; category: string; subcategory?: string | null }> = [];

  logConfigurationDebug('Validando dependencias de movimientos para configuración', {
    householdId,
    groupIdCount: groupIds.length
  });

  for (let index = 0; index < groupIds.length; index += TRANSACTION_GROUP_QUERY_CHUNK_SIZE) {
    const chunk = groupIds.slice(index, index + TRANSACTION_GROUP_QUERY_CHUNK_SIZE);
    const chunkIndex = Math.floor(index / TRANSACTION_GROUP_QUERY_CHUNK_SIZE) + 1;

    logConfigurationDebug('Cargando chunk de transacciones para configuración', {
      householdId,
      groupIdCount: groupIds.length,
      chunkIndex,
      chunkSize: chunk.length
    });

    try {
      const { data, error } = await client
        .from('transactions')
        .select('id,group_id,category,subcategory')
        .in('group_id', chunk);

      if (error) {
        errorConfigurationDebug('Error al validar dependencias de movimientos para configuración', {
          householdId,
          groupIdCount: groupIds.length,
          chunkIndex,
          chunkSize: chunk.length,
          error
        });
        throw new Error(error.message);
      }

      transactionRows.push(...((data ?? []) as Array<{ id: string; group_id: string; category: string; subcategory?: string | null }>));
    } catch (error) {
      errorConfigurationDebug('Excepción al validar dependencias de movimientos para configuración', {
        householdId,
        groupIdCount: groupIds.length,
        chunkIndex,
        chunkSize: chunk.length,
        error
      });

      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`No fue posible validar dependencias de movimientos. La consulta se dividió en chunks de hasta ${TRANSACTION_GROUP_QUERY_CHUNK_SIZE} grupos, pero falló el chunk ${chunkIndex} de ${chunk.length} grupos: ${message}`);
    }
  }

  logConfigurationDebug('Transacciones cargadas para validar configuración', {
    householdId,
    groupIdCount: groupIds.length,
    transactionCount: transactionRows.length
  });
  const categoryMovementCounts = transactionRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.category] = (acc[row.category] ?? 0) + 1;
    return acc;
  }, {});
  const subcategoryMovementCounts = transactionRows.reduce<Record<string, number>>((acc, row) => {
    if (!row.subcategory) return acc;
    const key = `${row.category}::${row.subcategory}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const assignedCategoryIds = new Set(assignments.map((assignment) => assignment.financial_category_id));
  const assignedColumnIds = assignments.reduce<Record<string, number>>((acc, assignment) => {
    acc[assignment.projection_column_id] = (acc[assignment.projection_column_id] ?? 0) + 1;
    return acc;
  }, {});

  const categoriesWithAvailability = categories.map((category) => {
    const hasMovements = (categoryMovementCounts[category.key] ?? 0) > 0;
    const hasSubcategories = category.subcategories.length > 0;
    const hasAssignments = assignedCategoryIds.has(category.id);
    const canDelete = !hasMovements && !hasSubcategories && !hasAssignments;
    return {
      ...category,
      canDelete,
      deleteBlockedReason: canDelete ? null : 'No se puede eliminar esta categoría porque todavía tiene movimientos, subcategorías o columnas asociadas. Puedes desactivarla.',
      subcategories: category.subcategories.map((subcategory) => {
        const movementCount = subcategoryMovementCounts[`${category.key}::${subcategory.key}`] ?? 0;
        const subcategoryCanDelete = movementCount === 0;
        return {
          ...subcategory,
          canDelete: subcategoryCanDelete,
          deleteBlockedReason: subcategoryCanDelete ? null : 'No se puede eliminar esta subcategoría porque todavía tiene movimientos asociados. Puedes desactivarla.'
        };
      })
    };
  });

  const projectionColumnsWithAvailability = projectionColumns.map((column) => {
    const canDelete = (assignedColumnIds[column.id] ?? 0) === 0;
    return {
      ...column,
      canDelete,
      deleteBlockedReason: canDelete ? null : 'No se puede eliminar esta columna porque todavía tiene categorías asignadas. Quita primero las categorías.'
    };
  });

  return { categories: categoriesWithAvailability, projectionColumns: projectionColumnsWithAvailability };
}

export async function getConfigurationData(client: SupabaseClientLike = supabaseAdmin): Promise<ConfigurationData> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) return { hasHousehold: false, householdId: null, categories: [], projectionColumns: [], flows: [], categoryAudit: createEmptyCategoryAuditData() };

  const [categoriesResult, subcategoriesResult, columnsResult, assignmentsResult, flowsResult] = await Promise.all([
    client.from('financial_categories').select('id,household_id,name,key,type,no_projectable,is_active,created_at,updated_at').eq('household_id', householdId).order('name', { ascending: true }),
    client.from('financial_subcategories').select('id,household_id,financial_category_id,name,key,is_active,planned_amount,planned_period_type,flow_fund_id,created_at,updated_at').eq('household_id', householdId).order('name', { ascending: true }),
    client.from('projection_columns').select('id,household_id,name,key,type,description,display_order,is_active,created_at,updated_at').eq('household_id', householdId).order('display_order', { ascending: true }),
    client.from('projection_column_categories').select('projection_column_id,financial_category_id').eq('household_id', householdId),
    client.from('flow_funds').select('id,household_id,name,period_type,target_type,manual_target_amount,is_active,priority').eq('household_id', householdId).order('priority')
  ]);

  for (const result of [categoriesResult, subcategoriesResult, columnsResult, assignmentsResult, flowsResult]) {
    if (result.error) throw new Error(`No fue posible leer configuración: ${result.error.message}`);
  }

  const subcategoriesByCategory = ((subcategoriesResult.data ?? []) as FinancialSubcategoryRow[]).reduce<Record<string, FinancialSubcategory[]>>((acc, row) => {
    const mapped = mapFinancialSubcategory(row);
    acc[mapped.financialCategoryId] = [...(acc[mapped.financialCategoryId] ?? []), mapped];
    return acc;
  }, {});
  const categories = ((categoriesResult.data ?? []) as FinancialCategoryRow[]).map((row) => mapFinancialCategory(row, subcategoriesByCategory[row.id] ?? []));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const assignmentsByColumn = ((assignmentsResult.data ?? []) as ProjectionAssignmentRow[]).reduce<Record<string, string[]>>((acc, row) => {
    acc[row.projection_column_id] = [...(acc[row.projection_column_id] ?? []), row.financial_category_id];
    return acc;
  }, {});
  const projectionColumns = ((columnsResult.data ?? []) as ProjectionColumnRow[]).map((row) => mapProjectionColumn(row, (assignmentsByColumn[row.id] ?? []).flatMap((categoryId) => {
    const category = categoryById.get(categoryId);
    return category ? [{ id: category.id, name: category.name, key: category.key, type: category.type, isActive: category.isActive, noProjectable: category.noProjectable }] : [];
  })));

  const deletableConfiguration = await applyConfigurationDeleteAvailability(householdId, categories, projectionColumns, (assignmentsResult.data ?? []) as ProjectionAssignmentRow[], client);
  const categoryAudit = await buildCategoryAuditData(householdId, deletableConfiguration.categories, deletableConfiguration.projectionColumns, client);

  const concepts = deletableConfiguration.categories.flatMap((category) => category.subcategories);
  const flowReferences = new Set(concepts.map((concept) => concept.flowFundId).filter(Boolean));
  const flows = ((flowsResult.data ?? []) as Array<{ id: string; household_id: string; name: string; period_type: FlowPeriodType; target_type: FlowTargetType; manual_target_amount: string | number | null; is_active: boolean }>).map((flow) => ({ id: flow.id, householdId: flow.household_id, name: flow.name, periodType: flow.period_type, targetType: flow.target_type, manualTargetAmount: flow.manual_target_amount == null ? null : Number(flow.manual_target_amount), isActive: flow.is_active, canDelete: !flowReferences.has(flow.id), deleteBlockedReason: flowReferences.has(flow.id) ? 'No se puede eliminar este flujo porque tiene conceptos asociados. Reasígnalos o elimínalos primero.' : null, targetAmount: calculateFlowTarget({ id: flow.id, periodType: flow.period_type, targetType: flow.target_type, manualTargetAmount: flow.manual_target_amount == null ? null : Number(flow.manual_target_amount) }, concepts.map((concept) => ({ flowFundId: concept.flowFundId ?? null, plannedAmount: concept.plannedAmount ?? null, plannedPeriodType: concept.plannedPeriodType ?? null, isActive: concept.isActive })) ) }));
  return { hasHousehold: true, householdId, categories: deletableConfiguration.categories, projectionColumns: deletableConfiguration.projectionColumns, flows, categoryAudit };
}


async function getHouseholdTransactionGroupIds(householdId: string, client: SupabaseClientLike) {
  const { data, error } = await client.from('transaction_groups').select('id').eq('household_id', householdId);
  if (error) throw new Error(`No fue posible validar movimientos del hogar: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((group) => group.id);
}

async function countTransactionsByCategory(householdId: string, categoryKey: string, client: SupabaseClientLike) {
  const groupIds = await getHouseholdTransactionGroupIds(householdId, client);
  let count = 0;
  for (let index = 0; index < groupIds.length; index += TRANSACTION_GROUP_QUERY_CHUNK_SIZE) {
    const chunk = groupIds.slice(index, index + TRANSACTION_GROUP_QUERY_CHUNK_SIZE);
    const { data, error } = await client
      .from('transactions')
      .select('id,group_id,category')
      .in('group_id', chunk)
      .eq('category', categoryKey);
    if (error) throw new Error(`No fue posible validar movimientos de la categoría. Falló un chunk de ${chunk.length} grupos: ${error.message}`);
    count += ((data ?? []) as Array<{ id: string }>).length;
  }
  return count;
}

async function countTransactionsBySubcategory(householdId: string, categoryKey: string, subcategoryKey: string, client: SupabaseClientLike) {
  const groupIds = await getHouseholdTransactionGroupIds(householdId, client);
  let count = 0;
  for (let index = 0; index < groupIds.length; index += TRANSACTION_GROUP_QUERY_CHUNK_SIZE) {
    const chunk = groupIds.slice(index, index + TRANSACTION_GROUP_QUERY_CHUNK_SIZE);
    const { data, error } = await client
      .from('transactions')
      .select('id,group_id,category,subcategory')
      .in('group_id', chunk)
      .eq('category', categoryKey)
      .eq('subcategory', subcategoryKey);
    if (error) throw new Error(`No fue posible validar movimientos de la subcategoría. Falló un chunk de ${chunk.length} grupos: ${error.message}`);
    count += ((data ?? []) as Array<{ id: string }>).length;
  }
  return count;
}

async function getOwnedCategoryRow(householdId: string, categoryId: string, client: SupabaseClientLike) {
  const { data, error } = await client
    .from('financial_categories')
    .select('id,household_id,name,key,type,no_projectable,is_active,created_at,updated_at')
    .eq('id', categoryId)
    .eq('household_id', householdId)
    .maybeSingle();
  if (error) throw new Error(`No fue posible leer la categoría: ${error.message}`);
  if (!data?.id) throw new Error('No se encontró la categoría en este hogar.');
  return data as FinancialCategoryRow;
}

async function getOwnedSubcategoryWithCategory(householdId: string, subcategoryId: string, client: SupabaseClientLike) {
  const { data: subcategory, error } = await client
    .from('financial_subcategories')
    .select('id,household_id,financial_category_id,name,key,is_active,planned_amount,planned_period_type,flow_fund_id,created_at,updated_at')
    .eq('id', subcategoryId)
    .eq('household_id', householdId)
    .maybeSingle();
  if (error) throw new Error(`No fue posible leer la subcategoría: ${error.message}`);
  if (!subcategory?.id) throw new Error('No se encontró la subcategoría en este hogar.');
  const category = await getOwnedCategoryRow(householdId, (subcategory as FinancialSubcategoryRow).financial_category_id, client);
  return { subcategory: subcategory as FinancialSubcategoryRow, category };
}

async function assertCategoryHasNoDeleteDependencies(householdId: string, category: FinancialCategoryRow, client: SupabaseClientLike) {
  const [movementCount, subcategoriesResult, assignmentsResult] = await Promise.all([
    countTransactionsByCategory(householdId, category.key, client),
    client.from('financial_subcategories').select('id').eq('household_id', householdId).eq('financial_category_id', category.id),
    client.from('projection_column_categories').select('id').eq('household_id', householdId).eq('financial_category_id', category.id)
  ]);
  if (subcategoriesResult.error) throw new Error(`No fue posible validar subcategorías de la categoría: ${subcategoriesResult.error.message}`);
  if (assignmentsResult.error) throw new Error(`No fue posible validar columnas asociadas a la categoría: ${assignmentsResult.error.message}`);
  const hasSubcategories = ((subcategoriesResult.data ?? []) as Array<{ id: string }>).length > 0;
  const hasAssignments = ((assignmentsResult.data ?? []) as Array<{ id: string }>).length > 0;
  if (movementCount > 0 || hasSubcategories || hasAssignments) {
    throw new Error('No se puede eliminar esta categoría porque todavía tiene movimientos, subcategorías o columnas asociadas. Puedes desactivarla.');
  }
}

async function assertSubcategoryHasNoDeleteDependencies(householdId: string, categoryKey: string, subcategoryKey: string, client: SupabaseClientLike) {
  const movementCount = await countTransactionsBySubcategory(householdId, categoryKey, subcategoryKey, client);
  if (movementCount > 0) {
    throw new Error('No se puede eliminar esta subcategoría porque todavía tiene movimientos asociados. Puedes desactivarla.');
  }
}

async function assertProjectionColumnHasNoDeleteDependencies(householdId: string, columnId: string, client: SupabaseClientLike) {
  const { data: column, error: columnError } = await client.from('projection_columns').select('id').eq('id', columnId).eq('household_id', householdId).maybeSingle();
  if (columnError) throw new Error(`No fue posible leer la columna de Proyección: ${columnError.message}`);
  if (!column?.id) throw new Error('No se encontró la columna de Proyección en este hogar.');
  const { data, error } = await client.from('projection_column_categories').select('id').eq('household_id', householdId).eq('projection_column_id', columnId);
  if (error) throw new Error(`No fue posible validar categorías asignadas a la columna: ${error.message}`);
  if (((data ?? []) as Array<{ id: string }>).length > 0) {
    throw new Error('No se puede eliminar esta columna porque todavía tiene categorías asignadas. Quita primero las categorías.');
  }
}

export async function createFinancialCategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialCategoryCreateSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(input.householdId, client);
  const key = normalizeAndValidateRequiredKey(input.name, 'La categoría');
  await assertUniqueKey('financial_categories', householdId, key, client);
  const now = new Date().toISOString();
  const { data, error } = await client.from('financial_categories').insert({ household_id: householdId, name: input.name.trim(), key, type: input.type, no_projectable: input.noProjectable, is_active: true, updated_at: now }).select('id,household_id,name,key,type,no_projectable,is_active,created_at,updated_at').single();
  if (error || !data) throw new Error(error?.message ?? 'No fue posible crear la categoría.');
  return mapFinancialCategory(data);
}

export async function updateFinancialCategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialCategoryUpdateSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(input.householdId, client);
  const key = normalizeAndValidateRequiredKey(input.name, 'La categoría');
  await assertUniqueKey('financial_categories', householdId, key, client, input.categoryId);
  if (input.noProjectable) await assertCategoryHasNoProjectionAssignments(householdId, input.categoryId, client);
  const { data, error } = await client.from('financial_categories').update({ name: input.name.trim(), key, type: input.type, no_projectable: input.noProjectable, is_active: input.isActive, updated_at: new Date().toISOString() }).eq('id', input.categoryId).eq('household_id', householdId).select('id,household_id,name,key,type,no_projectable,is_active,created_at,updated_at').maybeSingle();
  if (error) throw new Error(`No fue posible editar la categoría: ${error.message}`);
  if (!data) throw new Error('No se encontró la categoría en este hogar.');
  return mapFinancialCategory(data);
}

export async function toggleFinancialCategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialCategoryToggleSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  const { error } = await client.from('financial_categories').update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq('id', input.categoryId).eq('household_id', householdId);
  if (error) throw new Error(`No fue posible cambiar estado de la categoría: ${error.message}`);
}

export async function deleteFinancialCategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialCategoryDeleteSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  const category = await getOwnedCategoryRow(householdId, input.categoryId, client);
  await assertCategoryHasNoDeleteDependencies(householdId, category, client);
  const { error } = await client.from('financial_categories').delete().eq('id', input.categoryId).eq('household_id', householdId);
  if (error) throw new Error(`No fue posible eliminar la categoría: ${error.message}`);
}

export async function createFinancialSubcategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialSubcategoryCreateSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(input.householdId, client);
  const key = normalizeAndValidateRequiredKey(input.name, 'La subcategoría');
  await assertUniqueKey('financial_subcategories', householdId, key, client, undefined, { field: 'financial_category_id', value: input.financialCategoryId });
  const { data, error } = await client.from('financial_subcategories').insert({ household_id: householdId, financial_category_id: input.financialCategoryId, name: input.name.trim(), key, is_active: true, planned_amount: input.plannedAmount ?? null, planned_period_type: input.plannedPeriodType ?? null, flow_fund_id: input.flowFundId ?? null, updated_at: new Date().toISOString() }).select('id,household_id,financial_category_id,name,key,is_active,planned_amount,planned_period_type,flow_fund_id,created_at,updated_at').single();
  if (error || !data) throw new Error(error?.message ?? 'No fue posible crear la subcategoría.');
  return mapFinancialSubcategory(data);
}

export async function updateFinancialSubcategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialSubcategoryUpdateSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(input.householdId, client);
  const key = normalizeAndValidateRequiredKey(input.name, 'La subcategoría');
  await assertUniqueKey('financial_subcategories', householdId, key, client, input.subcategoryId, { field: 'financial_category_id', value: input.financialCategoryId });
  const { data, error } = await client.from('financial_subcategories').update({ financial_category_id: input.financialCategoryId, name: input.name.trim(), key, is_active: input.isActive, planned_amount: input.plannedAmount ?? null, planned_period_type: input.plannedPeriodType ?? null, flow_fund_id: input.flowFundId ?? null, updated_at: new Date().toISOString() }).eq('id', input.subcategoryId).eq('household_id', householdId).select('id,household_id,financial_category_id,name,key,is_active,planned_amount,planned_period_type,flow_fund_id,created_at,updated_at').maybeSingle();
  if (error) throw new Error(`No fue posible editar la subcategoría: ${error.message}`);
  if (!data) throw new Error('No se encontró la subcategoría en este hogar.');
  return mapFinancialSubcategory(data);
}

export async function toggleFinancialSubcategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialSubcategoryToggleSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  const { error } = await client.from('financial_subcategories').update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq('id', input.subcategoryId).eq('household_id', householdId);
  if (error) throw new Error(`No fue posible cambiar estado de la subcategoría: ${error.message}`);
}

export async function deleteFinancialSubcategory(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = financialSubcategoryDeleteSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  const { subcategory, category } = await getOwnedSubcategoryWithCategory(householdId, input.subcategoryId, client);
  await assertSubcategoryHasNoDeleteDependencies(householdId, category.key, subcategory.key, client);
  const { error } = await client.from('financial_subcategories').delete().eq('id', input.subcategoryId).eq('household_id', householdId);
  if (error) throw new Error(`No fue posible eliminar la subcategoría: ${error.message}`);
}

export async function createProjectionColumn(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = projectionColumnCreateSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(input.householdId, client);
  const key = normalizeAndValidateRequiredKey(input.name, 'La columna');
  await assertUniqueKey('projection_columns', householdId, key, client);
  const { data, error } = await client.from('projection_columns').insert({ household_id: householdId, name: input.name.trim(), key, type: input.type, description: input.description?.trim() || null, display_order: input.displayOrder, is_active: true, updated_at: new Date().toISOString() }).select('id,household_id,name,key,type,description,display_order,is_active,created_at,updated_at').single();
  if (error || !data) throw new Error(error?.message ?? 'No fue posible crear la columna de Proyección.');
  return mapProjectionColumn(data);
}

export async function updateProjectionColumn(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = projectionColumnUpdateSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(input.householdId, client);
  const key = normalizeAndValidateRequiredKey(input.name, 'La columna');
  await assertUniqueKey('projection_columns', householdId, key, client, input.columnId);
  const { data, error } = await client.from('projection_columns').update({ name: input.name.trim(), key, type: input.type, description: input.description?.trim() || null, display_order: input.displayOrder, is_active: input.isActive, updated_at: new Date().toISOString() }).eq('id', input.columnId).eq('household_id', householdId).select('id,household_id,name,key,type,description,display_order,is_active,created_at,updated_at').maybeSingle();
  if (error) throw new Error(`No fue posible editar la columna: ${error.message}`);
  if (!data) throw new Error('No se encontró la columna en este hogar.');
  return mapProjectionColumn(data);
}

export async function toggleProjectionColumn(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = projectionColumnToggleSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  if (input.isActive) {
    const { data: assignments, error: assignmentsError } = await client.from('projection_column_categories').select('financial_category_id').eq('household_id', householdId).eq('projection_column_id', input.columnId);
    if (assignmentsError) throw new Error(`No fue posible validar asignaciones de la columna: ${assignmentsError.message}`);
    for (const assignment of ((assignments ?? []) as Array<{ financial_category_id: string }>)) {
      await assertCategoryIsProjectable(householdId, assignment.financial_category_id, client);
      const activeColumnIds = await getActiveColumnIdsForCategory(householdId, assignment.financial_category_id, client);
      if (activeColumnIds.some((id) => id !== input.columnId)) {
        throw new Error('No puedes activar esta columna porque una de sus categorías ya alimenta otra columna activa.');
      }
    }
  }
  const { error } = await client.from('projection_columns').update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq('id', input.columnId).eq('household_id', householdId);
  if (error) throw new Error(`No fue posible cambiar estado de la columna: ${error.message}`);
}

export async function deleteProjectionColumn(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = projectionColumnDeleteSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  await assertProjectionColumnHasNoDeleteDependencies(householdId, input.columnId, client);
  const { error } = await client.from('projection_columns').delete().eq('id', input.columnId).eq('household_id', householdId);
  if (error) throw new Error(`No fue posible eliminar la columna de Proyección: ${error.message}`);
}

async function getActiveColumnIdsForCategory(householdId: string, categoryId: string, client: SupabaseClientLike) {
  const { data: assignments, error: assignmentsError } = await client.from('projection_column_categories').select('projection_column_id,financial_category_id').eq('household_id', householdId).eq('financial_category_id', categoryId);
  if (assignmentsError) throw new Error(`No fue posible validar asignaciones: ${assignmentsError.message}`);
  const columnIds = ((assignments ?? []) as Array<{ projection_column_id: string }>).map((row) => row.projection_column_id);
  if (!columnIds.length) return [];
  const { data: columns, error: columnsError } = await client.from('projection_columns').select('id,is_active').eq('household_id', householdId).in('id', columnIds);
  if (columnsError) throw new Error(`No fue posible validar columnas activas: ${columnsError.message}`);
  return ((columns ?? []) as Array<{ id: string; is_active: boolean }>).filter((column) => column.is_active).map((column) => column.id);
}


async function assertCategoryIsProjectable(householdId: string, categoryId: string, client: SupabaseClientLike) {
  const { data, error } = await client.from('financial_categories').select('id,no_projectable').eq('household_id', householdId).eq('id', categoryId).maybeSingle();
  if (error) throw new Error(`No fue posible validar categoría: ${error.message}`);
  if (!data?.id) throw new Error('No se encontró la categoría en este hogar.');
  if ((data as { no_projectable?: boolean | null }).no_projectable) throw new Error('Las categorías excluidas de Proyección no pueden asignarse a columnas.');
}

export async function assignCategoryToProjectionColumn(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = projectionColumnCategoryAssignSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  await assertCategoryIsProjectable(householdId, input.financialCategoryId, client);
  const activeColumnIds = await getActiveColumnIdsForCategory(householdId, input.financialCategoryId, client);
  if (activeColumnIds.some((id) => id !== input.projectionColumnId)) {
    throw new Error('Esta categoría principal ya alimenta otra columna activa. Desactiva o remueve la asignación anterior para evitar duplicar importes.');
  }
  const { data: existing, error: existingError } = await client.from('projection_column_categories').select('id').eq('household_id', householdId).eq('projection_column_id', input.projectionColumnId).eq('financial_category_id', input.financialCategoryId).maybeSingle();
  if (existingError) throw new Error(`No fue posible validar duplicados: ${existingError.message}`);
  if (existing?.id) return existing;
  const { data, error } = await client.from('projection_column_categories').insert({ household_id: householdId, projection_column_id: input.projectionColumnId, financial_category_id: input.financialCategoryId }).select('id,household_id,projection_column_id,financial_category_id,created_at').single();
  if (error || !data) throw new Error(error?.message ?? 'No fue posible asignar la categoría a la columna.');
  return data;
}

export async function removeCategoryFromProjectionColumn(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = projectionColumnCategoryRemoveSchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  const { error } = await client.from('projection_column_categories').delete().eq('household_id', householdId).eq('projection_column_id', input.projectionColumnId).eq('financial_category_id', input.financialCategoryId);
  if (error) throw new Error(`No fue posible quitar la categoría de la columna: ${error.message}`);
}


export async function reclassifyCategoryAuditMovement(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = categoryAuditReclassifySchema.parse(rawInput);
  const householdId = await resolveInputHouseholdId(undefined, client);
  const validated = await validateCategorySelection(householdId, input.category, input.subcategory ?? null, client);

  const { data: group, error: groupError } = await client
    .from('transaction_groups')
    .select('id,household_id')
    .eq('id', input.movementId)
    .eq('household_id', householdId)
    .maybeSingle();
  if (groupError) throw new Error(`No fue posible leer el movimiento para reclasificar: ${groupError.message}`);
  if (!group?.id) throw new Error('No se encontró el movimiento en este hogar.');

  const { data: lines, error: txError } = await client
    .from('transactions')
    .select('id,group_id,category,subcategory,amount,type,account_id')
    .eq('group_id', input.movementId);
  if (txError) throw new Error(`No fue posible leer transacciones del movimiento: ${txError.message}`);

  const editableLines = ((lines ?? []) as Array<{ id: string; category: string }>).filter((line) => !isSystemProjectionCategory(line.category));
  if (!editableLines.length) throw new Error('Este movimiento no tiene una categoría reclasificable.');

  await Promise.all(editableLines.map(async (line) => {
    const { error } = await client
      .from('transactions')
      .update({ category: validated.categoryKey, subcategory: validated.subcategoryKey })
      .eq('id', line.id)
      .eq('group_id', input.movementId);
    if (error) throw new Error(`No fue posible reclasificar el movimiento: ${error.message}`);
  }));

  return { category: validated.categoryKey, subcategory: validated.subcategoryKey };
}

function getIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfLocalWeek(date: Date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function projectionWeekKey(date: Date) {
  return getIsoDate(startOfLocalWeek(date));
}

function emptyProjectionCell(): WeeklyProjectionCell {
  return { amount: 0, movements: [], categoryBreakdown: [] };
}

function isEventProjectionColumn(column: ProjectionColumn) {
  const text = `${column.key} ${column.name}`.toLowerCase();
  return text.includes('evento') || text.includes('event');
}

function buildProjectionCategoryBreakdown(
  movements: WeeklyProjectionMovementDetail[],
  categoryByKey: Map<string, FinancialCategory>,
  weeksUsed: number
): WeeklyProjectionCategoryDetail[] {
  const byCategory = new Map<string, WeeklyProjectionCategoryDetail>();
  for (const movement of movements) {
    const category = categoryByKey.get(movement.category);
    const categoryName = category?.name ?? movement.categoryName ?? movement.category;
    const existing = byCategory.get(movement.category) ?? {
      category: movement.category,
      categoryName,
      subcategories: [],
      total: 0,
      averageWeekly: 0,
      movementCount: 0
    };
    const subcategory = movement.subcategory || 'Sin subcategoría';
    const sub = existing.subcategories.find((item) => item.subcategory === subcategory);
    if (sub) {
      sub.total += movement.amount;
      sub.movements.push(movement);
    } else {
      existing.subcategories.push({ subcategory, total: movement.amount, movements: [movement] });
    }
    existing.total += movement.amount;
    existing.movementCount += 1;
    existing.averageWeekly = weeksUsed > 0 ? existing.total / weeksUsed : 0;
    byCategory.set(movement.category, existing);
  }
  return [...byCategory.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName));
}

function createProjectionRow(id: string, block: WeeklyProjectionRow['block'], label: string, start: Date, columns: ProjectionColumn[]): WeeklyProjectionRow {
  const cells = Object.fromEntries(columns.map((column) => [column.id, emptyProjectionCell()])) as Record<string, WeeklyProjectionCell>;
  return {
    id,
    block,
    label,
    startDate: getIsoDate(start),
    endDate: getIsoDate(addDays(start, 6)),
    isValidHistorical: false,
    cells,
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    operationalMoney: 0
  };
}

function recalculateProjectionRow(row: WeeklyProjectionRow, columns: ProjectionColumn[]) {
  row.totalIncome = columns.filter((column) => column.type === 'income').reduce((sum, column) => sum + (row.cells[column.id]?.amount ?? 0), 0);
  row.totalExpense = columns.filter((column) => column.type === 'expense').reduce((sum, column) => sum + (row.cells[column.id]?.amount ?? 0), 0);
  row.balance = row.totalIncome - row.totalExpense;
  row.isValidHistorical = row.totalIncome > 0 && row.totalExpense > 0;
}

export async function buildWeeklyProjectionSummary(client: SupabaseClientLike = supabaseAdmin): Promise<WeeklyProjectionSummary> {
  const configuration = await getConfigurationData(client);
  const emptySummary: WeeklyProjectionSummary = {
    hasHousehold: false,
    hasConfiguration: false,
    operationalMoney: 0,
    historicalWeeksUsed: 0,
    averageWeeklyIncome: 0,
    averageWeeklyExpense: 0,
    averageWeeklyBalance: 0,
    projectedOperationalMoney12Weeks: 0,
    projectedChange: 0,
    columns: [],
    tableRows: [],
    excludedWeeks: [],
    unclassified: [],
    scenarioNotes: { activeColumns: 0, validHistoricalWeeks: 0, currentWeekExcluded: true, unclassifiedCategories: 0, ignoredNoProjectableCategories: 0 }
  };
  if (!configuration.hasHousehold || !configuration.householdId) return emptySummary;

  const activeColumns = configuration.projectionColumns.filter((column) => column.isActive).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'income' ? -1 : 1;
    return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name);
  });
  const activeAssignments = new Map<string, ProjectionColumn>();
  for (const column of activeColumns) {
    for (const category of column.categories) {
      if (category.isActive && !category.noProjectable) activeAssignments.set(category.id, column);
    }
  }
  const categoryByKey = new Map(configuration.categories.map((category) => [category.key, category]));
  const noProjectableKeys = new Set(configuration.categories.filter((category) => category.noProjectable).map((category) => category.key));

  const [groupsResult, accountsResult] = await Promise.all([
    client.from('transaction_groups').select('id,note,created_at').eq('household_id', configuration.householdId),
    client.from('accounts').select('id,name,type,balance,is_active').eq('household_id', configuration.householdId)
  ]);
  const groups = (groupsResult.data ?? []) as Array<{ id: string; note?: string | null; created_at?: string | null }>;
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const groupIds = groups.map((group) => group.id);
  const accounts = (accountsResult.data ?? []) as Array<{ id: string; name?: string | null; type?: string | null; balance?: string | number; is_active?: boolean | null }>;
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const operationalMoney = accounts
    .filter((account) => account.is_active !== false && ['operativa', 'operational_cash'].includes(account.type ?? ''))
    .reduce((sum, account) => sum + toFiniteNumber(account.balance, 0), 0);

  const { data: rows } = groupIds.length
    ? await client.from('transactions').select('id,group_id,account_id,type,category,subcategory,amount,happened_at').in('group_id', groupIds)
    : { data: [] as ProjectionTransactionRow[] };

  const currentWeekStart = startOfLocalWeek(new Date());
  const nextWeekStart = addDays(currentWeekStart, 7);
  const historicalRowsByWeek = new Map<string, WeeklyProjectionRow>();
  const currentRow = createProjectionRow('current', 'current', 'Semana actual parcial', currentWeekStart, activeColumns);
  const unclassified = new Map<string, { category: string; categoryName: string | null; total: number; movementCount: number; movements: WeeklyProjectionMovementDetail[] }>();
  const columnHistoricalMovements = new Map<string, WeeklyProjectionMovementDetail[]>();
  const futureEventMovements = new Map<string, WeeklyProjectionMovementDetail[]>();

  for (const tx of (rows ?? []) as ProjectionTransactionRow[]) {
    if (tx.category === 'entrada_cuenta' || tx.category === 'salida_cuenta') continue;
    const category = categoryByKey.get(tx.category);
    if (category?.noProjectable || noProjectableKeys.has(tx.category)) continue;
    const column = category && category.isActive ? activeAssignments.get(category.id) : undefined;
    const happenedAt = tx.happened_at ? new Date(tx.happened_at) : new Date();
    if (Number.isNaN(happenedAt.getTime())) continue;
    const amount = toFiniteNumber(tx.amount, 0);
    const account = tx.account_id ? accountById.get(tx.account_id) : undefined;
    const group = groupById.get(tx.group_id);
    const movement: WeeklyProjectionMovementDetail = {
      id: tx.id ?? `${tx.group_id}-${tx.category}-${tx.happened_at ?? ''}`,
      groupId: tx.group_id,
      date: getIsoDate(happenedAt),
      description: group?.note || tx.subcategory || tx.category,
      accountName: account?.name ?? null,
      amount,
      category: tx.category,
      categoryName: category?.name ?? tx.category,
      subcategory: tx.subcategory ?? null
    };

    if (!column) {
      if (category?.isActive) {
        const existing = unclassified.get(tx.category) ?? { category: tx.category, categoryName: category?.name ?? tx.category, total: 0, movementCount: 0, movements: [] };
        existing.total += amount;
        existing.movementCount += 1;
        existing.movements.push(movement);
        unclassified.set(tx.category, existing);
      }
      continue;
    }

    if (happenedAt < currentWeekStart) {
      const key = projectionWeekKey(happenedAt);
      const row = historicalRowsByWeek.get(key) ?? createProjectionRow(`historical-${key}`, 'historical', key, new Date(`${key}T00:00:00.000Z`), activeColumns);
      const cell = row.cells[column.id] ?? emptyProjectionCell();
      cell.amount += amount;
      cell.movements.push(movement);
      row.cells[column.id] = cell;
      historicalRowsByWeek.set(key, row);
    } else if (happenedAt < nextWeekStart) {
      const cell = currentRow.cells[column.id] ?? emptyProjectionCell();
      cell.amount += amount;
      cell.movements.push(movement);
      currentRow.cells[column.id] = cell;
    } else if (isEventProjectionColumn(column) && happenedAt < addDays(nextWeekStart, 12 * 7)) {
      const futureKey = `${projectionWeekKey(happenedAt)}:${column.id}`;
      futureEventMovements.set(futureKey, [...(futureEventMovements.get(futureKey) ?? []), movement]);
    }
  }

  for (const row of historicalRowsByWeek.values()) {
    for (const cell of Object.values(row.cells)) cell.categoryBreakdown = buildProjectionCategoryBreakdown(cell.movements, categoryByKey, 1);
    recalculateProjectionRow(row, activeColumns);
  }
  for (const cell of Object.values(currentRow.cells)) cell.categoryBreakdown = buildProjectionCategoryBreakdown(cell.movements, categoryByKey, 1);
  recalculateProjectionRow(currentRow, activeColumns);

  const sortedHistoricalRows = [...historicalRowsByWeek.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const validHistoricalRows = sortedHistoricalRows.filter((row) => row.isValidHistorical);
  const excludedWeeks = sortedHistoricalRows.filter((row) => !row.isValidHistorical);
  validHistoricalRows.forEach((row, index) => { row.label = `Histórico real ${index + 1}`; });
  excludedWeeks.forEach((row, index) => { row.label = `Semana excluida ${index + 1}`; });

  const historicalWeeksUsed = validHistoricalRows.length;
  const columnAverages = new Map<string, number>();
  for (const column of activeColumns) {
    const total = validHistoricalRows.reduce((sum, row) => sum + (row.cells[column.id]?.amount ?? 0), 0);
    columnAverages.set(column.id, historicalWeeksUsed > 0 ? total / historicalWeeksUsed : 0);
    columnHistoricalMovements.set(column.id, validHistoricalRows.flatMap((row) => row.cells[column.id]?.movements ?? []));
  }

  const projectionRows: WeeklyProjectionRow[] = [];
  let runningOperationalMoney = operationalMoney;
  for (let index = 0; index < 12; index += 1) {
    const start = addDays(nextWeekStart, index * 7);
    const row = createProjectionRow(`projection-${index + 1}`, 'projection', `Proyección semana ${index + 1}`, start, activeColumns);
    for (const column of activeColumns) {
      const values = validHistoricalRows.map((historicalRow, historicalIndex) => ({ label: `Histórico real ${historicalIndex + 1}`, amount: historicalRow.cells[column.id]?.amount ?? 0 }));
      const futureMovements = futureEventMovements.get(`${row.startDate}:${column.id}`) ?? [];
      const average = isEventProjectionColumn(column) ? futureMovements.reduce((sum, movement) => sum + movement.amount, 0) : (columnAverages.get(column.id) ?? 0);
      row.cells[column.id] = {
        amount: average,
        movements: futureMovements,
        categoryBreakdown: futureMovements.length > 0
          ? buildProjectionCategoryBreakdown(futureMovements, categoryByKey, 1)
          : buildProjectionCategoryBreakdown(columnHistoricalMovements.get(column.id) ?? [], categoryByKey, Math.max(historicalWeeksUsed, 1)),
        projectedFromAverage: true,
        averageUsed: average,
        historicalValues: values
      };
    }
    recalculateProjectionRow(row, activeColumns);
    runningOperationalMoney += row.balance;
    row.operationalMoney = runningOperationalMoney;
    projectionRows.push(row);
  }

  let historicalRunningMoney = operationalMoney - validHistoricalRows.reduce((sum, row) => sum + row.balance, 0);
  for (const row of validHistoricalRows) {
    historicalRunningMoney += row.balance;
    row.operationalMoney = historicalRunningMoney;
  }
  currentRow.operationalMoney = operationalMoney;

  const totalHistoricalIncome = validHistoricalRows.reduce((sum, row) => sum + row.totalIncome, 0);
  const totalHistoricalExpense = validHistoricalRows.reduce((sum, row) => sum + row.totalExpense, 0);
  const averageWeeklyIncome = historicalWeeksUsed > 0 ? totalHistoricalIncome / historicalWeeksUsed : 0;
  const averageWeeklyExpense = historicalWeeksUsed > 0 ? totalHistoricalExpense / historicalWeeksUsed : 0;
  const averageWeeklyBalance = averageWeeklyIncome - averageWeeklyExpense;
  const projectedOperationalMoney12Weeks = projectionRows.at(-1)?.operationalMoney ?? operationalMoney;

  const columnSummaries: WeeklyProjectionColumnSummary[] = activeColumns.map((column) => {
    const movements = columnHistoricalMovements.get(column.id) ?? [];
    const total = validHistoricalRows.reduce((sum, row) => sum + (row.cells[column.id]?.amount ?? 0), 0);
    const categoryBreakdown = buildProjectionCategoryBreakdown(movements, categoryByKey, Math.max(historicalWeeksUsed, 1));
    const subcategoryTotals = new Map<string, number>();
    for (const category of categoryBreakdown) {
      for (const subcategory of category.subcategories) subcategoryTotals.set(subcategory.subcategory, (subcategoryTotals.get(subcategory.subcategory) ?? 0) + subcategory.total);
    }
    return {
      columnId: column.id,
      columnName: column.name,
      columnKey: column.key,
      type: column.type,
      total,
      averageWeekly: columnAverages.get(column.id) ?? 0,
      weeksUsed: historicalWeeksUsed,
      categories: column.categories.filter((category) => category.isActive && !category.noProjectable).map((category) => ({ id: category.id, key: category.key, name: category.name })),
      categoryBreakdown,
      subcategoryBreakdown: [...subcategoryTotals.entries()].map(([subcategory, subtotal]) => ({ subcategory, total: subtotal }))
    };
  });

  return {
    hasHousehold: true,
    hasConfiguration: configuration.categories.length > 0 && configuration.projectionColumns.length > 0,
    operationalMoney,
    historicalWeeksUsed,
    averageWeeklyIncome,
    averageWeeklyExpense,
    averageWeeklyBalance,
    projectedOperationalMoney12Weeks,
    projectedChange: projectedOperationalMoney12Weeks - operationalMoney,
    columns: columnSummaries,
    tableRows: [...validHistoricalRows, currentRow, ...projectionRows],
    excludedWeeks,
    unclassified: [...unclassified.values()],
    scenarioNotes: {
      activeColumns: activeColumns.length,
      validHistoricalWeeks: historicalWeeksUsed,
      currentWeekExcluded: true,
      unclassifiedCategories: unclassified.size,
      ignoredNoProjectableCategories: noProjectableKeys.size
    }
  };
}


export async function createConfiguredFlow(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = flowCreateSchema.parse(rawInput); const householdId = await resolveInputHouseholdId(input.householdId, client);
  const { data: maxPriority } = await client.from('flow_funds').select('priority').eq('household_id', householdId).order('priority', { ascending: false }).limit(1);
  const { data, error } = await client.from('flow_funds').insert({ household_id: householdId, name: input.name.trim(), code: normalizeAndValidateRequiredKey(input.name, 'El flujo'), period_type: input.periodType, target_type: input.targetType, manual_target_amount: input.targetType === 'manual' ? input.manualTargetAmount : null, priority: Number(maxPriority?.[0]?.priority ?? 0) + 1, is_active: true }).select('id').single();
  if (error || !data) throw new Error(error?.message ?? 'No fue posible crear el flujo.'); return data;
}
export async function updateConfiguredFlow(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = flowUpdateSchema.parse(rawInput); const householdId = await resolveInputHouseholdId(input.householdId, client);
  const { error } = await client.from('flow_funds').update({ name: input.name.trim(), period_type: input.periodType, target_type: input.targetType, manual_target_amount: input.targetType === 'manual' ? input.manualTargetAmount : null, is_active: input.isActive, updated_at: new Date().toISOString() }).eq('id', input.flowId).eq('household_id', householdId);
  if (error) throw new Error(`No fue posible editar el flujo: ${error.message}`);
}
export async function deleteConfiguredFlow(rawInput: unknown, client: SupabaseClientLike = supabaseAdmin) {
  const input = flowDeleteSchema.parse(rawInput); const householdId = await resolveInputHouseholdId(undefined, client);
  const { data: references, error: referenceError } = await client.from('financial_subcategories').select('id').eq('household_id', householdId).eq('flow_fund_id', input.flowId);
  if (referenceError) throw new Error(`No fue posible validar conceptos asociados: ${referenceError.message}`);
  if (references?.length) throw new Error('No se puede eliminar el flujo porque tiene conceptos asociados.');
  const { error } = await client.from('flow_funds').delete().eq('id', input.flowId).eq('household_id', householdId); if (error) throw new Error(`No fue posible eliminar el flujo: ${error.message}`);
}
