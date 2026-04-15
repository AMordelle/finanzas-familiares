import { describe, expect, it } from 'vitest';
import { calculateFinancialStatus } from '@/lib/finance/financialStatus';

describe('financial structural status calculation', () => {
  it('clasifica hogar sólido cuando hay cobertura, reserva y baja dependencia extraordinaria', () => {
    const status = calculateFinancialStatus({
      regularIncomeMonthly: 52000,
      annualExtraIncome: 24000,
      recurringObligationsMonthly: 32000,
      debtPaymentsMonthly: 7000,
      debtBalance: 90000,
      protectedSavings: 85000,
      operativeMoney: 20000
    });

    expect(status.status).toBe('solido');
    expect(status.stage).toBe('optimizacion');
    expect(status.strengths.length).toBeGreaterThan(0);
  });

  it('clasifica hogar vulnerable cuando no alcanza ingreso base y no hay reserva', () => {
    const status = calculateFinancialStatus({
      regularIncomeMonthly: 18000,
      annualExtraIncome: 90000,
      recurringObligationsMonthly: 25000,
      debtPaymentsMonthly: 9000,
      debtBalance: 220000,
      protectedSavings: 2000,
      operativeMoney: 3000
    });

    expect(status.status).toBe('vulnerable');
    expect(status.interpretation.toLowerCase()).toContain('estructural');
    expect(status.nextFocus).toContain('recuperar tracción');
  });

  it('agrega supuestos cuando faltan datos estructurales', () => {
    const status = calculateFinancialStatus({});

    expect(status.assumptions.length).toBeGreaterThan(0);
    expect(status.metrics.coverageRatio).toBeGreaterThanOrEqual(0);
  });
});
