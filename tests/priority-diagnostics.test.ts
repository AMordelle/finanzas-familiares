import { describe, expect, it } from 'vitest';
import { getPriorityDiagnostics } from '@/lib/finance/priorityDiagnostics';

const baseRadar = {
  status: 'atencion' as const,
  headline: 'Semana sensible',
  whatToDoToday: 'Prioriza pagos urgentes esta semana.',
  whyItMatters: 'La carga inmediata consume casi toda la liquidez.',
  whatIsComing: 'En 6 días vence Pago TDC BBVA.',
  nextBestAction: 'Reordena pagos y evita extras.',
  metrics: {
    availableNow: 5000,
    upcoming7dLoad: 4300,
    nearFuture8to14dLoad: 1800,
    estimatedMargin: 700,
    frictionBufferRequired: 1080,
    marginAfterFrictionBuffer: -380,
    tacticalPressureLevel: 'medium' as const,
    recommendationTone: 'prudente' as const
  },
  breakdowns: {
    upcoming7dLoad: [
      { label: 'Pago TDC BBVA', amount: 2200, category: 'deuda' as const, dueInDays: 6 },
      { label: 'Renta', amount: 2100, category: 'gasto_fijo' as const, dueInDays: 3 }
    ],
    suggestedActionBasis: 'Existe pago inmediato y colchón incompleto.',
    frictionGap: {
      formula: '(colchón recomendado + carga inmediata) - liquidez disponible',
      buffer: 1080,
      immediateLoad: 4300,
      availableLiquidity: 5000,
      gap: 380
    }
  },
  windowDays: 7,
  windowLabel: 'próximos 7 días',
  actionToday: 'Hoy: prioriza pagos urgentes esta semana.',
  actionTodayDetail: 'Cubre lo esencial y prioriza liquidez.',
  upcoming: 'En 6 días vence Pago TDC BBVA.',
  riskText: 'Cubres lo inmediato, pero no alcanzas el colchón de fricción recomendado.',
  nextBestStep: 'Cierra la semana con margen positivo.',
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
    accountBalances: [
      { name: 'TDC MPAGO', type: 'credit_card', balance: 14000 },
      { name: 'Préstamo auto', type: 'loan', balance: 11000 }
    ],
    groupedBalances: {},
    recentTransactions: [],
    recentIncome: 15000,
    recentExpenses: 16500,
    debtBalances: 25000,
    receivables: 0,
    actualCurrentLiquidity: 5000
  },
  projected: {
    upcoming7dLoad: 6100,
    nearFuture8to14dLoad: 2200,
    monthlyBaseCoverage: 1,
    debtPressureRatio: 0.42,
    reserveMonths: 0,
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
  it('A) explica faltante con evidencia estructurada', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar },
      financialStatus: baseStatus,
      financialPressure: null,
      recommendationContext: {
        ...baseContext,
        projected: {
          ...baseContext.projected,
          upcoming7dLoad: 4300,
          nearFuture8to14dLoad: 1800,
          tacticalPressure: 'low',
          radar: { ...baseRadar }
        }
      } as any
    });

    const shortfall = diagnostics.find((item) => item.key === 'semana-corta-liquidez');
    expect(shortfall?.explanation).toContain('colchón recomendado + carga inmediata');
    expect(shortfall?.evidence.length).toBeGreaterThan(0);
    expect(shortfall?.recommendedAction).toBeTruthy();
  });

  it('B) si no hay reservas, el copy no menciona reservas', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion' as const, upcomingLoad: 6100, estimatedMargin: -1100, tacticalPressureLevel: 'high' as const },
      financialStatus: { ...baseStatus, status: 'vulnerable' as const, metrics: { ...baseStatus.metrics, reserveMonths: 0 } },
      financialPressure: null,
      recommendationContext: baseContext as any
    });

    expect(diagnostics.map((d) => `${d.title} ${d.explanation} ${d.recommendedAction}`).join(' ').toLowerCase()).not.toContain('sin tocar reservas');
  });

  it('C) si recomienda deuda cara, nombra una deuda concreta', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion' as const, upcomingLoad: 6100, estimatedMargin: -1100, tacticalPressureLevel: 'high' as const },
      financialStatus: { ...baseStatus, status: 'vulnerable' as const, metrics: { ...baseStatus.metrics, debtPressureRatio: 0.45 } },
      financialPressure: null,
      recommendationContext: baseContext as any
    });

    const debt = diagnostics.find((item) => item.key === 'deuda-recorta-margen');
    expect(debt?.recommendedAction).toContain('Prioriza');
    expect(debt?.recommendedAction).toContain('TDC MPAGO');
  });

  it('D) si hay siguiente evento de carga, lo mantiene explícito', () => {
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
