import { describe, expect, it, vi } from 'vitest';
import { buildMissingFlowPeriods, calculateFlowFinancialState } from '@/lib/flows/periods';

const base = { householdId: 'home', fundId: 'fund', periodType: 'monthly' as const, createdAt: '2026-01-15T10:00:00Z', targetAmount: 100 };

describe('historial de periodos de Flujos', () => {
  it('genera todos los periodos faltantes desde el alta hasta el actual', () => {
    const periods = buildMissingFlowPeriods({ ...base, now: new Date('2026-04-20T00:00:00Z'), existing: [] });
    expect(periods.map((period) => period.periodStart)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('no vuelve a crear periodos ya persistidos', () => {
    const existing = buildMissingFlowPeriods({ ...base, now: new Date('2026-03-20T00:00:00Z'), existing: [] });
    expect(buildMissingFlowPeriods({ ...base, now: new Date('2026-03-20T00:00:00Z'), existing })).toEqual([]);
  });

  it('arrastra el déficit de todos los periodos al calcular la necesidad vigente', () => {
    const state = calculateFlowFinancialState([{ targetAmount: 100 }, { targetAmount: 100 }, { targetAmount: 100 }], 180);
    expect(state).toMatchObject({ accumulatedNeed: 300, availableReserve: 180, difference: -120, status: 'atrasado' });
  });

  it.each([
    [200, 'al_corriente'],
    [199, 'atrasado'],
    [250, 'adelantado']
  ] as const)('calcula el estado %s como %s', (reserve, status) => {
    expect(calculateFlowFinancialState([{ targetAmount: 200 }], reserve).status).toBe(status);
  });

  it('preserva el objetivo capturado en los periodos históricos tras un cambio', () => {
    const historical = buildMissingFlowPeriods({ ...base, now: new Date('2026-02-20T00:00:00Z'), existing: [] });
    const newer = buildMissingFlowPeriods({ ...base, targetAmount: 250, now: new Date('2026-03-20T00:00:00Z'), existing: historical });
    expect(historical.map((period) => period.targetAmount)).toEqual([100, 100]);
    expect(newer).toMatchObject([{ periodStart: '2026-03-01', targetAmount: 250 }]);
  });
});

describe('integración de carga lazy de periodos', () => {
  it('persiste, recupera e informa los siete flujos en la primera carga de forma idempotente', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: {} }));
    vi.doMock('@/lib/db/queries', () => ({ getDefaultHouseholdId: vi.fn() }));
    const { ensureFlowPeriods, buildFlowCardState } = await import('@/lib/flows/service');
    const rows: Array<Record<string, unknown>> = [];
    const client = { from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }),
      upsert: (pending: Array<Record<string, unknown>>) => ({ select: async () => {
        for (const period of pending) if (!rows.some((row) => row.fund_id === period.fund_id && row.period_start === period.period_start)) rows.push({ id: `period-${rows.length + 1}`, ...period });
        return { data: pending, error: null };
      } })
    }) };
    const types = ['weekly', 'monthly', 'bimonthly', 'semiannual', 'annual'] as const;
    const funds = [
      ...types.map((period_type, index) => ({ id: `calculated-${period_type}`, name: period_type, period_type, created_at: period_type === 'weekly' ? '2026-07-13T00:00:00Z' : '2026-07-01T00:00:00Z', target_type: 'calculated', manual_target_amount: null })),
      { id: 'miscellaneous', name: 'Gastos Variables', period_type: 'weekly', created_at: '2026-07-13T00:00:00Z', target_type: 'manual', manual_target_amount: 1200 },
      { id: 'wealth', name: 'Patrimonio', period_type: 'monthly', created_at: '2026-07-01T00:00:00Z', target_type: 'manual', manual_target_amount: 2000 }
    ];
    const concepts = types.map((period_type, index) => ({ flow_fund_id: `calculated-${period_type}`, planned_amount: 100 + index, planned_period_type: period_type, is_active: true }));
    const now = new Date('2026-07-19T00:00:00Z');
    await ensureFlowPeriods('home', funds, concepts, client as never, now);
    expect(rows.length).toBeGreaterThanOrEqual(7);
    const firstLoadCount = rows.length;
    await ensureFlowPeriods('home', funds, concepts, client as never, now);
    expect(rows).toHaveLength(firstLoadCount);
    const periods = rows.map((row) => ({ id: String(row.id), householdId: String(row.household_id), fundId: String(row.fund_id), periodStart: String(row.period_start), periodEnd: String(row.period_end), periodLabel: String(row.period_label), targetAmount: Number(row.target_amount) }));
    const variables = buildFlowCardState({ id: 'miscellaneous', name: 'Gastos Variables', code: 'miscellaneous', periodType: 'weekly', priority: 1, isActive: true }, periods.filter((period) => period.fundId === 'miscellaneous'), 0);
    const wealth = buildFlowCardState({ id: 'wealth', name: 'Patrimonio', code: 'wealth', periodType: 'monthly', priority: 2, isActive: true }, periods.filter((period) => period.fundId === 'wealth'), 0);
    expect(variables).toMatchObject({ periodTarget: 1200, currentNeed: 1200, accumulatedNeed: 1200, status: 'atrasado' });
    expect(wealth).toMatchObject({ periodTarget: 2000, currentNeed: 2000, accumulatedNeed: 2000, status: 'atrasado' });
    expect(periods.filter((period) => period.fundId.startsWith('calculated-')).every((period) => period.targetAmount > 0)).toBe(true);
  });

  it('nunca clasifica un flujo sin periodos como al corriente', async () => {
    vi.resetModules(); vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: {} })); vi.doMock('@/lib/db/queries', () => ({ getDefaultHouseholdId: vi.fn() }));
    const { buildFlowCardState } = await import('@/lib/flows/service');
    expect(buildFlowCardState({ id: 'broken', name: 'Inválido', code: 'broken', periodType: 'none', priority: 1, isActive: true }, [], 0).status).toBe('sin_inicializar');
  });
});

describe('inicio efectivo del seguimiento', () => {
  it('no crea la semana anterior cuando el seguimiento empieza un lunes', () => {
    const periods = buildMissingFlowPeriods({ ...base, periodType: 'weekly', createdAt: '2026-07-20T00:00:00Z', now: new Date('2026-07-20T12:00:00Z'), existing: [] });
    expect(periods).toMatchObject([{ periodStart: '2026-07-20', periodEnd: '2026-07-26' }]);
  });
  it('no crea julio para un flujo mensual que inicia en agosto', () => {
    const periods = buildMissingFlowPeriods({ ...base, createdAt: '2026-08-01T00:00:00Z', now: new Date('2026-08-10T00:00:00Z'), existing: [] });
    expect(periods).toMatchObject([{ periodStart: '2026-08-01', periodEnd: '2026-08-31' }]);
  });
});
