export type AccountKind = 'operativa' | 'fondo' | 'inversion' | 'deuda' | 'por_cobrar';

export interface FinancialInput {
  fixedExpenses: number;
  avgVariableExpenses: number;
  debtPayments: number;
  periodicExpensesMonthlyEquivalent: number;
  safetyMarginPct: number;
  regularIncomeMonthly: number;
  annualExtraIncome: number;
  operativeMoney: number;
  liquidFunds: number;
  liquidInvestments: number;
  debtBalance: number;
  totalFixedExpenses: number;
  variableSeries: number[];
  reservesUsageLastMonth: number;
}

export interface Goal {
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string;
}
