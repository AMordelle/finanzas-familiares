export type ProjectionTrend = 'up' | 'down' | 'stable';
export type ProjectionConfidence = 'low' | 'medium' | 'high';
export type FinancialMovementClassification = 'recurrent' | 'extraordinary' | 'internal' | 'ignore' | 'debt_payment';
export type ProjectionClassificationSource = 'manual' | 'automatic';

export type ProjectionDetectedMovement = {
  description: string;
  amount: number;
  date: string;
  reason: string;
};

export type ProjectionMovementAuditItem = {
  groupId: string;
  date: string;
  category: string;
  accountName: string | null;
  amount: number;
  reason: string;
  classification: FinancialMovementClassification;
  classificationSource: ProjectionClassificationSource;
};

export type ProjectionCategoryBreakdown = {
  category: string;
  amount: number;
};

export type ProjectionCommitmentAuditItem = {
  weekNumber: number;
  description: string;
  amount: number;
  dueDate: string | null;
  installmentNumber: number;
};

export type ProjectionEventAuditItem = {
  weekNumber: number;
  label: string;
  amount: number;
  eventDate: string;
};

export type ProjectionCalculationTransparency = {
  income: {
    periodStart: string;
    periodEnd: string;
    criterion: string;
    shortNote: string;
    weeklyAverage: number;
    ordinaryIncome: number;
    extraordinaryIncluded: number;
    extraordinaryExcluded: number;
    byCategory: ProjectionCategoryBreakdown[];
    byAccount: ProjectionCategoryBreakdown[];
    includedMovements: ProjectionMovementAuditItem[];
    excludedMovements: ProjectionMovementAuditItem[];
  };
  expenses: {
    periodStart: string;
    periodEnd: string;
    criterion: string;
    shortNote: string;
    weeklyAverage: number;
    variableExpenses: number;
    fixedExpenses: number;
    debtPaymentsIncluded: number;
    byCategory: ProjectionCategoryBreakdown[];
    includedMovements: ProjectionMovementAuditItem[];
    excludedMovements: ProjectionMovementAuditItem[];
  };
  commitments: {
    criterion: string;
    shortNote: string;
    byWeek: Array<{ weekNumber: number; total: number; items: ProjectionCommitmentAuditItem[] }>;
  };
  events: {
    criterion: string;
    shortNote: string;
    includedEvents: ProjectionEventAuditItem[];
  };
  warnings: string[];
};

export type ProjectionWeek = {
  weekNumber: number;
  periodStart: string;
  periodEnd: string;
  openingOperationalMoney: number;
  estimatedIncome: number;
  estimatedVariableExpenses: number;
  estimatedCommitments: number;
  extraordinaryEvents: number;
  closingOperationalMoney: number;
  netChange: number;
  notes: string[];
};

export type ProjectionScenario = {
  generatedAt: string;
  recurringWeeklyIncome: number;
  recurringWeeklyExpenses: number;
  extraordinaryDetected: ProjectionDetectedMovement[];
  internalExcluded: ProjectionDetectedMovement[];
  weeks: ProjectionWeek[];
  summary: {
    startingOperationalMoney: number;
    endingOperationalMoney: number;
    projectedChange: number;
    lowestProjectedMoney: number;
    lowestProjectedWeek: number;
    trend: ProjectionTrend;
    confidence: ProjectionConfidence;
    dataLimitations: string[];
  };
  calculation: ProjectionCalculationTransparency;
};

type QueryResult<T> = { data: T | null; error: { message: string } | null };
type QueryBuilder = {
  select: (columns?: string) => QueryBuilder;
  eq: (field: string, value: unknown) => QueryBuilder;
  in: (field: string, value: unknown[]) => QueryBuilder;
  gte: (field: string, value: unknown) => QueryBuilder;
  order: (field: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (value: number) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult<Record<string, unknown>>>;
  then: <TResult1 = QueryResult<unknown[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
};
type SupabaseClientLike = { from: (table: string) => QueryBuilder };

type AccountRow = { id: string; household_id: string; name: string; type: string; balance: string | number; is_active?: boolean | null };
type GroupRow = { id: string; household_id: string };
type TransactionRow = { group_id: string; account_id?: string | null; type: string; category: string; amount: string | number; happened_at: string; projection_type?: FinancialMovementClassification | null };
type MovementAction = {
  action: 'income' | 'expense' | null;
  amount: number;
  happenedAt: string;
  groupId: string;
  category: string;
  accountName: string | null;
  accountType: string | null;
  reason: string;
  description: string;
  classification: FinancialMovementClassification;
  classificationSource: ProjectionClassificationSource;
  classificationReason: string;
  isExtraordinary: boolean;
  isTransferLike: boolean;
  isFixedExpense: boolean;
  isDebtPayment: boolean;
};
type MsiInstallmentRow = { id: string; household_id: string; msi_purchase_id?: string | null; installment_number: number; amount: string | number; due_date: string | null; status: string };
type MsiPurchaseRow = { id: string; description: string };
type CalendarEventRow = { id: string; household_id: string; label: string; amount: string | number; event_date: string };
type ExtraWorkRow = { id: string; household_id: string; status: string };

const PROJECTION_WEEKS = 12;
const RECENT_WEEKS = 4;
const FALLBACK_WEEKS = 12;

function getProjectionAccountScope(accountType: string): 'operational' | 'complementary' {
  const normalized = accountType.toLowerCase().trim();
  // Mismo criterio de dinero operativo real que usan Cierre/Dashboard Advisor:
  // solo efectivo y cuentas líquidas de uso diario; fondos, inversiones,
  // tarjetas, deudas, receivables, cuentas técnicas y complementarias quedan fuera.
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
  return operationalTypes.has(normalized) ? 'operational' : 'complementary';
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}


export function classifyFinancialMovement(input: {
  category: string;
  type?: string | null;
  description?: string | null;
  amount?: number;
  accountType?: string | null;
  hasMirrorMovement?: boolean;
  projectionType?: FinancialMovementClassification | null;
}): { classification: FinancialMovementClassification; source: ProjectionClassificationSource; reason: string } {
  if (input.projectionType) {
    return { classification: input.projectionType, source: 'manual', reason: `Clasificación manual de proyección: ${input.projectionType}.` };
  }

  const haystack = normalizeText(`${input.category} ${input.type ?? ''} ${input.description ?? ''} ${input.accountType ?? ''}`);

  // Heurísticas iniciales documentadas para Proyección v1:
  // - internal: transferencias/rebalanceos/movimientos técnicos o espejo entre cuentas propias.
  // - extraordinary: SAT, aguinaldo, bonos, préstamos, devoluciones, ventas aisladas o pagos extraordinarios.
  // - recurrent: lo operativo no clasificado como interno/extraordinario; alimenta el promedio semanal.
  const internalKeywords = ['transfer', 'traspaso', 'rebalanceo', 'payment_internal', 'interno', 'movimiento tecnico', 'ajuste tecnico'];
  if (input.hasMirrorMovement || internalKeywords.some((word) => haystack.includes(word))) {
    return { classification: 'internal', source: 'automatic', reason: 'Movimiento interno/técnico detectado; no afecta el flujo proyectable.' };
  }

  const extraordinaryKeywords = ['aguinaldo', 'sat', 'devolucion', 'devolución', 'bono', 'prestamo', 'préstamo', 'extraordinario', 'excepcional', 'venta aislada', 'premio', 'finiquito'];
  if (extraordinaryKeywords.some((word) => haystack.includes(normalizeText(word)))) {
    return { classification: 'extraordinary', source: 'automatic', reason: 'Movimiento extraordinario detectado; se separa del promedio recurrente.' };
  }

  return { classification: 'recurrent', source: 'automatic', reason: 'Movimiento operativo recurrente; alimenta el promedio semanal.' };
}

function inferMovementAction(lines: Array<{ type: string; category: string }>) {
  const has = (type: string, category: string) => lines.some((line) => line.type === type && line.category === category);
  if (has('debit', 'entrada_cuenta')) return 'income';
  if (has('credit', 'salida_cuenta')) return 'expense';
  return null;
}

function isExtraordinaryIncomeCategory(category: string) {
  const normalized = normalizeText(category);
  return ['bono', 'aguinaldo', 'sat', 'devolucion', 'prestamo', 'extraordinario', 'excepcional', 'premio', 'venta aislada', 'finiquito'].some((word) => normalized.includes(word));
}

function isTransferLikeCategory(category: string) {
  const normalized = normalizeText(category);
  return ['transfer', 'traspaso', 'entrada_cuenta', 'salida_cuenta', 'ajuste'].some((word) => normalized.includes(word));
}

function isFixedExpenseCategory(category: string) {
  const normalized = normalizeText(category);
  return ['renta', 'hipoteca', 'servicio', 'colegiatura', 'suscripcion', 'obligacion', 'fijo'].some((word) => normalized.includes(word));
}

function isDebtPaymentCategory(category: string) {
  const normalized = normalizeText(category);
  return ['tarjeta', 'deuda', 'credito', 'prestamo', 'pago_deuda'].some((word) => normalized.includes(word));
}

function addBreakdown(map: Map<string, number>, key: string, amount: number) {
  map.set(key, roundMoney((map.get(key) ?? 0) + amount));
}

function mapBreakdown(map: Map<string, number>) {
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

async function getDefaultHouseholdId(client: SupabaseClientLike) {
  const { data, error } = await client
    .from('household_members')
    .select('household_id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No fue posible resolver el hogar para la proyección: ${error.message}`);
  return (data?.household_id as string | undefined) ?? null;
}

function buildWeekRanges(generatedAt: Date) {
  const start = startOfUtcDay(generatedAt);
  return Array.from({ length: PROJECTION_WEEKS }, (_, index) => {
    const periodStart = addDays(start, index * 7);
    const periodEnd = addDays(periodStart, 6);
    return { periodStart, periodEnd, periodStartIso: toDateOnly(periodStart), periodEndIso: toDateOnly(periodEnd) };
  });
}

function actionToAuditItem(item: MovementAction): ProjectionMovementAuditItem {
  return {
    groupId: item.groupId,
    date: item.happenedAt.slice(0, 10),
    category: item.category,
    accountName: item.accountName,
    amount: roundMoney(item.amount),
    reason: item.reason,
    classification: item.classification,
    classificationSource: item.classificationSource
  };
}

function buildAverageDetails(args: {
  actions: MovementAction[];
  action: 'income' | 'expense';
  generatedAt: Date;
  dataLimitations: string[];
}) {
  const nowIso = args.generatedAt.toISOString();
  const recentPeriodStart = toDateOnly(addDays(args.generatedAt, -(RECENT_WEEKS * 7)));
  const fallbackPeriodStart = toDateOnly(addDays(args.generatedAt, -(FALLBACK_WEEKS * 7)));
  const recentStart = `${recentPeriodStart}T00:00:00.000Z`;
  const fallbackStart = `${fallbackPeriodStart}T00:00:00.000Z`;
  const label = args.action === 'income' ? 'ingresos' : 'gastos';
  const matchingRecent = args.actions.filter((item) => item.action === args.action && item.classification === 'recurrent' && item.happenedAt >= recentStart && item.happenedAt <= nowIso);
  const allRecentWindow = args.actions.filter((item) => item.happenedAt >= recentStart && item.happenedAt <= nowIso);

  if (matchingRecent.length > 0) {
    return {
      periodStart: recentPeriodStart,
      periodEnd: toDateOnly(args.generatedAt),
      divisorWeeks: RECENT_WEEKS,
      included: matchingRecent,
      excluded: allRecentWindow.filter((item) => item.action !== args.action || item.classification !== 'recurrent'),
      weeklyAverage: roundMoney(matchingRecent.reduce((acc, item) => acc + item.amount, 0) / RECENT_WEEKS),
      criterion: `Promedio semanal recurrente de las últimas ${RECENT_WEEKS} semanas; excluye movimientos extraordinary e internal en ${label}.`
    };
  }

  const matchingFallback = args.actions.filter((item) => item.action === args.action && item.classification === 'recurrent' && item.happenedAt >= fallbackStart && item.happenedAt <= nowIso);
  const allFallbackWindow = args.actions.filter((item) => item.happenedAt >= fallbackStart && item.happenedAt <= nowIso);
  if (matchingFallback.length > 0) {
    args.dataLimitations.push(`No hubo ${label} en las últimas 4 semanas; se usó el promedio semanal de hasta 12 semanas disponibles.`);
    return {
      periodStart: fallbackPeriodStart,
      periodEnd: toDateOnly(args.generatedAt),
      divisorWeeks: FALLBACK_WEEKS,
      included: matchingFallback,
      excluded: allFallbackWindow.filter((item) => item.action !== args.action || item.classification !== 'recurrent'),
      weeklyAverage: roundMoney(matchingFallback.reduce((acc, item) => acc + item.amount, 0) / FALLBACK_WEEKS),
      criterion: `Promedio semanal recurrente de las últimas ${FALLBACK_WEEKS} semanas disponibles porque no había datos suficientes en 4 semanas; excluye extraordinary e internal.`
    };
  }

  args.dataLimitations.push(`No hay historial reciente de ${label}; se proyecta ese rubro en $0.`);
  return {
    periodStart: recentPeriodStart,
    periodEnd: toDateOnly(args.generatedAt),
    divisorWeeks: RECENT_WEEKS,
    included: [] as MovementAction[],
    excluded: allRecentWindow.filter((item) => item.action !== args.action || item.classification !== 'recurrent'),
    weeklyAverage: 0,
    criterion: `No se encontraron movimientos recientes clasificados como ${label}.`
  };
}

function commitmentWeekIndex(installment: MsiInstallmentRow, ranges: ReturnType<typeof buildWeekRanges>, fallbackIndex: number) {
  if (!installment.due_date) return Math.min(fallbackIndex, PROJECTION_WEEKS - 1);
  const dueDate = installment.due_date.slice(0, 10);
  if (dueDate < ranges[0].periodStartIso) return 0;
  const index = ranges.findIndex((range) => dueDate >= range.periodStartIso && dueDate <= range.periodEndIso);
  return index >= 0 ? index : -1;
}

function detectTrend(projectedChange: number): ProjectionTrend {
  if (projectedChange > 0.009) return 'up';
  if (projectedChange < -0.009) return 'down';
  return 'stable';
}

function confidenceFromData(actions: MovementAction[]): ProjectionConfidence {
  const recurringIncomeCount = actions.filter((item) => item.action === 'income' && item.classification === 'recurrent').length;
  const recurringExpenseCount = actions.filter((item) => item.action === 'expense' && item.classification === 'recurrent').length;
  const extraordinaryCount = actions.filter((item) => item.classification === 'extraordinary').length;
  const internalCount = actions.filter((item) => item.classification === 'internal').length;
  const recurrentCount = recurringIncomeCount + recurringExpenseCount;

  if (recurringIncomeCount === 0 || recurringExpenseCount === 0) return 'low';
  if (recurrentCount < 3 || extraordinaryCount > recurrentCount || internalCount > recurrentCount) return 'low';
  if (recurringIncomeCount >= 2 && recurringExpenseCount >= 2 && extraordinaryCount <= 1 && internalCount <= 2) return 'high';
  return 'medium';
}

function emptyCalculation(generatedAt: Date): ProjectionCalculationTransparency {
  const periodStart = toDateOnly(addDays(generatedAt, -(RECENT_WEEKS * 7)));
  const periodEnd = toDateOnly(generatedAt);
  return {
    income: {
      periodStart,
      periodEnd,
      criterion: 'No hay hogar configurado; no se analizaron movimientos.',
      shortNote: 'Promedio semanal recurrente; no incluye extraordinarios, extras pendientes ni transferencias internas.',
      weeklyAverage: 0,
      ordinaryIncome: 0,
      extraordinaryIncluded: 0,
      extraordinaryExcluded: 0,
      byCategory: [],
      byAccount: [],
      includedMovements: [],
      excludedMovements: []
    },
    expenses: {
      periodStart,
      periodEnd,
      criterion: 'No hay hogar configurado; no se analizaron movimientos.',
      shortNote: 'Promedio semanal recurrente; no incluye extraordinarios ni transferencias internas.',
      weeklyAverage: 0,
      variableExpenses: 0,
      fixedExpenses: 0,
      debtPaymentsIncluded: 0,
      byCategory: [],
      includedMovements: [],
      excludedMovements: []
    },
    commitments: { criterion: 'MSI pendientes distribuidos por fecha de vencimiento; sin hogar no hay compromisos.', shortNote: 'Incluye MSI pendientes.', byWeek: [] },
    events: { criterion: 'Eventos extraordinarios solo si están registrados con fecha dentro del horizonte.', shortNote: 'Solo eventos registrados.', includedEvents: [] },
    warnings: ['No hay un hogar configurado para proyectar.']
  };
}

export async function buildProjectionScenario(
  householdId?: string | null,
  client?: SupabaseClientLike,
  generatedAt: Date = new Date()
): Promise<ProjectionScenario> {
  const dbClient = client ?? (await import('@/lib/db/supabase')).supabaseAdmin;
  const resolvedHouseholdId = householdId ?? await getDefaultHouseholdId(dbClient);
  const generatedAtIso = generatedAt.toISOString();
  const ranges = buildWeekRanges(generatedAt);
  const dataLimitations = [
    'La proyección usa promedios recientes, no garantiza resultados.',
    'Los extras pendientes no se cuentan como ingreso hasta que se paguen.',
    'Los eventos extraordinarios solo se incluyen si están registrados.'
  ];

  if (!resolvedHouseholdId) {
    return {
      generatedAt: generatedAtIso,
      recurringWeeklyIncome: 0,
      recurringWeeklyExpenses: 0,
      extraordinaryDetected: [],
      internalExcluded: [],
      weeks: ranges.map((range, index) => ({
        weekNumber: index + 1,
        periodStart: range.periodStartIso,
        periodEnd: range.periodEndIso,
        openingOperationalMoney: 0,
        estimatedIncome: 0,
        estimatedVariableExpenses: 0,
        estimatedCommitments: 0,
        extraordinaryEvents: 0,
        closingOperationalMoney: 0,
        netChange: 0,
        notes: ['No hay un hogar configurado para proyectar.']
      })),
      summary: {
        startingOperationalMoney: 0,
        endingOperationalMoney: 0,
        projectedChange: 0,
        lowestProjectedMoney: 0,
        lowestProjectedWeek: 1,
        trend: 'stable',
        confidence: 'low',
        dataLimitations: ['No hay un hogar configurado para proyectar.', ...dataLimitations]
      },
      calculation: emptyCalculation(generatedAt)
    };
  }

  const { data: accountData, error: accountsError } = await dbClient
    .from('accounts')
    .select('id,household_id,name,type,balance,is_active')
    .eq('household_id', resolvedHouseholdId);
  if (accountsError) throw new Error(`No fue posible leer cuentas para la proyección: ${accountsError.message}`);

  const accounts = ((accountData ?? []) as AccountRow[]).filter((account) => account.is_active !== false);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const operationalAccounts = accounts.filter((account) => getProjectionAccountScope(account.type) === 'operational');
  const startingOperationalMoney = roundMoney(operationalAccounts.reduce((acc, account) => acc + Number(account.balance), 0));
  if (!operationalAccounts.length) dataLimitations.push('No se encontraron cuentas operativas activas; el saldo inicial puede estar incompleto.');

  const { data: groupsData, error: groupsError } = await dbClient
    .from('transaction_groups')
    .select('id,household_id')
    .eq('household_id', resolvedHouseholdId);
  if (groupsError) throw new Error(`No fue posible leer grupos de movimientos para la proyección: ${groupsError.message}`);

  const groupIds = ((groupsData ?? []) as GroupRow[]).map((group) => group.id);
  const fallbackStart = `${toDateOnly(addDays(generatedAt, -(FALLBACK_WEEKS * 7)))}T00:00:00.000Z`;
  const { data: transactionData, error: transactionsError } = groupIds.length
    ? await dbClient
      .from('transactions')
      .select('group_id,account_id,type,category,amount,happened_at,projection_type')
      .in('group_id', groupIds)
      .gte('happened_at', fallbackStart)
    : { data: [] as TransactionRow[], error: null };
  if (transactionsError) throw new Error(`No fue posible leer movimientos para la proyección: ${transactionsError.message}`);

  const linesByGroup = ((transactionData ?? []) as TransactionRow[])
    .filter((line) => line.happened_at <= generatedAtIso)
    .reduce<Record<string, TransactionRow[]>>((acc, line) => {
      acc[line.group_id] = acc[line.group_id] ?? [];
      acc[line.group_id].push(line);
      return acc;
    }, {});

  const movementActions = Object.values(linesByGroup).map((lines) => {
    const action = inferMovementAction(lines);
    const amountLine = action === 'income'
      ? lines.find((line) => line.type === 'debit' && line.category === 'entrada_cuenta')
      : action === 'expense'
        ? lines.find((line) => line.type === 'credit' && line.category === 'salida_cuenta')
        : lines.find((line) => !isTransferLikeCategory(line.category)) ?? lines[0];
    const categoryLine = lines.find((line) => line.category && !['entrada_cuenta', 'salida_cuenta'].includes(line.category)) ?? amountLine ?? lines[0];
    const account = amountLine?.account_id ? accountById.get(amountLine.account_id) : undefined;
    const manualProjectionType = lines.find((line) => line.projection_type)?.projection_type ?? null;
    const category = categoryLine?.category ?? 'sin_categoria';
    const amount = Number(amountLine?.amount ?? categoryLine?.amount ?? 0);
    const happenedAt = lines.reduce((latest, line) => line.happened_at > latest ? line.happened_at : latest, lines[0]?.happened_at ?? '');
    const isTransferLike = lines.some((line) => isTransferLikeCategory(line.category)) && !action;
    const accountType = account?.type ?? null;
    const description = category;
    const isDebtPayment = isDebtPaymentCategory(category) || accountType === 'credit_card' || accountType === 'loan' || accountType === 'deuda';
    const classificationResult = classifyFinancialMovement({
      category,
      type: action,
      description,
      amount,
      accountType,
      hasMirrorMovement: isTransferLike,
      projectionType: manualProjectionType
    });
    const reason = classificationResult.source === 'manual'
      ? `${classificationResult.reason} ${classificationResult.classification === 'recurrent' ? 'Incluido en promedio recurrente.' : 'Excluido del promedio recurrente.'}`
      : classificationResult.classification === 'internal'
        ? 'Excluido: movimiento internal/transferencia entre cuentas, no entra a proyección.'
        : classificationResult.classification === 'extraordinary'
          ? 'Excluido: movimiento extraordinary/atípico, no entra al promedio recurrente.'
          : classificationResult.classification === 'debt_payment'
            ? 'Excluido: pago de deuda/tarjeta separado de gasto variable.'
            : classificationResult.classification === 'ignore'
              ? 'Excluido: movimiento ignorado para proyección.'
              : action === 'income'
                ? 'Incluido: ingreso recurrente usado para proyección.'
                : action === 'expense'
                  ? 'Incluido: gasto recurrente usado para proyección.'
                  : 'Excluido: no tiene patrón claro de ingreso o gasto operativo.';

    return {
      action,
      amount,
      happenedAt,
      groupId: lines[0]?.group_id ?? '',
      category,
      description,
      classification: classificationResult.classification,
      classificationSource: classificationResult.source,
      classificationReason: classificationResult.reason,
      accountName: account?.name ?? null,
      accountType,
      reason,
      isExtraordinary: classificationResult.classification === 'extraordinary' || (action === 'income' && isExtraordinaryIncomeCategory(category)),
      isTransferLike: classificationResult.classification === 'internal' || isTransferLike,
      isFixedExpense: action === 'expense' && isFixedExpenseCategory(category),
      isDebtPayment: action === 'expense' && isDebtPayment
    } satisfies MovementAction;
  });

  movementActions.forEach((item) => {
    if (item.classification !== 'recurrent' || item.action === null) return;
    const peers = movementActions.filter((peer) => peer !== item && peer.action === item.action && peer.classification === 'recurrent');
    if (peers.length < 2) return;
    const peerAverage = peers.reduce((acc, peer) => acc + peer.amount, 0) / peers.length;
    if (item.amount > Math.max(peerAverage * 3, 5000)) {
      item.classification = 'extraordinary';
      item.classificationSource = 'automatic';
      item.classificationReason = 'Monto atípicamente superior al historial recurrente; se separa del promedio.';
      item.reason = 'Excluido: monto extraordinario detectado por comparación histórica.';
      item.isExtraordinary = true;
    }
  });

  const incomeAverage = buildAverageDetails({ actions: movementActions, action: 'income', generatedAt, dataLimitations });
  const expenseAverage = buildAverageDetails({ actions: movementActions, action: 'expense', generatedAt, dataLimitations });
  const estimatedIncome = incomeAverage.weeklyAverage;
  const estimatedVariableExpenses = expenseAverage.weeklyAverage;
  const extraordinaryDetected = movementActions
    .filter((item) => item.classification === 'extraordinary')
    .map((item) => ({ description: item.description, amount: roundMoney(item.amount), date: item.happenedAt.slice(0, 10), reason: item.classificationReason }));
  const internalExcluded = movementActions
    .filter((item) => item.classification === 'internal')
    .map((item) => ({ description: item.description, amount: roundMoney(item.amount), date: item.happenedAt.slice(0, 10), reason: item.classificationReason }));

  const incomeByCategory = new Map<string, number>();
  const incomeByAccount = new Map<string, number>();
  incomeAverage.included.forEach((item) => {
    addBreakdown(incomeByCategory, item.category, item.amount);
    addBreakdown(incomeByAccount, item.accountName ?? 'Sin cuenta identificada', item.amount);
  });
  const expenseByCategory = new Map<string, number>();
  expenseAverage.included.forEach((item) => addBreakdown(expenseByCategory, item.category, item.amount));

  const { data: installmentsData, error: installmentsError } = await dbClient
    .from('msi_installments')
    .select('id,household_id,msi_purchase_id,installment_number,amount,due_date,status')
    .eq('household_id', resolvedHouseholdId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .order('installment_number', { ascending: true });
  if (installmentsError) throw new Error(`No fue posible leer compromisos MSI para la proyección: ${installmentsError.message}`);

  const purchaseIds = [...new Set(((installmentsData ?? []) as MsiInstallmentRow[]).map((item) => item.msi_purchase_id).filter((id): id is string => Boolean(id)))];
  const { data: purchasesData, error: purchasesError } = purchaseIds.length
    ? await dbClient
      .from('msi_purchases')
      .select('id,description')
      .in('id', purchaseIds)
    : { data: [] as MsiPurchaseRow[], error: null };
  if (purchasesError) throw new Error(`No fue posible leer compras MSI para la proyección: ${purchasesError.message}`);
  const purchaseById = new Map(((purchasesData ?? []) as MsiPurchaseRow[]).map((purchase) => [purchase.id, purchase.description]));

  const commitmentsByWeek = new Array(PROJECTION_WEEKS).fill(0) as number[];
  const commitmentItemsByWeek = Array.from({ length: PROJECTION_WEEKS }, () => [] as ProjectionCommitmentAuditItem[]);
  ((installmentsData ?? []) as MsiInstallmentRow[]).forEach((installment, index) => {
    const weekIndex = commitmentWeekIndex(installment, ranges, index);
    if (weekIndex >= 0) {
      const amount = Number(installment.amount);
      commitmentsByWeek[weekIndex] = roundMoney(commitmentsByWeek[weekIndex] + amount);
      commitmentItemsByWeek[weekIndex].push({
        weekNumber: weekIndex + 1,
        description: installment.msi_purchase_id ? purchaseById.get(installment.msi_purchase_id) ?? `MSI ${installment.msi_purchase_id}` : `MSI sin compra vinculada ${installment.id}`,
        amount: roundMoney(amount),
        dueDate: installment.due_date,
        installmentNumber: installment.installment_number
      });
    }
  });

  const horizonEnd = `${ranges[PROJECTION_WEEKS - 1].periodEndIso}T23:59:59.999Z`;
  const { data: eventsData, error: eventsError } = await dbClient
    .from('calendar_events')
    .select('id,household_id,label,amount,event_date')
    .eq('household_id', resolvedHouseholdId)
    .gte('event_date', `${ranges[0].periodStartIso}T00:00:00.000Z`);
  if (eventsError) throw new Error(`No fue posible leer eventos extraordinarios para la proyección: ${eventsError.message}`);

  const eventsByWeek = new Array(PROJECTION_WEEKS).fill(0) as number[];
  const includedEvents: ProjectionEventAuditItem[] = [];
  ((eventsData ?? []) as CalendarEventRow[])
    .filter((event) => event.event_date <= horizonEnd)
    .forEach((event) => {
      const eventDate = event.event_date.slice(0, 10);
      const index = ranges.findIndex((range) => eventDate >= range.periodStartIso && eventDate <= range.periodEndIso);
      if (index >= 0) {
        const amount = Number(event.amount);
        eventsByWeek[index] = roundMoney(eventsByWeek[index] + amount);
        includedEvents.push({ weekNumber: index + 1, label: event.label, amount: roundMoney(amount), eventDate });
      }
    });

  const { data: extrasData, error: extrasError } = await dbClient
    .from('extra_work_entries')
    .select('id,household_id,status')
    .eq('household_id', resolvedHouseholdId)
    .eq('status', 'pending');
  if (extrasError) throw new Error(`No fue posible leer extras pendientes para la proyección: ${extrasError.message}`);
  if (((extrasData ?? []) as ExtraWorkRow[]).length > 0) dataLimitations.push('Hay extras pendientes por cobrar; se muestran como pendientes y no se suman a la proyección base.');

  const warnings: string[] = [];
  if (incomeAverage.included.length < 2 || expenseAverage.included.length < 2) warnings.push('Hay pocos datos históricos; el promedio semanal puede ser poco representativo.');
  const extraordinaryIncluded = 0;
  const ordinaryIncome = roundMoney(incomeAverage.included.reduce((acc, item) => acc + item.amount, 0));
  const extraordinaryExcluded = roundMoney(movementActions.filter((item) => item.action === 'income' && item.classification === 'extraordinary').reduce((acc, item) => acc + item.amount, 0));
  if (extraordinaryDetected.length > 0) warnings.push('Se detectaron movimientos extraordinarios y no se incluyeron en el promedio recurrente.');
  if (internalExcluded.length > 0) warnings.push('Se excluyeron movimientos internos o transferencias para no distorsionar la proyección.');
  if (expenseAverage.included.some((item) => item.isDebtPayment)) warnings.push('Hay pagos de tarjeta/deuda dentro de gastos; podrían duplicar gasto si el consumo original ya fue contado.');

  let opening = startingOperationalMoney;
  const weeks = ranges.map((range, index) => {
    const estimatedCommitments = roundMoney(commitmentsByWeek[index]);
    const extraordinaryEvents = roundMoney(eventsByWeek[index]);
    const netChange = roundMoney(estimatedIncome - estimatedVariableExpenses - estimatedCommitments + extraordinaryEvents);
    const closing = roundMoney(opening + netChange);
    const notes: string[] = [];
    if (estimatedCommitments > 0) notes.push('Incluye pagos MSI pendientes programados para esta semana.');
    if (extraordinaryEvents !== 0) notes.push('Incluye eventos extraordinarios registrados.');
    if (closing <= 0) notes.push('Semana crítica: el dinero operativo queda en cero o negativo.');

    const week: ProjectionWeek = {
      weekNumber: index + 1,
      periodStart: range.periodStartIso,
      periodEnd: range.periodEndIso,
      openingOperationalMoney: roundMoney(opening),
      estimatedIncome,
      estimatedVariableExpenses,
      estimatedCommitments,
      extraordinaryEvents,
      closingOperationalMoney: closing,
      netChange,
      notes
    };
    opening = closing;
    return week;
  });

  const endingOperationalMoney = weeks.at(-1)?.closingOperationalMoney ?? startingOperationalMoney;
  const projectedChange = roundMoney(endingOperationalMoney - startingOperationalMoney);
  const lowestWeek = weeks.reduce((lowest, week) => week.closingOperationalMoney < lowest.closingOperationalMoney ? week : lowest, weeks[0]);

  return {
    generatedAt: generatedAtIso,
    recurringWeeklyIncome: estimatedIncome,
    recurringWeeklyExpenses: estimatedVariableExpenses,
    extraordinaryDetected,
    internalExcluded,
    weeks,
    summary: {
      startingOperationalMoney,
      endingOperationalMoney,
      projectedChange,
      lowestProjectedMoney: lowestWeek.closingOperationalMoney,
      lowestProjectedWeek: lowestWeek.weekNumber,
      trend: detectTrend(projectedChange),
      confidence: confidenceFromData(movementActions),
      dataLimitations: [...new Set([...dataLimitations, ...warnings])]
    },
    calculation: {
      income: {
        periodStart: incomeAverage.periodStart,
        periodEnd: incomeAverage.periodEnd,
        criterion: incomeAverage.criterion,
        shortNote: 'Promedio semanal recurrente; no incluye extraordinarios, extras pendientes ni transferencias internas.',
        weeklyAverage: estimatedIncome,
        ordinaryIncome,
        extraordinaryIncluded,
        extraordinaryExcluded,
        byCategory: mapBreakdown(incomeByCategory),
        byAccount: mapBreakdown(incomeByAccount),
        includedMovements: incomeAverage.included.map(actionToAuditItem),
        excludedMovements: incomeAverage.excluded.map(actionToAuditItem)
      },
      expenses: {
        periodStart: expenseAverage.periodStart,
        periodEnd: expenseAverage.periodEnd,
        criterion: expenseAverage.criterion,
        shortNote: 'Promedio semanal recurrente; no incluye extraordinarios ni transferencias internas.',
        weeklyAverage: estimatedVariableExpenses,
        variableExpenses: roundMoney(expenseAverage.included.filter((item) => !item.isFixedExpense).reduce((acc, item) => acc + item.amount, 0)),
        fixedExpenses: roundMoney(expenseAverage.included.filter((item) => item.isFixedExpense).reduce((acc, item) => acc + item.amount, 0)),
        debtPaymentsIncluded: roundMoney(expenseAverage.excluded.filter((item) => item.action === 'expense' && item.classification === 'debt_payment').reduce((acc, item) => acc + item.amount, 0)),
        byCategory: mapBreakdown(expenseByCategory),
        includedMovements: expenseAverage.included.map(actionToAuditItem),
        excludedMovements: expenseAverage.excluded.map(actionToAuditItem)
      },
      commitments: {
        criterion: 'Se incluyen installments MSI pendientes. Si tienen fecha, se colocan en la semana de vencimiento; si no tienen due_date, se distribuyen desde la semana actual en orden consecutivo.',
        shortNote: 'Incluye MSI pendientes.',
        byWeek: commitmentItemsByWeek.map((items, index) => ({ weekNumber: index + 1, total: roundMoney(commitmentsByWeek[index]), items }))
      },
      events: {
        criterion: 'Solo se incluyen eventos extraordinarios registrados con fecha dentro de las próximas 12 semanas; no se inventan bonos, aguinaldos ni devoluciones.',
        shortNote: 'Solo eventos registrados.',
        includedEvents
      },
      warnings: [...new Set(warnings)]
    }
  };
}
