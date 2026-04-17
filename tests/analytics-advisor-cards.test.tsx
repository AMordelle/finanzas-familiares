import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalyticsAdvisorCards, toggleAnalyticsCard } from '@/components/dashboard/analytics-advisor-cards';

const radar = {
  status: 'atencion' as const,
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
  estimatedMargin: 800
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

const financialStatus = {
  status: 'ajustado' as const,
  stage: 'estabilizacion' as const,
  headline: 'Estructura ajustada',
  interpretation: 'Tu hogar cubre lo esencial, pero aún depende de maniobras para respirar con holgura.',
  shortLine: 'La base alcanza, aunque la holgura sigue siendo limitada.',
  strengths: ['El ingreso base sí cubre lo esencial del mes.'],
  risks: ['El ahorro protegido todavía no alcanza para blindar el mes.'],
  nextFocus: 'Tu siguiente enfoque debe ser convertir deuda en margen.',
  metrics: {
    coverageRatio: 1.02,
    debtPressureRatio: 0.31,
    reserveMonths: 0.6,
    extraordinaryIncomeDependency: 0.12
  },
  assumptions: []
};

const priorityDiagnostics = [
  {
    key: 'obligacion-inminente',
    level: 'high' as const,
    title: 'En 6 días vence Pago TDC BBVA y esta semana queda justa',
    explanation: 'La carga de esta ventana deja poco margen frente al disponible.',
    action: 'Congela extras y deja ese pago separado.'
  },
  {
    key: 'deuda-recorta-margen',
    level: 'medium' as const,
    title: 'Hoy 38% del ingreso base se va en deuda',
    explanation: 'Ese peso fijo recorta la maniobra mensual.',
    action: 'Renegocia una cuota para recuperar flujo.'
  },
  {
    key: 'ventana-ahorro',
    level: 'low' as const,
    title: 'Esta semana te deja $2,400 de margen aprovechable',
    explanation: 'Puedes convertir parte de ese margen en colchón real.',
    action: 'Aparta hoy una cantidad concreta al fondo.'
  }
];

describe('AnalyticsAdvisorCards', () => {
  it('renderiza cards compactas incluyendo diagnósticos prioritarios colapsados', () => {
    const html = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} priorityDiagnostics={priorityDiagnostics} />
    );

    expect(html).toContain('Radar Financiero');
    expect(html).toContain('Estado financiero actual');
    expect(html).toContain('Diagnósticos prioritarios');
    expect((html.match(/min-h-\[148px\]/g) ?? []).length).toBe(3);
    expect(html).toContain('En 6 días vence Pago TDC BBVA');
    expect(html).toContain('Hoy 38% del ingreso base se va en deuda');
    expect(html).not.toContain('Esta semana te deja $2,400 de margen aprovechable');
    expect(html).not.toContain('Interpretación general:');
    expect(html).not.toContain('Siguiente paso:');
  });

  it('expande solo la card seleccionada, incluyendo diagnósticos', () => {
    const diagnosticosExpanded = renderToStaticMarkup(
      <AnalyticsAdvisorCards
        radar={radar}
        financialPressure={pressure}
        financialStatus={financialStatus}
        priorityDiagnostics={priorityDiagnostics}
        initialOpenCard="diagnosticos"
      />
    );

    expect(diagnosticosExpanded).toContain('Siguiente paso:');
    expect(diagnosticosExpanded).toContain('Esta semana te deja $2,400 de margen aprovechable');
    expect(diagnosticosExpanded).not.toContain('Qué hacer hoy:');
    expect(diagnosticosExpanded).not.toContain('Interpretación general:');

    const radarExpanded = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} priorityDiagnostics={priorityDiagnostics} initialOpenCard="radar" />
    );
    expect(radarExpanded).toContain('Qué hacer hoy:');
    expect(radarExpanded).not.toContain('Interpretación general:');

    const estadoExpanded = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} priorityDiagnostics={priorityDiagnostics} initialOpenCard="estado" />
    );
    expect(estadoExpanded).toContain('Interpretación general:');
    expect(estadoExpanded).not.toContain('Siguiente paso:');
  });

  it('reduce redundancia visual de severidad en items de diagnósticos', () => {
    const html = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} priorityDiagnostics={priorityDiagnostics} initialOpenCard="diagnosticos" />
    );

    expect(html).toContain('Alta prioridad');
    expect(html).not.toContain('>Alta<');
    expect(html).not.toContain('>Media<');
    expect(html).not.toContain('>Baja<');
  });

  it('aplica comportamiento accordion en helper de estado', () => {
    expect(toggleAnalyticsCard(null, 'radar')).toBe('radar');
    expect(toggleAnalyticsCard('radar', 'estado')).toBe('estado');
    expect(toggleAnalyticsCard('estado', 'diagnosticos')).toBe('diagnosticos');
    expect(toggleAnalyticsCard('diagnosticos', 'diagnosticos')).toBeNull();
  });
});
