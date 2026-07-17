import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { getAllocatedByCycle, getTotalAllocated, type FlowAllocationAmount } from '@/lib/flows/calculations';

const allocations: FlowAllocationAmount[] = [
  { householdId: 'home', accountId: 'cash', fundId: 'weekly', cycleId: 'week-29', amount: 7400 },
  { householdId: 'home', accountId: 'cash', fundId: 'weekly', cycleId: 'week-30', amount: 7600 },
  { householdId: 'other', accountId: 'cash-2', fundId: 'weekly-2', cycleId: 'week-other', amount: 99000 }
];

describe('asignaciones por ciclo', () => {
  it('dos ciclos del mismo fondo no comparten asignaciones históricas', () => {
    expect(getAllocatedByCycle(allocations, 'home', 'week-29')).toBe(7400);
    expect(getAllocatedByCycle(allocations, 'home', 'week-30')).toBe(7600);
    expect(getAllocatedByCycle(allocations, 'home', 'missing')).toBe(0);
  });
  it('eliminar una asignación disminuye únicamente su ciclo', () => {
    const afterDelete = allocations.filter((allocation) => allocation.cycleId !== 'week-29');
    expect(getAllocatedByCycle(afterDelete, 'home', 'week-29')).toBe(0);
    expect(getAllocatedByCycle(afterDelete, 'home', 'week-30')).toBe(7600);
  });
  it('los totales reservados incluyen ciclos históricos hasta que un cierre futuro decida su destino', () => {
    expect(getTotalAllocated(allocations, 'home')).toBe(15000);
  });
  it('la creación manual resuelve el ciclo activo sin aceptar cycle_id de la interfaz', async () => {
    vi.resetModules(); vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: {} })); vi.doMock('@/lib/db/queries', () => ({ getDefaultHouseholdId: vi.fn(async () => 'home') }));
    const { createFlowAllocation } = await import('@/lib/flows/service');
    const fundQuery = { eq: vi.fn() } as { eq: ReturnType<typeof vi.fn>; single?: ReturnType<typeof vi.fn> };
    fundQuery.eq.mockReturnValue(fundQuery); fundQuery.single = vi.fn(async () => ({ data: { id: '00000000-0000-0000-0000-000000000010', period_type: 'weekly' }, error: null }));
    const cycleQuery = { eq: vi.fn() } as { eq: ReturnType<typeof vi.fn>; neq?: ReturnType<typeof vi.fn> };
    cycleQuery.eq.mockReturnValue(cycleQuery); cycleQuery.neq = vi.fn(async () => ({ data: [{ id: 'cycle', household_id: 'home', fund_id: '00000000-0000-0000-0000-000000000010', cycle_start: '2026-07-13', cycle_end: '2026-07-19', cycle_label: 'week', target_amount: 0, consumed_amount: 0, status: 'pending' }], error: null }));
    const rpc = vi.fn(async () => ({ error: null }));
    const client = { from: vi.fn((table: string) => table === 'flow_funds' ? { select: () => fundQuery } : { select: () => cycleQuery }), rpc };
    await createFlowAllocation({ accountId: '00000000-0000-0000-0000-000000000020', fundId: '00000000-0000-0000-0000-000000000010', amount: 100, notes: null }, client as never);
    expect(rpc).toHaveBeenCalledWith('create_flow_allocation', expect.not.objectContaining({ p_cycle_id: expect.anything() }));
  });
});

describe('migración y garantías SQL', () => {
  const migration = readFileSync('db/migrations/0009_create_flow_cycles.sql', 'utf8');
  it('vincula asignaciones anteriores al ciclo activo y exige cycle_id', () => {
    expect(migration).toMatch(/UPDATE flow_allocations a[\s\S]*c\.status <> 'closed'/);
    expect(migration).toContain('ALTER COLUMN cycle_id SET NOT NULL');
  });
  it('garantiza conjuntamente ciclo, hogar y fondo', () => {
    expect(migration).toContain('FOREIGN KEY (cycle_id, household_id, fund_id)');
    expect(migration).toContain('REFERENCES flow_cycles(id, household_id, fund_id)');
    expect(migration).toContain('FOREIGN KEY (account_id, household_id)');
    expect(migration).toContain('FOREIGN KEY (fund_id, household_id)');
  });
  it('la creación resuelve el ciclo activo en servidor y rechaza ciclos cerrados', () => {
    expect(migration).toMatch(/SELECT id INTO v_cycle_id FROM flow_cycles[\s\S]*status <> 'closed'/);
    expect(migration).toContain('INSERT INTO flow_allocations(household_id, fund_id, cycle_id');
    expect(migration).toMatch(/validate_flow_allocation_cycle[\s\S]*status <> 'closed'/);
  });
  it('valida atómicamente que el consumo no supere lo asignado al ciclo', () => {
    expect(migration).toMatch(/SUM\(amount\)[\s\S]*cycle_id = p_cycle_id/);
    expect(migration).toContain("RAISE EXCEPTION 'consumed_exceeds_assigned'");
  });
});
