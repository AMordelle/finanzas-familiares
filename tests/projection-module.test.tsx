import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildProjectionScenario } from '@/lib/finance/projection';

const baseInput = {
  hasHousehold: true,
  startDate: new Date('2026-05-13T00:00:00.000Z'),
  recentWeeks: 12,
  accounts: [
    { id: 'bank', name: 'Banco', type: 'operational_cash', balance: 10000, isActive: true },
    { id: 'cash', name: 'Efectivo', type: 'operativa', balance: 500, isActive: true },
    { id: 'tdc', name: 'TDC', type: 'credit_card', balance: 9000, isActive: true },
    { id: 'fund', name: 'Fondo', type: 'savings_fund', balance: 3000, isActive: true },
    { id: 'recv', name: 'Por cobrar', type: 'receivable', balance: 700, isActive: true }
  ],
  movements: [
    { id: 'm1', groupId: 'g1', note: 'Ingreso sueldo semanal', action: 'ingreso' as const, category: 'ingreso_fijo', amount: 1200, happenedAt: '2026-05-01T12:00:00.000Z' },
    { id: 'm2', groupId: 'g2', note: 'PrimeIPTV recurrente', action: 'ingreso' as const, category: 'ingreso_extra', amount: 240, happenedAt: '2026-05-02T12:00:00.000Z' },
    { id: 'm3', groupId: 'g3', note: 'Oxxo y comida', action: 'gasto' as const, category: 'comida', amount: 360, happenedAt: '2026-05-03T12:00:00.000Z' },
    { id: 'm4', groupId: 'g4', note: 'Pago tarjeta BBVA', action: 'pago_deuda' as const, category: 'pago_deuda', amount: 600, happenedAt: '2026-05-04T12:00:00.000Z' },
    { id: 'm5', groupId: 'g5', note: 'Internet casa', action: 'gasto' as const, category: 'internet', amount: 120, happenedAt: '2026-05-05T12:00:00.000Z' },
    { id: 'm6', groupId: 'g6', note: 'Aportación fondo GNP', action: 'objetivo_aporte' as const, category: 'ahorro_meta', amount: 240, happenedAt: '2026-05-06T12:00:00.000Z' },
    { id: 'm7', groupId: 'g7', note: 'Compra a 3 MSI', action: 'msi_purchase' as const, category: 'ropa msi', amount: 999, happenedAt: '2026-05-07T12:00:00.000Z' }
  ],
  msiInstallments: [
    { id: 'i1', amount: 300, dueDate: '2026-05-15', status: 'pending' },
    { id: 'i2', amount: 300, dueDate: null, status: 'pending' },
    { id: 'i3', amount: 300, dueDate: '2026-05-20', status: 'paid' }
  ],
  extraordinaryEvents: []
};

describe('módulo Proyección', () => {
  it('genera 12 semanas y usa dinero operativo real como inicio', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.weeks).toHaveLength(12);
    expect(scenario.dineroOperativoActual).toBe(10500);
    expect(scenario.weeks[0].dineroOperativoProyectado).toBeCloseTo(10500 + scenario.weeks[0].balanceSemanal, 2);
  });

  it('calcula totales, balance y encadena dinero proyectado semana a semana', () => {
    const scenario = buildProjectionScenario(baseInput);
    const first = scenario.weeks[0];
    const second = scenario.weeks[1];

    expect(first.totalIngresos).toBeCloseTo(first.nomina + first.cajaAhorro + first.ingresosExtra + first.eventosExtraordinarios, 2);
    expect(first.totalGastos).toBeCloseTo(first.gastoFamiliarFijo + first.gastosVariables + first.serviciosSuscripciones + first.deudaTarjetas + first.msiComprasMeses + first.ahorroInversion, 2);
    expect(first.balanceSemanal).toBeCloseTo(first.totalIngresos - first.totalGastos, 2);
    expect(second.dineroOperativoProyectado).toBeCloseTo(first.dineroOperativoProyectado + second.balanceSemanal, 2);
  });

  it('separa nómina de ingresos extra', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.weeks[0].nomina).toBe(100);
    expect(scenario.weeks[0].ingresosExtra).toBe(20);
  });

  it('separa deuda y tarjetas de gastos variables', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.weeks[0].deudaTarjetas).toBe(50);
    expect(scenario.weeks[0].gastosVariables).toBe(30);
  });

  it('incluye MSI como columna independiente', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.weeks[0].msiComprasMeses).toBe(600);
    expect(scenario.weeks[0].gastosVariables).toBe(30);
  });

  it('no proyecta eventos extraordinarios si no están registrados', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.weeks.every((week) => week.eventosExtraordinarios === 0)).toBe(true);
    expect(scenario.explanations.find((item) => item.key === 'eventosExtraordinarios')?.warning).toContain('eventos se agregarán manualmente');
  });

  it('no modifica cuentas, movimientos ni saldos', () => {
    const input = structuredClone(baseInput);
    const before = JSON.stringify(input);

    buildProjectionScenario(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it('renderiza tabla con columnas financieras y sección de explicación', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/queries', () => ({ getProjectionData: vi.fn(async () => buildProjectionScenario(baseInput)) }));
    const { default: ProjectionPage } = await import('@/app/proyeccion/page');

    const html = renderToStaticMarkup(await ProjectionPage());

    expect(html).toContain('Proyección');
    expect(html).toContain('Visualiza cómo podría evolucionar tu dinero operativo durante las próximas 12 semanas.');
    expect(html).toContain('Nómina');
    expect(html).toContain('Caja ahorro');
    expect(html).toContain('MSI / compras a meses');
    expect(html).toContain('Dinero operativo proyectado');
    expect(html).toContain('Cómo se armó este escenario');
    expect(html).toContain('Promedio semanal reciente de ingresos');
  });
});
