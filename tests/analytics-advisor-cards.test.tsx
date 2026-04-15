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

describe('AnalyticsAdvisorCards', () => {
  it('renderiza ambas cards compactas y balanceadas al estar colapsadas', () => {
    const html = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} />);
    expect(html).toContain('Radar Financiero');
    expect(html).toContain('Estado financiero actual');
    expect(html).toContain('La base alcanza, aunque la holgura sigue siendo limitada.');
    expect((html.match(/min-h-\[148px\]/g) ?? []).length).toBe(2);
    expect(html).not.toContain('Qué hacer hoy');
    expect(html).not.toContain('Interpretación general:');
  });

  it('expande solo la card seleccionada', () => {
    const radarExpanded = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} initialOpenCard="radar" />);
    expect(radarExpanded).toContain('Qué hacer hoy:');
    expect(radarExpanded).toContain('Presión cercana (8-14 días):');
    expect(radarExpanded).not.toContain('Interpretación general:');

    const estadoExpanded = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} initialOpenCard="estado" />);
    expect(estadoExpanded).toContain('Interpretación general:');
    expect(estadoExpanded).toContain('Fortalezas actuales');
    expect(estadoExpanded).toContain('Riesgos actuales');
    expect(estadoExpanded).toContain('En qué enfocarse ahora:');
    expect(estadoExpanded).not.toContain('Qué hacer hoy:');
    expect(estadoExpanded).not.toContain('Necesidad próximos 7 días');
  });

  it('aplica comportamiento accordion en helper de estado', () => {
    expect(toggleAnalyticsCard(null, 'radar')).toBe('radar');
    expect(toggleAnalyticsCard('radar', 'estado')).toBe('estado');
    expect(toggleAnalyticsCard('estado', 'estado')).toBeNull();
  });

  it('mantiene separación entre estado estructural y radar táctico', () => {
    const html = renderToStaticMarkup(<AnalyticsAdvisorCards radar={radar} financialPressure={pressure} financialStatus={financialStatus} initialOpenCard="estado" />);
    expect(html).toContain('Tu hogar cubre lo esencial, pero aún depende de maniobras para respirar con holgura.');
    expect(html).not.toContain('Presión cercana (8-14 días):');
    expect(html).not.toContain('Necesidad próximos 7 días');
    expect(html).not.toContain('Qué hacer hoy:');
  });
});
