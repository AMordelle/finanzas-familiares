import { formatCurrencyMXN } from '@/lib/formatters/currency';
export type HouseholdStructuralStatus = 'solido' | 'en_transicion' | 'ajustado' | 'vulnerable';
export type HouseholdFinancialStage = 'recuperacion' | 'estabilizacion' | 'optimizacion';


export type FinancialStatusRecommendationSignals = {
  declared: {
    recurringIncomePlan: Array<{ monthlyAmount: number; recurring: boolean }>;
    fixedObligations: Array<{ amount: number }>;
  };
  observed: {
    debtBalances: number;
    actualCurrentLiquidity: number;
  };
  projected: {
    monthlyBaseCoverage: number;
    debtPressureRatio: number;
    reserveMonths: number;
  };
  derived: {
    extraordinaryIncomeDependence: number;
    baseMonthlyMargin: number;
    confidenceNotes: string[];
    assumptions: string[];
  };
};

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

type StructuralMetrics = FinancialStatus['metrics'] & {
  baseMonthlyMargin: number;
  safeObligations: number;
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

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function toMonths(value: number) {
  return `${value.toFixed(1)} meses`;
}

function buildStructuralMetrics(input: {
  regularIncomeMonthly: unknown;
  annualExtraIncome: unknown;
  recurringObligationsMonthly: unknown;
  debtPaymentsMonthly: unknown;
  protectedSavings: unknown;
}) {
  const regularIncomeMonthly = toPositive(input.regularIncomeMonthly);
  const annualExtraIncome = toPositive(input.annualExtraIncome);
  const recurringObligationsMonthly = toPositive(input.recurringObligationsMonthly);
  const debtPaymentsMonthly = toPositive(input.debtPaymentsMonthly);
  const protectedSavings = toPositive(input.protectedSavings);

  const safeObligations = recurringObligationsMonthly > 0 ? recurringObligationsMonthly : Math.max(regularIncomeMonthly * 0.8, 1);
  const totalMonthlyIncome = regularIncomeMonthly + annualExtraIncome / 12;

  return {
    coverageRatio: roundMetric(regularIncomeMonthly / safeObligations),
    debtPressureRatio: roundMetric(debtPaymentsMonthly / Math.max(regularIncomeMonthly, 1)),
    reserveMonths: roundMetric(protectedSavings / safeObligations),
    extraordinaryIncomeDependency: roundMetric((annualExtraIncome / 12) / Math.max(totalMonthlyIncome, 1)),
    baseMonthlyMargin: roundMetric(regularIncomeMonthly - safeObligations - debtPaymentsMonthly),
    safeObligations
  } satisfies StructuralMetrics;
}

function composeStatus(input: {
  metrics: StructuralMetrics;
  debtBalance: number;
  operativeMoney: number;
  assumptions: string[];
  confidenceNotes?: string[];
}) {
  const { coverageRatio, debtPressureRatio, reserveMonths, extraordinaryIncomeDependency, baseMonthlyMargin, safeObligations } = input.metrics;

  const hasWeakCoverage = coverageRatio < 1;
  const hasHighDebtPressure = debtPressureRatio >= 0.35;
  const hasLowReserve = reserveMonths < 1;
  const hasHighExtraDependency = extraordinaryIncomeDependency >= 0.25;

  let status: HouseholdStructuralStatus = 'ajustado';
  if (coverageRatio >= 1.15 && debtPressureRatio < 0.25 && reserveMonths >= 2 && extraordinaryIncomeDependency < 0.2) {
    status = 'solido';
  } else if (coverageRatio >= 1 && debtPressureRatio < 0.33 && reserveMonths >= 0.9 && extraordinaryIncomeDependency < 0.3) {
    status = 'en_transicion';
  } else if (coverageRatio < 0.95 || reserveMonths < 0.45 || (hasHighDebtPressure && hasLowReserve)) {
    status = 'vulnerable';
  }

  let stage: HouseholdFinancialStage = 'recuperacion';
  if (coverageRatio >= 1 && reserveMonths >= 0.8) stage = 'estabilizacion';
  if (coverageRatio >= 1.1 && reserveMonths >= 2 && debtPressureRatio < 0.28) stage = 'optimizacion';

  const strengthsPool = {
    liquidity: 'Hoy existe liquidez operativa para sostener la semana sin fricción mayor.',
    obligations: 'El hogar sigue cubriendo obligaciones base del mes.',
    weeklyManeuver: 'Ya existe capacidad de maniobra semanal para ordenar pagos.',
    reserve: 'Ya hay una base de ahorro protector en construcción.',
    lowExtraDependency: 'La estructura depende más del ingreso recurrente que de eventos aislados.'
  };

  const riskPool = {
    weakCoverage: 'La estructura mensual sigue frágil: el ingreso base no cubre todo con consistencia.',
    highDebt: 'La deuda reduce demasiado el margen mensual.',
    lowReserve: 'Falta ahorro protector suficiente para absorber un imprevisto relevante.',
    highExtraDependency: 'Parte del equilibrio depende de ingresos no recurrentes.',
    highDebtBalance: 'El tamaño de la deuda mantiene una presión estructural alta.'
  };

  const strengths: string[] = [];
  const risks: string[] = [];

  if (input.operativeMoney > safeObligations * 0.35) strengths.push(strengthsPool.liquidity);
  if (coverageRatio >= 1) strengths.push(strengthsPool.obligations);
  if (baseMonthlyMargin > 0) strengths.push(strengthsPool.weeklyManeuver);
  if (reserveMonths >= 0.7) strengths.push(strengthsPool.reserve);
  if (extraordinaryIncomeDependency < 0.2) strengths.push(strengthsPool.lowExtraDependency);

  if (hasWeakCoverage) risks.push(riskPool.weakCoverage);
  if (hasHighDebtPressure) risks.push(riskPool.highDebt);
  if (hasLowReserve) risks.push(riskPool.lowReserve);
  if (hasHighExtraDependency) risks.push(riskPool.highExtraDependency);
  if (input.debtBalance > (safeObligations + Math.max(baseMonthlyMargin, 0)) * 8) risks.push(riskPool.highDebtBalance);

  if (status === 'vulnerable') {
    const vulnerableStrengths = strengths.filter((item) =>
      [strengthsPool.liquidity, strengthsPool.obligations, strengthsPool.weeklyManeuver].includes(item)
    );
    const cappedStrengths = vulnerableStrengths.slice(0, 2);
    if (!cappedStrengths.length) cappedStrengths.push('Hoy hay algunos intentos de orden, pero todavía no alcanzan para dar estabilidad.');

    const dominantRisks = risks.length ? risks : [riskPool.weakCoverage, riskPool.lowReserve];

    return {
      status,
      stage,
      headline: 'Estructura vulnerable',
      interpretation:
        `La fragilidad es estructural: cobertura base ${toPercent(coverageRatio)}, reserva ${toMonths(reserveMonths)} y presión de deuda ${toPercent(debtPressureRatio)}. ` +
        'Con estos niveles, un imprevisto relevante presiona el mes de inmediato.',
      shortLine: 'Hoy la estructura mensual es frágil y necesita refuerzo prioritario.',
      strengths: cappedStrengths,
      risks: dominantRisks.slice(0, 3),
      nextFocus: 'Convertir deuda en margen mensual, construir colchón protector real y fortalecer ingreso base recurrente.',
      metrics: {
        coverageRatio,
        debtPressureRatio,
        reserveMonths,
        extraordinaryIncomeDependency
      },
      assumptions: Array.from(new Set([...(input.assumptions ?? []), ...(input.confidenceNotes ?? [])]))
    } satisfies FinancialStatus;
  }

  const headlineByStatus: Record<Exclude<HouseholdStructuralStatus, 'vulnerable'>, string> = {
    solido: 'Estructura sólida',
    en_transicion: 'Estructura en transición',
    ajustado: 'Estructura ajustada'
  };

  const interpretationByStatus: Record<Exclude<HouseholdStructuralStatus, 'vulnerable'>, string> = {
    solido:
      `Tu estructura mensual es saludable: cobertura base ${toPercent(coverageRatio)}, reserva ${toMonths(reserveMonths)} y presión de deuda ${toPercent(debtPressureRatio)}.`,
    en_transicion:
      `Hay avance real: cobertura base ${toPercent(coverageRatio)} y reserva ${toMonths(reserveMonths)}, pero aún conviene fortalecer margen y blindaje.`,
    ajustado:
      `El hogar sostiene lo esencial con margen corto (margen base ${formatCurrencyMXN(baseMonthlyMargin)}); falta consolidar reserva y reducir presión estructural.`
  };

  const shortLineByStatus: Record<Exclude<HouseholdStructuralStatus, 'vulnerable'>, string> = {
    solido: 'La estructura del hogar está firme, con margen y protección razonable.',
    en_transicion: 'Hay estabilidad parcial: buen rumbo, pero todavía con puntos frágiles.',
    ajustado: 'La base se sostiene, aunque la holgura estructural sigue limitada.'
  };

  const nextFocusByStatus: Record<Exclude<HouseholdStructuralStatus, 'vulnerable'>, string> = {
    solido: 'Mantener disciplina: convertir excedente en reserva protegida y seguir bajando deuda cara.',
    en_transicion: 'Convertir deuda en margen mensual y llevar el ahorro protector a un nivel más estable.',
    ajustado: 'Reducir fugas estructurales, subir ahorro protector y fortalecer ingreso base recurrente.'
  };

  if (!strengths.length) strengths.push('Existe intención de orden financiero, aunque aún falta consolidar resultados constantes.');
  if (!risks.length) risks.push('No se observan focos críticos hoy, pero conviene sostener hábitos para no retroceder.');

  const strengthsLimit = status === 'solido' ? 3 : 2;
  const risksLimit = status === 'solido' ? 2 : 3;

  return {
    status,
    stage,
    headline: headlineByStatus[status],
    interpretation: interpretationByStatus[status],
    shortLine: shortLineByStatus[status],
    strengths: strengths.slice(0, strengthsLimit),
    risks: risks.slice(0, risksLimit),
    nextFocus: nextFocusByStatus[status],
    metrics: {
      coverageRatio,
      debtPressureRatio,
      reserveMonths,
      extraordinaryIncomeDependency
    },
    assumptions: Array.from(new Set([...(input.assumptions ?? []), ...(input.confidenceNotes ?? [])]))
  };
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
  const protectedSavings = toPositive(input.protectedSavings);

  if (regularIncomeMonthly <= 0) assumptions.push('No hay ingreso recurrente claro; se toma postura conservadora.');
  if (recurringObligationsMonthly <= 0) assumptions.push('Compromisos recurrentes incompletos; se usa base mínima para evitar optimismo falso.');
  if (protectedSavings <= 0) assumptions.push('No se detecta ahorro protegido; se asume reserva nula.');

  return composeStatus({
    metrics: buildStructuralMetrics({
      regularIncomeMonthly,
      annualExtraIncome,
      recurringObligationsMonthly,
      debtPaymentsMonthly: input.debtPaymentsMonthly,
      protectedSavings
    }),
    debtBalance: toPositive(input.debtBalance),
    operativeMoney: toPositive(input.operativeMoney),
    assumptions
  });
}

export function calculateFinancialStatusFromRecommendationContext(context: FinancialStatusRecommendationSignals): FinancialStatus {
  const recurringIncomeMonthly = context.declared.recurringIncomePlan
    .filter((item) => item.recurring !== false)
    .reduce((acc, item) => acc + toPositive(item.monthlyAmount), 0);

  const obligationsMonthly = context.declared.fixedObligations
    .reduce((acc, item) => acc + toPositive(item.amount), 0);

  const protectedSavings = toPositive(context.projected.reserveMonths) * Math.max(obligationsMonthly, recurringIncomeMonthly * 0.8, 1);
  const annualExtraIncome = Math.round(toPositive(context.derived.extraordinaryIncomeDependence) * recurringIncomeMonthly * 12);
  const debtPaymentsMonthly = toPositive(context.projected.debtPressureRatio) * Math.max(recurringIncomeMonthly, 1);

  const computedMetrics = buildStructuralMetrics({
    regularIncomeMonthly: recurringIncomeMonthly,
    annualExtraIncome,
    recurringObligationsMonthly: obligationsMonthly,
    debtPaymentsMonthly,
    protectedSavings
  });

  return composeStatus({
    metrics: {
      ...computedMetrics,
      coverageRatio: roundMetric(context.projected.monthlyBaseCoverage),
      debtPressureRatio: roundMetric(context.projected.debtPressureRatio),
      reserveMonths: roundMetric(context.projected.reserveMonths),
      extraordinaryIncomeDependency: roundMetric(context.derived.extraordinaryIncomeDependence),
      baseMonthlyMargin: roundMetric(context.derived.baseMonthlyMargin)
    },
    debtBalance: toPositive(context.observed.debtBalances),
    operativeMoney: toPositive(context.observed.actualCurrentLiquidity),
    assumptions: context.derived.assumptions ?? [],
    confidenceNotes: context.derived.confidenceNotes ?? []
  });
}
