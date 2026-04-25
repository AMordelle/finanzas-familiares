export type FinancialRadarStatus = 'estable' | 'atencion' | 'presion';

import { deriveSharedTacticalMetrics } from '@/lib/finance/sharedTacticalMetrics';

export type RadarBreakdownCategory = 'obligacion' | 'gasto_fijo' | 'deuda' | 'meta' | 'operativo' | 'otros';

export type RadarBreakdownItem = {
  label: string;
  amount: number;
  category: RadarBreakdownCategory;
  dueInDays?: number | null;
};

export type FinancialRadar = {
  status: FinancialRadarStatus;
  headline: string;
  whatToDoToday: string;
  whyItMatters: string;
  whatIsComing: string;
  nextBestAction: string;
  metrics: {
    availableNow: number;
    upcoming7dLoad: number;
    nearFuture8to14dLoad: number;
    estimatedMargin: number;
    frictionBufferRequired: number;
    marginAfterFrictionBuffer: number;
    tacticalPressureLevel: 'low' | 'medium' | 'high';
    recommendationTone: 'optimista' | 'prudente' | 'contencion';
  };
  breakdowns: {
    upcoming7dLoad: RadarBreakdownItem[];
    suggestedActionBasis: string;
    frictionGap: {
      formula: string;
      buffer: number;
      immediateLoad: number;
      availableLiquidity: number;
      gap: number;
    };
  };
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

function classifyObligation(name?: string): RadarBreakdownCategory {
  const normalized = normalizeName(name);
  if (!normalized) return 'otros';
  if (['tdc', 'tarjeta', 'credito', 'crédito', 'prestamo', 'préstamo', 'loan', 'deuda', 'mpago', 'bbva', 'sctbnk'].some((token) => normalized.includes(token))) {
    return 'deuda';
  }
  if (['renta', 'hipoteca', 'colegiatura', 'colegio', 'servicio', 'luz', 'agua', 'gas', 'internet', 'telefono', 'teléfono', 'seguro'].some((token) => normalized.includes(token))) {
    return 'gasto_fijo';
  }
  if (['meta', 'ahorro objetivo', 'objetivo', 'goal'].some((token) => normalized.includes(token))) {
    return 'meta';
  }
  return 'obligacion';
}

function splitObligationsByHorizon(obligations: RadarObligation[], now: Date) {
  const output = {
    mandatoryTotal: 0,
    nearFutureTotal: 0,
    mandatoryHighlights: [] as string[],
    nearFutureHighlights: [] as string[],
    upcomingBreakdown: [] as RadarBreakdownItem[]
  };

  for (const obligation of obligations) {
    const amount = Math.max(Number(obligation.amount) || 0, 0);
    if (amount <= 0) continue;

    const named = obligation.name?.trim();
    const category = classifyObligation(named);

    if (!obligation.dueDay || obligation.dueDay < 1 || obligation.dueDay > 31) {
      const prorated = roundMoney(amount / 4.33);
      output.mandatoryTotal += prorated;
      output.upcomingBreakdown.push({
        label: named || 'Obligación sin fecha definida',
        amount: prorated,
        category: category === 'gasto_fijo' ? 'gasto_fijo' : 'obligacion',
        dueInDays: null
      });
      continue;
    }

    const dueInDays = daysUntilDue(obligation.dueDay, now);

    if (dueInDays <= WINDOW_DAYS) {
      output.mandatoryTotal += amount;
      output.upcomingBreakdown.push({
        label: named || `Obligación en ${dueInDays} días`,
        amount,
        category,
        dueInDays
      });
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
    nearFutureHighlights: output.nearFutureHighlights.slice(0, 2),
    upcomingBreakdown: output.upcomingBreakdown
      .sort((a, b) => (a.dueInDays ?? 999) - (b.dueInDays ?? 999))
      .slice(0, 8)
  };
}

function toActionBasis(status: FinancialRadarStatus, upcomingHighlight: string | undefined, nearFutureLoad: number, frictionGap: number) {
  if (status === 'presion') return 'La prioridad es cubrir pagos críticos y cerrar el faltante de liquidez de esta semana.';
  if (status === 'atencion') {
    if (upcomingHighlight) return `Existe un pago inmediato (${upcomingHighlight.replace(/\.$/, '')}) y el colchón todavía no está completo.`;
    return 'Hay cobertura base, pero falta proteger un margen para operar sin fricción.';
  }
  if (nearFutureLoad > 0) return 'La semana actual está cubierta; conviene apartar parte del excedente para la siguiente ola de pagos.';
  if (frictionGap <= 0) return 'Con el colchón actual puedes ejecutar una acción concreta (separar reserva o adelantar pago) sin desbalancear liquidez.';
  return 'Hay holgura táctica para fortalecer el margen semanal.';
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

  const upcomingSummary = obligations.nearFutureHighlights[0] ?? obligations.mandatoryHighlights[0];
  const frictionGap = roundMoney((shared.frictionBufferRequired + shared.upcoming7dLoad) - shared.availableNow);

  const whatToDoTodayByStatus: Record<FinancialRadarStatus, string> = {
    estable: nearFutureLoad > 0
      ? 'Aparta hoy un monto para la siguiente semana de carga alta.'
      : 'Separa hoy una parte del excedente al colchón sugerido.',
    atencion: obligations.mandatoryHighlights[0]
      ? `Prioriza y deja fondeado ${obligations.mandatoryHighlights[0].replace('En ', '').replace('.', '')}.`
      : 'Cubre gasto fijo pendiente y mantén liquidez semanal sin comprometer extras.',
    presion: obligations.mandatoryHighlights[0]
      ? `Protege primero ${obligations.mandatoryHighlights[0].replace('En ', '').replace('.', '')}.`
      : 'Reordena pagos próximos y cubre solo obligaciones críticas esta semana.'
  };

  const whyItMattersByStatus: Record<FinancialRadarStatus, string> = {
    estable: nearFutureLoad > 0
      ? 'Llegas bien a esta semana, pero ya se observa una segunda ola de pagos en 8-14 días.'
      : 'Tu liquidez cubre la carga inmediata y también el colchón recomendado para operar sin fricción.',
    atencion: `Cubres lo inmediato, pero faltan ${Math.max(frictionGap, 0) > 0 ? `aprox. ${Math.max(frictionGap, 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : '0'} para sostener colchón más carga de la semana.`,
    presion: 'La carga inmediata supera la liquidez disponible y cualquier gasto extra aumenta el faltante operativo.'
  };

  const whatIsComingByStatus: Record<FinancialRadarStatus, string> = {
    estable: upcomingSummary ?? 'No se detectan eventos de presión relevante en los próximos 14 días.',
    atencion: upcomingSummary ?? 'Hay una ventana sensible en los próximos días; conviene anticipar apartados.',
    presion: obligations.mandatoryHighlights[0] ?? upcomingSummary ?? 'Hay obligaciones cercanas que requieren reordenar pagos hoy.'
  };

  const nextBestActionByStatus: Record<FinancialRadarStatus, string> = {
    estable: nearFutureLoad > 0
      ? 'Fortalece liquidez semanal apartando una parte específica para la siguiente ola (8-14 días).'
      : 'Fortalece liquidez semanal separando colchón sugerido sin usar dinero comprometido.',
    atencion: 'Cubre primero obligaciones de esta semana y posterga gastos movibles hasta recuperar colchón mínimo.',
    presion: 'Negocia fecha o monto de una obligación no crítica para reducir faltante de corto plazo.'
  };

  const statusReasonByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Tu disponible cubre carga inmediata y colchón de fricción.',
    atencion: 'Hay margen táctico, pero no alcanza para operar con colchón recomendado.',
    presion: 'La carga inmediata supera tu disponible.'
  };

  const upcoming7dBreakdown: RadarBreakdownItem[] = [
    {
      label: 'Gasto operativo estimado (7 días)',
      amount: weeklyBaseSpending,
      category: 'operativo',
      dueInDays: null
    },
    ...obligations.upcomingBreakdown
  ].filter((item) => item.amount > 0);

  const radarHeadline = status === 'presion'
    ? 'Semana en presión: faltante operativo inmediato'
    : status === 'atencion'
      ? 'Semana sensible: cubres carga, pero sin colchón suficiente'
      : 'Semana controlada con margen operativo';

  return {
    status,
    headline: radarHeadline,
    whatToDoToday: whatToDoTodayByStatus[status],
    whyItMatters: whyItMattersByStatus[status],
    whatIsComing: whatIsComingByStatus[status],
    nextBestAction: nextBestActionByStatus[status],
    metrics: {
      availableNow,
      upcoming7dLoad: upcomingLoad,
      nearFuture8to14dLoad: nearFutureLoad,
      estimatedMargin,
      frictionBufferRequired: shared.frictionBufferRequired,
      marginAfterFrictionBuffer: shared.marginAfterFrictionBuffer,
      tacticalPressureLevel: shared.tacticalPressureLevel,
      recommendationTone: shared.recommendationTone
    },
    breakdowns: {
      upcoming7dLoad: upcoming7dBreakdown,
      suggestedActionBasis: toActionBasis(status, obligations.mandatoryHighlights[0], nearFutureLoad, frictionGap),
      frictionGap: {
        formula: '(colchón recomendado + carga inmediata) - liquidez disponible',
        buffer: shared.frictionBufferRequired,
        immediateLoad: shared.upcoming7dLoad,
        availableLiquidity: shared.availableNow,
        gap: frictionGap
      }
    },
    windowDays: WINDOW_DAYS,
    windowLabel: 'próximos 7 días',
    actionToday: `Hoy: ${whatToDoTodayByStatus[status]}`,
    actionTodayDetail: whatToDoTodayByStatus[status],
    upcoming: whatIsComingByStatus[status],
    riskText: whyItMattersByStatus[status],
    nextBestStep: nextBestActionByStatus[status],
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
