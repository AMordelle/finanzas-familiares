import { describe, expect, it, vi } from 'vitest';
import { calculateCycleStatus, calculateMissingAmount, calculateRemainingAmount, createCycleIfMissing, getActiveCycle, getCyclePeriod, getFundTargets, type FlowCycle } from '@/lib/flows/cycles';

const base: FlowCycle = { id: 'cycle', householdId: 'home', fundId: 'weekly', cycleStart: '2026-07-13', cycleEnd: '2026-07-19', cycleLabel: '13–19 julio', targetAmount: 100, consumedAmount: 0, status: 'pending' };

describe('ciclos de Flujos', () => {
  it('calcula únicamente los cuatro estados definidos', () => {
    expect(calculateCycleStatus(99, 100, 0)).toBe('pending');
    expect(calculateCycleStatus(100, 100, 0)).toBe('covered');
    expect(calculateCycleStatus(100, 100, 1)).toBe('consuming');
    expect(calculateCycleStatus(0, 100, 0, 'closed')).toBe('closed');
  });
  it('limita faltante a cero y hace visible un disponible inconsistente', () => {
    expect(calculateMissingAmount(100, 120)).toBe(0);
    expect(calculateMissingAmount(100, 40)).toBe(60);
    expect(calculateRemainingAmount(100, 120)).toBe(-20);
    expect(calculateRemainingAmount(100, 40)).toBe(60);
  });
  it('crea exactamente un ciclo semanal y después reutiliza el activo', () => {
    const first = createCycleIfMissing({ cycles: [], householdId: 'home', fundId: 'weekly', periodType: 'weekly', now: new Date('2026-07-17T10:00:00Z') });
    expect(first.created).toBe(true); expect(first.cycle.cycleStart).toBe('2026-07-13'); expect(first.cycle.cycleEnd).toBe('2026-07-19');
    const second = createCycleIfMissing({ cycles: [first.cycle], householdId: 'home', fundId: 'weekly', periodType: 'weekly' });
    expect(second.created).toBe(false); expect(getActiveCycle([first.cycle], 'weekly')).toBe(first.cycle);
  });
  it('usa mes para fondos sin periodicidad y expone objetivos por fondo', () => {
    expect(getCyclePeriod('monthly', new Date('2026-07-17T00:00:00Z'))).toMatchObject({ start: '2026-07-01', end: '2026-07-31' });
    const result = createCycleIfMissing({ cycles: [], householdId: 'home', fundId: 'wealth', periodType: 'none', now: new Date('2026-07-17T00:00:00Z') });
    expect(result.cycle.cycleStart).toBe('2026-07-01'); expect(getFundTargets([{ ...base, targetAmount: 7420 }])).toEqual({ weekly: 7420 });
  });
});

describe('persistencia de ciclos', () => {
  it('abrir varias veces usa upsert y no duplica ciclos', async () => {
    vi.resetModules(); vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: {} })); vi.doMock('@/lib/db/queries', () => ({ getDefaultHouseholdId: vi.fn() }));
    const { ensureActiveFlowCycles } = await import('@/lib/flows/service');
    const stored: Array<Record<string, unknown>> = [];
    const client = { from: () => ({ select: () => ({ eq: () => ({ neq: async () => ({ data: stored, error: null }) }) }), upsert: vi.fn(async (rows: Array<Record<string, unknown>>) => { rows.forEach((row) => { if (!stored.some((item) => item.fund_id === row.fund_id)) stored.push({ id: 'cycle', ...row }); }); return { error: null }; }) }) };
    const funds = [{ id: 'weekly', period_type: 'weekly' }];
    await ensureActiveFlowCycles('home', funds, client as never, new Date('2026-07-17T00:00:00Z')); await ensureActiveFlowCycles('home', funds, client as never, new Date('2026-07-17T00:00:00Z'));
    expect(stored).toHaveLength(1);
  });
  it('actualiza el objetivo únicamente en el ciclo activo', async () => {
    vi.resetModules(); vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: {} })); vi.doMock('@/lib/db/queries', () => ({ getDefaultHouseholdId: vi.fn(async () => 'home') }));
    const { updateFlowCycleTarget } = await import('@/lib/flows/service'); const select = vi.fn(async () => ({ data: [{ id: 'cycle' }], error: null })); const neq = vi.fn(() => ({ select })); const eqHousehold = vi.fn(() => ({ neq })); const eqId = vi.fn(() => ({ eq: eqHousehold })); const update = vi.fn(() => ({ eq: eqId })); const client = { from: () => ({ update }) };
    await updateFlowCycleTarget('00000000-0000-0000-0000-000000000001', 500, client as never);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ target_amount: 500 })); expect(neq).toHaveBeenCalledWith('status', 'closed');
  });
  it('delega el consumo a la validación atómica del servidor', async () => {
    vi.resetModules(); vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: {} })); vi.doMock('@/lib/db/queries', () => ({ getDefaultHouseholdId: vi.fn(async () => 'home') }));
    const { updateFlowCycleConsumed } = await import('@/lib/flows/service'); const rpc = vi.fn(async () => ({ error: null }));
    await updateFlowCycleConsumed('00000000-0000-0000-0000-000000000001', 80, { rpc } as never);
    expect(rpc).toHaveBeenCalledWith('update_flow_cycle_consumed', { p_household_id: 'home', p_cycle_id: '00000000-0000-0000-0000-000000000001', p_amount: 80 });
  });
});
