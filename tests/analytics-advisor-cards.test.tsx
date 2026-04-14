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

describe('AnalyticsAdvisorCards', () => {
  it('renderiza ambas cards compactas y balanceadas al estar colapsadas', () => {
    const html = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} />);
    expect(html).toContain('Radar Financiero');
    expect(html).toContain('Estado financiero actual');
    expect((html.match(/min-h-\[148px\]/g) ?? []).length).toBe(2);
    expect(html).not.toContain('Qué hacer hoy');
    expect(html).not.toContain('Interpretación:');
  });

  it('expande solo la card seleccionada', () => {
    const radarExpanded = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} initialOpenCard="radar" />);
    expect(radarExpanded).toContain('Qué hacer hoy:');
    expect(radarExpanded).not.toContain('Interpretación:');

    const estadoExpanded = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} initialOpenCard="estado" />);
    expect(estadoExpanded).toContain('Interpretación:');
    expect(estadoExpanded).not.toContain('Qué hacer hoy:');
  });

  it('aplica comportamiento accordion en helper de estado', () => {
    expect(toggleAnalyticsCard(null, 'radar')).toBe('radar');
    expect(toggleAnalyticsCard('radar', 'estado')).toBe('estado');
    expect(toggleAnalyticsCard('estado', 'estado')).toBeNull();
  });

  it('usa la misma ventana temporal en ambas cards', () => {
    const html = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} initialOpenCard="estado" />);
    expect(html).toContain('próximos 7 días');
    expect(html).toContain('Necesidad próximos 7 días');
  });
});
