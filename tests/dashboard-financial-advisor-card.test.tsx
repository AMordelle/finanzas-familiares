import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('@/app/dashboard/actions', () => ({
  analyzeFinancialAdvisorAction: vi.fn()
}));

describe('Dashboard Financial Advisor card', () => {
  it('renderiza la tarjeta del asesor y el botón de análisis', async () => {
    const { default: DashboardPage } = await import('@/app/dashboard/page');
    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain('Asesor financiero');
    expect(html).toContain('Analiza tu situación actual con base en tus cuentas, movimientos, cierres y extras.');
    expect(html).toContain('Analizar mis finanzas');
  });
});
