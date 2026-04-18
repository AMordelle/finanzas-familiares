import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AnalisisPage from '@/app/analisis/page';

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));


vi.mock('@/lib/db/queries', () => ({
  getDashboardData: vi.fn(async () => ({
    hasHousehold: true,
    monthlyOFH: 10000,
    weeklyOFH: 2500,
    availableMoney: 3100,
    diagnoses: ['Consumo de reservas'],
    recommendations: ['Separar pagos próximos'],
    financialPressure: null,
    financialInsight: null,
    financialRadar: null,
    financialStatus: {
      status: 'vulnerable',
      stage: 'recuperacion',
      headline: 'Estructura vulnerable',
      interpretation: 'La fragilidad es estructural y requiere refuerzo inmediato.',
      shortLine: 'Vulnerable — La base mensual necesita refuerzo.',
      strengths: ['Hay intención de orden.'],
      risks: ['La reserva es insuficiente.'],
      nextFocus: 'Convertir deuda en margen mensual.',
      metrics: {
        coverageRatio: 0.9,
        debtPressureRatio: 0.4,
        reserveMonths: 0.2,
        extraordinaryIncomeDependency: 0.3
      },
      assumptions: ['No se detecta ahorro protegido; se asume reserva nula.']
    },
    priorityDiagnostics: []
  }))
}));

describe('AnalisisPage', () => {
  it('renderiza el módulo estructural completo en la vista de análisis', async () => {
    const html = renderToStaticMarkup(await AnalisisPage());

    expect(html).toContain('Estado financiero actual');
    expect(html).toContain('Interpretación general:');
    expect(html).toContain('Etapa actual:');
    expect(html).toContain('Fortalezas actuales');
    expect(html).toContain('Riesgos actuales');
    expect(html).toContain('En qué enfocarse ahora:');
    expect(html).toContain('Supuestos');
    expect(html).toContain('Distribución inteligente de ingreso extraordinario');
    expect(html).toContain('Recomendado:');
  });
});
