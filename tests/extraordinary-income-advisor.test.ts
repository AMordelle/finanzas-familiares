import { describe, expect, it } from 'vitest';
import {
  detectExtraordinaryIncome,
  recommendExtraordinaryIncomeDistribution,
  type ExtraordinaryIncomeContext
} from '@/lib/finance/extraordinaryIncomeAdvisor';

function buildContext(overrides?: Partial<ExtraordinaryIncomeContext>): ExtraordinaryIncomeContext {
  return {
    monthlyOFH: 30000,
    availableMoney: 12000,
    financialRadar: {
      status: 'atencion',
      windowDays: 7,
      windowLabel: 'próximos 7 días',
      actionToday: 'Hoy: cubre lo esencial y evita extras.',
      actionTodayDetail: 'Detalle',
      upcoming: 'Viene colegiatura',
      riskText: 'riesgo',
      nextBestStep: 'paso',
      statusReason: 'razón',
      availableNow: 12000,
      upcomingLoad: 9000,
      nearFutureLoad: 2500,
      estimatedMargin: 3000
    },
    financialStatus: {
      status: 'ajustado',
      stage: 'estabilizacion',
      headline: 'Ajustado',
      interpretation: 'Interpretación',
      shortLine: 'Línea corta',
      strengths: ['fortaleza'],
      risks: ['riesgo'],
      nextFocus: 'enfoque',
      metrics: {
        coverageRatio: 1,
        debtPressureRatio: 0.3,
        reserveMonths: 1.2,
        extraordinaryIncomeDependency: 0.2
      },
      assumptions: []
    },
    priorityDiagnostics: [],
    ...overrides
  };
}

describe('extraordinary income advisor', () => {
  it('detecta etiqueta extraordinaria por palabras clave', () => {
    const detection = detectExtraordinaryIncome({
      label: 'Devolución SAT 2026',
      amount: 5000,
      monthlyOFH: 30000
    });

    expect(detection.detected).toBe(true);
    expect(detection.confidence).toMatch(/alta|media/);
  });

  it('genera tres escenarios con asignaciones válidas', () => {
    const recommendation = recommendExtraordinaryIncomeDistribution({
      amount: 25000,
      label: 'Aguinaldo',
      context: buildContext()
    });

    expect(recommendation.scenarios).toHaveLength(3);
    expect(recommendation.scenarios.map((scenario) => scenario.recommendationMode)).toEqual([
      'conservador',
      'balanceado',
      'agresivo'
    ]);
  });

  it('mantiene suma exacta de asignaciones contra el monto total', () => {
    const total = 33333.33;
    const recommendation = recommendExtraordinaryIncomeDistribution({
      amount: total,
      label: 'Fondo de ahorro',
      context: buildContext()
    });

    for (const scenario of recommendation.scenarios) {
      const allocationTotal = Number(scenario.allocations.reduce((acc, item) => acc + item.amount, 0).toFixed(2));
      expect(allocationTotal).toBe(total);
    }
  });

  it('modifica recomendación cuando sube la presión de deuda y baja colchón', () => {
    const healthy = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Bono importante',
      context: buildContext()
    });

    const pressured = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Bono importante',
      context: buildContext({
        financialStatus: {
          ...buildContext().financialStatus!,
          metrics: {
            ...buildContext().financialStatus!.metrics,
            debtPressureRatio: 0.45,
            reserveMonths: 0.6
          }
        },
        financialRadar: {
          ...buildContext().financialRadar!,
          status: 'presion'
        }
      })
    });

    expect(healthy.recommendedMode).toBe('balanceado');
    expect(pressured.recommendedMode).toBe('conservador');

    const healthyDebt = healthy.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'deuda')!.amount;
    const pressuredDebt = pressured.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'deuda')!.amount;

    expect(pressuredDebt).toBeGreaterThan(healthyDebt);
  });
});
