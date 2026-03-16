import { z } from 'zod';
import { supabase, supabaseAdmin } from '@/lib/db/supabase';
import { buildRecommendations, buildTopDiagnoses, calculateAvailableMoney, calculateMonthlyOFH, calculateWeeklyOFH } from '@/lib/financial/engine';
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

export type MovementHistoryItem = {
  id: string;
  fecha: string;
  tipoMovimiento: string;
  descripcion: string;
  monto: number;
  cuentaOrigen: string | null;
  cuentaDestino: string | null;
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

type DashboardData = {
  hasHousehold: boolean;
  monthlyOFH: number;
  weeklyOFH: number;
  availableMoney: number;
  diagnoses: string[];
  recommendations: string[];
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

  return {
    hasHousehold: true,
    monthlyOFH,
    weeklyOFH,
    availableMoney,
    diagnoses: diagnoses.length ? diagnoses : ['Sin diagnósticos disponibles por el momento.'],
    recommendations: recommendations.length ? recommendations : ['Aún no hay recomendaciones; registra movimientos para enriquecer el análisis.']
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

  const parsed = normalizeSnapshotPayload(data.payload);
  return parsed;
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
    .order('name');

  const accounts = (data ?? []) as AccountOption[];
  logDebug('Cuentas lookup', { householdId, accountCount: accounts.length, readMode: 'db_result' });
  return accounts;
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

  const accountIds = Array.from(new Set(transactions.map((tx) => tx.account_id).filter((id): id is string => Boolean(id))));
  const { data: accountsData } = accountIds.length
    ? await client.from('accounts').select('id,name').in('id', accountIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const accountById = new Map((accountsData ?? []).map((account: { id: string; name: string }) => [account.id, account.name]));

  const movements = groups.map<MovementHistoryItem>((group) => {
    const lines = transactions.filter((tx) => tx.group_id === group.id);
    const debitLine = lines.find((tx) => tx.type === 'debit');
    const creditLine = lines.find((tx) => tx.type === 'credit');
    const happenedAt = lines.find((tx) => Boolean(tx.happened_at))?.happened_at ?? group.created_at;

    return {
      id: group.id,
      fecha: happenedAt,
      tipoMovimiento: inferMovementType(lines),
      descripcion: group.note?.trim() ? group.note : 'Movimiento sin descripción',
      monto: Number(debitLine?.amount ?? creditLine?.amount ?? 0),
      cuentaOrigen: creditLine?.account_id ? accountById.get(creditLine.account_id) ?? null : null,
      cuentaDestino: debitLine?.account_id ? accountById.get(debitLine.account_id) ?? null : null
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

  const transactionsPayload = lines.map((line) => ({
    group_id: group.id,
    account_id: line.accountId,
    type: line.type,
    category: line.category,
    amount: line.amount.toFixed(2)
  }));

  const { error: txError } = await supabaseAdmin.from('transactions').insert(transactionsPayload);

  if (txError) {
    throw new Error(txError.message);
  }

  await recalculateIndicators(householdId);
}

export async function recalculateIndicators(householdId: string) {
  const { data: groups } = await supabaseAdmin.from('transaction_groups').select('id').eq('household_id', householdId);
  const groupIds = (groups ?? []).map((group) => group.id as string);

  let parsed: Array<{ type: string; category: string; amount: string }> = [];
  if (groupIds.length > 0) {
    const { data: transactionsData } = await supabaseAdmin
      .from('transactions')
      .select('type,category,amount')
      .in('group_id', groupIds);

    parsed = (transactionsData ?? []) as Array<{ type: string; category: string; amount: string }>;
  }

  const totalExpenses = parsed
    .filter((item) => item.type === 'debit' && item.category !== 'entrada_cuenta')
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const totalIncome = parsed
    .filter((item) => item.type === 'credit' && item.category.startsWith('ingreso'))
    .reduce((acc, item) => acc + Number(item.amount), 0);

  const { data: accounts } = await supabaseAdmin
    .from('accounts')
    .select('type,balance')
    .eq('household_id', householdId);

  const accountList = (accounts ?? []) as Array<{ type: string; balance: string }>;
  const operativeMoney = accountList
    .filter((item) => item.type === 'operativa')
    .reduce((acc, item) => acc + Number(item.balance), 0);
  const liquidFunds = accountList
    .filter((item) => item.type === 'fondo')
    .reduce((acc, item) => acc + Number(item.balance), 0);
  const liquidInvestments = accountList
    .filter((item) => item.type === 'inversion')
    .reduce((acc, item) => acc + Number(item.balance), 0);
  const debtBalance = accountList
    .filter((item) => item.type === 'deuda')
    .reduce((acc, item) => acc + Number(item.balance), 0);

  const financialInput = {
    fixedExpenses: totalExpenses,
    avgVariableExpenses: 0,
    debtPayments: 0,
    periodicExpensesMonthlyEquivalent: 0,
    safetyMarginPct: 10,
    regularIncomeMonthly: totalIncome,
    annualExtraIncome: 0,
    operativeMoney,
    liquidFunds,
    liquidInvestments,
    debtBalance,
    totalFixedExpenses: totalExpenses,
    variableSeries: [],
    reservesUsageLastMonth: 0
  };

  const monthlyOFH = calculateMonthlyOFH(financialInput);
  const weeklyOFH = calculateWeeklyOFH(monthlyOFH);
  const availableMoney = calculateAvailableMoney(operativeMoney);
  const diagnoses = buildTopDiagnoses(financialInput);
  const recommendations = buildRecommendations(diagnoses);

  await supabaseAdmin.from('financial_snapshots').insert({
    household_id: householdId,
    period_type: 'conversacional',
    payload: JSON.stringify({
      monthlyOFH,
      weeklyOFH,
      availableMoney,
      diagnoses,
      recommendations,
      financialInput,
      totals: { totalIncome, totalExpenses }
    })
  });
}
