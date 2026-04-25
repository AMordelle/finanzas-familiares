import { describe, expect, it } from 'vitest';
import { getPriorityDiagnostics } from '@/lib/finance/priorityDiagnostics';

const baseRadar = {
  status: 'atencion' as const,
  windowDays: 7,
  windowLabel: 'próximos 7 días',
  actionToday: 'Hoy: hay margen nominal, pero conviene conservarlo porque la semana queda justa.',
  actionTodayDetail: 'Cubre lo esencial y prioriza liquidez; evita comprometer colchón o extras por ahora.',
  upcoming: 'En 6 días vence Pago TDC BBVA.',
  riskText: 'Cubres lo inmediato, pero no alcanzas el colchón de fricción recomendado.',
  nextBestStep: 'Intenta cerrar la semana con margen positivo, aunque sea pequeño.',
  statusReason: 'Hay margen táctico, pero la semana sigue ajustada frente al colchón recomendado.',
  availableNow: 5000,
  upcomingLoad: 4300,
  nearFutureLoad: 1800,
  estimatedMargin: 700,
  frictionBufferRequired: 1080,
  marginAfterFrictionBuffer: -380,
  tacticalPressureLevel: 'medium' as const,
  recommendationTone: 'prudente' as const
};

const baseStatus = {
  status: 'ajustado' as const,
  stage: 'estabilizacion' as const,
  headline: 'Estructura ajustada',
  interpretation: 'El hogar sostiene lo esencial con margen corto.',
  shortLine: 'La base se sostiene, aunque la holgura estructural sigue limitada.',
  strengths: ['El hogar sigue cubriendo obligaciones base del mes.'],
  risks: ['Falta ahorro protector suficiente para absorber un imprevisto relevante.'],
  nextFocus: 'Reducir fugas estructurales, subir ahorro protector y fortalecer ingreso base recurrente.',
  metrics: {
    coverageRatio: 1.02,
    debtPressureRatio: 0.38,
    reserveMonths: 0.5,
    extraordinaryIncomeDependency: 0.14
  },
  assumptions: []
};

const baseContext = {
  householdId: 'house-1',
  generatedAt: '2026-04-19T00:00:00.000Z',
  declared: {
    recurringIncomePlan: [],
    fixedObligations: [],
    extraordinaryEvents: [],
    goals: [],
    priorities: ['Priorizar pagos urgentes'],
    householdSettings: {
      householdName: 'Hogar Test',
      recurringPatterns: []
    }
  },
  observed: {
    accountBalances: [],
    groupedBalances: {},
    recentTransactions: [],
    recentIncome: 15000,
    recentExpenses: 16500,
    debtBalances: 19000,
    receivables: 0,
    actualCurrentLiquidity: 5000
  },
  projected: {
    upcoming7dLoad: 6100,
    nearFuture8to14dLoad: 2200,
    monthlyBaseCoverage: 1,
    debtPressureRatio: 0.42,
    reserveMonths: 0.6,
    nextHeavyWeek: '8-14d window may be heavier than current tactical window.',
    nextExtraordinaryEvent: null,
    tacticalPressure: 'high' as const,
    structuralPressure: 'high' as const,
    radar: { ...baseRadar, status: 'presion' as const, upcomingLoad: 6100, estimatedMargin: -1100, tacticalPressureLevel: 'high' as const, recommendationTone: 'contencion' as const },
    status: { ...baseStatus, status: 'vulnerable' as const },
    sharedTacticalMetrics: {
      availableNow: 5000,
      upcoming7dLoad: 6100,
      upcoming8to14dLoad: 2200,
      tacticalMargin: -1100,
      frictionBufferRequired: 1320,
      marginAfterFrictionBuffer: -2420,
      tacticalPressureLevel: 'high' as const,
      structuralPressureLevel: 'high' as const,
      recommendationTone: 'contencion' as const
    }
  },
  derived: {
    householdStage: 'estabilizacion' as const,
    tacticalStatus: 'presion' as const,
    structuralStatus: 'vulnerable' as const,
    extraordinaryIncomeDependence: 0.2,
    baseMonthlyMargin: -900,
    confidenceNotes: [],
    assumptions: []
  }
};

describe('getPriorityDiagnostics', () => {
  it('A) explica faltante de fricción aunque disponible > carga inmediata', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'atencion', upcomingLoad: 4300, estimatedMargin: 700 },
      financialStatus: baseStatus,
      financialPressure: null,
      recommendationContext: {
        ...baseContext,
        observed: { ...baseContext.observed, actualCurrentLiquidity: 5000 },
        projected: {
          ...baseContext.projected,
          upcoming7dLoad: 4300,
          nearFuture8to14dLoad: 1800,
          tacticalPressure: 'low',
          radar: { ...baseRadar },
          sharedTacticalMetrics: {
            availableNow: 5000,
            upcoming7dLoad: 4300,
            upcoming8to14dLoad: 1800,
            tacticalMargin: 700,
            frictionBufferRequired: 1080,
            marginAfterFrictionBuffer: -380,
            tacticalPressureLevel: 'medium',
            structuralPressureLevel: 'high',
            recommendationTone: 'prudente'
          }
        }
      } as any
    });

    const shortfall = diagnostics.find((item) => item.key === 'semana-corta-liquidez');
    expect(shortfall?.title).toContain('falta');
    expect(shortfall?.explanation).toContain('Carga inmediata');
    expect(shortfall?.explanation).toContain('Liquidez disponible');
    expect(shortfall?.explanation).toContain('Colchón requerido');
    expect(shortfall?.explanation).toContain('Faltante contra colchón');
  });

  it('B) cuando cubre carga + buffer no muestra faltante', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: {
        ...baseRadar,
        status: 'estable',
        estimatedMargin: 2600,
        frictionBufferRequired: 900,
        marginAfterFrictionBuffer: 1700,
        tacticalPressureLevel: 'low',
        recommendationTone: 'optimista',
        nearFutureLoad: 200
      },
      financialStatus: {
        ...baseStatus,
        status: 'en_transicion',
        metrics: {
          coverageRatio: 1.2,
          debtPressureRatio: 0.2,
          reserveMonths: 1.2,
          extraordinaryIncomeDependency: 0.1
        }
      },
      financialPressure: {
        requiredMoney: 3200,
        availableMoney: 7000,
        gap: -3800,
        status: 'healthy',
        breakdown: { debts: 500, fixedExpenses: 1700, operationalEstimate: 1000 }
      },
      recommendationContext: {
        ...baseContext,
        observed: {
          ...baseContext.observed,
          recentIncome: 16000,
          recentExpenses: 12000,
          actualCurrentLiquidity: 7000,
          debtBalances: 8000
        },
        projected: {
          ...baseContext.projected,
          tacticalPressure: 'low',
          debtPressureRatio: 0.2,
          reserveMonths: 1.2,
          radar: {
            ...baseRadar,
            status: 'estable',
            estimatedMargin: 2600,
            frictionBufferRequired: 900,
            marginAfterFrictionBuffer: 1700,
            tacticalPressureLevel: 'low',
            recommendationTone: 'optimista',
            nearFutureLoad: 200
          },
          status: {
            ...baseStatus,
            status: 'en_transicion',
            metrics: {
              coverageRatio: 1.2,
              debtPressureRatio: 0.2,
              reserveMonths: 1.2,
              extraordinaryIncomeDependency: 0.1
            }
          },
          sharedTacticalMetrics: {
            availableNow: 7000,
            upcoming7dLoad: 4400,
            upcoming8to14dLoad: 200,
            tacticalMargin: 2600,
            frictionBufferRequired: 900,
            marginAfterFrictionBuffer: 1700,
            tacticalPressureLevel: 'low',
            structuralPressureLevel: 'low',
            recommendationTone: 'optimista'
          }
        },
        derived: {
          ...baseContext.derived,
          baseMonthlyMargin: 1200
        }
      } as any
    });

    expect(diagnostics.some((item) => item.key === 'semana-corta-liquidez')).toBe(false);
  });

  it('C) con faltante táctico real prioriza faltante semanal', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion', upcomingLoad: 6100, estimatedMargin: -1100, tacticalPressureLevel: 'high', recommendationTone: 'contencion' },
      financialStatus: { ...baseStatus, status: 'vulnerable' },
      financialPressure: {
        requiredMoney: 6200,
        availableMoney: 5000,
        gap: 1200,
        status: 'critical',
        breakdown: { debts: 2000, fixedExpenses: 2500, operationalEstimate: 1700 }
      },
      recommendationContext: baseContext as any
    });

    const high = diagnostics.find((item) => item.key === 'semana-corta-liquidez');
    expect(high?.level).toBe('high');
    expect(high?.title).toContain('falta');
  });

  it('D) con carga 8-14d relevante mantiene anticipación coherente', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: null,
      financialStatus: null,
      financialPressure: null,
      recommendationContext: {
        ...baseContext,
        projected: {
          ...baseContext.projected,
          upcoming7dLoad: 4000,
          nearFuture8to14dLoad: 2400,
          tacticalPressure: 'low',
          radar: {
            ...baseRadar,
            status: 'atencion',
            upcomingLoad: 4000,
            nearFutureLoad: 2400,
            estimatedMargin: 1000,
            frictionBufferRequired: 800,
            marginAfterFrictionBuffer: 200,
            tacticalPressureLevel: 'low',
            recommendationTone: 'optimista'
          },
          sharedTacticalMetrics: {
            availableNow: 5000,
            upcoming7dLoad: 4000,
            upcoming8to14dLoad: 2400,
            tacticalMargin: 1000,
            frictionBufferRequired: 800,
            marginAfterFrictionBuffer: 200,
            tacticalPressureLevel: 'low',
            structuralPressureLevel: 'medium',
            recommendationTone: 'optimista'
          }
        },
        derived: {
          ...baseContext.derived,
          baseMonthlyMargin: 500
        }
      } as any
    });

    expect(diagnostics.some((item) => item.key === 'ola-siguiente-semana')).toBe(true);
  });
});
