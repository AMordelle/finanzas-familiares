import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';
import type { HouseholdRecommendationContext } from '@/lib/finance/recommendationContext';

export type RecommendationMode = 'conservador' | 'balanceado' | 'agresivo';
export type AllocationBucket = 'liquidez' | 'colchon' | 'deuda' | 'libre';

export type ExtraordinaryIncomeDetection = {
  detected: boolean;
  label: string;
  confidence: 'alta' | 'media' | 'baja';
  reasons: string[];
};

export type ExtraordinaryIncomeContext = {
  monthlyOFH: number;
  availableMoney: number;
  financialRadar: FinancialRadar | null;
  financialStatus: FinancialStatus | null;
  priorityDiagnostics: string[];
  recommendationContext?: HouseholdRecommendationContext | null;
};

export type ExtraordinaryIncomeAllocation = {
  bucket: AllocationBucket;
  amount: number;
  percentage: number;
  reason: string;
};

export type ExtraordinaryScenario = {
  recommendationMode: RecommendationMode;
  summary: string;
  allocations: ExtraordinaryIncomeAllocation[];
  warnings: string[];
  nextStep: string;
};

export type ExtraordinaryIncomeRecommendation = {
  detectedExtraordinaryIncome: number;
  label: string;
  detected: boolean;
  recommendedMode: RecommendationMode;
  summary: string;
  scenarios: ExtraordinaryScenario[];
};

const EXTRAORDINARY_KEYWORDS = [
  'devolucion sat',
  'sat',
  'aguinaldo',
  'fondo de ahorro',
  'apoyo escolar',
  'vacaciones',
  'bono',
  'extraordinario',
  'utilidades',
  'reembolso fuerte'
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function roundMoney(value: number) {
  return Number((Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildAllocationFromPercentages(amount: number, percentages: Record<AllocationBucket, number>) {
  const allocations: Record<AllocationBucket, number> = {
    liquidez: roundMoney(amount * percentages.liquidez),
    colchon: roundMoney(amount * percentages.colchon),
    deuda: roundMoney(amount * percentages.deuda),
    libre: 0
  };

  const consumed = allocations.liquidez + allocations.colchon + allocations.deuda;
  const libreCandidate = roundMoney(amount - consumed);

  if (libreCandidate >= 0) {
    allocations.libre = libreCandidate;
    return allocations;
  }

  let deficit = Math.abs(libreCandidate);
  const rebalanceOrder: AllocationBucket[] = ['deuda', 'colchon', 'liquidez'];

  for (const bucket of rebalanceOrder) {
    if (deficit <= 0) break;
    const reducible = Math.min(allocations[bucket], deficit);
    allocations[bucket] = roundMoney(allocations[bucket] - reducible);
    deficit = roundMoney(deficit - reducible);
  }

  allocations.libre = 0;

  const totalAfter = roundMoney(allocations.liquidez + allocations.colchon + allocations.deuda + allocations.libre);
  const roundingGap = roundMoney(amount - totalAfter);
  if (roundingGap !== 0) {
    allocations.deuda = roundMoney(Math.max(allocations.deuda + roundingGap, 0));
  }

  return allocations;
}

function normalizePercentages(weights: Record<AllocationBucket, number>) {
  const sum = Object.values(weights).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) {
    return {
      liquidez: 0.25,
      colchon: 0.25,
      deuda: 0.35,
      libre: 0.15
    };
  }

  return {
    liquidez: clamp(weights.liquidez / sum, 0.05, 0.8),
    colchon: clamp(weights.colchon / sum, 0.05, 0.8),
    deuda: clamp(weights.deuda / sum, 0.05, 0.85),
    libre: clamp(weights.libre / sum, 0.05, 0.5)
  };
}

type AdvisorSignals = {
  tacticalPressure: 'low' | 'medium' | 'high';
  debtPressureRatio: number;
  reserveMonths: number;
  upcomingProtectionAmount: number;
  householdStage: FinancialStatus['stage'] | null;
  activeGoal: { name: string; missingAmount: number } | null;
  hasContext: boolean;
};

export function detectExtraordinaryIncome(input: { label?: string | null; amount: number; monthlyOFH?: number }) : ExtraordinaryIncomeDetection {
  const label = input.label?.trim() || 'Ingreso extraordinario';
  const normalizedLabel = normalizeText(label);
  const keywordMatched = EXTRAORDINARY_KEYWORDS.some((keyword) => normalizedLabel.includes(keyword));

  const monthlyOFH = Math.max(Number(input.monthlyOFH) || 0, 0);
  const amount = Math.max(Number(input.amount) || 0, 0);
  const unusuallyLargeAgainstOFH = monthlyOFH > 0 && amount >= monthlyOFH * 0.35;
  const unusuallyLargeAbsolute = amount >= 10000;

  const detected = keywordMatched || unusuallyLargeAgainstOFH || unusuallyLargeAbsolute;

  const reasons: string[] = [];
  if (keywordMatched) reasons.push('La etiqueta coincide con eventos no rutinarios del hogar.');
  if (unusuallyLargeAgainstOFH) reasons.push('El monto representa una proporción alta frente al OFH mensual.');
  if (unusuallyLargeAbsolute) reasons.push('El monto es material para planeación estratégica familiar.');

  const confidence: ExtraordinaryIncomeDetection['confidence'] = detected
    ? (reasons.length >= 2 ? 'alta' : 'media')
    : 'baja';

  return {
    detected,
    label,
    confidence,
    reasons
  };
}

function adjustedWeightsByMode(mode: RecommendationMode, context: ExtraordinaryIncomeContext) {
  const signals = extractSignals(context);
  const debtPressure = signals.debtPressureRatio;
  const reserveMonths = signals.reserveMonths;
  const tacticalPressure = signals.tacticalPressure;

  const weightsByMode: Record<RecommendationMode, Record<AllocationBucket, number>> = {
    conservador: { liquidez: 0.35, colchon: 0.35, deuda: 0.2, libre: 0.1 },
    balanceado: { liquidez: 0.25, colchon: 0.25, deuda: 0.35, libre: 0.15 },
    agresivo: { liquidez: 0.15, colchon: 0.15, deuda: 0.6, libre: 0.1 }
  };

  const weights = { ...weightsByMode[mode] };

  if (debtPressure >= 0.35) {
    weights.deuda += mode === 'agresivo' ? 0.08 : 0.1;
    weights.libre -= 0.05;
    weights.colchon -= 0.03;
  }

  if (reserveMonths < 1) {
    weights.colchon += 0.1;
    if (mode === 'agresivo') {
      weights.deuda -= 0.04;
      weights.libre -= 0.03;
    } else {
      weights.libre -= 0.05;
      weights.liquidez -= 0.03;
    }
  }

  if (tacticalPressure === 'high') {
    weights.liquidez += 0.13;
    weights.libre -= 0.04;
    weights.deuda -= mode === 'agresivo' ? 0.04 : 0.06;
  } else if (tacticalPressure === 'medium') {
    weights.liquidez += 0.06;
    weights.libre -= 0.02;
    weights.deuda -= 0.02;
  }

  if (signals.upcomingProtectionAmount > 0) {
    weights.liquidez += mode === 'conservador' ? 0.1 : 0.07;
    weights.libre -= 0.03;
    if (mode === 'agresivo') {
      weights.deuda -= 0.04;
    } else {
      weights.colchon -= 0.03;
    }
  }

  if (signals.activeGoal && reserveMonths >= 1 && tacticalPressure !== 'high') {
    weights.libre += mode === 'agresivo' ? 0.08 : 0.05;
    weights.deuda -= mode === 'agresivo' ? 0.03 : 0.02;
  }

  return normalizePercentages(weights);
}

function bucketReason(bucket: AllocationBucket, mode: RecommendationMode, context: ExtraordinaryIncomeContext) {
  const signals = extractSignals(context);
  const debtPressure = signals.debtPressureRatio;
  const reserveMonths = signals.reserveMonths;

  if (bucket === 'liquidez') {
    return signals.tacticalPressure === 'high' || signals.upcomingProtectionAmount > 0
      ? 'Esta semana ya trae presión táctica; apartar liquidez primero evita fricción en pagos inmediatos.'
      : 'Mantiene tranquilidad operativa para que el mes no se apriete por calendario.';
  }

  if (bucket === 'colchon') {
    if (reserveMonths < 1) return 'Refuerza el colchón porque hoy la reserva sigue frágil frente a imprevistos.';
    return 'Construye blindaje para próximas eventualidades familiares.';
  }

  if (bucket === 'deuda') {
    if (debtPressure >= 0.35) return 'Reducir deuda libera presión mensual y mejora la maniobra del hogar.';
    return mode === 'agresivo'
      ? 'Ataque directo a deuda para liberar flujo más rápido.'
      : 'Mantiene avance en deuda sin descuidar estabilidad.';
  }

  if (signals.activeGoal && reserveMonths >= 1 && signals.tacticalPressure !== 'high') {
    return `Deja un margen flexible para avanzar la meta "${signals.activeGoal.name}" sin desordenar el flujo.`;
  }

  return mode === 'agresivo'
    ? 'Flexibilidad mínima para no perder control mientras aceleras saneamiento.'
    : 'Espacio flexible para decisiones familiares de corto plazo sin improvisar.';
}

function buildScenario(mode: RecommendationMode, amount: number, context: ExtraordinaryIncomeContext): ExtraordinaryScenario {
  const signals = extractSignals(context);
  const weights = adjustedWeightsByMode(mode, context);
  const raw = buildAllocationFromPercentages(amount, weights);
  const warnings: string[] = [];

  if ((context.financialStatus?.metrics.reserveMonths ?? 0) < 0.7) {
    warnings.push('El colchón actual sigue bajo; evita usar la parte libre en gasto no esencial.');
  }

  if ((context.financialStatus?.metrics.debtPressureRatio ?? 0) >= 0.4) {
    warnings.push('La presión de deuda es alta; prioriza deuda cara antes de nuevas metas de consumo.');
  }

  if (signals.tacticalPressure === 'high') {
    warnings.push('Hay presión en la ventana de 7 días; separa liquidez desde hoy antes de mover lo demás.');
  }
  if (signals.upcomingProtectionAmount > 0) {
    warnings.push('Hay obligaciones próximas; protege ese monto antes de usar la parte flexible.');
  }

  const allocations: ExtraordinaryIncomeAllocation[] = (['liquidez', 'colchon', 'deuda', 'libre'] as AllocationBucket[]).map((bucket) => ({
    bucket,
    amount: raw[bucket],
    percentage: amount > 0 ? Number(((raw[bucket] / amount) * 100).toFixed(1)) : 0,
    reason: bucket === 'libre' && raw.libre <= 0
      ? 'No hay remanente flexible por ahora; conviene priorizar estabilidad y protección.'
      : bucketReason(bucket, mode, context)
  }));

  const summaryByMode: Record<RecommendationMode, string> = {
    conservador: 'Escenario protector: asegura operación y estabilidad antes de acelerar.',
    balanceado: 'Escenario mixto: reparte entre tranquilidad operativa y avance financiero.',
    agresivo: 'Escenario de aceleración: empuja deuda y metas cuando la base lo permite.'
  };

  const nextStepByMode: Record<RecommendationMode, string> = {
    conservador: 'Aparta hoy mismo liquidez y colchón en cuentas separadas para no mezclarlo con gasto corriente.',
    balanceado: 'Ejecuta en dos pasos: primero deuda y liquidez, después fondea colchón y define parte libre.',
    agresivo: 'Programa pago extraordinario a deuda esta semana y bloquea la parte libre para evitar rebote de gasto.'
  };

  return {
    recommendationMode: mode,
    summary: summaryByMode[mode],
    allocations,
    warnings: warnings.slice(0, 3),
    nextStep: nextStepByMode[mode]
  };
}

function extractSignals(context: ExtraordinaryIncomeContext): AdvisorSignals {
  const recommendationContext = context.recommendationContext;
  const tacticalPressure = recommendationContext?.projected.tacticalPressure
    ?? (context.financialRadar?.status === 'presion'
      ? 'high'
      : context.financialRadar?.status === 'atencion'
        ? 'medium'
        : 'low');
  const debtPressureRatio = recommendationContext?.projected.debtPressureRatio
    ?? context.financialStatus?.metrics.debtPressureRatio
    ?? 0;
  const reserveMonths = recommendationContext?.projected.reserveMonths
    ?? context.financialStatus?.metrics.reserveMonths
    ?? 0;

  const upcoming7d = recommendationContext?.projected.upcoming7dLoad ?? 0;
  const upcoming8to14 = recommendationContext?.projected.nearFuture8to14dLoad ?? 0;
  const liquidity = recommendationContext?.observed.actualCurrentLiquidity ?? context.availableMoney ?? 0;
  const shortTermPressure = Math.max(upcoming7d + upcoming8to14 - liquidity, 0);
  const upcomingProtectionAmount = roundMoney(Math.max(shortTermPressure, upcoming7d * 0.35, 0));

  const activeGoal = recommendationContext?.declared.goals
    .map((goal) => ({
      name: goal.name,
      missingAmount: roundMoney(Math.max(goal.targetAmount - goal.savedAmount, 0))
    }))
    .find((goal) => goal.missingAmount > 0) ?? null;

  return {
    tacticalPressure,
    debtPressureRatio,
    reserveMonths,
    upcomingProtectionAmount,
    householdStage: recommendationContext?.derived.householdStage ?? context.financialStatus?.stage ?? null,
    activeGoal,
    hasContext: Boolean(recommendationContext)
  };
}

export function recommendExtraordinaryIncomeDistribution(input: {
  amount: number;
  label?: string | null;
  context: ExtraordinaryIncomeContext;
}): ExtraordinaryIncomeRecommendation {
  const amount = roundMoney(Math.max(Number(input.amount) || 0, 0));
  const detection = detectExtraordinaryIncome({
    label: input.label,
    amount,
    monthlyOFH: input.context.monthlyOFH
  });

  const signals = extractSignals(input.context);
  const debtPressure = signals.debtPressureRatio;
  const reserveMonths = signals.reserveMonths;
  const tacticalPressure = signals.tacticalPressure;

  let recommendedMode: RecommendationMode = 'balanceado';
  if (tacticalPressure === 'high' || reserveMonths < 0.8 || signals.upcomingProtectionAmount > amount * 0.2) {
    recommendedMode = 'conservador';
  } else if (debtPressure >= 0.38 && reserveMonths >= 1 && tacticalPressure === 'low') {
    recommendedMode = 'agresivo';
  } else if (signals.householdStage === 'fortalecimiento' && reserveMonths >= 2 && tacticalPressure !== 'high') {
    recommendedMode = 'agresivo';
  }

  const scenarios: ExtraordinaryScenario[] = [
    buildScenario('conservador', amount, input.context),
    buildScenario('balanceado', amount, input.context),
    buildScenario('agresivo', amount, input.context)
  ];

  const selectedScenario = scenarios.find((item) => item.recommendationMode === recommendedMode) ?? scenarios[1];

  return {
    detectedExtraordinaryIncome: amount,
    label: detection.label,
    detected: detection.detected,
    recommendedMode,
    summary: detection.detected
      ? `Se detectó un ingreso extraordinario y te proponemos iniciar con enfoque ${recommendedMode}. ${selectedScenario.summary}`
      : `Tomamos este monto como evento puntual para planeación y sugerimos enfoque ${recommendedMode}.${signals.hasContext ? ' Basamos la sugerencia en contexto real del hogar.' : ''}`,
    scenarios
  };
}
