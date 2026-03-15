import { z } from 'zod';
import { supabase } from '@/lib/db/supabase';
import { calculateMonthlyOFH, calculateWeeklyOFH } from '@/lib/financial/engine';
import type { TransactionIntent } from '@/lib/ai/transactionInterpreter';

export const onboardingSchema = z.object({
  householdName: z.string().min(2),
  regularIncome: z.number().nonnegative(),
  extraIncomeAnnual: z.number().nonnegative(),
  fixedExpenses: z.number().nonnegative(),
  variableExpenses: z.number().nonnegative()
});

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

async function getDefaultHouseholdId() {
  const { data } = await supabase.from('households').select('id').limit(1).maybeSingle();
  return data?.id as string | undefined;
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
