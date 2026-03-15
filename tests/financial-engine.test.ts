import { describe, expect, it } from 'vitest';
import {
  buildRecommendations,
  buildTopDiagnoses,
  calculateImmediateMRF,
  calculateMonthlyOFH,
  calculateWeeklyOFH,
  detectExtraIncomeDependency
} from '@/lib/financial/engine';

describe('financial engine', () => {
  it('calcula OFH mensual y semanal', () => {
    const ofh = calculateMonthlyOFH({
      fixedExpenses: 10000,
      avgVariableExpenses: 4000,
      debtPayments: 2000,
      periodicExpensesMonthlyEquivalent: 1000,
      safetyMarginPct: 10
    });
    expect(ofh).toBe(18700);
    expect(calculateWeeklyOFH(ofh)).toBeGreaterThan(4300);
  });

  it('detecta dependencia de ingresos extraordinarios', () => {
    expect(detectExtraIncomeDependency(18000, 25000, 22000)).toBe(true);
  });

  it('genera diagnósticos y recomendaciones', () => {
    const diagnoses = buildTopDiagnoses({
      fixedExpenses: 18000,
      avgVariableExpenses: 9000,
      debtPayments: 3500,
      periodicExpensesMonthlyEquivalent: 1200,
      safetyMarginPct: 10,
      regularIncomeMonthly: 30000,
      annualExtraIncome: 36000,
      operativeMoney: 22000,
      liquidFunds: 15000,
      liquidInvestments: 18000,
      debtBalance: 85000,
      totalFixedExpenses: 18000,
      variableSeries: [6200, 7100, 8400, 9800],
      reservesUsageLastMonth: 1200
    });
    expect(diagnoses.length).toBeGreaterThan(0);
    expect(buildRecommendations(diagnoses).length).toBeGreaterThan(0);
  });

  it('calcula MRF inmediato', () => {
    expect(calculateImmediateMRF(30000, 15000, 15000)).toBe(1);
  });
});
