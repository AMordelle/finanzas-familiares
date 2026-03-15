import { randomUUID } from 'crypto';
import { z } from 'zod';
import { supabase } from '@/lib/db/supabase';
import { calculateMonthlyOFH, calculateWeeklyOFH } from '@/lib/financial/engine';
import type { TransactionIntent } from '@/lib/ai/transactionInterpreter';
import { buildInitialIndicators, onboardingPayloadSchema, type OnboardingPayload } from '@/lib/onboarding/flow';

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

async function getOrCreateActiveProfileId() {
  const configured = process.env.DEV_PROFILE_ID;
  if (configured) return configured;

  const { data: firstProfile } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
  if (firstProfile?.id) return firstProfile.id as string;

  const id = randomUUID();
  const { error } = await supabase.from('profiles').insert({
    id,
    full_name: 'Usuario local'
  });

  if (error) throw new Error(error.message);
  return id;
}

async function getDefaultHouseholdId() {
  const profileId = await getOrCreateActiveProfileId();

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('profile_id', profileId)
    .limit(1)
    .maybeSingle();

  if (membership?.household_id) return membership.household_id as string;

  const { data } = await supabase.from('households').select('id').limit(1).maybeSingle();
  return data?.id as string | undefined;
}

export async function hasOnboardingForActiveProfile() {
  const profileId = await getOrCreateActiveProfileId();
  const { data } = await supabase
    .from('household_members')
    .select('id')
    .eq('profile_id', profileId)
    .limit(1)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function createHouseholdOnboarding(rawInput: unknown) {
  const input: OnboardingPayload = onboardingPayloadSchema.parse(rawInput);
  const profileId = await getOrCreateActiveProfileId();

  const { data: household, error: householdError } = await supabase
    .from('households')
    .insert({ name: input.householdName })
    .select('id')
    .single();

  if (householdError || !household?.id) {
    throw new Error(householdError?.message ?? 'No fue posible crear el hogar.');
  }

  const householdId = household.id as string;

  await supabase.from('household_members').insert({
    household_id: householdId,
    profile_id: profileId,
    role: 'owner'
  });

  const accountPayload = [
    ...input.operationalAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'operativa', balance: (item.saldoInicial ?? 0).toFixed(2) })),
    ...input.fundAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'fondo', balance: (item.saldoInicial ?? 0).toFixed(2) })),
    ...input.debtAccounts.map((item) => ({ household_id: householdId, name: item.nombre, type: 'deuda', balance: (item.saldoInicial ?? 0).toFixed(2) })),
    ...input.receivables.map((item) => ({ household_id: householdId, name: item.nombre, type: 'por_cobrar', balance: item.monto.toFixed(2) }))
  ];

  if (accountPayload.length > 0) {
    const { error } = await supabase.from('accounts').insert(accountPayload);
    if (error) throw new Error(error.message);
  }

  const incomePayload = [
    ...input.regularIncomes.map((item) => ({ household_id: householdId, name: `${item.nombre} (${item.periodicidad ?? 'mensual'})`, amount: item.monto.toFixed(2), recurring: true })),
    ...input.extraordinaryIncomes.map((item) => ({ household_id: householdId, name: `${item.nombre}${item.mesEsperado ? ` (mes ${item.mesEsperado})` : ''}`, amount: item.monto.toFixed(2), recurring: false }))
  ];

  if (incomePayload.length > 0) {
    const { error } = await supabase.from('income_sources').insert(incomePayload);
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
    const { error } = await supabase.from('obligations').insert(obligationsPayload);
    if (error) throw new Error(error.message);
  }

  if (input.variableSpending.length > 0) {
    const { error } = await supabase.from('variable_spending_profiles').insert(
      input.variableSpending.map((item) => ({
        household_id: householdId,
        category: item.nombre,
        monthly_estimate: item.monto.toFixed(2)
      }))
    );

    if (error) throw new Error(error.message);
  }

  if (input.receivables.length > 0) {
    const { error } = await supabase.from('receivables').insert(
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
  const { error: snapshotError } = await supabase.from('financial_snapshots').insert({
    household_id: householdId,
    period_type: 'onboarding_inicial',
    payload: JSON.stringify(indicators)
  });

  if (snapshotError) throw new Error(snapshotError.message);

  return {
    householdId,
    indicators
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) {
    return {
      hasHousehold: false,
      monthlyOFH: 0,
      weeklyOFH: 0,
      availableMoney: 0,
      diagnoses: ['Completa tu onboarding para obtener diagnóstico.'],
      recommendations: ['Configura hogar, cuentas e ingresos iniciales para activar recomendaciones.']
    };
  }

  const { data } = await supabase
    .from('financial_snapshots')
    .select('payload')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.payload) {
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

export async function getAccountsForRegistration(): Promise<AccountOption[]> {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) return [];

  const { data } = await supabase
    .from('accounts')
    .select('id,name,type')
    .eq('household_id', householdId)
    .order('name');

  return (data ?? []) as AccountOption[];
}

export async function getRegistrationSetupStatus(): Promise<RegistrationSetupStatus> {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) {
    return {
      hasHousehold: false,
      accounts: []
    };
  }

  const accounts = await getAccountsForRegistration();
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
