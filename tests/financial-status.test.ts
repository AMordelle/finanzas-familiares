import { describe, expect, it } from 'vitest';
import {
  calculateFinancialStatus,
  calculateFinancialStatusFromRecommendationContext,
  type FinancialStatusRecommendationSignals
} from '@/lib/finance/financialStatus';

function buildRecommendationSignals(overrides?: Partial<FinancialStatusRecommendationSignals>): FinancialStatusRecommendationSignals {
  return {
    declared: {
      recurringIncomePlan: [{ monthlyAmount: 52000, recurring: true }],
      fixedObligations: [{ amount: 32000 }],
      ...overrides?.declared
    },
    observed: {
      debtBalances: 90000,
      actualCurrentLiquidity: 20000,
      ...overrides?.observed
    },
    projected: {
      monthlyBaseCoverage: 1.2,
      debtPressureRatio: 0.14,
      reserveMonths: 2.4,
      ...overrides?.projected
    },
    derived: {
      extraordinaryIncomeDependence: 0.08,
      baseMonthlyMargin: 13000,
      confidenceNotes: [],
      assumptions: [],
      ...overrides?.derived
    }
  };
}

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

  it('usa señales del recommendation context para interpretación estructural coherente', () => {
    const status = calculateFinancialStatusFromRecommendationContext(buildRecommendationSignals());

    expect(status.status).toBe('solido');
    expect(status.metrics.coverageRatio).toBe(1.2);
    expect(status.metrics.reserveMonths).toBe(2.4);
    expect(status.metrics.debtPressureRatio).toBe(0.14);
  });

  it('distingue casos vulnerable/ajustado/solido usando señales compartidas', () => {
    const vulnerable = calculateFinancialStatusFromRecommendationContext(
      buildRecommendationSignals({
        projected: { monthlyBaseCoverage: 0.82, debtPressureRatio: 0.44, reserveMonths: 0.2 },
        derived: { extraordinaryIncomeDependence: 0.32, baseMonthlyMargin: -9500, confidenceNotes: [], assumptions: [] }
      })
    );

    const adjusted = calculateFinancialStatusFromRecommendationContext(
      buildRecommendationSignals({
        projected: { monthlyBaseCoverage: 0.98, debtPressureRatio: 0.3, reserveMonths: 0.65 },
        derived: { extraordinaryIncomeDependence: 0.22, baseMonthlyMargin: -1200, confidenceNotes: [], assumptions: [] }
      })
    );

    const strong = calculateFinancialStatusFromRecommendationContext(buildRecommendationSignals());

    expect(vulnerable.status).toBe('vulnerable');
    expect(adjusted.status).toBe('ajustado');
    expect(strong.status).toBe('solido');
  });

  it('marca dependencia de ingresos extraordinarios cuando context la reporta alta', () => {
    const status = calculateFinancialStatusFromRecommendationContext(
      buildRecommendationSignals({
        derived: { extraordinaryIncomeDependence: 0.38, baseMonthlyMargin: -1800, confidenceNotes: [], assumptions: [] }
      })
    );

    expect(status.metrics.extraordinaryIncomeDependency).toBeGreaterThanOrEqual(0.25);
    expect(status.risks.join(' ')).toContain('ingresos no recurrentes');
  });

  it('refleja debilidad de colchón y presión de deuda en la lectura estructural', () => {
    const status = calculateFinancialStatusFromRecommendationContext(
      buildRecommendationSignals({
        projected: { monthlyBaseCoverage: 0.92, debtPressureRatio: 0.41, reserveMonths: 0.3 },
        derived: { extraordinaryIncomeDependence: 0.1, baseMonthlyMargin: -6000, confidenceNotes: [], assumptions: [] }
      })
    );

    expect(status.status).toBe('vulnerable');
    expect(status.risks.join(' ')).toMatch(/deuda|ahorro protector|imprevisto/i);
  });

  it('agrega supuestos y notas cuando faltan datos del contexto compartido', () => {
    const status = calculateFinancialStatusFromRecommendationContext(
      buildRecommendationSignals({
        declared: { recurringIncomePlan: [], fixedObligations: [] },
        observed: { debtBalances: 0, actualCurrentLiquidity: 0 },
        projected: { monthlyBaseCoverage: 0, debtPressureRatio: 0, reserveMonths: 0 },
        derived: {
          extraordinaryIncomeDependence: 0,
          baseMonthlyMargin: 0,
          confidenceNotes: ['Observed behavior lacks recent transaction history.'],
          assumptions: ['No recurring income sources found; recurring income assumed as 0.']
        }
      })
    );

    expect(status.assumptions).toContain('No recurring income sources found; recurring income assumed as 0.');
    expect(status.assumptions).toContain('Observed behavior lacks recent transaction history.');
    expect(status.metrics.coverageRatio).toBe(0);
  });

  it('mantiene fallback legacy y agrega supuestos cuando faltan datos estructurales', () => {
    const status = calculateFinancialStatus({});

    expect(status.assumptions.length).toBeGreaterThan(0);
    expect(status.metrics.coverageRatio).toBeGreaterThanOrEqual(0);
  });
});
