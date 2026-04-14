export type FinancialRadarStatus = 'estable' | 'atencion' | 'presion';

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
  estimatedMargin: number;
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

function isImmediateLiquidityAccount(account: RadarAccount) {
  const type = normalizeType(account.type);
  const name = normalizeName(account.name);
  if (['operativa', 'operational_cash'].includes(type)) return true;
  return ['tdd', 'banco', 'efectivo', 'caja'].some((token) => name.includes(token));
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

  if (recentExpenseTotal > 0) {
    return roundMoney(recentExpenseTotal / 4);
  }

  return roundMoney(Math.max(fallbackMonthlyEstimate, 0) / 4.33);
}

function estimateDueSoonObligations(obligations: RadarObligation[], now: Date) {
  if (!obligations.length) return { total: 0, highlights: [] as string[] };

  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const details = obligations.reduce((acc, obligation) => {
      const amount = Math.max(Number(obligation.amount) || 0, 0);
      if (amount <= 0) return acc;

      if (!obligation.dueDay || obligation.dueDay < 1 || obligation.dueDay > 31) {
        acc.total += amount / 4.33;
        return acc;
      }

      const safeDueDay = Math.min(obligation.dueDay, daysInMonth);
      const dueSoonThisMonth = safeDueDay >= today && safeDueDay - today <= 10;
      const dueSoonNextMonth = safeDueDay < today && (daysInMonth - today + safeDueDay) <= 10;

      if (dueSoonThisMonth || dueSoonNextMonth) {
        const daysUntil = dueSoonThisMonth ? safeDueDay - today : (daysInMonth - today + safeDueDay);
        acc.total += amount;
        if (obligation.name) {
          acc.highlights.push(`En ${daysUntil} días vence ${obligation.name}.`);
        }
      }

      return acc;
    }, { total: 0, highlights: [] as string[] });

  return { total: roundMoney(details.total), highlights: details.highlights.slice(0, 2) };
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

  const immediateLiquidity = roundMoney(
    usableAccounts
      .filter((account) => isImmediateLiquidityAccount(account))
      .reduce((acc, account) => acc + Math.max(Number(account.balance) || 0, 0), 0)
  );

  const reserveLiquidity = roundMoney(Math.max(availableNow - immediateLiquidity, 0));

  const weeklyBaseSpending = estimateWeeklyBaseSpending(input.recentTransactions, input.fallbackMonthlyEstimate ?? 0);
  const dueSoon = estimateDueSoonObligations(input.obligations, now);
  const upcomingLoad = roundMoney(weeklyBaseSpending + dueSoon.total);

  const estimatedMargin = roundMoney(availableNow - upcomingLoad);
  const marginRatio = upcomingLoad > 0 ? estimatedMargin / upcomingLoad : 1;

  let status: FinancialRadarStatus = 'estable';
  if (estimatedMargin < 0 || marginRatio < 0.1) {
    status = 'presion';
  } else if (marginRatio < 0.35) {
    status = 'atencion';
  }

  const actionTodayByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Hoy: puedes apartar una parte a colchón.',
    atencion: 'Hoy: evita gastos extra y cuida liquidez.',
    presion: 'Hoy: protege caja y prioriza pagos clave.'
  };

  const actionTodayDetailByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Si mantienes el ritmo, puedes separar una parte sin desbalancearte.',
    atencion: 'Mantén solo gastos esenciales hasta pasar esta ventana corta.',
    presion: 'Ordena pagos críticos primero y mueve lo no urgente.'
  };

  const upcomingByStatus: Record<FinancialRadarStatus, string> = {
    estable: dueSoon.highlights[0] ?? 'La semana viene controlada por ahora.',
    atencion: dueSoon.highlights[0] ?? 'Viene una semana más pesada de lo normal.',
    presion: dueSoon.highlights[0] ?? 'Se acerca una semana exigente; conviene ajustar hoy.'
  };

  const riskByStatus: Record<FinancialRadarStatus, string> = {
    estable: reserveLiquidity > immediateLiquidity ? 'Buen respaldo: hay reserva para imprevistos.' : 'Riesgo bajo si mantienes disciplina semanal.',
    atencion: 'Riesgo medio: cualquier gasto no planeado te aprieta.',
    presion: 'Riesgo alto: la liquidez no alcanza con margen seguro.'
  };

  const nextStepByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Aparta una parte del margen para fortalecer tu reserva.',
    atencion: 'Reordena pagos de los próximos 7 días y recorta variable.',
    presion: 'Activa plan de emergencia: prioriza esenciales y difiere no críticos.'
  };

  const statusReasonByStatus: Record<FinancialRadarStatus, string> = {
    estable: 'Tu disponible cubre la carga de la ventana con margen saludable.',
    atencion: 'Sí cubres la carga, pero con poco margen de seguridad.',
    presion: 'La carga próxima supera tu disponible o deja margen muy bajo.'
  };

  return {
    status,
    windowDays: 7,
    windowLabel: 'próximos 7 días',
    actionToday: actionTodayByStatus[status],
    actionTodayDetail: actionTodayDetailByStatus[status],
    upcoming: upcomingByStatus[status],
    riskText: riskByStatus[status],
    nextBestStep: nextStepByStatus[status],
    statusReason: statusReasonByStatus[status],
    availableNow,
    upcomingLoad,
    estimatedMargin
  };
}
