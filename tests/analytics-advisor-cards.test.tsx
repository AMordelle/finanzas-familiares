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
  estimatedMargin: 800,
  frictionBufferRequired: 900,
  marginAfterFrictionBuffer: -100,
  tacticalPressureLevel: 'medium',
  recommendationTone: 'prudente'
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
  it('renderiza dashboard táctico sin card estructural expandida y con resumen ejecutivo', () => {
    const html = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} priorityDiagnostics={priorityDiagnostics} />
    );

    expect(html).toContain('Radar Financiero');
    expect(html).toContain('Diagnósticos prioritarios');
    expect(html).not.toContain('Estado general');
    expect(html).not.toContain('Estado financiero actual');
    expect(html).not.toContain('Interpretación general:');
    expect((html.match(/min-h-\[148px\]/g) ?? []).length).toBe(2);
    expect(html).toContain('En 6 días vence Pago TDC BBVA');
    expect(html).toContain('Hoy 38% del ingreso base se va en deuda');
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
    expect(radarExpanded).not.toContain('Siguiente paso:');
  });

  it('reduce redundancia visual de severidad en items de diagnósticos', () => {
    const html = renderToStaticMarkup(
      <AnalyticsAdvisorCards radar={radar} financialPressure={pressure} priorityDiagnostics={priorityDiagnostics} initialOpenCard="diagnosticos" />
    );

    expect(html).toContain('Alta prioridad');
    expect(html).not.toContain('>Alta<');
    expect(html).not.toContain('>Media<');
    expect(html).not.toContain('>Baja<');
  });

  it('aplica comportamiento accordion en helper de estado', () => {
    expect(toggleAnalyticsCard(null, 'radar')).toBe('radar');
    expect(toggleAnalyticsCard('radar', 'diagnosticos')).toBe('diagnosticos');
    expect(toggleAnalyticsCard('diagnosticos', 'diagnosticos')).toBeNull();
  });
});
