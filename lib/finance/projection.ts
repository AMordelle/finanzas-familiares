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

export type ProjectionWeek = {
  weekNumber: number;
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
};

export type ProjectionScenario = {
  hasHousehold: boolean;
  dineroOperativoActual: number;
  projectionAt12Weeks: number;
  projectedChange: number;
  averageWeeklyBalance: number;
  lowestWeek: ProjectionWeek | null;
  trend: 'positiva' | 'negativa' | 'estable';
  weeks: ProjectionWeek[];
  explanations: ProjectionColumnExplanation[];
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PROJECTION_WEEKS = 12;

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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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

function isOperationalAccountType(type: string) {
  return new Set(['operativa', 'operational_cash', 'cash', 'debit', 'debit_card', 'checking', 'bank_account', 'operative']).has(normalize(type).trim());
}

function classifyMovement(movement: ProjectionMovement): ProjectionColumnKey | null {
  const category = normalize(movement.category ?? '');
  const note = normalize(movement.note ?? '');
  const text = `${category} ${note}`;

  if (movement.action === 'ingreso' || movement.action === 'pago_recibido') {
    if (category.includes('ingreso_fijo') || includesAny(text, ['nomina', 'sueldo', 'salario', 'quincena', 'payroll'])) return 'nomina';
    if (includesAny(text, ['caja de ahorro', 'caja ahorro'])) return 'cajaAhorro';
    return 'ingresosExtra';
  }

  if (movement.action === 'pago_deuda') return 'deudaTarjetas';
  if (movement.action === 'objetivo_aporte') return 'ahorroInversion';
  if (movement.action !== 'gasto' && movement.action !== 'msi_purchase') return null;

  if (movement.action === 'msi_purchase' || includesAny(text, ['msi', 'meses sin intereses', 'compras a meses', 'mensualidad'])) return null;
  if (includesAny(text, ['esposa', 'familia', 'familiar fijo', 'gasto familiar', 'casa semanal', 'semanal familiar'])) return 'gastoFamiliarFijo';
  if (includesAny(text, ['tarjeta', 'tdc', 'prestamo', 'prestamo', 'credito', 'deuda', 'auto', 'departamental', 'liverpool', 'palacio', 'coppel'])) return 'deudaTarjetas';
  if (includesAny(text, ['amazon', 'internet', 'celular', 'luz', 'agua', 'streaming', 'netflix', 'spotify', 'prime', 'suscripcion', 'servicio', 'izzi', 'telmex', 'cfe'])) return 'serviciosSuscripciones';
  if (includesAny(text, ['gnp', 'fondo', 'inversion', 'inversion', 'ahorro programado', 'aportacion', 'aportacion'])) return 'ahorroInversion';
  if (includesAny(text, ['extraordinario', 'evento extraordinario', 'bono anual', 'aguinaldo'])) return null;

  return 'gastosVariables';
}

function buildWeeklyMsiAmounts(installments: ProjectionMsiInstallment[], start: Date) {
  const amounts = Array.from({ length: PROJECTION_WEEKS }, () => 0);
  const pending = installments.filter((installment) => installment.status === 'pending');
  const withoutDate: ProjectionMsiInstallment[] = [];

  for (const installment of pending) {
    if (!installment.dueDate) {
      withoutDate.push(installment);
      continue;
    }
    const due = new Date(`${installment.dueDate.slice(0, 10)}T00:00:00.000Z`);
    const index = Math.floor((due.getTime() - start.getTime()) / WEEK_MS);
    if (index >= 0 && index < PROJECTION_WEEKS) amounts[index] += installment.amount;
  }

  withoutDate.forEach((installment, index) => {
    amounts[index % PROJECTION_WEEKS] += installment.amount;
  });

  return amounts.map(roundMoney);
}

function buildWeeklyEventAmounts(events: ProjectionExtraordinaryEvent[], start: Date) {
  const amounts = Array.from({ length: PROJECTION_WEEKS }, () => 0);
  for (const event of events) {
    const date = new Date(event.eventDate);
    const index = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start.getTime()) / WEEK_MS);
    if (index >= 0 && index < PROJECTION_WEEKS) amounts[index] += event.amount;
  }
  return amounts.map(roundMoney);
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
  recentWeeks?: number;
}): ProjectionScenario {
  const hasHousehold = input.hasHousehold ?? true;
  const startDate = new Date(input.startDate ?? new Date());
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const recentWeeks = input.recentWeeks ?? 12;
  const recentStart = new Date(start.getTime() - recentWeeks * WEEK_MS);
  const totals = Object.fromEntries(Object.keys(labels).map((key) => [key, 0])) as Record<ProjectionColumnKey, number>;
  const counts = Object.fromEntries(Object.keys(labels).map((key) => [key, 0])) as Record<ProjectionColumnKey, number>;

  for (const movement of input.movements) {
    const happened = new Date(movement.happenedAt);
    if (Number.isNaN(happened.getTime()) || happened < recentStart || happened >= start) continue;
    const column = classifyMovement(movement);
    if (!column || column === 'eventosExtraordinarios' || column === 'msiComprasMeses') continue;
    totals[column] += movement.amount;
    counts[column] += 1;
  }

  const base = Object.fromEntries(Object.keys(labels).map((key) => [key, roundMoney((totals[key as ProjectionColumnKey] ?? 0) / recentWeeks)])) as Record<ProjectionColumnKey, number>;
  base.eventosExtraordinarios = 0;
  base.msiComprasMeses = 0;

  const msiByWeek = buildWeeklyMsiAmounts(input.msiInstallments ?? [], start);
  const eventsByWeek = buildWeeklyEventAmounts(input.extraordinaryEvents ?? [], start);
  const dineroOperativoActual = calculateOperationalMoney(input.accounts);
  let previousMoney = dineroOperativoActual;

  const weeks = Array.from({ length: PROJECTION_WEEKS }, (_, index): ProjectionWeek => {
    const weekStart = new Date(start.getTime() + index * WEEK_MS);
    const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
    const row = {
      weekNumber: index + 1,
      label: `Semana ${index + 1}`,
      startDate: dateOnly(weekStart),
      endDate: dateOnly(weekEnd),
      nomina: base.nomina,
      cajaAhorro: base.cajaAhorro,
      ingresosExtra: base.ingresosExtra,
      eventosExtraordinarios: eventsByWeek[index],
      gastoFamiliarFijo: base.gastoFamiliarFijo,
      gastosVariables: base.gastosVariables,
      serviciosSuscripciones: base.serviciosSuscripciones,
      deudaTarjetas: base.deudaTarjetas,
      msiComprasMeses: msiByWeek[index],
      ahorroInversion: base.ahorroInversion
    };
    const totalIngresos = roundMoney(row.nomina + row.cajaAhorro + row.ingresosExtra + row.eventosExtraordinarios);
    const totalGastos = roundMoney(row.gastoFamiliarFijo + row.gastosVariables + row.serviciosSuscripciones + row.deudaTarjetas + row.msiComprasMeses + row.ahorroInversion);
    const balanceSemanal = roundMoney(totalIngresos - totalGastos);
    const dineroOperativoProyectado = roundMoney(previousMoney + balanceSemanal);
    previousMoney = dineroOperativoProyectado;
    return { ...row, totalIngresos, totalGastos, balanceSemanal, dineroOperativoProyectado };
  });

  const projectionAt12Weeks = weeks.at(-1)?.dineroOperativoProyectado ?? dineroOperativoActual;
  const projectedChange = roundMoney(projectionAt12Weeks - dineroOperativoActual);
  const averageWeeklyBalance = roundMoney(weeks.reduce((sum, week) => sum + week.balanceSemanal, 0) / Math.max(weeks.length, 1));
  const lowestWeek = weeks.reduce<ProjectionWeek | null>((lowest, week) => !lowest || week.dineroOperativoProyectado < lowest.dineroOperativoProyectado ? week : lowest, null);
  const trend = projectedChange > 0 ? 'positiva' : projectedChange < 0 ? 'negativa' : 'estable';

  const explanations: ProjectionColumnExplanation[] = (Object.keys(labels) as ProjectionColumnKey[]).map((key) => {
    const baseValue = key === 'msiComprasMeses' ? roundMoney(msiByWeek.reduce((sum, amount) => sum + amount, 0) / PROJECTION_WEEKS) : key === 'eventosExtraordinarios' ? 0 : base[key];
    const criteriaByKey: Record<ProjectionColumnKey, string> = {
      nomina: 'Promedio semanal reciente de ingresos con categoría ingreso_fijo o textos de nómina/sueldo/salario.',
      cajaAhorro: 'Promedio semanal reciente de movimientos relacionados con Caja de ahorro.',
      ingresosExtra: 'Promedio semanal reciente de ingresos recurrentes no nómina, como PrimeIPTV, extras pagados, ventas o servicios.',
      eventosExtraordinarios: 'No se promedia. Solo se incluyen eventos registrados explícitamente en el calendario financiero.',
      gastoFamiliarFijo: 'Promedio semanal reciente de gastos detectados como entrega fija a esposa/familia.',
      gastosVariables: 'Promedio semanal reciente de gastos recurrentes no fijos, excluyendo deuda, MSI, servicios, inversión y eventos extraordinarios.',
      serviciosSuscripciones: 'Promedio semanal reciente de servicios y suscripciones como Amazon, internet, celular, luz, agua o streaming.',
      deudaTarjetas: 'Promedio semanal reciente de pagos a tarjetas, préstamos, auto o departamentales.',
      msiComprasMeses: 'Usa pagos pendientes del módulo Compras a meses, ubicados por fecha de vencimiento o distribuidos semanalmente si no tienen fecha.',
      ahorroInversion: 'Promedio semanal reciente de GNP, fondos, ahorro programado, aportaciones o inversión.'
    };
    const warning = key === 'gastoFamiliarFijo' && counts[key] === 0
      ? 'No se detectó automáticamente. En esta versión aparece en $0.'
      : key === 'eventosExtraordinarios' && (input.extraordinaryEvents ?? []).length === 0
        ? 'Los eventos se agregarán manualmente en una versión posterior; por ahora quedan en $0 si no hay registros explícitos.'
        : undefined;
    return { key, label: labels[key], baseValue, criteria: criteriaByKey[key], estimated: key !== 'eventosExtraordinarios', warning };
  });

  return {
    hasHousehold,
    dineroOperativoActual,
    projectionAt12Weeks,
    projectedChange,
    averageWeeklyBalance,
    lowestWeek,
    trend,
    weeks,
    explanations
  };
}
