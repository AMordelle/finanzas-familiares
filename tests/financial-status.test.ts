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
    expect(status.shortLine.toLowerCase()).toContain('firme');
    expect(status.risks.length).toBeLessThanOrEqual(2);
  });

  it('alinea contenido en estado vulnerable con fortalezas realistas y riesgos dominantes', () => {
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
    expect(status.interpretation.toLowerCase()).toContain('fragilidad');
    expect(status.strengths.length).toBeLessThanOrEqual(2);
    expect(status.risks.length).toBeGreaterThanOrEqual(status.strengths.length);
    expect(status.nextFocus.toLowerCase()).toContain('colchón protector');
  });

  it('marca dependencia de ingresos extraordinarios cuando sostienen el equilibrio', () => {
    const status = calculateFinancialStatus({
      regularIncomeMonthly: 25000,
      annualExtraIncome: 180000,
      recurringObligationsMonthly: 26000,
      debtPaymentsMonthly: 6000,
      debtBalance: 120000,
      protectedSavings: 18000,
      operativeMoney: 9000
    });

    expect(status.metrics.extraordinaryIncomeDependency).toBeGreaterThanOrEqual(0.25);
    expect(status.risks.join(' ')).toContain('ingresos no recurrentes');
  });

  it('entrega riesgos y enfoque con lenguaje estructural accionable', () => {
    const status = calculateFinancialStatus({
      regularIncomeMonthly: 29000,
      annualExtraIncome: 30000,
      recurringObligationsMonthly: 28000,
      debtPaymentsMonthly: 12000,
      debtBalance: 260000,
      protectedSavings: 7000,
      operativeMoney: 7000
    });

    expect(status.risks.join(' ')).toMatch(/deuda|ahorro protector|imprevisto|ingresos no recurrentes/i);
    expect(status.nextFocus).toMatch(/margen mensual|colchón protector|ingreso base recurrente|fugas estructurales/i);
  });

  it('agrega supuestos cuando faltan datos estructurales', () => {
    const status = calculateFinancialStatus({});

    expect(status.assumptions.length).toBeGreaterThan(0);
    expect(status.metrics.coverageRatio).toBeGreaterThanOrEqual(0);
  });
});
