import { calculateFinancialRadar, type FinancialRadar } from '@/lib/finance/financialRadar';
import { calculateFinancialStatusFromRecommendationContext, type FinancialStatus } from '@/lib/finance/financialStatus';
import { supabaseAdmin } from '@/lib/db/supabase';

type SupabaseClientLike = typeof supabaseAdmin;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function logRecommendationContext(message: string, payload?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[recommendation-context] ${message}`, payload ?? {});
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeType(value: string | null | undefined) {
  return (value ?? '').toLowerCase().trim();
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasDebtPaymentHint(text: string | null | undefined) {
  const normalized = normalizeLabel(text);
  if (!normalized) return false;
  return ['pago', 'deuda', 'tarjeta', 'tdc', 'abono'].some((token) => normalized.includes(token));
}

function isDebtType(type: string) {
  return ['deuda', 'credit_card', 'loan'].includes(normalizeType(type));
}

function isReceivableType(type: string) {
  return ['por_cobrar', 'receivable'].includes(normalizeType(type));
}

function isExpenseType(type: string) {
  return ['debit', 'gasto', 'expense', 'egreso'].includes(normalizeType(type));
}

function isIncomeType(type: string) {
  return ['credit', 'income', 'ingreso', 'deposito'].includes(normalizeType(type));
}

function buildGroupedBalances(accounts: Array<{ type: string; balance: number }>) {
  return accounts.reduce<Record<string, number>>((acc, account) => {
    const key = normalizeType(account.type) || 'unknown';
    acc[key] = roundMoney((acc[key] ?? 0) + Math.max(account.balance, 0));
    return acc;
  }, {});
}

function inferTacticalPressure(radar: FinancialRadar): 'low' | 'medium' | 'high' {
  if (radar.status === 'presion') return 'high';
  if (radar.status === 'atencion') return 'medium';
  return 'low';
}

function inferStructuralPressure(status: FinancialStatus): 'low' | 'medium' | 'high' {
  if (status.status === 'vulnerable') return 'high';
  if (status.status === 'ajustado') return 'medium';
  return 'low';
}

function toISODate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

function daysUntil(dateIso: string, now: Date) {
  const date = new Date(dateIso).getTime();
  if (!Number.isFinite(date)) return Number.POSITIVE_INFINITY;
  return Math.ceil((date - now.getTime()) / MS_PER_DAY);
}

function tokenSet(value: string) {
  const ignoredTokens = new Set(['pago', 'deuda', 'tarjeta', 'credito', 'credito', 'tdc', 'prestamo', 'loan', 'card']);
  return new Set(
    normalizeLabel(value)
      .split(' ')
      .filter((token) => token.length >= 3)
      .filter((token) => !ignoredTokens.has(token))
  );
}

function labelsLikelyMatch(left: string, right: string) {
  const leftNorm = normalizeLabel(left);
  const rightNorm = normalizeLabel(right);
  if (!leftNorm || !rightNorm) return false;
  if (leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm)) return true;
  const leftTokens = tokenSet(leftNorm);
  const rightTokens = tokenSet(rightNorm);
  if (!leftTokens.size || !rightTokens.size) return false;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap >= 1;
}

function resolveUpcomingDueDate(dueDay: number, now: Date) {
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dueDay, 12, 0, 0, 0));
  if (dueDate.getUTCDate() !== dueDay) return null;
  if (dueDate.getTime() < now.getTime()) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dueDay, 12, 0, 0, 0));
    if (next.getUTCDate() !== dueDay) return null;
    return next;
  }
  return dueDate;
}

function buildCycleWindow(dueDate: Date) {
  const previousDueDate = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() - 1, dueDate.getUTCDate(), 12, 0, 0, 0));
  const cycleStart = new Date(previousDueDate.getTime() + MS_PER_DAY);
  return { cycleStart, cycleEnd: dueDate };
}

type ReconciledObligation = {
  name: string;
  dueDay: number | null;
  dueDate: string | null;
  expectedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'pending' | 'partial' | 'paid';
  matchedPaymentCount: number;
};

export type HouseholdRecommendationContext = {
  householdId: string;
  generatedAt: string;
  declared: {
    recurringIncomePlan: Array<{ name: string; monthlyAmount: number; recurring: boolean }>;
    fixedObligations: Array<{ name: string; amount: number; dueDay: number | null }>;
    extraordinaryEvents: Array<{ label: string; amount: number; eventDate: string | null }>;
    goals: Array<{ name: string; targetAmount: number; savedAmount: number; targetDate: string }>;
    priorities: string[];
    householdSettings: {
      householdName: string | null;
      recurringPatterns: string[];
    };
  };
  observed: {
    accountBalances: Array<{ name: string; type: string; balance: number }>;
    groupedBalances: Record<string, number>;
    recentTransactions: Array<{ type: string; amount: number; happenedAt: string | null }>;
    recentIncome: number;
    recentExpenses: number;
    debtBalances: number;
    receivables: number;
    actualCurrentLiquidity: number;
  };
  projected: {
    upcoming7dLoad: number;
    nearFuture8to14dLoad: number;
    monthlyBaseCoverage: number;
    debtPressureRatio: number;
    reserveMonths: number;
    nextHeavyWeek: string | null;
    nextExtraordinaryEvent: { label: string; amount: number; date: string; inDays: number } | null;
    tacticalPressure: 'low' | 'medium' | 'high';
    structuralPressure: 'low' | 'medium' | 'high';
    reconciledObligations: ReconciledObligation[];
    radar: FinancialRadar;
    status: FinancialStatus;
  };
  derived: {
    householdStage: FinancialStatus['stage'];
    tacticalStatus: FinancialRadar['status'];
    structuralStatus: FinancialStatus['status'];
    extraordinaryIncomeDependence: number;
    baseMonthlyMargin: number;
    confidenceNotes: string[];
    assumptions: string[];
  };
};

export async function buildHouseholdRecommendationContext(
  householdId: string,
  client: SupabaseClientLike = supabaseAdmin,
  options?: { now?: Date }
): Promise<HouseholdRecommendationContext> {
  const assumptions: string[] = [];
  const now = options?.now ?? new Date();

  const [
    householdResult,
    incomeSourcesResult,
    obligationsResult,
    calendarEventsResult,
    goalsResult,
    recurringPatternsResult,
    snapshotsResult,
    accountsResult,
    variableSpendingResult,
    groupsResult,
    receivablesResult
  ] = await Promise.all([
    client.from('households').select('name').eq('id', householdId).limit(1).maybeSingle(),
    client.from('income_sources').select('name,amount,recurring').eq('household_id', householdId),
    client.from('obligations').select('name,amount,due_day').eq('household_id', householdId),
    client.from('calendar_events').select('label,amount,event_date').eq('household_id', householdId),
    client.from('goals').select('name,target_amount,saved_amount,target_date').eq('household_id', householdId),
    client.from('recurring_patterns').select('pattern_type,active').eq('household_id', householdId).eq('active', true),
    client.from('financial_snapshots').select('payload').eq('household_id', householdId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('accounts').select('id,name,type,balance,periodic_payment').eq('household_id', householdId).eq('is_active', true),
    client.from('variable_spending_profiles').select('monthly_estimate').eq('household_id', householdId),
    client.from('transaction_groups').select('id,note,source').eq('household_id', householdId),
    client.from('receivables').select('pending_amount,status').eq('household_id', householdId)
  ]);

  const groups = (groupsResult.data ?? []) as Array<{ id: string; note?: string | null; source?: string | null }>;
  const groupIds = groups.map((group) => group.id);
  const transactionsResult = groupIds.length
    ? await client
        .from('transactions')
        .select('id,group_id,type,amount,happened_at,category,account_id')
        .in('group_id', groupIds)
        .order('happened_at', { ascending: false })
        .limit(90)
    : { data: [], error: null };

  const recurringIncomePlan = ((incomeSourcesResult.data ?? []) as Array<{ name: string; amount: string | number; recurring: boolean }>)
    .map((item) => ({
      name: item.name,
      monthlyAmount: roundMoney(toNumber(item.amount, 0)),
      recurring: item.recurring !== false
    }));

  if (!recurringIncomePlan.length) {
    assumptions.push('No recurring income sources found; recurring income assumed as 0.');
  }

  const fixedObligations = ((obligationsResult.data ?? []) as Array<{ name: string; amount: string | number; due_day: number | null }>)
    .map((item) => ({
      name: item.name,
      amount: roundMoney(toNumber(item.amount, 0)),
      dueDay: item.due_day ?? null
    }));

  if (!fixedObligations.length) {
    assumptions.push('No fixed obligations found; immediate load may be underestimated.');
  }

  const extraordinaryEvents = ((calendarEventsResult.data ?? []) as Array<{ label: string; amount: string | number; event_date: string | null }>)
    .map((item) => ({
      label: item.label,
      amount: roundMoney(toNumber(item.amount, 0)),
      eventDate: toISODate(item.event_date)
    }));

  const goals = ((goalsResult.data ?? []) as Array<{ name: string; target_amount: string | number; saved_amount: string | number; target_date: string }>)
    .map((goal) => ({
      name: goal.name,
      targetAmount: roundMoney(toNumber(goal.target_amount, 0)),
      savedAmount: roundMoney(toNumber(goal.saved_amount, 0)),
      targetDate: new Date(goal.target_date).toISOString()
    }));

  const recurringPatterns = ((recurringPatternsResult.data ?? []) as Array<{ pattern_type: string; active: boolean }>)
    .map((pattern) => pattern.pattern_type);

  const latestSnapshotPayload = snapshotsResult.data?.payload
    ? (typeof snapshotsResult.data.payload === 'string' ? JSON.parse(snapshotsResult.data.payload) : snapshotsResult.data.payload)
    : null;

  const priorities = Array.isArray(latestSnapshotPayload?.diagnoses)
    ? latestSnapshotPayload.diagnoses.filter((item: unknown): item is string => typeof item === 'string')
    : [];

  const accounts = ((accountsResult.data ?? []) as Array<{ id: string; name: string; type: string; balance: string | number; periodic_payment?: string | number | null }>)
    .map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      balance: roundMoney(toNumber(item.balance, 0)),
      periodicPayment: item.periodic_payment == null ? null : roundMoney(toNumber(item.periodic_payment, 0))
    }));

  const accountBalances = accounts.map(({ name, type, balance }) => ({ name, type, balance }));
  const groupedBalances = buildGroupedBalances(accountBalances.map((item) => ({ type: item.type, balance: item.balance })));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const groupMetaById = new Map(groups.map((group) => [group.id, group]));

  const recentTransactions = ((transactionsResult.data ?? []) as Array<{
    id?: string;
    group_id?: string;
    type: string;
    amount: string | number;
    happened_at: string | null;
    category?: string | null;
    account_id?: string | null;
  }>)
    .map((item) => ({
      id: item.id ?? null,
      groupId: item.group_id ?? null,
      type: item.type,
      amount: roundMoney(toNumber(item.amount, 0)),
      happenedAt: toISODate(item.happened_at),
      category: normalizeType(item.category ?? ''),
      accountId: item.account_id ?? null
    }));

  const debtAccountIds = accounts.filter((account) => isDebtType(account.type)).map((account) => account.id);
  const debtPaymentPoolResult = groupIds.length && debtAccountIds.length
    ? await client
        .from('transactions')
        .select('id,group_id,type,amount,happened_at,category,account_id')
        .in('group_id', groupIds)
        .order('happened_at', { ascending: false })
        .limit(600)
    : { data: [], error: null };

  const debtPaymentPool = ((debtPaymentPoolResult.data ?? []) as Array<{
    id?: string;
    group_id?: string;
    type: string;
    amount: string | number;
    happened_at: string | null;
    category?: string | null;
    account_id?: string | null;
  }>).map((item) => ({
    id: item.id ?? null,
    groupId: item.group_id ?? null,
    type: normalizeType(item.type),
    amount: roundMoney(toNumber(item.amount, 0)),
    happenedAt: toISODate(item.happened_at),
    category: normalizeType(item.category ?? ''),
    accountId: item.account_id ?? null
  }));

  const debtAccountsById = new Map(
    accounts
      .filter((account) => isDebtType(account.type))
      .map((account) => [account.id, account])
  );
  const debtPaymentCandidates = debtPaymentPool
    .map((tx) => {
      const account = tx.accountId ? accountsById.get(tx.accountId) : null;
      const groupMeta = tx.groupId ? groupMetaById.get(tx.groupId) : null;
      const groupDescription = groupMeta?.note ?? groupMeta?.source ?? '';
      const categorySuggestsDebtPayment = ['deuda', 'pago_deuda'].includes(tx.category);
      const groupSuggestsDebtPayment = hasDebtPaymentHint(groupDescription);
      const accountIsDebt = Boolean(account && isDebtType(account.type));
      const rejectionReason = !accountIsDebt
        ? 'account_not_debt'
        : (!categorySuggestsDebtPayment && !groupSuggestsDebtPayment)
          ? 'category_or_group_not_debt_payment'
          : null;

      return {
        id: tx.id,
        groupId: tx.groupId,
        happenedAt: tx.happenedAt,
        category: tx.category,
        amount: tx.amount,
        accountId: tx.accountId,
        accountName: account?.name ?? null,
        accountType: account?.type ?? null,
        direction: tx.type,
        groupDescription,
        isDebtPaymentCandidate: rejectionReason === null,
        rejectionReason
      };
    });

  logRecommendationContext('debt payment candidates', {
    total: debtPaymentCandidates.length,
    candidates: debtPaymentCandidates
  });

  const reconciledObligations: ReconciledObligation[] = fixedObligations.map((obligation) => {
    const expectedAmount = Math.max(obligation.amount, 0);
    const dueDate = obligation.dueDay ? resolveUpcomingDueDate(obligation.dueDay, now) : null;
    const cycleWindow = dueDate ? buildCycleWindow(dueDate) : null;
    const matchedDebtAccountIds = accounts
      .filter((account) => isDebtType(account.type))
      .filter((account) => labelsLikelyMatch(obligation.name, account.name))
      .map((account) => account.id);

    const matchedPaymentTransactions = debtPaymentCandidates
      .filter((tx) => tx.isDebtPaymentCandidate)
      .filter((tx) => tx.accountId && debtAccountsById.has(tx.accountId))
      .filter((tx) => tx.accountId && matchedDebtAccountIds.includes(tx.accountId))
      .filter((tx) => {
        if (!tx.happenedAt) return false;
        const happenedAt = new Date(tx.happenedAt).getTime();
        if (!Number.isFinite(happenedAt)) return false;
        if (!cycleWindow) return now.getTime() - happenedAt <= 35 * MS_PER_DAY;
        return happenedAt >= cycleWindow.cycleStart.getTime() && happenedAt <= cycleWindow.cycleEnd.getTime();
      });

    const paidAmount = roundMoney(matchedPaymentTransactions.reduce((acc, tx) => acc + Math.max(tx.amount, 0), 0));

    const remainingAmount = roundMoney(Math.max(expectedAmount - paidAmount, 0));
    const status: ReconciledObligation['status'] = remainingAmount <= 0
      ? 'paid'
      : paidAmount > 0
        ? 'partial'
        : 'pending';

    const matchedPaymentCount = matchedPaymentTransactions.length;

    const matchedDestinationAccounts = matchedDebtAccountIds
      .map((id) => accountsById.get(id)?.name ?? id)
      .filter(Boolean);

    const matchedPaymentDetails = matchedPaymentTransactions.map((tx) => {
      const sourceAccounts = debtPaymentPool
        .filter((line) => line.groupId && tx.groupId && line.groupId === tx.groupId)
        .filter((line) => line.type === 'credit')
        .filter((line) => line.accountId && line.accountId !== tx.accountId)
        .map((line) => accountsById.get(line.accountId as string)?.name ?? (line.accountId as string));

      return {
        id: tx.id ?? null,
        happenedAt: tx.happenedAt,
        amount: tx.amount,
        sourceAccounts
      };
    });

    logRecommendationContext('obligation reconciliation', {
      obligationName: obligation.name,
      expectedAmount,
      matchedDestinationAccount: matchedDestinationAccounts,
      matchedPaymentTransactions: matchedPaymentDetails,
      totalPaidAmount: paidAmount,
      remainingAmount,
      status
    });

    return {
      name: obligation.name,
      dueDay: obligation.dueDay,
      dueDate: dueDate?.toISOString() ?? null,
      expectedAmount,
      paidAmount,
      remainingAmount,
      status,
      matchedPaymentCount
    };
  });

  const pendingReconciledObligationsForRadar = reconciledObligations
    .filter((obligation) => obligation.status !== 'paid' && obligation.remainingAmount > 0)
    .map((obligation) => ({
      name: obligation.status === 'partial'
        ? `${obligation.name} (restante ${obligation.remainingAmount.toFixed(2)})`
        : obligation.name,
      amount: obligation.remainingAmount,
      dueDay: obligation.dueDay
    }));

  const tx30d = recentTransactions.filter((tx) => tx.happenedAt && daysUntil(tx.happenedAt, now) >= -30);
  if (!tx30d.length) assumptions.push('Not enough recent movements (30d); trend confidence reduced.');

  const recentIncome = roundMoney(tx30d.filter((tx) => isIncomeType(tx.type)).reduce((acc, tx) => acc + Math.max(tx.amount, 0), 0));
  const recentExpenses = roundMoney(tx30d.filter((tx) => isExpenseType(tx.type)).reduce((acc, tx) => acc + Math.max(tx.amount, 0), 0));

  const debtBalances = roundMoney(
    accountBalances.filter((account) => isDebtType(account.type)).reduce((acc, account) => acc + Math.max(account.balance, 0), 0)
  );

  const receivables = roundMoney(
    ((receivablesResult.data ?? []) as Array<{ pending_amount: string | number; status: string }>).
      filter((item) => normalizeType(item.status) !== 'cancelado').
      reduce((acc, item) => acc + Math.max(toNumber(item.pending_amount, 0), 0), 0)
  );

  const actualCurrentLiquidity = roundMoney(
    accountBalances
      .filter((account) => !isDebtType(account.type) && !isReceivableType(account.type))
      .reduce((acc, account) => acc + Math.max(account.balance, 0), 0)
  );

  const fallbackMonthlyEstimate = ((variableSpendingResult.data ?? []) as Array<{ monthly_estimate: string | number }>)
    .reduce((acc, item) => acc + toNumber(item.monthly_estimate, 0), 0);

  const radar = calculateFinancialRadar({
    now,
    accounts: accountBalances,
    obligations: pendingReconciledObligationsForRadar,
    recentTransactions,
    fallbackMonthlyEstimate
  });

  const recurringIncomeMonthly = roundMoney(recurringIncomePlan.filter((item) => item.recurring).reduce((acc, item) => acc + item.monthlyAmount, 0));
  const obligationsMonthly = roundMoney(fixedObligations.reduce((acc, item) => acc + item.amount, 0));

  const debtPaymentsMonthly = roundMoney(
    accounts
      .filter((item) => isDebtType(item.type))
      .reduce((acc, item) => acc + Math.max(item.periodicPayment ?? 0, 0), 0)
  );
  const snapshotDebtPayments = toNumber((latestSnapshotPayload?.financialInput as Record<string, unknown> | undefined)?.debtPayments, 0);
  const safeDebtPaymentsMonthly = debtPaymentsMonthly > 0 ? debtPaymentsMonthly : snapshotDebtPayments;

  const annualExtraIncome = roundMoney(extraordinaryEvents.reduce((acc, item) => acc + item.amount, 0));

  const protectedSavings = roundMoney(
    (groupedBalances.fondo ?? 0) +
    (groupedBalances.savings_fund ?? 0) +
    (groupedBalances.investment ?? 0) +
    (groupedBalances.inversion ?? 0)
  );

  const safeObligations = obligationsMonthly > 0 ? obligationsMonthly : Math.max(recurringIncomeMonthly * 0.8, 1);
  const monthlyBaseCoverage = roundMoney(recurringIncomeMonthly / safeObligations);
  const debtPressureRatio = roundMoney(safeDebtPaymentsMonthly / Math.max(recurringIncomeMonthly, 1));
  const reserveMonths = roundMoney(protectedSavings / safeObligations);
  const extraordinaryIncomeDependence = roundMoney((annualExtraIncome / 12) / Math.max(recurringIncomeMonthly + annualExtraIncome / 12, 1));
  const baseMonthlyMargin = roundMoney(recurringIncomeMonthly - obligationsMonthly - safeDebtPaymentsMonthly);

  const confidenceNotes: string[] = [];
  if (!recurringIncomePlan.length) confidenceNotes.push('Declared income is incomplete, projections are conservative.');
  if (!tx30d.length) confidenceNotes.push('Observed behavior lacks recent transaction history.');
  if (!extraordinaryEvents.length) confidenceNotes.push('No extraordinary events declared, seasonality might be missing.');

  const status = calculateFinancialStatusFromRecommendationContext({
    declared: {
      recurringIncomePlan: recurringIncomePlan.map((item) => ({
        monthlyAmount: item.monthlyAmount,
        recurring: item.recurring
      })),
      fixedObligations: fixedObligations.map((item) => ({
        amount: item.amount
      }))
    },
    observed: {
      debtBalances,
      actualCurrentLiquidity
    },
    projected: {
      monthlyBaseCoverage,
      debtPressureRatio,
      reserveMonths
    },
    derived: {
      extraordinaryIncomeDependence,
      baseMonthlyMargin,
      confidenceNotes,
      assumptions
    }
  });

  assumptions.push(...status.assumptions);

  const nextExtraordinaryEvent = extraordinaryEvents
    .filter((event) => event.eventDate)
    .map((event) => ({
      label: event.label,
      amount: event.amount,
      date: event.eventDate as string,
      inDays: daysUntil(event.eventDate as string, now)
    }))
    .filter((event) => event.inDays >= 0)
    .sort((a, b) => a.inDays - b.inDays)[0] ?? null;

  if (!nextExtraordinaryEvent && extraordinaryEvents.length) {
    assumptions.push('Extraordinary events loaded but no future date is available.');
  }


  const context: HouseholdRecommendationContext = {
    householdId,
    generatedAt: now.toISOString(),
    declared: {
      recurringIncomePlan,
      fixedObligations,
      extraordinaryEvents,
      goals,
      priorities,
      householdSettings: {
        householdName: (householdResult.data?.name as string | undefined) ?? null,
        recurringPatterns
      }
    },
    observed: {
      accountBalances,
      groupedBalances,
      recentTransactions,
      recentIncome,
      recentExpenses,
      debtBalances,
      receivables,
      actualCurrentLiquidity
    },
    projected: {
      upcoming7dLoad: radar.upcomingLoad,
      nearFuture8to14dLoad: radar.nearFutureLoad,
      monthlyBaseCoverage,
      debtPressureRatio,
      reserveMonths,
      nextHeavyWeek: radar.nearFutureLoad > radar.upcomingLoad * 0.65 ? '8-14d window may be heavier than current tactical window.' : null,
      nextExtraordinaryEvent,
      tacticalPressure: inferTacticalPressure(radar),
      structuralPressure: inferStructuralPressure(status),
      reconciledObligations,
      radar,
      status
    },
    derived: {
      householdStage: status.stage,
      tacticalStatus: radar.status,
      structuralStatus: status.status,
      extraordinaryIncomeDependence,
      baseMonthlyMargin,
      confidenceNotes,
      assumptions: Array.from(new Set(assumptions))
    }
  };

  logRecommendationContext('declared loaded', {
    householdId,
    recurringIncomeItems: context.declared.recurringIncomePlan.length,
    obligations: context.declared.fixedObligations.length,
    extraordinaryEvents: context.declared.extraordinaryEvents.length,
    goals: context.declared.goals.length
  });

  logRecommendationContext('observed loaded', {
    householdId,
    accounts: context.observed.accountBalances.length,
    recentTransactions: context.observed.recentTransactions.length,
    liquidity: context.observed.actualCurrentLiquidity,
    debtBalances: context.observed.debtBalances
  });

  logRecommendationContext('projected computed', {
    householdId,
    tacticalPressure: context.projected.tacticalPressure,
    structuralPressure: context.projected.structuralPressure,
    upcoming7dLoad: context.projected.upcoming7dLoad,
    reserveMonths: context.projected.reserveMonths,
    assumptions: context.derived.assumptions.length
  });

  return context;
}
