import { describe, expect, it } from 'vitest';
import { getPriorityDiagnostics } from '@/lib/finance/priorityDiagnostics';

const baseRadar = {
  status: 'atencion' as const,
  windowDays: 7,
  windowLabel: 'próximos 7 días',
  actionToday: 'Hoy: cubre lo esencial y evita extras.',
  actionTodayDetail: 'Alcanzas esta semana, pero conviene no mover reservas sin necesidad.',
  upcoming: 'En 6 días vence Pago TDC BBVA.',
  riskText: 'Cubres lo inmediato, pero con poco margen.',
  nextBestStep: 'Intenta cerrar la semana con margen positivo, aunque sea pequeño.',
  statusReason: 'Cubres el periodo, pero con poco margen.',
  availableNow: 5000,
  upcomingLoad: 4300,
  nearFutureLoad: 1800,
  estimatedMargin: 700
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
    reconciledObligations: [],
    radar: { ...baseRadar, status: 'presion' as const, upcomingLoad: 6100, estimatedMargin: -1100 },
    status: { ...baseStatus, status: 'vulnerable' as const }
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
  it('retorna máximo 3 diagnósticos priorizados', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion', estimatedMargin: -600 },
      financialStatus: { ...baseStatus, status: 'vulnerable' },
      financialPressure: {
        requiredMoney: 6200,
        availableMoney: 5000,
        gap: 1200,
        status: 'critical',
        breakdown: { debts: 2000, fixedExpenses: 2500, operationalEstimate: 1700 }
      }
    });

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.length).toBeLessThanOrEqual(3);
  });

  it('prioriza señales urgentes usando shared context', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: null,
      financialStatus: null,
      financialPressure: {
        requiredMoney: 6200,
        availableMoney: 5000,
        gap: 1200,
        status: 'critical',
        breakdown: { debts: 2000, fixedExpenses: 2500, operationalEstimate: 1700 }
      },
      recommendationContext: baseContext as any
    });

    expect(diagnostics[0]?.key).toBe('obligacion-inminente');
    expect(diagnostics.some((item) => item.key === 'semana-corta-liquidez')).toBe(true);
  });

  it('detecta presión de deuda con ratio derivado del contexto compartido', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: null,
      financialStatus: null,
      financialPressure: null,
      recommendationContext: baseContext as any
    });

    expect(diagnostics.some((item) => item.key === 'deuda-recorta-margen')).toBe(true);
  });

  it('mantiene oportunidad de ahorro útil cuando la semana está estable', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: {
        ...baseRadar,
        status: 'estable',
        estimatedMargin: 2400,
        nearFutureLoad: 200,
        actionToday: 'Hoy: mantén orden semanal y evita extras.'
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
            estimatedMargin: 2400,
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
          }
        },
        derived: {
          ...baseContext.derived,
          baseMonthlyMargin: 1200
        }
      } as any
    });

    const saveWindow = diagnostics.find((item) => item.key === 'ventana-ahorro');
    expect(saveWindow?.title).toContain('$');
    expect(saveWindow?.title).toContain('.00');
    expect(saveWindow?.action).toContain('fondo');
  });

  it('incluye ola de carga cuando Radar/contexto indican siguiente semana pesada', () => {
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
          tacticalPressure: 'medium',
          radar: {
            ...baseRadar,
            status: 'atencion',
            upcomingLoad: 4000,
            nearFutureLoad: 2400,
            estimatedMargin: 1000
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

  it('deja de marcar urgencia cuando la obligación ya quedó cubierta', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, upcoming: 'En 0 días vence Pago TDC BBVA.' },
      financialStatus: { ...baseStatus },
      financialPressure: null,
      recommendationContext: {
        ...baseContext,
        projected: {
          ...baseContext.projected,
          tacticalPressure: 'medium',
          reconciledObligations: [
            {
              name: 'Pago TDC BBVA',
              dueDay: 19,
              dueDate: '2026-04-19T12:00:00.000Z',
              expectedAmount: 2000,
              paidAmount: 2000,
              remainingAmount: 0,
              status: 'paid',
              matchedPaymentCount: 1
            }
          ]
        }
      } as any
    });

    expect(diagnostics.some((item) => item.key === 'obligacion-inminente')).toBe(false);
    expect(diagnostics.some((item) => item.key === 'obligacion-cubierta')).toBe(true);
  });
});
