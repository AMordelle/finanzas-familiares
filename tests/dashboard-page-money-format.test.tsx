import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import DashboardPage from '@/app/dashboard/page';

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/metric-card', () => ({
  MetricCard: ({ label, value }: { label: string; value: string }) => <p>{label}: {value}</p>
}));

vi.mock('@/components/dashboard/analytics-advisor-cards', () => ({
  AnalyticsAdvisorCards: () => <div>analytics</div>
}));

vi.mock('@/lib/db/queries', () => ({
  getDashboardData: vi.fn(async () => ({
    hasHousehold: true,
    monthlyOFH: 35173,
    weeklyOFH: 8117,
    availableMoney: 23233.91,
    recommendations: [],
    financialPressure: null,
    financialInsight: null,
    financialRadar: null,
    priorityDiagnostics: []
  }))
}));

describe('Dashboard money formatting consistency', () => {
  it('renders dashboard money cards with $ and 2 fixed decimals', async () => {
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain('OFH mensual: $35,173.00');
    expect(html).toContain('Objetivo semanal: $8,117.00');
    expect(html).toContain('Dinero disponible hoy: $23,233.91');
  });
});
