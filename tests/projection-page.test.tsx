import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ProjectionPage from '@/app/proyeccion/page';

vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

vi.mock('@/lib/finance/projection', () => ({
  buildProjectionScenario: vi.fn(async () => ({
      generatedAt: '2026-05-12T10:00:00.000Z',
      weeks: Array.from({ length: 12 }, (_, index) => ({
        weekNumber: index + 1,
        periodStart: '2026-05-12',
        periodEnd: '2026-05-18',
        openingOperationalMoney: 2000 - index * 100,
        estimatedIncome: 400,
        estimatedVariableExpenses: 200,
        estimatedCommitments: 250,
        extraordinaryEvents: 0,
        closingOperationalMoney: 1950 - index * 100,
        netChange: -50,
        notes: []
      })),
      summary: {
        startingOperationalMoney: 2000,
        endingOperationalMoney: 850,
        projectedChange: -1150,
        lowestProjectedMoney: 850,
        lowestProjectedWeek: 12,
        trend: 'down',
        confidence: 'high',
        dataLimitations: ['Los extras pendientes no se cuentan como ingreso hasta que se paguen.']
      }
    }))
}));

describe('ProjectionPage', () => {
  it('renderiza /proyeccion con resumen y tabla semanal', async () => {
    const html = renderToStaticMarkup(await ProjectionPage());

    expect(html).toContain('Proyección');
    expect(html).toContain('Resumen del escenario actual');
    expect(html).toContain('Dinero operativo actual');
    expect(html).toContain('Tabla de 12 semanas');
    expect(html).toContain('Ingresos estimados');
    expect(html).toContain('Gastos estimados');
    expect(html).toContain('Compromisos');
    expect(html).toContain('Eventos');
    expect(html).toContain('Semana 12');
  });
});
