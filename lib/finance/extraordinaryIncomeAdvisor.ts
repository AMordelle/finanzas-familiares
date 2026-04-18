import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';

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
  const debtPressure = context.financialStatus?.metrics.debtPressureRatio ?? 0;
  const reserveMonths = context.financialStatus?.metrics.reserveMonths ?? 0;
  const radarPressure = context.financialRadar?.status === 'presion';

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

  if (radarPressure) {
    weights.liquidez += 0.1;
    weights.libre -= 0.04;
    weights.deuda -= mode === 'agresivo' ? 0.02 : 0.04;
  }

  return normalizePercentages(weights);
}

function bucketReason(bucket: AllocationBucket, mode: RecommendationMode, context: ExtraordinaryIncomeContext) {
  const debtPressure = context.financialStatus?.metrics.debtPressureRatio ?? 0;
  const reserveMonths = context.financialStatus?.metrics.reserveMonths ?? 0;

  if (bucket === 'liquidez') {
    return context.financialRadar?.status === 'presion'
      ? 'Protege la operación de las próximas semanas y evita fricción en pagos inmediatos.'
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

  return mode === 'agresivo'
    ? 'Flexibilidad mínima para no perder control mientras aceleras saneamiento.'
    : 'Espacio flexible para decisiones familiares de corto plazo sin improvisar.';
}

function buildScenario(mode: RecommendationMode, amount: number, context: ExtraordinaryIncomeContext): ExtraordinaryScenario {
  const weights = adjustedWeightsByMode(mode, context);
  const raw = buildAllocationFromPercentages(amount, weights);
  const warnings: string[] = [];

  if ((context.financialStatus?.metrics.reserveMonths ?? 0) < 0.7) {
    warnings.push('El colchón actual sigue bajo; evita usar la parte libre en gasto no esencial.');
  }

  if ((context.financialStatus?.metrics.debtPressureRatio ?? 0) >= 0.4) {
    warnings.push('La presión de deuda es alta; prioriza deuda cara antes de nuevas metas de consumo.');
  }

  if (context.financialRadar?.status === 'presion') {
    warnings.push('Hay presión en la ventana de 7 días; separa liquidez desde hoy antes de mover lo demás.');
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
    conservador: 'Escenario protector: fortalece estabilidad y liquidez primero.',
    balanceado: 'Escenario mixto: combina estabilidad inmediata, deuda y colchón.',
    agresivo: 'Escenario de aceleración: reduce presión de deuda más rápido.'
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

  const debtPressure = input.context.financialStatus?.metrics.debtPressureRatio ?? 0;
  const reserveMonths = input.context.financialStatus?.metrics.reserveMonths ?? 0;
  const radarStatus = input.context.financialRadar?.status;

  let recommendedMode: RecommendationMode = 'balanceado';
  if (radarStatus === 'presion' || reserveMonths < 0.8) {
    recommendedMode = 'conservador';
  } else if (debtPressure >= 0.38 && reserveMonths >= 1) {
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
      : `Tomamos este monto como evento puntual para planeación y sugerimos enfoque ${recommendedMode}.`,
    scenarios
  };
}
