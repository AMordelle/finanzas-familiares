import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';
import type { HouseholdRecommendationContext } from '@/lib/finance/recommendationContext';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import { deriveSharedTacticalMetrics, type SharedTacticalMetrics } from '@/lib/finance/sharedTacticalMetrics';

export type PriorityDiagnostic = {
  key: string;
  level: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  action?: string;
};

type FinancialPressureData = {
  requiredMoney: number;
  availableMoney: number;
  gap: number;
  status: 'healthy' | 'warning' | 'critical';
  breakdown: {
    debts: number;
    fixedExpenses: number;
    operationalEstimate: number;
  };
};

type Candidate = PriorityDiagnostic & { score: number };

type PrioritySignals = {
  radar: FinancialRadar | null;
  financialStatus: FinancialStatus | null;
  declaredPriorities: string[];
  upcoming7dLoad: number;
  nearFuture8to14dLoad: number;
  tacticalPressure: 'low' | 'medium' | 'high' | null;
  reserveMonths: number;
  debtPressureRatio: number;
  nextHeavyWeek: string | null;
  nextExtraordinaryEvent: { label: string; amount: number; date: string; inDays: number } | null;
  monthlyMargin: number;
  liquidity: number;
  debtBalances: number;
  recentSpendingPressure: number;
  shared: SharedTacticalMetrics;
};

function normalizedTokens(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function isDuplicateEquivalent(candidate: Candidate, baseline: string[]) {
  const candidateTokens = new Set(normalizedTokens(`${candidate.title} ${candidate.explanation}`));
  if (!candidateTokens.size) return false;

  return baseline.some((text) => {
    const baselineTokens = new Set(normalizedTokens(text));
    if (!baselineTokens.size) return false;
    let overlap = 0;
    for (const token of candidateTokens) {
      if (baselineTokens.has(token)) overlap += 1;
    }
    const ratio = overlap / Math.min(candidateTokens.size, baselineTokens.size);
    return ratio >= 0.75;
  });
}

function riskLevelFromScore(score: number): PriorityDiagnostic['level'] {
  if (score >= 85) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function extractUpcomingObligation(radar: FinancialRadar | null) {
  if (!radar?.upcoming) return null;
  const match = /En\s+(\d+)\s+d[ií]as\s+(?:vence|viene)\s+(.+?)(?:\.|$)/i.exec(radar.upcoming);
  if (!match) return null;
  const dueInDays = Number(match[1]);
  const rawName = match[2]?.trim() ?? '';
  const name = rawName.replace(/^el\s+/i, '');
  if (!name) return null;
  return {
    name,
    dueInDays: Number.isFinite(dueInDays) ? dueInDays : null
  };
}

function buildSignals(input: {
  radar: FinancialRadar | null;
  financialStatus: FinancialStatus | null;
  recommendationContext?: HouseholdRecommendationContext | null;
}) {
  const context = input.recommendationContext;
  const radar = context?.projected.radar ?? input.radar;
  const financialStatus = context?.projected.status ?? input.financialStatus;
  const liquidity = context?.observed.actualCurrentLiquidity ?? radar?.availableNow ?? 0;
  const upcoming7dLoad = context?.projected.upcoming7dLoad ?? radar?.upcomingLoad ?? 0;
  const nearFuture8to14dLoad = context?.projected.nearFuture8to14dLoad ?? radar?.nearFutureLoad ?? 0;
  const monthlyMargin = context?.derived.baseMonthlyMargin ?? 0;
  const debtBalances = context?.observed.debtBalances ?? 0;
  const recentSpendingPressure = context
    ? context.observed.recentExpenses - context.observed.recentIncome
    : 0;

  const shared = context?.projected.sharedTacticalMetrics ?? deriveSharedTacticalMetrics({
    availableNow: liquidity,
    upcoming7dLoad,
    upcoming8to14dLoad: nearFuture8to14dLoad,
    structuralPressureLevel: context?.projected.structuralPressure
  });

  const signals: PrioritySignals = {
    radar,
    financialStatus,
    declaredPriorities: context?.declared.priorities ?? [],
    upcoming7dLoad,
    nearFuture8to14dLoad,
    tacticalPressure: context?.projected.tacticalPressure ?? shared.tacticalPressureLevel,
    reserveMonths: context?.projected.reserveMonths ?? financialStatus?.metrics.reserveMonths ?? 0,
    debtPressureRatio: context?.projected.debtPressureRatio ?? financialStatus?.metrics.debtPressureRatio ?? 0,
    nextHeavyWeek: context?.projected.nextHeavyWeek ?? null,
    nextExtraordinaryEvent: context?.projected.nextExtraordinaryEvent ?? null,
    monthlyMargin,
    liquidity,
    debtBalances,
    recentSpendingPressure,
    shared
  };

  return signals;
}

export function getPriorityDiagnostics(input: {
  radar: FinancialRadar | null;
  financialStatus: FinancialStatus | null;
  financialPressure: FinancialPressureData | null;
  recommendationContext?: HouseholdRecommendationContext | null;
  existingDiagnoses?: string[];
}): PriorityDiagnostic[] {
  const { financialPressure } = input;
  const signals = buildSignals(input);
  const radar = signals.radar;
  const financialStatus = signals.financialStatus;

  const baselineTexts = [
    radar?.actionToday,
    radar?.actionTodayDetail,
    radar?.upcoming,
    radar?.riskText,
    radar?.nextBestStep,
    financialStatus?.shortLine,
    financialStatus?.interpretation,
    financialStatus?.nextFocus,
    ...signals.declaredPriorities,
    ...(input.existingDiagnoses ?? [])
  ].filter((value): value is string => Boolean(value));

  const candidates: Candidate[] = [];
  const upcomingObligation = extractUpcomingObligation(radar);

  if (radar && upcomingObligation?.dueInDays != null && upcomingObligation.dueInDays <= 10) {
    const pressurePoints = [
      radar.status === 'presion',
      signals.tacticalPressure === 'high',
      signals.shared.marginAfterFrictionBuffer < 0,
      financialPressure?.status === 'critical'
    ].filter(Boolean).length;

    if (pressurePoints >= 1) {
      candidates.push({
        key: 'obligacion-inminente',
        score: 98,
        level: 'high',
        title: `En ${upcomingObligation.dueInDays} días vence ${upcomingObligation.name} y esta semana queda justa`,
        explanation: `Carga inmediata ${formatCurrencyMXN(signals.shared.upcoming7dLoad)} vs liquidez ${formatCurrencyMXN(signals.shared.availableNow)}. El colchón recomendado es ${formatCurrencyMXN(signals.shared.frictionBufferRequired)} y hoy faltan ${formatCurrencyMXN(Math.max(-signals.shared.marginAfterFrictionBuffer, 0))} para operar sin fricción.`,
        action: 'Congela extras esta semana y deja separado ese pago desde hoy.'
      });
    }
  }

  if (
    radar && (
      radar.status === 'presion'
      || signals.tacticalPressure === 'high'
      || signals.shared.tacticalMargin < 0
      || signals.shared.marginAfterFrictionBuffer < 0
      || financialPressure?.status === 'critical'
      || signals.recentSpendingPressure > signals.upcoming7dLoad * 0.4
    )
  ) {
    const tacticalShortfall = Math.max(signals.shared.upcoming7dLoad - signals.shared.availableNow, 0);
    const frictionShortfall = Math.max(signals.shared.frictionBufferRequired - signals.shared.tacticalMargin, 0);
    const shortfall = Math.max(tacticalShortfall, frictionShortfall, financialPressure?.gap ?? 0, 0);
    candidates.push({
      key: 'semana-corta-liquidez',
      score: 92,
      level: 'high',
      title: shortfall > 0
        ? `Esta semana te falta ${formatCurrencyMXN(shortfall)} para cubrir sin fricción`
        : 'Esta semana va muy al límite y cualquier gasto extra desordena el flujo',
      explanation: `Carga inmediata: ${formatCurrencyMXN(signals.shared.upcoming7dLoad)} · Liquidez disponible: ${formatCurrencyMXN(signals.shared.availableNow)} · Colchón requerido: ${formatCurrencyMXN(signals.shared.frictionBufferRequired)} · Faltante contra colchón: ${formatCurrencyMXN(Math.max(-signals.shared.marginAfterFrictionBuffer, 0))}.`,
      action: 'Reordena pagos por fecha y mueve lo postergable fuera de esta ventana.'
    });
  }

  if (signals.debtPressureRatio >= 0.35 || signals.debtBalances > 0 && signals.monthlyMargin < 0) {
    const debtPercent = Math.round(signals.debtPressureRatio * 100);
    candidates.push({
      key: 'deuda-recorta-margen',
      score: 84,
      level: 'high',
      title: `Hoy ${debtPercent}% del ingreso base se va en deuda`,
      explanation: 'Ese peso fijo recorta la maniobra mensual y te obliga a operar con margen corto casi todo el mes.',
      action: 'Ataca primero deuda cara o renegocia una cuota para recuperar flujo mensual.'
    });
  }

  if ((signals.reserveMonths < 1 || financialStatus?.status === 'vulnerable') && signals.monthlyMargin <= 0) {
    const reserveMonths = Math.max(signals.reserveMonths, 0);
    candidates.push({
      key: 'colchon-debil',
      score: 74,
      level: 'medium',
      title: `Tu colchón actual cubre solo ${reserveMonths.toFixed(1)} meses`,
      explanation: 'Con ese nivel, cualquier imprevisto mediano vuelve a presionar la semana y obliga a improvisar.',
      action: 'Define una meta mínima de reserva y fondea una parte fija cada semana.'
    });
  }

  if (
    radar
    && radar.status === 'estable'
    && signals.tacticalPressure !== 'high'
    && signals.shared.marginAfterFrictionBuffer >= 0
    && signals.reserveMonths < 2
    && signals.monthlyMargin >= 0
  ) {
    candidates.push({
      key: 'ventana-ahorro',
      score: 56,
      level: 'low',
      title: `Esta semana te deja ${formatCurrencyMXN(radar.estimatedMargin)} de margen aprovechable`,
      explanation: 'Si sostienes el orden de pagos, puedes convertir una parte de ese margen en colchón real.',
      action: 'Aparta hoy una cantidad concreta al fondo y trátala como pago fijo.'
    });
  }

  if (signals.nearFuture8to14dLoad > 0 && signals.nearFuture8to14dLoad / Math.max(signals.upcoming7dLoad, 1) >= 0.35) {
    candidates.push({
      key: 'ola-siguiente-semana',
      score: signals.nextHeavyWeek ? 72 : 70,
      level: 'medium',
      title: `Después de esta ventana viene otra carga de ${formatCurrencyMXN(signals.nearFuture8to14dLoad)}`,
      explanation: 'Si no te anticipas hoy, la siguiente semana arranca más ajustada y reduce tu margen de maniobra.',
      action: 'Reserva desde esta semana una parte para la siguiente ola de pagos.'
    });
  }

  if (signals.nextExtraordinaryEvent && signals.nextExtraordinaryEvent.inDays <= 14 && signals.nextExtraordinaryEvent.amount > 0) {
    candidates.push({
      key: 'evento-extraordinario-proximo',
      score: signals.nextExtraordinaryEvent.inDays <= 7 ? 80 : 67,
      level: 'medium',
      title: `En ${signals.nextExtraordinaryEvent.inDays} días llega ${signals.nextExtraordinaryEvent.label}`,
      explanation: `Anticipa ${formatCurrencyMXN(signals.nextExtraordinaryEvent.amount)} para evitar que ese evento rompa tu flujo operativo.`,
      action: 'Crea una reserva puntual para ese evento desde esta semana.'
    });
  }

  const preview = candidates
    .filter((candidate, index, list) => list.findIndex((item) => item.key === candidate.key) === index)
    .filter((candidate) => candidate.score >= 90 || !isDuplicateEquivalent(candidate, baselineTexts))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score, ...candidate }) => ({
      ...candidate,
      level: riskLevelFromScore(score)
    }));

  if (process.env.NODE_ENV !== 'production') {
    console.info('[recommendation-context] shared tactical metrics', {
      availableNow: signals.shared.availableNow,
      upcoming7dLoad: signals.shared.upcoming7dLoad,
      tacticalMargin: signals.shared.tacticalMargin,
      frictionBufferRequired: signals.shared.frictionBufferRequired,
      marginAfterFrictionBuffer: signals.shared.marginAfterFrictionBuffer,
      tacticalPressureLevel: signals.shared.tacticalPressureLevel,
      radarStatus: radar?.status ?? null,
      diagnosticsPriority: preview[0]?.level ?? 'none'
    });
  }

  return preview;
}
