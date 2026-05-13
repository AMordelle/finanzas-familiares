import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildProjectionScenario } from '@/lib/finance/projection';

const baseInput = {
  hasHousehold: true,
  startDate: new Date('2026-05-13T00:00:00.000Z'),
  accounts: [
    { id: 'bank', name: 'Banco', type: 'operational_cash', balance: 12000, isActive: true },
    { id: 'cash', name: 'Efectivo', type: 'operativa', balance: 300, isActive: true },
    { id: 'tdc', name: 'TDC', type: 'credit_card', balance: 9000, isActive: true },
    { id: 'fund', name: 'Fondo', type: 'savings_fund', balance: 3000, isActive: true },
    { id: 'recv', name: 'Por cobrar', type: 'receivable', balance: 700, isActive: true }
  ],
  movements: [
    { id: 'm1', groupId: 'g1', note: 'Ingreso sueldo semanal', action: 'ingreso' as const, category: 'ingreso_fijo', amount: 2000, happenedAt: '2026-04-28T12:00:00.000Z' },
    { id: 'm2', groupId: 'g2', note: 'PrimeIPTV recurrente', action: 'ingreso' as const, category: 'ingreso_extra', amount: 400, happenedAt: '2026-04-29T12:00:00.000Z' },
    { id: 'm3', groupId: 'g3', note: 'Entrega semanal esposa familia', action: 'gasto' as const, category: 'gasto_familiar', amount: 700, happenedAt: '2026-04-30T12:00:00.000Z' },
    { id: 'm4', groupId: 'g4', note: 'Oxxo y comida', action: 'gasto' as const, category: 'comida', amount: 300, happenedAt: '2026-05-01T12:00:00.000Z' },
    { id: 'm5', groupId: 'g5', note: 'Pago tarjeta BBVA', action: 'pago_deuda' as const, category: 'pago_deuda', amount: 500, happenedAt: '2026-05-02T12:00:00.000Z' },
    { id: 'm6', groupId: 'g6', note: 'Ingreso sueldo semanal', action: 'ingreso' as const, category: 'ingreso_fijo', amount: 3000, happenedAt: '2026-05-05T12:00:00.000Z' },
    { id: 'm7', groupId: 'g7', note: 'PrimeIPTV recurrente', action: 'ingreso' as const, category: 'ingreso_extra', amount: 200, happenedAt: '2026-05-05T13:00:00.000Z' },
    { id: 'm8', groupId: 'g8', note: 'Gasolina', action: 'gasto' as const, category: 'gasolina', amount: 500, happenedAt: '2026-05-06T12:00:00.000Z' },
    { id: 'm9', groupId: 'g9', note: 'Entrega semanal esposa familia', action: 'gasto' as const, category: 'gasto_familiar', amount: 700, happenedAt: '2026-05-07T12:00:00.000Z' },
    { id: 'm10', groupId: 'g10', note: 'Pago tarjeta BBVA', action: 'pago_deuda' as const, category: 'pago_deuda', amount: 300, happenedAt: '2026-05-08T12:00:00.000Z' },
    { id: 'm11', groupId: 'g11', note: 'Internet casa', action: 'gasto' as const, category: 'internet', amount: 100, happenedAt: '2026-05-09T12:00:00.000Z' },
    { id: 'm12', groupId: 'g12', note: 'Aportación fondo GNP', action: 'objetivo_aporte' as const, category: 'ahorro_meta', amount: 200, happenedAt: '2026-05-09T13:00:00.000Z' },
    { id: 'm13', groupId: 'g13', note: 'Compra a 3 MSI', action: 'msi_purchase' as const, category: 'ropa msi', amount: 600, happenedAt: '2026-05-10T12:00:00.000Z' },
    { id: 'm14', groupId: 'g14', note: 'Sueldo semana actual parcial', action: 'ingreso' as const, category: 'ingreso_fijo', amount: 10000, happenedAt: '2026-05-12T12:00:00.000Z' }
  ],
  msiInstallments: [],
  extraordinaryEvents: []
};

describe('módulo Proyección con histórico semanal tipo Excel', () => {
  it('construye semanas históricas completas lunes-domingo y excluye semana parcial del promedio', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.historicalWeeks).toHaveLength(2);
    expect(scenario.historicalWeeks[0]).toMatchObject({ rowType: 'historical', startDate: '2026-04-27', endDate: '2026-05-03' });
    expect(scenario.historicalWeeks[1]).toMatchObject({ rowType: 'historical', startDate: '2026-05-04', endDate: '2026-05-10' });
    expect(scenario.partialWeek).toMatchObject({ rowType: 'partial', label: 'Semana actual parcial', startDate: '2026-05-11', endDate: '2026-05-17' });
    expect(scenario.partialWeekExcluded).toBe(true);
    expect(scenario.averages.nomina).toBe(2500);
  });

  it('agrupa columnas reales por semana antes de calcular promedios', () => {
    const scenario = buildProjectionScenario(baseInput);
    const first = scenario.historicalWeeks[0];
    const second = scenario.historicalWeeks[1];

    expect(first.nomina).toBe(2000);
    expect(first.ingresosExtra).toBe(400);
    expect(first.gastoFamiliarFijo).toBe(700);
    expect(first.gastosVariables).toBe(300);
    expect(first.deudaTarjetas).toBe(500);

    expect(second.nomina).toBe(3000);
    expect(second.ingresosExtra).toBe(200);
    expect(second.gastoFamiliarFijo).toBe(700);
    expect(second.gastosVariables).toBe(500);
    expect(second.deudaTarjetas).toBe(300);
    expect(second.serviciosSuscripciones).toBe(100);
    expect(second.ahorroInversion).toBe(200);
    expect(second.msiComprasMeses).toBe(600);
  });

  it('calcula total ingresos, total gastos y balance semanal real', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.historicalWeeks[0].totalIngresos).toBe(2400);
    expect(scenario.historicalWeeks[0].totalGastos).toBe(1500);
    expect(scenario.historicalWeeks[0].balanceSemanal).toBe(900);
    expect(scenario.historicalWeeks[1].totalIngresos).toBe(3200);
    expect(scenario.historicalWeeks[1].totalGastos).toBe(2400);
    expect(scenario.historicalWeeks[1].balanceSemanal).toBe(800);
  });

  it('calcula promedios por columna desde semanas reales completas', () => {
    const scenario = buildProjectionScenario(baseInput);

    expect(scenario.averages.nomina).toBe(2500);
    expect(scenario.averages.ingresosExtra).toBe(300);
    expect(scenario.averages.gastoFamiliarFijo).toBe(700);
    expect(scenario.averages.gastosVariables).toBe(400);
    expect(scenario.averages.deudaTarjetas).toBe(400);
    expect(scenario.averages.serviciosSuscripciones).toBe(50);
    expect(scenario.averages.msiComprasMeses).toBe(300);
    expect(scenario.averageWeeklyIncome).toBe(2800);
    expect(scenario.averageWeeklyExpenses).toBe(1950);
    expect(scenario.averageWeeklyBalance).toBe(850);
  });

  it('genera filas proyectadas usando promedios por columna después del histórico real', () => {
    const scenario = buildProjectionScenario(baseInput);
    const firstProjection = scenario.projectedWeeks[0];

    expect(scenario.projectedWeeks).toHaveLength(12);
    expect(firstProjection).toMatchObject({ rowType: 'projected', label: 'Proyección semana 1', nomina: 2500, ingresosExtra: 300, gastoFamiliarFijo: 700, msiComprasMeses: 300 });
    expect(firstProjection.totalIngresos).toBe(2800);
    expect(firstProjection.totalGastos).toBe(1950);
    expect(firstProjection.balanceSemanal).toBe(850);
    expect(scenario.projectedWeeks[1].dineroOperativoProyectado).toBeCloseTo(firstProjection.dineroOperativoProyectado + 850, 2);
  });

  it('usa dinero operativo real y no modifica cuentas, movimientos ni saldos', () => {
    const input = structuredClone(baseInput);
    const before = JSON.stringify(input);
    const scenario = buildProjectionScenario(input);

    expect(scenario.dineroOperativoActual).toBe(12300);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('renderiza histórico real, proyección y semanas usadas en resumen', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/queries', () => ({ getProjectionData: vi.fn(async () => buildProjectionScenario(baseInput)) }));
    const { default: ProjectionPage } = await import('@/app/proyeccion/page');

    const html = renderToStaticMarkup(await ProjectionPage());

    expect(html).toContain('Histórico real + proyección');
    expect(html).toContain('Histórico real');
    expect(html).toContain('Proyección');
    expect(html).toContain('Semana actual parcial');
    expect(html).toContain('Semanas históricas usadas');
    expect(html).toContain('2026-04-27 a 2026-05-10');
    expect(html).toContain('Fondo / dinero operativo');
    expect(html).toContain('Cómo se armó este escenario');
  });
});
