export type ProjectionTrend = 'up' | 'down' | 'stable';
export type ProjectionConfidence = 'low' | 'medium' | 'high';

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
type TransactionRow = { group_id: string; type: string; category: string; amount: string | number; happened_at: string };
type MsiInstallmentRow = { id: string; household_id: string; installment_number: number; amount: string | number; due_date: string | null; status: string };
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

function inferMovementAction(lines: Array<{ type: string; category: string }>) {
  const has = (type: string, category: string) => lines.some((line) => line.type === type && line.category === category);
  if (has('debit', 'entrada_cuenta')) return 'income';
  if (has('credit', 'salida_cuenta')) return 'expense';
  return null;
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

function averageWeeklyAmount(args: {
  actions: Array<{ action: 'income' | 'expense'; amount: number; happenedAt: string }>;
  action: 'income' | 'expense';
  generatedAt: Date;
  dataLimitations: string[];
}) {
  const nowIso = args.generatedAt.toISOString();
  const recentStart = `${toDateOnly(addDays(args.generatedAt, -(RECENT_WEEKS * 7)))}T00:00:00.000Z`;
  const fallbackStart = `${toDateOnly(addDays(args.generatedAt, -(FALLBACK_WEEKS * 7)))}T00:00:00.000Z`;
  const label = args.action === 'income' ? 'ingresos' : 'gastos';
  const recent = args.actions.filter((item) => item.action === args.action && item.happenedAt >= recentStart && item.happenedAt <= nowIso);

  if (recent.length > 0) {
    return roundMoney(recent.reduce((acc, item) => acc + item.amount, 0) / RECENT_WEEKS);
  }

  const fallback = args.actions.filter((item) => item.action === args.action && item.happenedAt >= fallbackStart && item.happenedAt <= nowIso);
  if (fallback.length > 0) {
    args.dataLimitations.push(`No hubo ${label} en las últimas 4 semanas; se usó el promedio semanal de hasta 12 semanas disponibles.`);
    return roundMoney(fallback.reduce((acc, item) => acc + item.amount, 0) / FALLBACK_WEEKS);
  }

  args.dataLimitations.push(`No hay historial reciente de ${label}; se proyecta ese rubro en $0.`);
  return 0;
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

function confidenceFromData(actions: Array<{ action: 'income' | 'expense' }>, hasMsi: boolean): ProjectionConfidence {
  const incomeCount = actions.filter((item) => item.action === 'income').length;
  const expenseCount = actions.filter((item) => item.action === 'expense').length;
  if (incomeCount >= 2 && expenseCount >= 2) return hasMsi ? 'high' : 'medium';
  if (incomeCount > 0 || expenseCount > 0) return 'medium';
  return 'low';
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
      }
    };
  }

  const { data: accountData, error: accountsError } = await dbClient
    .from('accounts')
    .select('id,household_id,name,type,balance,is_active')
    .eq('household_id', resolvedHouseholdId);
  if (accountsError) throw new Error(`No fue posible leer cuentas para la proyección: ${accountsError.message}`);

  const accounts = ((accountData ?? []) as AccountRow[]).filter((account) => account.is_active !== false);
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
      .select('group_id,type,category,amount,happened_at')
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
    if (!action) return null;
    const amount = Number(lines.find((line) => action === 'income' ? line.type === 'debit' : line.type === 'credit')?.amount ?? 0);
    const happenedAt = lines.reduce((latest, line) => line.happened_at > latest ? line.happened_at : latest, lines[0]?.happened_at ?? '');
    return { action, amount, happenedAt } as { action: 'income' | 'expense'; amount: number; happenedAt: string };
  }).filter((item): item is { action: 'income' | 'expense'; amount: number; happenedAt: string } => item !== null);

  const estimatedIncome = averageWeeklyAmount({ actions: movementActions, action: 'income', generatedAt, dataLimitations });
  const estimatedVariableExpenses = averageWeeklyAmount({ actions: movementActions, action: 'expense', generatedAt, dataLimitations });

  const { data: installmentsData, error: installmentsError } = await dbClient
    .from('msi_installments')
    .select('id,household_id,installment_number,amount,due_date,status')
    .eq('household_id', resolvedHouseholdId)
    .eq('status', 'pending')
    .order('due_date', { ascending: true })
    .order('installment_number', { ascending: true });
  if (installmentsError) throw new Error(`No fue posible leer compromisos MSI para la proyección: ${installmentsError.message}`);

  const commitmentsByWeek = new Array(PROJECTION_WEEKS).fill(0) as number[];
  ((installmentsData ?? []) as MsiInstallmentRow[]).forEach((installment, index) => {
    const weekIndex = commitmentWeekIndex(installment, ranges, index);
    if (weekIndex >= 0) commitmentsByWeek[weekIndex] = roundMoney(commitmentsByWeek[weekIndex] + Number(installment.amount));
  });

  const horizonEnd = `${ranges[PROJECTION_WEEKS - 1].periodEndIso}T23:59:59.999Z`;
  const { data: eventsData, error: eventsError } = await dbClient
    .from('calendar_events')
    .select('id,household_id,label,amount,event_date')
    .eq('household_id', resolvedHouseholdId)
    .gte('event_date', `${ranges[0].periodStartIso}T00:00:00.000Z`);
  if (eventsError) throw new Error(`No fue posible leer eventos extraordinarios para la proyección: ${eventsError.message}`);

  const eventsByWeek = new Array(PROJECTION_WEEKS).fill(0) as number[];
  ((eventsData ?? []) as CalendarEventRow[])
    .filter((event) => event.event_date <= horizonEnd)
    .forEach((event) => {
      const eventDate = event.event_date.slice(0, 10);
      const index = ranges.findIndex((range) => eventDate >= range.periodStartIso && eventDate <= range.periodEndIso);
      if (index >= 0) eventsByWeek[index] = roundMoney(eventsByWeek[index] + Number(event.amount));
    });

  const { data: extrasData, error: extrasError } = await dbClient
    .from('extra_work_entries')
    .select('id,household_id,status')
    .eq('household_id', resolvedHouseholdId)
    .eq('status', 'pending');
  if (extrasError) throw new Error(`No fue posible leer extras pendientes para la proyección: ${extrasError.message}`);
  if (((extrasData ?? []) as ExtraWorkRow[]).length > 0) dataLimitations.push('Hay extras pendientes por cobrar; se muestran como pendientes y no se suman a la proyección base.');

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
    weeks,
    summary: {
      startingOperationalMoney,
      endingOperationalMoney,
      projectedChange,
      lowestProjectedMoney: lowestWeek.closingOperationalMoney,
      lowestProjectedWeek: lowestWeek.weekNumber,
      trend: detectTrend(projectedChange),
      confidence: confidenceFromData(movementActions, ((installmentsData ?? []) as MsiInstallmentRow[]).length > 0),
      dataLimitations: [...new Set(dataLimitations)]
    }
  };
}
