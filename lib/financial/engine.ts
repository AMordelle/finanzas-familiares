import type { FinancialInput, Goal } from '@/types/financial';

export function calculateMonthlyOFH(input: Pick<FinancialInput, 'fixedExpenses' | 'avgVariableExpenses' | 'debtPayments' | 'periodicExpensesMonthlyEquivalent' | 'safetyMarginPct'>) {
  const base = input.fixedExpenses + input.avgVariableExpenses + input.debtPayments + input.periodicExpensesMonthlyEquivalent;
  return Math.round(base * (1 + input.safetyMarginPct / 100));
}

export function calculateWeeklyOFH(monthlyOFH: number) {
  return Math.round((monthlyOFH * 12) / 52);
}

export const calculateRegularIncome = (value: number) => value;

export function calculateAnnualAverageIncome(regularMonthly: number, annualExtraIncome: number) {
  return regularMonthly + annualExtraIncome / 12;
}

export function calculateImmediateMRF(monthlyOFH: number, operativeMoney: number, liquidFunds: number) {
  if (monthlyOFH <= 0) return 0;
  return Number(((operativeMoney + liquidFunds) / monthlyOFH).toFixed(2));
}

export function calculateExtendedMRF(monthlyOFH: number, operativeMoney: number, liquidFunds: number, liquidInvestments: number) {
  if (monthlyOFH <= 0) return 0;
  return Number(((operativeMoney + liquidFunds + liquidInvestments) / monthlyOFH).toFixed(2));
}

export const calculateAvailableMoney = (operativeMoney: number) => operativeMoney;

export function calculateDebtPressure(debtPayments: number, regularIncome: number) {
  if (regularIncome <= 0) return 1;
  return debtPayments / regularIncome;
}

export function calculateFixedExpensePressure(totalFixedExpenses: number, regularIncome: number) {
  if (regularIncome <= 0) return 1;
  return totalFixedExpenses / regularIncome;
}

export const detectReserveConsumption = (reservesUsageLastMonth: number) => reservesUsageLastMonth > 0;

export function detectExtraIncomeDependency(regularIncome: number, annualAvg: number, monthlyOFH: number) {
  return regularIncome < monthlyOFH && annualAvg >= monthlyOFH;
}

export function detectRisingVariableSpending(series: number[]) {
  if (series.length < 3) return false;
  const [a, b, c] = series.slice(-3);
  return c > b && b > a;
}

export function detectMoneyLeaks(series: number[]) {
  if (series.length < 4) return false;
  const avg = series.slice(0, -1).reduce((acc, val) => acc + val, 0) / (series.length - 1);
  return series[series.length - 1] > avg * 1.25;
}

export function detectFinancialRisk(monthlyOFH: number, regularIncome: number, immediateMRF: number) {
  return regularIncome < monthlyOFH || immediateMRF < 1.5;
}

export function buildTopDiagnoses(input: FinancialInput) {
  const monthlyOFH = calculateMonthlyOFH(input);
  const annualAvg = calculateAnnualAverageIncome(input.regularIncomeMonthly, input.annualExtraIncome);
  const immediateMRF = calculateImmediateMRF(monthlyOFH, input.operativeMoney, input.liquidFunds);
  const diagnoses: string[] = [];

  if (detectExtraIncomeDependency(input.regularIncomeMonthly, annualAvg, monthlyOFH)) diagnoses.push('Dependencia de ingresos extraordinarios');
  if (detectReserveConsumption(input.reservesUsageLastMonth)) diagnoses.push('Consumo de reservas');
  if (detectMoneyLeaks(input.variableSeries)) diagnoses.push('Fuga de dinero en gasto variable');
  if (detectFinancialRisk(monthlyOFH, input.regularIncomeMonthly, immediateMRF)) diagnoses.push('Riesgo financiero');
  if (!diagnoses.length) diagnoses.push('Estabilidad financiera saludable');

  return diagnoses.slice(0, 3);
}

export function buildRecommendations(diagnoses: string[]) {
  const map: Record<string, string> = {
    'Dependencia de ingresos extraordinarios': 'Prioriza ajustar gastos variables para que tu ingreso regular cubra el OFH.',
    'Consumo de reservas': 'Define un límite semanal de gasto y recupera reservas con pequeños apartados automáticos.',
    'Fuga de dinero en gasto variable': 'Revisa comida fuera, entretenimiento y compras pequeñas con un tope semanal.',
    'Riesgo financiero': 'Enfócate en construir fondo de emergencia y reducir deuda de mayor costo.',
    'Estabilidad financiera saludable': 'Mantén disciplina y dirige excedentes a metas de mediano plazo.'
  };
  return diagnoses.map((d) => map[d] ?? 'Revisa tu flujo de efectivo y deuda para reducir presión.').slice(0, 3);
}

export function calculateGoalSuggestedSaving(goal: Goal) {
  const remaining = Math.max(goal.targetAmount - goal.savedAmount, 0);
  const weeks = Math.max(Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)), 1);
  return Math.ceil(remaining / weeks);
}

export function calculateGoalProgressStatus(goal: Goal) {
  const progress = goal.savedAmount / Math.max(goal.targetAmount, 1);
  if (progress >= 1) return 'completado';
  if (progress >= 0.8) return 'en ritmo';
  return 'atrasado';
}

export function buildCalendarPressureSummary(upcomingPayments: number, upcomingIncome: number) {
  const diff = upcomingIncome - upcomingPayments;
  if (diff >= 0) return 'Las próximas semanas se ven estables y sin presión crítica.';
  return 'Se detecta presión financiera próxima; prepara reservas o ajusta gastos variables.';
}

export function buildPeriodClosureSummary(periodIncome: number, periodExpense: number, target: number) {
  const diff = periodIncome - target;
  if (diff >= 0) return `Superaste tu objetivo por $${diff}. Puedes fortalecer reservas o metas.`;
  const expenseGap = periodExpense - periodIncome;
  return `Quedaste $${Math.abs(diff)} debajo del objetivo. Se cubrió con ${expenseGap > 0 ? 'dinero disponible o reservas' : 'ajustes de gasto'}.`;
}
