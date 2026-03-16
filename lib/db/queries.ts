import { z } from 'zod';
import { supabase } from '@/lib/db/supabase';
import { calculateMonthlyOFH, calculateWeeklyOFH } from '@/lib/financial/engine';
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

export type AccountOption = {
  id: string;
  name: string;
  type: string;
};

export type RegistrationSetupStatus = {
  hasHousehold: boolean;
  accounts: AccountOption[];
};

type JournalLine = {
  accountId: string | null;
  type: 'debit' | 'credit';
  category: string;
  amount: number;
};

type DashboardData = {
  hasHousehold: boolean;
  monthlyOFH: number;
  weeklyOFH: number;
  availableMoney: number;
  diagnoses: string[];
  recommendations: string[];
};

type SupabaseClientLike = typeof supabase;

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
  const fromAuth = await getAuthProfileId(client);
  if (fromAuth) {
    return { activeProfileId: fromAuth, source: 'auth' as const };
  }

  const fromEnv = process.env.DEV_PROFILE_ID || process.env.NEXT_PUBLIC_DEV_PROFILE_ID;
  if (fromEnv) {
    return { activeProfileId: fromEnv, source: 'env' as const };
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

export async function getOrCreateActiveProfileId(client: SupabaseClientLike = supabase) {
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

export async function getDefaultHouseholdId(client: SupabaseClientLike = supabase) {
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

export async function createHouseholdOnboarding(rawInput: unknown, client: SupabaseClientLike = supabase) {
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
    ...input.operationalAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'operativa', balance: (item.saldoInicial ?? 0).toFixed(2) })),
    ...input.fundAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'fondo', balance: (item.saldoInicial ?? 0).toFixed(2) })),
    ...input.debtAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'deuda', balance: (item.saldoInicial ?? 0).toFixed(2) })),
    ...input.receivables.map((item) => ({ household_id: householdId, name: item.nombre, type: 'por_cobrar', balance: item.monto.toFixed(2) }))
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

export async function getDashboardData(client: SupabaseClientLike = supabase): Promise<DashboardData> {
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
      recommendations: ['Configura hogar, cuentas e ingresos iniciales para activar recomendaciones.']
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
      recommendations: ['Finaliza onboarding para generar indicadores automáticos.']
    };
  }

  const payload = JSON.parse(data.payload as string) as ReturnType<typeof buildInitialIndicators>;
  return {
    hasHousehold: true,
    monthlyOFH: payload.monthlyOFH,
    weeklyOFH: payload.weeklyOFH,
    availableMoney: payload.availableMoney,
    diagnoses: payload.diagnoses,
    recommendations: payload.recommendations
  };
}

export async function getAccountsForRegistration(client: SupabaseClientLike = supabase): Promise<AccountOption[]> {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) {
    logDebug('Cuentas lookup fallback', { reason: 'no_household' });
    return [];
  }

  const { data } = await client
    .from('accounts')
    .select('id,name,type')
    .eq('household_id', householdId)
    .order('name');

  const accounts = (data ?? []) as AccountOption[];
  logDebug('Cuentas lookup', { householdId, accountCount: accounts.length, readMode: 'db_result' });
  return accounts;
}

export async function getRegistrationSetupStatus(client: SupabaseClientLike = supabase): Promise<RegistrationSetupStatus> {
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

function findAccountIdByName(accounts: AccountOption[], name?: string) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  const account = accounts.find((item) => item.name.toLowerCase().includes(normalized) || normalized.includes(item.name.toLowerCase()));
  return account?.id ?? null;
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
      return [
        { accountId: null, type: 'debit', category: 'deuda', amount: intent.amount },
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

export async function saveConversationalTransaction(intent: TransactionIntent) {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) {
    throw new Error('No existe un hogar configurado para registrar movimientos.');
  }

  const accounts = await getAccountsForRegistration();
  const lines = buildJournalEntries(intent, accounts);

  const { data: group, error: groupError } = await supabase
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

  const transactionsPayload = lines.map((line) => ({
    group_id: group.id,
    account_id: line.accountId,
    type: line.type,
    category: line.category,
    amount: line.amount.toFixed(2)
  }));

  const { error: txError } = await supabase.from('transactions').insert(transactionsPayload);

  if (txError) {
    throw new Error(txError.message);
  }

  await recalculateIndicators(householdId);
}

export async function recalculateIndicators(householdId: string) {
  const { data } = await supabase
    .from('transactions')
    .select('type,category,amount,transaction_groups!inner(household_id)')
    .eq('transaction_groups.household_id', householdId);

  const parsed = (data ?? []) as Array<{ type: string; category: string; amount: string }>;

  const totalExpenses = parsed
    .filter((item) => item.type === 'debit' && item.category !== 'entrada_cuenta')
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const totalIncome = parsed
    .filter((item) => item.type === 'credit' && item.category.startsWith('ingreso'))
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const monthlyOFH = calculateMonthlyOFH({
    fixedExpenses: totalExpenses,
    avgVariableExpenses: 0,
    debtPayments: 0,
    periodicExpensesMonthlyEquivalent: 0,
    safetyMarginPct: 10
  });

  const weeklyOFH = calculateWeeklyOFH(monthlyOFH);

  await supabase.from('financial_snapshots').insert({
    household_id: householdId,
    period_type: 'conversacional',
    payload: JSON.stringify({ totalIncome, totalExpenses, monthlyOFH, weeklyOFH })
  });
}
