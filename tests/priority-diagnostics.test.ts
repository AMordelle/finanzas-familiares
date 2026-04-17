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

  it('prioriza obligación inminente con nombre cuando existe', () => {
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

    expect(diagnostics[0]?.key).toBe('obligacion-inminente');
    expect(diagnostics[0]?.title).toContain('Pago TDC BBVA');
    expect(diagnostics[0]?.title).toContain('En 6 días');
  });

  it('usa títulos concretos y evita frases abstractas previas', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, status: 'presion', estimatedMargin: -400 },
      financialStatus: { ...baseStatus, status: 'vulnerable' },
      financialPressure: {
        requiredMoney: 6200,
        availableMoney: 5000,
        gap: 1200,
        status: 'critical',
        breakdown: { debts: 2000, fixedExpenses: 2500, operationalEstimate: 1700 }
      }
    });

    const titles = diagnostics.map((item) => item.title).join(' | ');
    expect(titles).not.toContain('La liquidez inmediata está bajo presión');
    expect(titles).not.toContain('La presión principal sigue siendo estructural');
    expect(titles).not.toContain('La deuda está consumiendo demasiado margen');
  });

  it('entrega diagnóstico más específico que el wording del Radar', () => {
    const diagnostics = getPriorityDiagnostics({
      radar: { ...baseRadar, actionToday: 'Hoy: enfócate en cubrir lo inmediato.', status: 'presion', estimatedMargin: -300 },
      financialStatus: { ...baseStatus, status: 'ajustado' },
      financialPressure: {
        requiredMoney: 6200,
        availableMoney: 5000,
        gap: 1200,
        status: 'critical',
        breakdown: { debts: 2000, fixedExpenses: 2500, operationalEstimate: 1700 }
      }
    });

    expect(diagnostics.some((item) => item.title.includes('Pago TDC BBVA'))).toBe(true);
    expect(diagnostics.some((item) => item.explanation.includes('$'))).toBe(true);
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
      }
    });

    const saveWindow = diagnostics.find((item) => item.key === 'ventana-ahorro');
    expect(saveWindow?.title).toContain('$');
    expect(saveWindow?.action).toContain('fondo');
  });
});
