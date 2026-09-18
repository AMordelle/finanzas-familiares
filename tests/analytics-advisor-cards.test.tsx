import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalyticsAdvisorCards, toggleAnalyticsCard } from '@/components/dashboard/analytics-advisor-cards';

const radar = {
  status: 'atencion' as const,
  headline: 'Semana sensible: cubres carga, pero sin colchón suficiente',
  whatToDoToday: 'Prioriza y deja fondeado Pago TDC BBVA en 6 días.',
  whyItMatters: 'Cubres lo inmediato, pero aún falta colchón para operar sin fricción.',
  whatIsComing: 'En 6 días vence Pago TDC BBVA.',
  nextBestAction: 'Cubre primero obligaciones de esta semana y posterga gastos movibles.',
  metrics: {
    availableNow: 5000,
    upcoming7dLoad: 4200,
    nearFuture8to14dLoad: 1300,
    estimatedMargin: 800,
    frictionBufferRequired: 900,
    marginAfterFrictionBuffer: -100,
    tacticalPressureLevel: 'medium' as const,
    recommendationTone: 'prudente' as const
  },
  breakdowns: {
    upcoming7dLoad: [
      { label: 'Pago TDC BBVA', amount: 2500, category: 'deuda' as const },
      { label: 'Renta', amount: 1700, category: 'gasto_fijo' as const }
    ],
    suggestedActionBasis: 'Existe un pago inmediato y el colchón no está completo.',
    frictionGap: {
      formula: '(colchón recomendado + carga inmediata) - liquidez disponible',
      buffer: 900,
      immediateLoad: 4200,
      availableLiquidity: 5000,
      gap: 100
    }
  },
  windowDays: 7,
  windowLabel: 'próximos 7 días',
  actionToday: 'Hoy: evita gastos extra y cuida liquidez.',
  actionTodayDetail: 'Mantén solo gastos esenciales hasta pasar esta ventana corta.',
  upcoming: 'En 6 días vence Pago TDC BBVA.',
  riskText: 'Riesgo medio: cualquier gasto no planeado te aprieta.',
  nextBestStep: 'Reordena pagos de los próximos 7 días y recorta variable.',
  statusReason: 'Sí cubres la carga, pero con poco margen de seguridad.',
  availableNow: 5000,
  upcomingLoad: 4200,
  nearFutureLoad: 1300,
  estimatedMargin: 800,
  frictionBufferRequired: 900,
  marginAfterFrictionBuffer: -100,
  tacticalPressureLevel: 'medium' as const,
  recommendationTone: 'prudente' as const
};

const pressure = {
  requiredMoney: 4200,
  availableMoney: 5000,
  gap: -800,
  status: 'warning' as const,
  breakdown: {
    debts: 1200,
    fixedExpenses: 1800,
    operationalEstimate: 1200
  }
};

const priorityDiagnostics = [
  {
    key: 'obligacion-inminente',
    level: 'high' as const,
    priority: 'alta' as const,
    title: 'En 6 días vence Pago TDC BBVA y esta semana queda justa',
    explanation: 'La carga de esta ventana deja poco margen frente al disponible.',
    evidence: [{ label: 'Carga 7 días', value: '$4,200.00' }],
    recommendedAction: 'Congela extras y deja ese pago separado.',
    sourceMetrics: { upcoming7dLoad: 4200 }
  },
  {
    key: 'deuda-recorta-margen',
    level: 'medium' as const,
    priority: 'media' as const,
    title: 'Hoy 38% del ingreso base se va en deuda',
    explanation: 'Ese peso fijo recorta la maniobra mensual.',
    evidence: [{ label: 'Deuda priorizada', value: 'TDC MPAGO ($14,000.00)' }],
    recommendedAction: 'Prioriza TDC MPAGO: alto costo potencial por saldo relevante.',
    sourceMetrics: { debtPressureRatio: 0.38 }
  },
  {
    key: 'ventana-ahorro',
    level: 'low' as const,
    priority: 'baja' as const,
    title: 'Esta semana te deja $2,400 de margen aprovechable',
    explanation: 'Puedes convertir parte de ese margen en colchón real.',
    evidence: [{ label: 'Margen semanal estimado', value: '$2,400.00' }],
    recommendedAction: 'Aparta hoy una cantidad concreta al fondo.',
    sourceMetrics: { estimatedMargin: 2400 }
  }
];

describe('AnalyticsAdvisorCards', () => {
  it('renderiza dashboard táctico sin card estructural expandida y con resumen ejecutivo', () => {
    const html = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} priorityDiagnostics={priorityDiagnostics} />
    );

    expect(html).toContain('Radar Financiero');
    expect(html).toContain('Diagnósticos prioritarios');
    expect(html).toContain('Carga próximos 7 días:</span> $4,200.00');
    expect(html).not.toContain('Esta semana te deja $2,400 de margen aprovechable');
  });

  it('expande solo la card seleccionada de radar o diagnósticos', () => {
    const diagnosticosExpanded = renderToStaticMarkup(
      <AnalyticsAdvisorCards
        radar={radar}
        financialPressure={pressure}
        priorityDiagnostics={priorityDiagnostics}
        initialOpenCard="diagnosticos"
      />
    );

    expect(diagnosticosExpanded).toContain('Siguiente paso:');
    expect(diagnosticosExpanded).toContain('Esta semana te deja $2,400 de margen aprovechable');
    expect(diagnosticosExpanded).not.toContain('Qué hacer hoy:');

    const radarExpanded = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} priorityDiagnostics={priorityDiagnostics} initialOpenCard="radar" />
    );
    expect(radarExpanded).toContain('Qué hacer hoy:');
    expect(radarExpanded).toContain('Ver detalle');
    expect(radarExpanded).not.toContain('Estado general');
  });

  it('aplica comportamiento accordion en helper de estado', () => {
    expect(toggleAnalyticsCard(null, 'radar')).toBe('radar');
    expect(toggleAnalyticsCard('radar', 'diagnosticos')).toBe('diagnosticos');
    expect(toggleAnalyticsCard('diagnosticos', 'diagnosticos')).toBeNull();
  });
});
