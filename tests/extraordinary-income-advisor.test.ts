import { describe, expect, it } from 'vitest';
import {
  detectExtraordinaryIncome,
  recommendExtraordinaryIncomeDistribution,
  type ExtraordinaryIncomeContext
} from '@/lib/finance/extraordinaryIncomeAdvisor';
import type { HouseholdRecommendationContext } from '@/lib/finance/recommendationContext';

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

function buildRecommendationContext(overrides?: Partial<HouseholdRecommendationContext>): HouseholdRecommendationContext {
  return {
    householdId: 'home-1',
    generatedAt: '2026-04-19T00:00:00.000Z',
    declared: {
      recurringIncomePlan: [{ name: 'Sueldo', monthlyAmount: 52000, recurring: true }],
      fixedObligations: [{ name: 'Hipoteca', amount: 19000, dueDay: 5 }],
      extraordinaryEvents: [{ label: 'Colegiatura', amount: 8000, eventDate: '2026-05-01T00:00:00.000Z' }],
      goals: [{ name: 'Fondo casa', targetAmount: 120000, savedAmount: 30000, targetDate: '2027-01-01T00:00:00.000Z' }],
      priorities: ['Orden de liquidez'],
      householdSettings: {
        householdName: 'Hogar',
        recurringPatterns: ['quincenal']
      }
    },
    observed: {
      accountBalances: [{ name: 'Débito', type: 'checking', balance: 18000 }],
      groupedBalances: { checking: 18000 },
      recentTransactions: [],
      recentIncome: 52000,
      recentExpenses: 43000,
      debtBalances: 89000,
      receivables: 0,
      actualCurrentLiquidity: 18000
    },
    projected: {
      upcoming7dLoad: 9000,
      nearFuture8to14dLoad: 6000,
      monthlyBaseCoverage: 1.2,
      debtPressureRatio: 0.32,
      reserveMonths: 1.2,
      nextHeavyWeek: null,
      nextExtraordinaryEvent: null,
      tacticalPressure: 'medium',
      structuralPressure: 'medium',
      reconciledObligations: [],
      radar: buildContext().financialRadar!,
      status: buildContext().financialStatus!
    },
    derived: {
      householdStage: 'estabilizacion',
      tacticalStatus: 'atencion',
      structuralStatus: 'ajustado',
      extraordinaryIncomeDependence: 0.2,
      baseMonthlyMargin: 3000,
      confidenceNotes: [],
      assumptions: []
    },
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


  it('nunca deja el bucket libre en negativo', () => {
    const recommendation = recommendExtraordinaryIncomeDistribution({
      amount: 12000,
      label: 'Bono extraordinario',
      context: buildContext({
        financialStatus: {
          ...buildContext().financialStatus!,
          metrics: {
            ...buildContext().financialStatus!.metrics,
            debtPressureRatio: 0.6,
            reserveMonths: 0.2
          }
        },
        financialRadar: {
          ...buildContext().financialRadar!,
          status: 'presion'
        }
      })
    });

    for (const scenario of recommendation.scenarios) {
      const libre = scenario.allocations.find((item) => item.bucket === 'libre')!.amount;
      expect(libre).toBeGreaterThanOrEqual(0);
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

  it('sube liquidez cuando la presión táctica es alta en contexto compartido', () => {
    const medium = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Utilidades',
      context: buildContext({ recommendationContext: buildRecommendationContext() })
    });
    const high = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Utilidades',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: {
            ...buildRecommendationContext().projected,
            tacticalPressure: 'high',
            upcoming7dLoad: 17000,
            nearFuture8to14dLoad: 8000
          }
        })
      })
    });

    const baseLiquidity = medium.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'liquidez')!.amount;
    const stressedLiquidity = high.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'liquidez')!.amount;

    expect(stressedLiquidity).toBeGreaterThan(baseLiquidity);
  });

  it('sube deuda cuando la presión de deuda es alta en contexto compartido', () => {
    const base = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Bono',
      context: buildContext({ recommendationContext: buildRecommendationContext() })
    });
    const highDebt = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Bono',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: {
            ...buildRecommendationContext().projected,
            debtPressureRatio: 0.48
          }
        })
      })
    });

    const baseDebt = base.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'deuda')!.amount;
    const stressedDebt = highDebt.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'deuda')!.amount;
    expect(stressedDebt).toBeGreaterThan(baseDebt);
  });

  it('sube colchón cuando la reserva es débil en contexto compartido', () => {
    const healthyReserve = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Bono',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: { ...buildRecommendationContext().projected, reserveMonths: 1.4 }
        })
      })
    });
    const weakReserve = recommendExtraordinaryIncomeDistribution({
      amount: 20000,
      label: 'Bono',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: { ...buildRecommendationContext().projected, reserveMonths: 0.4 }
        })
      })
    });

    const healthyCushion = healthyReserve.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'colchon')!.amount;
    const weakCushion = weakReserve.scenarios.find((item) => item.recommendationMode === 'balanceado')!
      .allocations.find((item) => item.bucket === 'colchon')!.amount;
    expect(weakCushion).toBeGreaterThan(healthyCushion);
  });

  it('permite más flexibilidad en hogar estable con metas activas', () => {
    const tighter = recommendExtraordinaryIncomeDistribution({
      amount: 18000,
      label: 'Venta extraordinaria',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: { ...buildRecommendationContext().projected, tacticalPressure: 'medium' }
        })
      })
    });

    const stable = recommendExtraordinaryIncomeDistribution({
      amount: 18000,
      label: 'Venta extraordinaria',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: { ...buildRecommendationContext().projected, tacticalPressure: 'low', reserveMonths: 2.8 },
          derived: { ...buildRecommendationContext().derived, householdStage: 'fortalecimiento' }
        })
      })
    });

    const tightFree = tighter.scenarios.find((item) => item.recommendationMode === 'agresivo')!
      .allocations.find((item) => item.bucket === 'libre')!.amount;
    const stableFree = stable.scenarios.find((item) => item.recommendationMode === 'agresivo')!
      .allocations.find((item) => item.bucket === 'libre')!.amount;
    expect(stableFree).toBeGreaterThan(tightFree);
    expect(stable.recommendedMode).toBe('agresivo');
  });

  it('cambia escenario recomendado según contexto compartido', () => {
    const conservative = recommendExtraordinaryIncomeDistribution({
      amount: 22000,
      label: 'Aguinaldo',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: {
            ...buildRecommendationContext().projected,
            tacticalPressure: 'high',
            reserveMonths: 0.6
          }
        })
      })
    });

    const aggressive = recommendExtraordinaryIncomeDistribution({
      amount: 22000,
      label: 'Aguinaldo',
      context: buildContext({
        recommendationContext: buildRecommendationContext({
          projected: {
            ...buildRecommendationContext().projected,
            tacticalPressure: 'low',
            reserveMonths: 2.5,
            debtPressureRatio: 0.45
          },
          derived: { ...buildRecommendationContext().derived, householdStage: 'fortalecimiento' }
        })
      })
    });

    expect(conservative.recommendedMode).toBe('conservador');
    expect(aggressive.recommendedMode).toBe('agresivo');
  });

  it('usa fallback estable cuando no hay contexto compartido', () => {
    const noSharedContext = recommendExtraordinaryIncomeDistribution({
      amount: 21000,
      label: 'Aguinaldo',
      context: buildContext({
        recommendationContext: null,
        financialRadar: {
          ...buildContext().financialRadar!,
          status: 'presion'
        },
        financialStatus: {
          ...buildContext().financialStatus!,
          metrics: {
            ...buildContext().financialStatus!.metrics,
            reserveMonths: 0.5
          }
        }
      })
    });

    expect(noSharedContext.recommendedMode).toBe('conservador');
    expect(noSharedContext.summary).not.toContain('Basamos la sugerencia en contexto real del hogar.');
  });
});
