export type HouseholdStructuralStatus = 'solido' | 'en_transicion' | 'ajustado' | 'vulnerable';
export type HouseholdFinancialStage = 'recuperacion' | 'estabilizacion' | 'optimizacion';

export type FinancialStatus = {
  status: HouseholdStructuralStatus;
  stage: HouseholdFinancialStage;
  headline: string;
  interpretation: string;
  shortLine: string;
  strengths: string[];
  risks: string[];
  nextFocus: string;
  metrics: {
    coverageRatio: number;
    debtPressureRatio: number;
    reserveMonths: number;
    extraordinaryIncomeDependency: number;
  };
  assumptions: string[];
};

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function toPositive(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(numeric, 0);
}

function pushIf(list: string[], condition: boolean, message: string) {
  if (condition) list.push(message);
}

export function calculateFinancialStatus(input: {
  regularIncomeMonthly?: unknown;
  annualExtraIncome?: unknown;
  recurringObligationsMonthly?: unknown;
  debtPaymentsMonthly?: unknown;
  debtBalance?: unknown;
  protectedSavings?: unknown;
  operativeMoney?: unknown;
}): FinancialStatus {
  const assumptions: string[] = [];
  const regularIncomeMonthly = toPositive(input.regularIncomeMonthly);
  const annualExtraIncome = toPositive(input.annualExtraIncome);
  const recurringObligationsMonthly = toPositive(input.recurringObligationsMonthly);
  const debtPaymentsMonthly = toPositive(input.debtPaymentsMonthly);
  const debtBalance = toPositive(input.debtBalance);
  const protectedSavings = toPositive(input.protectedSavings);
  const operativeMoney = toPositive(input.operativeMoney);

  if (regularIncomeMonthly <= 0) assumptions.push('No hay ingreso recurrente claro; se toma postura conservadora.');
  if (recurringObligationsMonthly <= 0) assumptions.push('Compromisos recurrentes incompletos; se usa base mínima para evitar optimismo falso.');
  if (protectedSavings <= 0) assumptions.push('No se detecta ahorro protegido; se asume reserva nula.');

  const safeObligations = recurringObligationsMonthly > 0 ? recurringObligationsMonthly : Math.max(regularIncomeMonthly * 0.8, 1);
  const totalMonthlyIncome = regularIncomeMonthly + annualExtraIncome / 12;
  const coverageRatio = roundMetric(regularIncomeMonthly / safeObligations);
  const debtPressureRatio = roundMetric(debtPaymentsMonthly / Math.max(regularIncomeMonthly, 1));
  const reserveMonths = roundMetric(protectedSavings / safeObligations);
  const extraordinaryIncomeDependency = roundMetric((annualExtraIncome / 12) / Math.max(totalMonthlyIncome, 1));

  let status: HouseholdStructuralStatus = 'ajustado';
  if (coverageRatio >= 1.15 && debtPressureRatio < 0.25 && reserveMonths >= 2 && extraordinaryIncomeDependency < 0.25) {
    status = 'solido';
  } else if (coverageRatio >= 1 && debtPressureRatio < 0.35 && reserveMonths >= 1) {
    status = 'en_transicion';
  } else if (coverageRatio < 0.9 || reserveMonths < 0.4) {
    status = 'vulnerable';
  }

  let stage: HouseholdFinancialStage = 'recuperacion';
  if (coverageRatio >= 1 && reserveMonths >= 0.8) stage = 'estabilizacion';
  if (coverageRatio >= 1.1 && reserveMonths >= 2 && debtPressureRatio < 0.28) stage = 'optimizacion';

  const strengths: string[] = [];
  pushIf(strengths, coverageRatio >= 1, 'El ingreso base sí cubre lo esencial del mes.');
  pushIf(strengths, debtPressureRatio < 0.3, 'La deuda no está capturando la mayor parte del ingreso.');
  pushIf(strengths, reserveMonths >= 1, 'Ya existe un colchón que ayuda a absorber sobresaltos.');
  pushIf(strengths, extraordinaryIncomeDependency < 0.3, 'La estabilidad no depende tanto de ingresos extraordinarios.');
  pushIf(strengths, operativeMoney > safeObligations * 0.4, 'La liquidez operativa da margen para maniobrar sin fricción.');
  if (!strengths.length) strengths.push('Hay señales de orden, pero aún no son suficientes para dar estabilidad constante.');

  const risks: string[] = [];
  pushIf(risks, coverageRatio < 1, 'La presión no está en la semana, sino en que el ingreso base no alcanza de forma consistente.');
  pushIf(risks, debtPressureRatio >= 0.35, 'La deuda pesa demasiado dentro del ingreso mensual.');
  pushIf(risks, reserveMonths < 1, 'El ahorro protegido todavía no alcanza para blindar el mes.');
  pushIf(risks, extraordinaryIncomeDependency >= 0.3, 'Hoy se depende de eventos extraordinarios para sostener estabilidad.');
  pushIf(risks, debtBalance > regularIncomeMonthly * 8 && regularIncomeMonthly > 0, 'El tamaño total de deuda mantiene presión estructural alta.');
  if (!risks.length) risks.push('No se observan focos críticos hoy, pero conviene sostener hábitos para no retroceder.');

  const headlineByStatus: Record<HouseholdStructuralStatus, string> = {
    solido: 'Estructura sólida',
    en_transicion: 'Estructura en transición',
    ajustado: 'Estructura ajustada',
    vulnerable: 'Estructura vulnerable'
  };

  const interpretationByStatus: Record<HouseholdStructuralStatus, string> = {
    solido: 'Tu hogar cubre lo esencial, conserva margen y tiene protección real para imprevistos.',
    en_transicion: 'Vas ganando estabilidad, aunque todavía hay piezas que deben consolidarse.',
    ajustado: 'Tu hogar cubre lo esencial, pero aún depende de maniobras para respirar con holgura.',
    vulnerable: 'La presión principal es estructural: falta colchón y el mes se vuelve frágil ante cualquier cambio.'
  };

  const shortLineByStatus: Record<HouseholdStructuralStatus, string> = {
    solido: 'Hay base, margen y reserva: la estructura del hogar está firme.',
    en_transicion: 'Hay avances reales, pero aún no alcanza para hablar de estabilidad plena.',
    ajustado: 'La base alcanza, aunque la holgura sigue siendo limitada.',
    vulnerable: 'Hoy la estructura mensual sigue bajo presión y necesita refuerzo.'
  };

  const nextFocusByStatus: Record<HouseholdStructuralStatus, string> = {
    solido: 'Tu siguiente enfoque debe ser convertir el excedente en reserva protegida y acelerar reducción de deuda cara.',
    en_transicion: 'Tu siguiente enfoque debe ser convertir deuda en margen y llevar el ahorro protegido a dos meses.',
    ajustado: 'Tu siguiente enfoque debe ser estabilizar el mes: priorizar pagos clave y construir un colchón mínimo.',
    vulnerable: 'Tu siguiente enfoque debe ser recuperar tracción: reforzar ingreso base y frenar fugas estructurales.'
  };

  return {
    status,
    stage,
    headline: headlineByStatus[status],
    interpretation: interpretationByStatus[status],
    shortLine: shortLineByStatus[status],
    strengths: strengths.slice(0, 3),
    risks: risks.slice(0, 3),
    nextFocus: nextFocusByStatus[status],
    metrics: {
      coverageRatio,
      debtPressureRatio,
      reserveMonths,
      extraordinaryIncomeDependency
    },
    assumptions
  };
}
