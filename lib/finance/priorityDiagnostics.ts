import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

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

export function getPriorityDiagnostics(input: {
  radar: FinancialRadar | null;
  financialStatus: FinancialStatus | null;
  financialPressure: FinancialPressureData | null;
  existingDiagnoses?: string[];
}): PriorityDiagnostic[] {
  const { radar, financialStatus, financialPressure } = input;

  const baselineTexts = [
    radar?.actionToday,
    radar?.actionTodayDetail,
    radar?.upcoming,
    radar?.riskText,
    radar?.nextBestStep,
    financialStatus?.shortLine,
    financialStatus?.interpretation,
    financialStatus?.nextFocus,
    ...(input.existingDiagnoses ?? [])
  ].filter((value): value is string => Boolean(value));

  const candidates: Candidate[] = [];
  const upcomingObligation = extractUpcomingObligation(radar);

  if (radar && upcomingObligation?.dueInDays != null && upcomingObligation.dueInDays <= 10) {
    const pressurePoints = [
      radar.status === 'presion',
      radar.estimatedMargin <= Math.max(radar.upcomingLoad * 0.12, 350),
      financialPressure?.status === 'critical'
    ].filter(Boolean).length;

    if (pressurePoints >= 1) {
      candidates.push({
        key: 'obligacion-inminente',
        score: 98,
        level: 'high',
        title: `En ${upcomingObligation.dueInDays} días vence ${upcomingObligation.name} y esta semana queda justa`,
        explanation: `La carga de ${formatCurrencyMXN(radar.upcomingLoad)} en la ventana corta deja poco margen frente a tu disponible actual (${formatCurrencyMXN(radar.availableNow)}).`,
        action: 'Congela extras esta semana y deja separado ese pago desde hoy.'
      });
    }
  }

  if (radar && (radar.status === 'presion' || radar.estimatedMargin < 0 || financialPressure?.status === 'critical')) {
    const shortfall = Math.max(-radar.estimatedMargin, financialPressure?.gap ?? 0, 0);
    candidates.push({
      key: 'semana-corta-liquidez',
      score: 92,
      level: 'high',
      title: shortfall > 0
        ? `Esta semana te falta ${formatCurrencyMXN(shortfall)} para cubrir sin fricción`
        : 'Esta semana va muy al límite y cualquier gasto extra desordena el flujo',
      explanation: `El disponible (${formatCurrencyMXN(radar.availableNow)}) no alcanza con holgura para la carga inmediata (${formatCurrencyMXN(radar.upcomingLoad)}).`,
      action: 'Reordena pagos por fecha y mueve lo postergable fuera de esta ventana.'
    });
  }

  if (financialStatus && financialStatus.metrics.debtPressureRatio >= 0.35) {
    const debtPercent = Math.round(financialStatus.metrics.debtPressureRatio * 100);
    candidates.push({
      key: 'deuda-recorta-margen',
      score: 84,
      level: 'high',
      title: `Hoy ${debtPercent}% del ingreso base se va en deuda`,
      explanation: 'Ese peso fijo recorta la maniobra mensual y te obliga a operar con margen corto casi todo el mes.',
      action: 'Ataca primero deuda cara o renegocia una cuota para recuperar flujo mensual.'
    });
  }

  if (financialStatus && (financialStatus.metrics.reserveMonths < 1 || financialStatus.status === 'vulnerable')) {
    const reserveMonths = Math.max(financialStatus.metrics.reserveMonths, 0);
    candidates.push({
      key: 'colchon-debil',
      score: 74,
      level: 'medium',
      title: `Tu colchón actual cubre solo ${reserveMonths.toFixed(1)} meses`,
      explanation: 'Con ese nivel, cualquier imprevisto mediano vuelve a presionar la semana y obliga a improvisar.',
      action: 'Define una meta mínima de reserva y fondea una parte fija cada semana.'
    });
  }

  if (radar && financialStatus && radar.status === 'estable' && radar.estimatedMargin > 0 && financialStatus.metrics.reserveMonths < 2) {
    candidates.push({
      key: 'ventana-ahorro',
      score: 56,
      level: 'low',
      title: `Esta semana te deja ${formatCurrencyMXN(radar.estimatedMargin)} de margen aprovechable`,
      explanation: 'Si sostienes el orden de pagos, puedes convertir una parte de ese margen en colchón real.',
      action: 'Aparta hoy una cantidad concreta al fondo y trátala como pago fijo.'
    });
  }

  if (radar && radar.nearFutureLoad > 0 && radar.nearFutureLoad / Math.max(radar.upcomingLoad, 1) >= 0.35) {
    candidates.push({
      key: 'ola-siguiente-semana',
      score: 70,
      level: 'medium',
      title: `Después de esta ventana viene otra carga de ${formatCurrencyMXN(radar.nearFutureLoad)}`,
      explanation: 'Si no te anticipas hoy, la siguiente semana arranca más ajustada y reduce tu margen de maniobra.',
      action: 'Reserva desde esta semana una parte para la siguiente ola de pagos.'
    });
  }

  const selected = candidates
    .filter((candidate, index, list) => list.findIndex((item) => item.key === candidate.key) === index)
    .filter((candidate) => candidate.score >= 90 || !isDuplicateEquivalent(candidate, baselineTexts))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score, ...candidate }) => ({
      ...candidate,
      level: riskLevelFromScore(score)
    }));

  return selected;
}
