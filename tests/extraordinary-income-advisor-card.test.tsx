import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ExtraordinaryIncomeAdvisorCard,
  toggleExpandedScenario
} from '@/components/analysis/extraordinary-income-advisor-card';
import type { ExtraordinaryIncomeContext } from '@/lib/finance/extraordinaryIncomeAdvisor';

const baseContext: ExtraordinaryIncomeContext = {
  monthlyOFH: 26000,
  availableMoney: 9000,
  financialRadar: {
    status: 'atencion',
    windowDays: 7,
    windowLabel: 'próximos 7 días',
    actionToday: 'Hoy: cubre lo esencial y evita extras.',
    actionTodayDetail: 'Detalle',
    upcoming: 'Viene colegiatura',
    riskText: 'Riesgo controlado',
    nextBestStep: 'Paso',
    statusReason: 'Razón',
    availableNow: 9000,
    upcomingLoad: 7000,
    nearFutureLoad: 2400,
    estimatedMargin: 2000
  },
  financialStatus: {
    status: 'en_transicion',
    stage: 'estabilizacion',
    headline: 'En transición',
    interpretation: 'Hay avance',
    shortLine: 'Cuidar margen',
    strengths: ['Orden base'],
    risks: ['Ajustes pendientes'],
    nextFocus: 'Consolidar',
    metrics: {
      coverageRatio: 1.1,
      debtPressureRatio: 0.32,
      reserveMonths: 1.1,
      extraordinaryIncomeDependency: 0.2
    },
    assumptions: []
  },
  priorityDiagnostics: []
};

describe('extraordinary income advisor card', () => {
  it('muestra escenarios colapsados por defecto', () => {
    const html = renderToStaticMarkup(
      <ExtraordinaryIncomeAdvisorCard
        context={baseContext}
        suggestedAmount={15000}
      />
    );

    expect(html).toContain('Conservador');
    expect(html).toContain('Balanceado');
    expect(html).toContain('Agresivo');
    expect(html).not.toContain('Siguiente paso:');
    expect(html).toContain('Ver detalle');
  });

  it('permite cambiar estado expandido por demanda (comportamiento acordeón)', () => {
    expect(toggleExpandedScenario(null, 'conservador')).toBe('conservador');
    expect(toggleExpandedScenario('conservador', 'agresivo')).toBe('agresivo');
    expect(toggleExpandedScenario('agresivo', 'agresivo')).toBe(null);
  });

  it('muestra razones, alertas y siguiente paso cuando hay escenario expandido', () => {
    const pressuredContext: ExtraordinaryIncomeContext = {
      ...baseContext,
      financialRadar: {
        ...baseContext.financialRadar!,
        status: 'presion'
      },
      financialStatus: {
        ...baseContext.financialStatus!,
        metrics: {
          ...baseContext.financialStatus!.metrics,
          debtPressureRatio: 0.45,
          reserveMonths: 0.5
        }
      }
    };

    const html = renderToStaticMarkup(
      <ExtraordinaryIncomeAdvisorCard
        context={pressuredContext}
        suggestedAmount={22000}
        initialExpandedMode="conservador"
      />
    );

    expect(html).toContain('Siguiente paso:');
    expect(html).toContain('Liquidez:');
    expect(html).toContain('El colchón actual sigue bajo');
  });

  it('mantiene visible el badge de recomendado', () => {
    const html = renderToStaticMarkup(
      <ExtraordinaryIncomeAdvisorCard
        context={baseContext}
        suggestedAmount={18000}
      />
    );

    expect(html).toContain('Recomendado:');
    expect(html).toContain('Sugerido');
  });
});
