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
  upcoming: 'En 6 días vence BBVA.',
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
    key: 'presion-estructural',
    level: 'high' as const,
    title: 'La presión principal sigue siendo estructural',
    explanation: 'La base mensual todavía tiene poco margen y poca protección.',
    action: 'Convierte deuda en margen y fortalece reserva base.'
  },
  {
    key: 'semana-pesada',
    level: 'medium' as const,
    title: 'Se acerca una semana más pesada',
    explanation: 'Después de esta ventana viene una carga que conviene anticipar.',
    action: 'Reserva liquidez desde esta semana.'
  },
  {
    key: 'ahorro',
    level: 'low' as const,
    title: 'Buen momento para fortalecer colchón',
    explanation: 'Puedes separar una parte pequeña si mantienes el orden.',
    action: 'Aparta una cantidad pequeña al fondo.'
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
    expect(html).toContain('La presión principal sigue siendo estructural');
    expect(html).toContain('Se acerca una semana más pesada');
    expect(html).not.toContain('Buen momento para fortalecer colchón');
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
    expect(diagnosticosExpanded).toContain('Buen momento para fortalecer colchón');
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

  it('aplica comportamiento accordion en helper de estado', () => {
    expect(toggleAnalyticsCard(null, 'radar')).toBe('radar');
    expect(toggleAnalyticsCard('radar', 'estado')).toBe('estado');
    expect(toggleAnalyticsCard('estado', 'diagnosticos')).toBe('diagnosticos');
    expect(toggleAnalyticsCard('diagnosticos', 'diagnosticos')).toBeNull();
  });
});
