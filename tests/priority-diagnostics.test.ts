import { describe, expect, it } from 'vitest';
import { getPriorityDiagnostics } from '@/lib/finance/priorityDiagnostics';

const baseRadar = {
  status: 'atencion' as const,
  windowDays: 7,
  windowLabel: 'próximos 7 días',
  actionToday: 'Hoy: cubre lo esencial y evita extras.',
  actionTodayDetail: 'Alcanzas esta semana, pero conviene no mover reservas sin necesidad.',
  upcoming: 'En 6 días vence BBVA.',
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

describe('getPriorityDiagnostics', () => {
  it('retorna máximo 3 diagnósticos priorizados', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion', estimatedMargin: -200 },
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

  it('ordena primero lo de mayor prioridad', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion' },
      financialStatus: { ...baseStatus, status: 'vulnerable' },
      financialPressure: {
        requiredMoney: 6200,
        availableMoney: 5000,
        gap: 1200,
        status: 'critical',
        breakdown: { debts: 2000, fixedExpenses: 2500, operationalEstimate: 1700 }
      }
    });

    expect(diagnostics[0]?.level).toBe('high');
    expect(diagnostics[0]?.key).toBe('liquidez-inmediata');
  });

  it('evita duplicar mensajes equivalentes de Radar/Estado cuando es evitable', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'estable', actionToday: 'Hoy: puedes separar una parte para colchón.', estimatedMargin: 2000, nearFutureLoad: 0 },
      financialStatus: {
        ...baseStatus,
        status: 'en_transicion',
        metrics: {
          coverageRatio: 1.1,
          debtPressureRatio: 0.24,
          reserveMonths: 1.4,
          extraordinaryIncomeDependency: 0.12
        }
      },
      financialPressure: {
        requiredMoney: 3000,
        availableMoney: 6000,
        gap: -3000,
        status: 'healthy',
        breakdown: { debts: 700, fixedExpenses: 1500, operationalEstimate: 800 }
      },
      existingDiagnoses: ['Buen momento para fortalecer colchón']
    });

    expect(diagnostics.find((item) => item.key === 'ventana-ahorro')).toBeUndefined();
  });

  it('entrega salida útil para presión inmediata, debilidad estructural y oportunidad de ahorro', () => {
    const immediatePressure = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion' },
      financialStatus: { ...baseStatus, status: 'ajustado' },
      financialPressure: {
        requiredMoney: 6200,
        availableMoney: 5000,
        gap: 1200,
        status: 'critical',
        breakdown: { debts: 2000, fixedExpenses: 2500, operationalEstimate: 1700 }
      }
    });
    expect(immediatePressure.some((item) => item.key === 'liquidez-inmediata')).toBe(true);

    const structuralWeakness = getPriorityDiagnostics({
      radar: baseRadar,
      financialStatus: {
        ...baseStatus,
        status: 'vulnerable',
        shortLine: 'Hoy cuesta sostener el mes con holgura.',
        interpretation: 'Hay fragilidad en la base mensual.'
      },
      financialPressure: {
        requiredMoney: 4500,
        availableMoney: 5000,
        gap: -500,
        status: 'warning',
        breakdown: { debts: 1800, fixedExpenses: 1900, operationalEstimate: 800 }
      }
    });
    expect(structuralWeakness.some((item) => item.key === 'presion-estructural')).toBe(true);

    const saveOpportunity = getPriorityDiagnostics({
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
      }
    });

    expect(saveOpportunity.some((item) => item.key === 'ventana-ahorro')).toBe(true);
  });
});
