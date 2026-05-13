export type ProjectionColumnKey =
  | 'nomina'
  | 'cajaAhorro'
  | 'ingresosExtra'
  | 'eventosExtraordinarios'
  | 'gastoFamiliarFijo'
  | 'gastosVariables'
  | 'serviciosSuscripciones'
  | 'deudaTarjetas'
  | 'msiComprasMeses'
  | 'ahorroInversion';

export type ProjectionAccount = {
  id: string;
  name: string;
  type: string;
  balance: number;
  isActive?: boolean | null;
};

export type ProjectionMovement = {
  id: string;
  groupId: string;
  note: string;
  action: 'ingreso' | 'gasto' | 'pago_deuda' | 'objetivo_aporte' | 'pago_recibido' | 'prestamo_otorgado' | 'transferencia' | 'msi_purchase' | null;
  category: string;
  amount: number;
  happenedAt: string;
};

export type ProjectionMsiInstallment = {
  id: string;
  amount: number;
  dueDate: string | null;
  status: 'pending' | 'paid' | string;
};

export type ProjectionExtraordinaryEvent = {
  id: string;
  label: string;
  amount: number;
  eventDate: string;
};

export type ProjectionColumnExplanation = {
  key: ProjectionColumnKey;
  label: string;
  baseValue: number;
  criteria: string;
  estimated: boolean;
  warning?: string;
};

export type ProjectionRowType = 'historical_valid' | 'historical_excluded' | 'partial' | 'projected';

export type ProjectionWeek = {
  weekNumber: number;
  rowType: ProjectionRowType;
  projectionIndex: number | null;
  label: string;
  startDate: string;
  endDate: string;
  nomina: number;
  cajaAhorro: number;
  ingresosExtra: number;
  eventosExtraordinarios: number;
  totalIngresos: number;
  gastoFamiliarFijo: number;
  gastosVariables: number;
  serviciosSuscripciones: number;
  deudaTarjetas: number;
  msiComprasMeses: number;
  ahorroInversion: number;
  totalGastos: number;
  balanceSemanal: number;
  dineroOperativoProyectado: number;
  relevantMovementCount: number;
  exclusionReason: string | null;
};

export type ProjectionScenario = {
  hasHousehold: boolean;
  dineroOperativoActual: number;
  projectionAt12Weeks: number;
  projectedChange: number;
  averageWeeklyBalance: number;
  averageWeeklyIncome: number;
  averageWeeklyExpenses: number;
  lowestWeek: ProjectionWeek | null;
  trend: 'positiva' | 'negativa' | 'estable';
  historicalWeeksUsed: number;
  historicalRangeLabel: string;
  calendarWeeksDetected: number;
  excludedWeeksCount: number;
  partialWeekExcluded: boolean;
  weeks: ProjectionWeek[];
  historicalWeeks: ProjectionWeek[];
  excludedWeeks: ProjectionWeek[];
  partialWeek: ProjectionWeek | null;
  projectedWeeks: ProjectionWeek[];
  averages: Record<ProjectionColumnKey, number>;
  explanations: ProjectionColumnExplanation[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROJECTION_WEEKS = 12;

const columnKeys: ProjectionColumnKey[] = [
  'nomina',
  'cajaAhorro',
  'ingresosExtra',
  'eventosExtraordinarios',
  'gastoFamiliarFijo',
  'gastosVariables',
  'serviciosSuscripciones',
  'deudaTarjetas',
  'msiComprasMeses',
  'ahorroInversion'
];

const labels: Record<ProjectionColumnKey, string> = {
  nomina: 'Nómina',
  cajaAhorro: 'Caja ahorro',
  ingresosExtra: 'Ingresos extra',
  eventosExtraordinarios: 'Eventos extraordinarios',
  gastoFamiliarFijo: 'Gasto familiar fijo',
  gastosVariables: 'Gastos variables',
  serviciosSuscripciones: 'Servicios y suscripciones',
  deudaTarjetas: 'Deuda / tarjetas',
  msiComprasMeses: 'MSI / compras a meses',
  ahorroInversion: 'Ahorro / inversión'
};

type WeekAccumulator = Record<ProjectionColumnKey, number> & {
  start: Date;
  end: Date;
  hasData: boolean;
  hasMsiMovement: boolean;
  relevantMovementCount: number;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptyColumnTotals() {
  return Object.fromEntries(columnKeys.map((key) => [key, 0])) as Record<ProjectionColumnKey, number>;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function parseUtcDate(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfMondayWeek(date: Date) {
  const normalized = parseUtcDate(date) ?? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  return new Date(normalized.getTime() - offset * DAY_MS);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function weekKey(date: Date) {
  return dateOnly(startOfMondayWeek(date));
}

function createWeekAccumulator(start: Date): WeekAccumulator {
  return {
    start,
    end: addDays(start, 6),
    hasData: false,
    hasMsiMovement: false,
    relevantMovementCount: 0,
    ...emptyColumnTotals()
  };
}

function isOperationalAccountType(type: string) {
  return new Set(['operativa', 'operational_cash', 'cash', 'debit', 'debit_card', 'checking', 'bank_account', 'operative']).has(normalize(type).trim());
}

function isExtraordinaryText(text: string) {
  return includesAny(text, ['sat', 'aguinaldo', 'bono', 'devolucion', 'devolucion', 'prestamo recibido', 'evento unico', 'evento extraordinario', 'extraordinario']);
}

function classifyMovement(movement: ProjectionMovement): ProjectionColumnKey | null {
  const category = normalize(movement.category ?? '');
  const note = normalize(movement.note ?? '');
  const text = `${category} ${note}`;

  if (movement.action === 'ingreso' || movement.action === 'pago_recibido') {
    if (isExtraordinaryText(text)) return 'eventosExtraordinarios';
    if (category.includes('ingreso_fijo') || includesAny(text, ['nomina', 'sueldo', 'salario', 'quincena', 'payroll'])) return 'nomina';
    if (includesAny(text, ['caja de ahorro', 'caja ahorro'])) return 'cajaAhorro';
    return 'ingresosExtra';
  }

  if (movement.action === 'pago_deuda') return 'deudaTarjetas';
  if (movement.action === 'objetivo_aporte') return 'ahorroInversion';
  if (movement.action === 'msi_purchase') return 'msiComprasMeses';
  if (movement.action !== 'gasto') return null;

  if (includesAny(text, ['msi', 'meses sin intereses', 'compras a meses', 'mensualidad'])) return 'msiComprasMeses';
  if (includesAny(text, ['esposa', 'familia', 'familiar fijo', 'gasto familiar', 'casa semanal', 'semanal familiar'])) return 'gastoFamiliarFijo';
  if (includesAny(text, ['tarjeta', 'tdc', 'prestamo', 'credito', 'deuda', 'auto', 'departamental', 'liverpool', 'palacio', 'coppel'])) return 'deudaTarjetas';
  if (includesAny(text, ['amazon', 'internet', 'celular', 'luz', 'agua', 'streaming', 'netflix', 'spotify', 'prime', 'suscripcion', 'servicio', 'izzi', 'telmex', 'cfe'])) return 'serviciosSuscripciones';
  if (includesAny(text, ['gnp', 'fondo', 'inversion', 'ahorro programado', 'aportacion'])) return 'ahorroInversion';
  if (isExtraordinaryText(text)) return null;

  return 'gastosVariables';
}

function buildWeeklyMsiAmounts(installments: ProjectionMsiInstallment[], start: Date, weeks: number, status: 'pending' | 'paid') {
  const amounts = Array.from({ length: weeks }, () => 0);
  const withoutDate: ProjectionMsiInstallment[] = [];

  for (const installment of installments.filter((item) => item.status === status)) {
    if (!installment.dueDate) {
      withoutDate.push(installment);
      continue;
    }
    const due = parseUtcDate(installment.dueDate);
    if (!due) continue;
    const index = Math.floor((due.getTime() - start.getTime()) / WEEK_MS);
    if (index >= 0 && index < weeks) amounts[index] += installment.amount;
  }

  withoutDate.forEach((installment, index) => {
    amounts[index % weeks] += installment.amount;
  });

  return amounts.map(roundMoney);
}

function buildWeekFromAccumulator(input: {
  accumulator: WeekAccumulator;
  rowType: ProjectionRowType;
  weekNumber: number;
  projectionIndex?: number | null;
  label: string;
  previousMoney: number;
  exclusionReason?: string | null;
}): ProjectionWeek {
  const { accumulator, rowType, weekNumber, projectionIndex = null, label, previousMoney, exclusionReason = null } = input;
  const totalIngresos = roundMoney(accumulator.nomina + accumulator.cajaAhorro + accumulator.ingresosExtra + accumulator.eventosExtraordinarios);
  const totalGastos = roundMoney(accumulator.gastoFamiliarFijo + accumulator.gastosVariables + accumulator.serviciosSuscripciones + accumulator.deudaTarjetas + accumulator.msiComprasMeses + accumulator.ahorroInversion);
  const balanceSemanal = roundMoney(totalIngresos - totalGastos);
  return {
    weekNumber,
    rowType,
    projectionIndex,
    label,
    startDate: dateOnly(accumulator.start),
    endDate: dateOnly(accumulator.end),
    nomina: roundMoney(accumulator.nomina),
    cajaAhorro: roundMoney(accumulator.cajaAhorro),
    ingresosExtra: roundMoney(accumulator.ingresosExtra),
    eventosExtraordinarios: roundMoney(accumulator.eventosExtraordinarios),
    totalIngresos,
    gastoFamiliarFijo: roundMoney(accumulator.gastoFamiliarFijo),
    gastosVariables: roundMoney(accumulator.gastosVariables),
    serviciosSuscripciones: roundMoney(accumulator.serviciosSuscripciones),
    deudaTarjetas: roundMoney(accumulator.deudaTarjetas),
    msiComprasMeses: roundMoney(accumulator.msiComprasMeses),
    ahorroInversion: roundMoney(accumulator.ahorroInversion),
    totalGastos,
    balanceSemanal,
    dineroOperativoProyectado: roundMoney(previousMoney + balanceSemanal),
    relevantMovementCount: accumulator.relevantMovementCount,
    exclusionReason
  };
}

function addAmountToAccumulator(accumulator: WeekAccumulator, key: ProjectionColumnKey, amount: number) {
  accumulator[key] = roundMoney(accumulator[key] + amount);
  accumulator.hasData = true;
  accumulator.relevantMovementCount += 1;
  if (key === 'msiComprasMeses') accumulator.hasMsiMovement = true;
}

function calculateAccumulatorTotals(accumulator: Pick<WeekAccumulator, ProjectionColumnKey>) {
  const totalIngresos = roundMoney(accumulator.nomina + accumulator.cajaAhorro + accumulator.ingresosExtra + accumulator.eventosExtraordinarios);
  const totalGastos = roundMoney(accumulator.gastoFamiliarFijo + accumulator.gastosVariables + accumulator.serviciosSuscripciones + accumulator.deudaTarjetas + accumulator.msiComprasMeses + accumulator.ahorroInversion);
  return { totalIngresos, totalGastos };
}

function getHistoricalExclusionReason(accumulator: WeekAccumulator) {
  const { totalIngresos, totalGastos } = calculateAccumulatorTotals(accumulator);
  const mainIncome = roundMoney(accumulator.nomina + accumulator.cajaAhorro + accumulator.ingresosExtra);
  const hasMainIncome = mainIncome > 0;
  const hasIncomeAndExpense = totalIngresos > 0 && totalGastos > 0;
  const hasEnoughActivity = accumulator.relevantMovementCount >= 3;

  if (hasMainIncome || hasIncomeAndExpense || hasEnoughActivity) return null;
  if (totalIngresos === 0 && totalGastos > 0 && totalGastos === accumulator.deudaTarjetas) return 'Solo contiene pagos de deuda/tarjeta';
  if (!hasMainIncome) return 'Sin ingresos principales detectados';
  return 'Actividad insuficiente para considerarse semana representativa';
}

function averageColumns(weeks: ProjectionWeek[]) {
  const averages = emptyColumnTotals();
  if (!weeks.length) return averages;

  for (const key of columnKeys) {
    averages[key] = roundMoney(weeks.reduce((sum, week) => sum + week[key], 0) / weeks.length);
  }

  return averages;
}

function buildProjectionAccumulator(start: Date, averages: Record<ProjectionColumnKey, number>) {
  return {
    start,
    end: addDays(start, 6),
    hasData: true,
    hasMsiMovement: false,
    relevantMovementCount: 0,
    ...averages,
    eventosExtraordinarios: 0
  } satisfies WeekAccumulator;
}

function buildHistoricalRangeLabel(weeks: ProjectionWeek[]) {
  if (!weeks.length) return 'Sin semanas históricas completas';
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return `${first.startDate} a ${last.endDate}`;
}

export function calculateOperationalMoney(accounts: ProjectionAccount[]) {
  return roundMoney(accounts
    .filter((account) => account.isActive !== false && isOperationalAccountType(account.type))
    .reduce((sum, account) => sum + account.balance, 0));
}

export function buildProjectionScenario(input: {
  hasHousehold?: boolean;
  accounts: ProjectionAccount[];
  movements: ProjectionMovement[];
  msiInstallments?: ProjectionMsiInstallment[];
  extraordinaryEvents?: ProjectionExtraordinaryEvent[];
  startDate?: Date;
}): ProjectionScenario {
  const hasHousehold = input.hasHousehold ?? true;
  const startDate = parseUtcDate(input.startDate ?? new Date()) ?? parseUtcDate(new Date())!;
  const currentWeekStart = startOfMondayWeek(startDate);
  const movementsWithDates = input.movements
    .map((movement) => ({ movement, date: parseUtcDate(movement.happenedAt) }))
    .filter((item): item is { movement: ProjectionMovement; date: Date } => Boolean(item.date));
  const eventsWithDates = (input.extraordinaryEvents ?? [])
    .map((event) => ({ event, date: parseUtcDate(event.eventDate) }))
    .filter((item): item is { event: ProjectionExtraordinaryEvent; date: Date } => Boolean(item.date));
  const firstRealDate = [...movementsWithDates.map((item) => item.date), ...eventsWithDates.map((item) => item.date)]
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? currentWeekStart;
  const firstWeekStart = startOfMondayWeek(firstRealDate);
  const weekAccumulators = new Map<string, WeekAccumulator>();

  for (let cursor = firstWeekStart; cursor <= currentWeekStart; cursor = addDays(cursor, 7)) {
    weekAccumulators.set(dateOnly(cursor), createWeekAccumulator(cursor));
  }

  for (const { movement, date } of movementsWithDates) {
    const column = classifyMovement(movement);
    if (!column) continue;
    const accumulator = weekAccumulators.get(weekKey(date));
    if (!accumulator) continue;
    addAmountToAccumulator(accumulator, column, movement.amount);
  }

  for (const { event, date } of eventsWithDates) {
    const accumulator = weekAccumulators.get(weekKey(date));
    if (!accumulator) continue;
    addAmountToAccumulator(accumulator, 'eventosExtraordinarios', event.amount);
  }

  const lastHistoricalStart = addDays(currentWeekStart, -7);
  const firstProjectionStart = addDays(currentWeekStart, 7);
  const paidMsiAmounts = buildWeeklyMsiAmounts(input.msiInstallments ?? [], firstWeekStart, Math.max(1, Math.ceil((currentWeekStart.getTime() - firstWeekStart.getTime()) / WEEK_MS) + 1), 'paid');
  Array.from(weekAccumulators.values()).forEach((accumulator, index) => {
    if (accumulator.start <= currentWeekStart && !accumulator.hasMsiMovement && paidMsiAmounts[index]) {
      addAmountToAccumulator(accumulator, 'msiComprasMeses', paidMsiAmounts[index]);
    }
  });

  const calendarAccumulators = Array.from(weekAccumulators.values())
    .filter((accumulator) => accumulator.start <= lastHistoricalStart && accumulator.hasData)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const validHistoricalAccumulators: WeekAccumulator[] = [];
  const excludedHistoricalAccumulators: Array<{ accumulator: WeekAccumulator; reason: string }> = [];

  for (const accumulator of calendarAccumulators) {
    const reason = getHistoricalExclusionReason(accumulator);
    if (reason) excludedHistoricalAccumulators.push({ accumulator, reason });
    else validHistoricalAccumulators.push(accumulator);
  }

  const partialAccumulator = weekAccumulators.get(dateOnly(currentWeekStart));
  const shouldShowPartial = Boolean(partialAccumulator?.hasData);
  const dineroOperativoActual = calculateOperationalMoney(input.accounts);
  const partialBalance = shouldShowPartial && partialAccumulator ? roundMoney(
    partialAccumulator.nomina + partialAccumulator.cajaAhorro + partialAccumulator.ingresosExtra + partialAccumulator.eventosExtraordinarios
    - partialAccumulator.gastoFamiliarFijo - partialAccumulator.gastosVariables - partialAccumulator.serviciosSuscripciones - partialAccumulator.deudaTarjetas - partialAccumulator.msiComprasMeses - partialAccumulator.ahorroInversion
  ) : 0;
  const validHistoricalBalance = validHistoricalAccumulators.reduce((sum, accumulator) => {
    const { totalIngresos, totalGastos } = calculateAccumulatorTotals(accumulator);
    return roundMoney(sum + totalIngresos - totalGastos);
  }, 0);
  const closingAfterCompleteWeeks = roundMoney(dineroOperativoActual - partialBalance);
  let previousMoney = roundMoney(closingAfterCompleteWeeks - validHistoricalBalance);

  const historicalWeeks = validHistoricalAccumulators.map((accumulator, index) => {
    const week = buildWeekFromAccumulator({
      accumulator,
      rowType: 'historical_valid',
      weekNumber: index + 1,
      label: `Histórico real ${index + 1}`,
      previousMoney
    });
    previousMoney = week.dineroOperativoProyectado;
    return week;
  });

  const excludedWeeks = excludedHistoricalAccumulators.map(({ accumulator, reason }, index) => buildWeekFromAccumulator({
    accumulator,
    rowType: 'historical_excluded',
    weekNumber: index + 1,
    label: `Semana excluida ${index + 1}`,
    previousMoney: 0,
    exclusionReason: reason
  }));

  let partialWeek: ProjectionWeek | null = null;
  if (shouldShowPartial && partialAccumulator) {
    partialWeek = buildWeekFromAccumulator({
      accumulator: partialAccumulator,
      rowType: 'partial',
      weekNumber: historicalWeeks.length + 1,
      label: 'Semana actual parcial',
      previousMoney
    });
    previousMoney = partialWeek.dineroOperativoProyectado;
  }

  const averages = averageColumns(historicalWeeks);
  const projectionStartMoney = partialWeek?.dineroOperativoProyectado ?? historicalWeeks.at(-1)?.dineroOperativoProyectado ?? dineroOperativoActual;
  previousMoney = projectionStartMoney;
  const projectedWeeks = Array.from({ length: PROJECTION_WEEKS }, (_, index) => {
    const accumulator = buildProjectionAccumulator(addDays(firstProjectionStart, index * 7), averages);
    const week = buildWeekFromAccumulator({
      accumulator,
      rowType: 'projected',
      weekNumber: historicalWeeks.length + (partialWeek ? 1 : 0) + index + 1,
      projectionIndex: index + 1,
      label: `Proyección semana ${index + 1}`,
      previousMoney
    });
    previousMoney = week.dineroOperativoProyectado;
    return week;
  });

  const projectionAt12Weeks = projectedWeeks.at(-1)?.dineroOperativoProyectado ?? projectionStartMoney;
  const projectedChange = roundMoney(projectionAt12Weeks - dineroOperativoActual);
  const averageWeeklyIncome = roundMoney(columnKeys.slice(0, 4).reduce((sum, key) => sum + (key === 'eventosExtraordinarios' ? 0 : averages[key]), 0));
  const averageWeeklyExpenses = roundMoney(['gastoFamiliarFijo', 'gastosVariables', 'serviciosSuscripciones', 'deudaTarjetas', 'msiComprasMeses', 'ahorroInversion'].reduce((sum, key) => sum + averages[key as ProjectionColumnKey], 0));
  const averageWeeklyBalance = roundMoney(averageWeeklyIncome - averageWeeklyExpenses);
  const lowestWeek = projectedWeeks.reduce<ProjectionWeek | null>((lowest, week) => !lowest || week.dineroOperativoProyectado < lowest.dineroOperativoProyectado ? week : lowest, null);
  const trend = projectedChange > 0 ? 'positiva' : projectedChange < 0 ? 'negativa' : 'estable';
  const partialWeekExcluded = Boolean(partialWeek);

  const explanations: ProjectionColumnExplanation[] = columnKeys.map((key) => {
    const criteriaByKey: Record<ProjectionColumnKey, string> = {
      nomina: 'Histórico real lunes-domingo: suma ingresos laborales de nómina/sueldo/salario/ingreso_fijo. La proyección usa el promedio de esas semanas reales.',
      cajaAhorro: 'Histórico real lunes-domingo: suma movimientos asociados a Caja de ahorro. La proyección usa el promedio semanal histórico.',
      ingresosExtra: 'Histórico real lunes-domingo: suma PrimeIPTV, ventas, servicios, extras pagados y otros ingresos recurrentes no nómina.',
      eventosExtraordinarios: 'Histórico real lunes-domingo: suma SAT, aguinaldo, bonos, devoluciones o eventos únicos. No se proyecta automáticamente en semanas futuras.',
      gastoFamiliarFijo: 'Histórico real lunes-domingo: suma entregas recurrentes a esposa/familia/gasto semanal. La proyección usa el promedio histórico.',
      gastosVariables: 'Histórico real lunes-domingo: suma Oxxo, comida, gasolina, antojos, súper, hogar, educación y varios no fijos.',
      serviciosSuscripciones: 'Histórico real lunes-domingo: suma Amazon, internet, celular, luz, agua, streaming y suscripciones.',
      deudaTarjetas: 'Histórico real lunes-domingo: suma pagos a TDC, préstamos, auto y departamentales; no se mezcla con gasto variable.',
      msiComprasMeses: 'Histórico real lunes-domingo: suma pagos MSI registrados como movimiento o pagos MSI pagados del módulo cuando no hay movimiento MSI en esa semana.',
      ahorroInversion: 'Histórico real lunes-domingo: suma GNP, fondos, ahorro programado, aportaciones o inversión.'
    };
    const warning = key === 'eventosExtraordinarios'
      ? 'Los eventos extraordinarios se muestran en histórico real, pero las filas proyectadas los dejan en $0 para no repetir eventos únicos.'
      : historicalWeeks.length > 0 && historicalWeeks.filter((week) => week[key] > 0).length <= 1
        ? 'Hay poca información histórica para esta columna; el promedio puede cambiar cuando captures más semanas.'
        : undefined;
    return { key, label: labels[key], baseValue: key === 'eventosExtraordinarios' ? 0 : averages[key], criteria: criteriaByKey[key], estimated: true, warning };
  });

  if (partialWeekExcluded) {
    explanations.unshift({
      key: 'gastosVariables',
      label: 'Semana actual parcial',
      baseValue: partialWeek?.balanceSemanal ?? 0,
      criteria: 'La semana actual parcial se muestra como dato real capturado, pero no se usa para calcular promedios base ni proyección.',
      estimated: false,
      warning: 'Semana actual no usada por estar incompleta.'
    });
  }

  return {
    hasHousehold,
    dineroOperativoActual,
    projectionAt12Weeks,
    projectedChange,
    averageWeeklyBalance,
    averageWeeklyIncome,
    averageWeeklyExpenses,
    lowestWeek,
    trend,
    historicalWeeksUsed: historicalWeeks.length,
    historicalRangeLabel: buildHistoricalRangeLabel(historicalWeeks),
    calendarWeeksDetected: calendarAccumulators.length,
    excludedWeeksCount: excludedWeeks.length,
    partialWeekExcluded,
    weeks: [...historicalWeeks, ...(partialWeek ? [partialWeek] : []), ...projectedWeeks],
    historicalWeeks,
    excludedWeeks,
    partialWeek,
    projectedWeeks,
    averages,
    explanations
  };
}
