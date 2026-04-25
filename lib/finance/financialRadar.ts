export type FinancialRadarStatus = 'estable' | 'atencion' | 'presion';

import { deriveSharedTacticalMetrics } from '@/lib/finance/sharedTacticalMetrics';

export type FinancialRadar = {
  status: FinancialRadarStatus;
  windowDays: number;
  windowLabel: string;
  actionToday: string;
  actionTodayDetail: string;
  upcoming: string;
  riskText: string;
  nextBestStep: string;
  statusReason: string;
  availableNow: number;
  upcomingLoad: number;
  nearFutureLoad: number;
  estimatedMargin: number;
  frictionBufferRequired: number;
  marginAfterFrictionBuffer: number;
  tacticalPressureLevel: 'low' | 'medium' | 'high';
  recommendationTone: 'optimista' | 'prudente' | 'contencion';
};

export type RadarAccount = {
  type: string;
  name?: string | null;
  balance: number;
};

export type RadarObligation = {
  name?: string;
  amount: number;
  dueDay?: number | null;
};

export type RadarTransaction = {
  type: string;
  amount: number;
  happenedAt?: string | Date | null;
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const WINDOW_DAYS = 7;

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeType(value: string) {
  return value.toLowerCase().trim();
}

function normalizeName(value?: string | null) {
  return (value ?? '').toLowerCase().trim();
}

function isUsableMoneyAccount(account: RadarAccount) {
  const type = normalizeType(account.type);
  const name = normalizeName(account.name);
  if (['deuda', 'credit_card', 'loan', 'por_cobrar', 'receivable'].includes(type)) return false;
  if (['operativa', 'operational_cash', 'fondo', 'savings_fund', 'investment', 'inversion'].includes(type)) return true;
  return ['tdd', 'banco', 'efectivo', 'primeiptv', 'caja', 'ahorro'].some((token) => name.includes(token));
}

function isExpenseTransaction(tx: RadarTransaction) {
  const type = normalizeType(tx.type);
  return ['debit', 'gasto', 'expense', 'egreso'].includes(type);
}

function estimateWeeklyBaseSpending(recentTransactions: RadarTransaction[], fallbackMonthlyEstimate = 0) {
  const now = Date.now();
  const recentExpenseTotal = recentTransactions
    .filter((tx) => isExpenseTransaction(tx))
    .filter((tx) => {
      if (!tx.happenedAt) return true;
      const date = new Date(tx.happenedAt).getTime();
      if (!Number.isFinite(date)) return true;
      return now - date <= 28 * MS_PER_DAY;
    })
    .reduce((acc, tx) => acc + Math.max(Number(tx.amount) || 0, 0), 0);

  if (recentExpenseTotal > 0) return roundMoney(recentExpenseTotal / 4);
  return roundMoney(Math.max(fallbackMonthlyEstimate, 0) / 4.33);
}

function daysUntilDue(dueDay: number, now: Date) {
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const safeDueDay = Math.min(Math.max(dueDay, 1), daysInMonth);
  if (safeDueDay >= today) return safeDueDay - today;
  return daysInMonth - today + safeDueDay;
}

function splitObligationsByHorizon(obligations: RadarObligation[], now: Date) {
  const output = {
    mandatoryTotal: 0,
    nearFutureTotal: 0,
    mandatoryHighlights: [] as string[],
    nearFutureHighlights: [] as string[]
  };

  for (const obligation of obligations) {
    const amount = Math.max(Number(obligation.amount) || 0, 0);
    if (amount <= 0) continue;

    if (!obligation.dueDay || obligation.dueDay < 1 || obligation.dueDay > 31) {
      output.mandatoryTotal += amount / 4.33;
      continue;
    }

    const dueInDays = daysUntilDue(obligation.dueDay, now);
    const named = obligation.name?.trim();

    if (dueInDays <= WINDOW_DAYS) {
      output.mandatoryTotal += amount;
      if (named) output.mandatoryHighlights.push(`En ${dueInDays} días vence ${named}.`);
      continue;
    }

    if (dueInDays <= 14) {
      output.nearFutureTotal += amount;
      if (named) output.nearFutureHighlights.push(`En ${dueInDays} días viene ${named}.`);
    }
  }

  return {
    mandatoryTotal: roundMoney(output.mandatoryTotal),
    nearFutureTotal: roundMoney(output.nearFutureTotal),
    mandatoryHighlights: output.mandatoryHighlights.slice(0, 2),
    nearFutureHighlights: output.nearFutureHighlights.slice(0, 2)
  };
}

export function calculateFinancialRadar(input: {
  accounts: RadarAccount[];
  obligations: RadarObligation[];
  recentTransactions: RadarTransaction[];
  fallbackMonthlyEstimate?: number;
  now?: Date;
}): FinancialRadar {
  const now = input.now ?? new Date();
  const usableAccounts = input.accounts.filter((account) => isUsableMoneyAccount(account));

  const availableNow = roundMoney(
    usableAccounts.reduce((acc, account) => acc + Math.max(Number(account.balance) || 0, 0), 0)
  );

  const weeklyBaseSpending = estimateWeeklyBaseSpending(input.recentTransactions, input.fallbackMonthlyEstimate ?? 0);
  const obligations = splitObligationsByHorizon(input.obligations, now);

  const upcomingLoad = roundMoney(weeklyBaseSpending + obligations.mandatoryTotal);
  const nearFutureLoad = obligations.nearFutureTotal;
  const estimatedMargin = roundMoney(availableNow - upcomingLoad);

  const shared = deriveSharedTacticalMetrics({
    availableNow,
    upcoming7dLoad: upcomingLoad,
    upcoming8to14dLoad: nearFutureLoad
  });

  let status: FinancialRadarStatus = 'atencion';
  if (shared.tacticalMargin < 0) {
    status = 'presion';
  } else if (shared.marginAfterFrictionBuffer >= 0) {
    status = 'estable';
  }

  const actionTodayByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Hoy: puedes separar una parte para colchón.',
    atencion: 'Hoy: hay margen nominal, pero conviene conservarlo porque la semana queda justa.',
    presion: 'Hoy: enfócate en cubrir lo inmediato.'
  };

  const actionTodayDetailByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Con este margen, puedes avanzar un poco sin apretar tu semana.',
    atencion: 'Cubre lo esencial y prioriza liquidez; evita comprometer colchón o extras por ahora.',
    presion: 'Conviene enfocarte en lo esencial esta semana y postergar lo movible.'
  };

  const upcomingByStatus: Record<FinancialRadarStatus, string> = {
    estable: obligations.nearFutureHighlights[0] ?? obligations.mandatoryHighlights[0] ?? 'La siguiente semana también se ve manejable.',
    atencion: obligations.nearFutureHighlights[0] ?? obligations.mandatoryHighlights[0] ?? 'Viene una semana sensible; vale cuidar liquidez.',
    presion: obligations.mandatoryHighlights[0] ?? obligations.nearFutureHighlights[0] ?? 'Hay compromisos cercanos que presionan esta ventana.'
  };

  const riskByStatus: Record<FinancialRadarStatus, string> = {
    estable: nearFutureLoad > 0 ? 'Estás bien en lo inmediato; conviene anticiparte a lo que sigue.' : 'Tu semana está controlada con holgura.',
    atencion: 'Cubres lo inmediato, pero no alcanzas el colchón de fricción recomendado.',
    presion: 'La carga inmediata supera tu disponible actual.'
  };

  const nextStepByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Busca cerrar la semana con margen positivo y sin tocar reservas.',
    atencion: 'Intenta cerrar la semana con margen positivo, aunque sea pequeño.',
    presion: 'Reordena pagos cercanos y evita gastos no esenciales por ahora.'
  };

  const statusReasonByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Tu disponible cubre el periodo con holgura.',
    atencion: 'Hay margen táctico, pero la semana sigue ajustada frente al colchón recomendado.',
    presion: 'La carga inmediata supera tu disponible.'
  };

  return {
    status,
    windowDays: WINDOW_DAYS,
    windowLabel: 'próximos 7 días',
    actionToday: actionTodayByStatus[status],
    actionTodayDetail: actionTodayDetailByStatus[status],
    upcoming: upcomingByStatus[status],
    riskText: riskByStatus[status],
    nextBestStep: nextStepByStatus[status],
    statusReason: statusReasonByStatus[status],
    availableNow,
    upcomingLoad,
    nearFutureLoad,
    estimatedMargin,
    frictionBufferRequired: shared.frictionBufferRequired,
    marginAfterFrictionBuffer: shared.marginAfterFrictionBuffer,
    tacticalPressureLevel: shared.tacticalPressureLevel,
    recommendationTone: shared.recommendationTone
  };
}
