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
      recurringWeeklyIncome: 400,
      recurringWeeklyExpenses: 200,
      extraordinaryDetected: [{ description: 'devolucion_sat', amount: 26000, date: '2026-05-01', reason: 'Movimiento extraordinario detectado; se separa del promedio recurrente.' }],
      internalExcluded: [{ description: 'transferencia', amount: 5000, date: '2026-05-02', reason: 'Movimiento interno/técnico detectado; no afecta el flujo proyectable.' }],
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
      },
      calculation: {
        income: {
          periodStart: '2026-04-14',
          periodEnd: '2026-05-12',
          criterion: 'Promedio semanal de las últimas 4 semanas con movimientos clasificados como ingresos.',
          shortNote: 'Promedio semanal de las últimas 4 semanas; no incluye extras pendientes ni transferencias internas.',
          weeklyAverage: 400,
          ordinaryIncome: 1000,
          extraordinaryIncluded: 600,
          extraordinaryExcluded: 0,
          byCategory: [{ category: 'ingreso_sueldo', amount: 1000 }],
          byAccount: [{ category: 'Efectivo', amount: 1000 }],
          includedMovements: [{ groupId: 'income-1', date: '2026-05-05', category: 'ingreso_sueldo', accountName: 'Efectivo', amount: 1000, reason: 'Incluido: movimiento con entrada a cuenta operativa registrado como ingreso.', classification: 'recurrent', classificationSource: 'manual' }],
          excludedMovements: [{ groupId: 'transfer-1', date: '2026-05-03', category: 'transferencia', accountName: 'Banco', amount: 999, reason: 'Excluido: parece transferencia interna o ajuste, no ingreso/gasto proyectable.', classification: 'internal', classificationSource: 'automatic' }]
        },
        expenses: {
          periodStart: '2026-04-14',
          periodEnd: '2026-05-12',
          criterion: 'Promedio semanal de las últimas 4 semanas con movimientos clasificados como gastos.',
          shortNote: 'Promedio semanal de las últimas 4 semanas; no incluye transferencias internas.',
          weeklyAverage: 200,
          variableExpenses: 800,
          fixedExpenses: 0,
          debtPaymentsIncluded: 0,
          byCategory: [{ category: 'super', amount: 800 }],
          includedMovements: [{ groupId: 'expense-1', date: '2026-05-06', category: 'super', accountName: 'Efectivo', amount: 800, reason: 'Incluido: movimiento con salida de cuenta registrado como gasto.', classification: 'recurrent', classificationSource: 'automatic' }],
          excludedMovements: [{ groupId: 'transfer-1', date: '2026-05-03', category: 'transferencia', accountName: 'Banco', amount: 999, reason: 'Excluido: parece transferencia interna o ajuste, no ingreso/gasto proyectable.', classification: 'internal', classificationSource: 'automatic' }]
        },
        commitments: {
          criterion: 'Se incluyen installments MSI pendientes.',
          shortNote: 'Incluye MSI pendientes.',
          byWeek: [{ weekNumber: 1, total: 250, items: [{ weekNumber: 1, description: 'Lavadora', amount: 250, dueDate: '2026-05-13', installmentNumber: 1 }] }]
        },
        events: {
          criterion: 'Solo se incluyen eventos extraordinarios registrados con fecha dentro de las próximas 12 semanas.',
          shortNote: 'Solo eventos registrados.',
          includedEvents: [{ weekNumber: 2, label: 'Reembolso fechado', amount: 100, eventDate: '2026-05-20' }]
        },
        warnings: ['Hay ingresos extraordinarios recientes incluidos que podrían inflar el promedio semanal.']
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
    expect(html).toContain('Ver cómo se calculó esta proyección');
    expect(html).toContain('Movimientos incluidos en ingresos');
    expect(html).toContain('Movimientos excluidos de gastos');
    expect(html).toContain('Compromisos MSI');
    expect(html).toContain('Lavadora');
    expect(html).toContain('Flujo recurrente usado para la proyección');
    expect(html).toContain('Ingresos recurrentes');
    expect(html).toContain('Eventos extraordinarios detectados');
    expect(html).toContain('Movimientos internos excluidos');
    expect(html).toContain('Promedio semanal de las últimas 4 semanas');
    expect(html).toContain('recurrent');
    expect(html).toContain('manual');
  });
});
