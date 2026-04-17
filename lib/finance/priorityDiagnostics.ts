import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';

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

  if (radar?.status === 'presion' || financialPressure?.status === 'critical') {
    candidates.push({
      key: 'liquidez-inmediata',
      score: 100,
      level: 'high',
      title: 'La liquidez inmediata está bajo presión',
      explanation: 'En los próximos días la carga supera o casi consume tu disponible. Conviene blindar flujo desde hoy.',
      action: 'Prioriza lo indispensable y mueve lo no urgente.'
    });
  }

  if (radar && (radar.nearFutureLoad > 0 || radar.upcomingLoad > 0)) {
    const ratio = radar.upcomingLoad > 0 ? radar.nearFutureLoad / radar.upcomingLoad : 0;
    if (ratio >= 0.3 || radar.nearFutureLoad >= 1200) {
      candidates.push({
        key: 'presion-semana-cercana',
        score: 78 + Math.min(Math.round(ratio * 10), 8),
        level: 'medium',
        title: 'Se acerca una semana más pesada',
        explanation: `Después de esta ventana viene una carga cercana de $${Math.round(radar.nearFutureLoad).toLocaleString('es-MX')}. Vale anticiparte desde ahora.`,
        action: 'Reserva liquidez desde esta semana para no llegar justo.'
      });
    }
  }

  if (financialStatus) {
    if (financialStatus.status === 'vulnerable' || financialStatus.metrics.coverageRatio < 1 || financialStatus.metrics.reserveMonths < 0.7) {
      candidates.push({
        key: 'presion-estructural',
        score: 88,
        level: 'high',
        title: 'La presión principal sigue siendo estructural',
        explanation: 'Lo inmediato se puede mover, pero la base mensual aún tiene poco margen y poca protección.',
        action: 'Convierte deuda en margen y fortalece reserva base.'
      });
    }

    if (financialStatus.metrics.debtPressureRatio >= 0.35) {
      candidates.push({
        key: 'deuda-consume-margen',
        score: 82,
        level: 'high',
        title: 'La deuda está consumiendo demasiado margen',
        explanation: `La presión de deuda ronda ${Math.round(financialStatus.metrics.debtPressureRatio * 100)}% del ingreso base y limita tu maniobra mensual.`,
        action: 'Ataca primero la deuda más cara para liberar flujo.'
      });
    }

    if (financialStatus.metrics.extraordinaryIncomeDependency >= 0.25) {
      candidates.push({
        key: 'dependencia-extra',
        score: 62,
        level: 'medium',
        title: 'Hay dependencia de ingresos extraordinarios',
        explanation: 'Parte del equilibrio depende de entradas no recurrentes. Eso vuelve inestable el plan mensual.',
        action: 'Reduce compromisos fijos hasta que el ingreso base cargue más peso.'
      });
    }
  }

  if (radar && financialStatus && radar.status === 'estable' && radar.estimatedMargin > 0 && financialStatus.metrics.reserveMonths < 2) {
    candidates.push({
      key: 'ventana-ahorro',
      score: 54,
      level: 'low',
      title: 'Buen momento para fortalecer colchón',
      explanation: 'La semana se ve controlada. Si sostienes el orden, puedes separar una parte para protección.',
      action: 'Aparta una cantidad pequeña y constante al fondo.'
    });
  }

  const selected = candidates
    .filter((candidate, index, list) => list.findIndex((item) => item.key === candidate.key) === index)
    .filter((candidate) => candidate.score >= 85 || !isDuplicateEquivalent(candidate, baselineTexts))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ score, ...candidate }) => ({
      ...candidate,
      level: riskLevelFromScore(score)
    }));

  return selected;
}
