import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';
import type { HouseholdRecommendationContext } from '@/lib/finance/recommendationContext';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import { deriveSharedTacticalMetrics, type SharedTacticalMetrics } from '@/lib/finance/sharedTacticalMetrics';

export type PriorityDiagnostic = {
  key: string;
  level: 'high' | 'medium' | 'low';
  priority: 'alta' | 'media' | 'baja';
  title: string;
  explanation: string;
  evidence: Array<{ label: string; value: string }>;
  recommendedAction: string;
  sourceMetrics: Record<string, number | string | null>;
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
  recommendationContext?: HouseholdRecommendationContext | null;
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

function priorityLabel(level: PriorityDiagnostic['level']): PriorityDiagnostic['priority'] {
  if (level === 'high') return 'alta';
  if (level === 'medium') return 'media';
  return 'baja';
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

function selectExpensiveDebt(context?: HouseholdRecommendationContext | null) {
  if (!context) return null;
  const debts = context.observed.accountBalances
    .filter((account) => ['deuda', 'credit_card', 'loan'].includes(account.type.toLowerCase().trim()))
    .filter((account) => account.balance > 0)
    .map((account) => {
      const name = account.name?.trim() || 'Deuda activa';
      const normalized = name.toLowerCase();
      const isRevolving = ['tdc', 'tarjeta', 'credit', 'credito', 'crédito', 'mpago'].some((token) => normalized.includes(token));
      const isLoan = ['prestamo', 'préstamo', 'loan', 'hipoteca'].some((token) => normalized.includes(token));
      const riskWeight = isRevolving ? 1.35 : isLoan ? 1.1 : 1;
      return {
        name,
        balance: account.balance,
        heuristic: isRevolving ? 'revolving_debt_balance_weighted' : isLoan ? 'installment_debt_balance_weighted' : 'generic_debt_balance',
        score: account.balance * riskWeight
      };
    })
    .sort((a, b) => b.score - a.score);

  return debts[0] ?? null;
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
    shared,
    recommendationContext: context
  };

  return signals;
}

function buildCandidate(base: Omit<Candidate, 'level' | 'priority' | 'action'> & { score: number }): Candidate {
  const level = riskLevelFromScore(base.score);
  return {
    ...base,
    level,
    priority: priorityLabel(level),
    action: base.recommendedAction
  };
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
      candidates.push(buildCandidate({
        key: 'obligacion-inminente',
        score: 98,
        title: `En ${upcomingObligation.dueInDays} días vence ${upcomingObligation.name} y esta semana queda justa`,
        explanation: `Carga inmediata ${formatCurrencyMXN(signals.shared.upcoming7dLoad)} vs liquidez ${formatCurrencyMXN(signals.shared.availableNow)}.`,
        evidence: [
          { label: 'Obligación próxima', value: `${upcomingObligation.name} (${upcomingObligation.dueInDays} días)` },
          { label: 'Carga 7 días', value: formatCurrencyMXN(signals.shared.upcoming7dLoad) },
          { label: 'Liquidez disponible', value: formatCurrencyMXN(signals.shared.availableNow) }
        ],
        recommendedAction: 'Congela gastos discrecionales y deja este pago separado desde hoy.',
        sourceMetrics: {
          dueInDays: upcomingObligation.dueInDays,
          upcoming7dLoad: signals.shared.upcoming7dLoad,
          availableNow: signals.shared.availableNow,
          marginAfterFrictionBuffer: signals.shared.marginAfterFrictionBuffer
        }
      }));
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
    candidates.push(buildCandidate({
      key: 'semana-corta-liquidez',
      score: 92,
      title: shortfall > 0
        ? `Esta semana te falta ${formatCurrencyMXN(shortfall)} para cubrir sin fricción`
        : 'Esta semana va muy al límite y cualquier gasto extra desordena el flujo',
      explanation: 'El faltante se calcula como (colchón recomendado + carga inmediata) - liquidez disponible.',
      evidence: [
        { label: 'Carga inmediata', value: formatCurrencyMXN(signals.shared.upcoming7dLoad) },
        { label: 'Colchón recomendado', value: formatCurrencyMXN(signals.shared.frictionBufferRequired) },
        { label: 'Liquidez disponible', value: formatCurrencyMXN(signals.shared.availableNow) },
        { label: 'Faltante actual', value: formatCurrencyMXN(Math.max(shortfall, 0)) }
      ],
      recommendedAction: 'Reordena pagos por fecha y mueve lo postergable fuera de esta ventana.',
      sourceMetrics: {
        upcoming7dLoad: signals.shared.upcoming7dLoad,
        frictionBufferRequired: signals.shared.frictionBufferRequired,
        availableNow: signals.shared.availableNow,
        shortfall
      }
    }));
  }

  if (signals.debtPressureRatio >= 0.35 || signals.debtBalances > 0 && signals.monthlyMargin < 0) {
    const debtPercent = Math.round(signals.debtPressureRatio * 100);
    const expensiveDebt = selectExpensiveDebt(signals.recommendationContext);
    candidates.push(buildCandidate({
      key: 'deuda-recorta-margen',
      score: 84,
      title: `Hoy ${debtPercent}% del ingreso base se va en deuda`,
      explanation: 'Ese peso fijo reduce la maniobra mensual y eleva la probabilidad de operar en modo reactivo.',
      evidence: [
        { label: 'Presión de deuda', value: `${debtPercent}%` },
        { label: 'Saldo de deuda observado', value: formatCurrencyMXN(signals.debtBalances) },
        {
          label: 'Deuda priorizada',
          value: expensiveDebt ? `${expensiveDebt.name} (${formatCurrencyMXN(expensiveDebt.balance)})` : 'Sin deuda específica identificable'
        }
      ],
      recommendedAction: expensiveDebt
        ? `Prioriza ${expensiveDebt.name}: alto costo potencial por saldo relevante.`
        : 'Prioriza la deuda revolving con mayor saldo para recuperar flujo mensual.',
      sourceMetrics: {
        debtPressureRatio: signals.debtPressureRatio,
        debtBalances: signals.debtBalances,
        prioritizedDebtName: expensiveDebt?.name ?? null,
        prioritizedDebtBalance: expensiveDebt?.balance ?? null,
        prioritizationHeuristic: expensiveDebt?.heuristic ?? 'revolving_then_balance_desc'
      }
    }));
  }

  if ((signals.reserveMonths < 1 || financialStatus?.status === 'vulnerable') && signals.monthlyMargin <= 0) {
    const reserveMonths = Math.max(signals.reserveMonths, 0);
    candidates.push(buildCandidate({
      key: 'colchon-debil',
      score: 74,
      title: `Tu colchón actual cubre solo ${reserveMonths.toFixed(1)} meses`,
      explanation: 'Con este nivel, un imprevisto mediano puede desbalancear la liquidez semanal.',
      evidence: [
        { label: 'Meses de reserva', value: reserveMonths.toFixed(1) },
        { label: 'Margen mensual base', value: formatCurrencyMXN(signals.monthlyMargin) }
      ],
      recommendedAction: 'Define una meta mínima de colchón y fondea un monto fijo cada semana.',
      sourceMetrics: {
        reserveMonths,
        monthlyMargin: signals.monthlyMargin
      }
    }));
  }

  if (
    radar
    && radar.status === 'estable'
    && signals.tacticalPressure !== 'high'
    && signals.shared.marginAfterFrictionBuffer >= 0
    && signals.reserveMonths < 2
    && signals.monthlyMargin >= 0
  ) {
    candidates.push(buildCandidate({
      key: 'ventana-ahorro',
      score: 56,
      title: `Esta semana te deja ${formatCurrencyMXN(radar.estimatedMargin)} de margen aprovechable`,
      explanation: 'Si sostienes el orden de pagos, puedes convertir una parte en colchón real.',
      evidence: [
        { label: 'Margen semanal estimado', value: formatCurrencyMXN(radar.estimatedMargin) },
        { label: 'Meses de reserva', value: signals.reserveMonths.toFixed(1) }
      ],
      recommendedAction: 'Aparta hoy una cantidad concreta al fondo de liquidez semanal.',
      sourceMetrics: {
        estimatedMargin: radar.estimatedMargin,
        reserveMonths: signals.reserveMonths
      }
    }));
  }

  if (signals.nearFuture8to14dLoad > 0 && signals.nearFuture8to14dLoad / Math.max(signals.upcoming7dLoad, 1) >= 0.35) {
    candidates.push(buildCandidate({
      key: 'ola-siguiente-semana',
      score: signals.nextHeavyWeek ? 72 : 70,
      title: `Después de esta ventana viene otra carga de ${formatCurrencyMXN(signals.nearFuture8to14dLoad)}`,
      explanation: 'Si no anticipas apartados hoy, la siguiente semana arranca con menor margen de maniobra.',
      evidence: [
        { label: 'Carga 8-14 días', value: formatCurrencyMXN(signals.nearFuture8to14dLoad) },
        { label: 'Carga 0-7 días', value: formatCurrencyMXN(signals.upcoming7dLoad) }
      ],
      recommendedAction: 'Reserva desde esta semana una parte para la siguiente ola de pagos.',
      sourceMetrics: {
        nearFuture8to14dLoad: signals.nearFuture8to14dLoad,
        upcoming7dLoad: signals.upcoming7dLoad
      }
    }));
  }

  if (signals.nextExtraordinaryEvent && signals.nextExtraordinaryEvent.inDays <= 14 && signals.nextExtraordinaryEvent.amount > 0) {
    candidates.push(buildCandidate({
      key: 'evento-extraordinario-proximo',
      score: signals.nextExtraordinaryEvent.inDays <= 7 ? 80 : 67,
      title: `En ${signals.nextExtraordinaryEvent.inDays} días llega ${signals.nextExtraordinaryEvent.label}`,
      explanation: `Anticipa ${formatCurrencyMXN(signals.nextExtraordinaryEvent.amount)} para evitar que el evento rompa tu flujo operativo.`,
      evidence: [
        { label: 'Evento', value: signals.nextExtraordinaryEvent.label },
        { label: 'Monto estimado', value: formatCurrencyMXN(signals.nextExtraordinaryEvent.amount) },
        { label: 'Días para el evento', value: String(signals.nextExtraordinaryEvent.inDays) }
      ],
      recommendedAction: 'Crea una reserva puntual para ese evento desde esta semana.',
      sourceMetrics: {
        amount: signals.nextExtraordinaryEvent.amount,
        inDays: signals.nextExtraordinaryEvent.inDays
      }
    }));
  }

  const preview = candidates
    .filter((candidate, index, list) => list.findIndex((item) => item.key === candidate.key) === index)
    .filter((candidate) => candidate.score >= 90 || !isDuplicateEquivalent(candidate, baselineTexts))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score, ...candidate }) => candidate);

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
