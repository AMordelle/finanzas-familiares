import { describe, expect, it, vi } from 'vitest';
import { getAllocatedByAccount, getAllocatedByFund, getAvailableByAccount, getTotalAllocated, getTotalLiquidity, getUnallocatedMoney, validateAllocation, type FlowAccount, type FlowAllocationAmount } from '@/lib/flows/calculations';

const household = 'home-a';
const cash: FlowAccount = { id: 'cash', householdId: household, type: 'operational_cash', balance: 10_000, isActive: true };
const allocations: FlowAllocationAmount[] = [
  { householdId: household, accountId: 'cash', fundId: 'weekly', cycleId: 'week-29', amount: 4_000 },
  { householdId: household, accountId: 'cash', fundId: 'monthly', cycleId: 'month-7', amount: 2_000 },
  { householdId: 'home-b', accountId: 'cash-b', fundId: 'weekly-b', cycleId: 'week-b', amount: 50_000 }
];

describe('base de Flujos', () => {
  it('excluye crédito, deuda, inversión, ahorro y cuentas inactivas de la liquidez operativa', () => {
    const accounts = [cash, ...['credit_card', 'loan', 'investment', 'savings_fund'].map((type, index) => ({ ...cash, id: `x${index}`, type, balance: 99_000 })), { ...cash, id: 'inactive', isActive: false }];
    expect(getTotalLiquidity(accounts, household)).toBe(10_000);
  });
  it('suma asignaciones únicamente del hogar actual y por dimensiones', () => {
    expect(getTotalAllocated(allocations, household)).toBe(6_000);
    expect(getAllocatedByAccount(allocations, household, 'cash')).toBe(6_000);
    expect(getAllocatedByFund(allocations, household, 'weekly')).toBe(4_000);
  });
  it('calcula liquidez menos asignaciones y reporta 4,000 disponibles', () => {
    expect(getUnallocatedMoney([cash], allocations, household)).toBe(4_000);
    expect(getAvailableByAccount(cash, allocations, household)).toBe(4_000);
  });
  it('impide superar el saldo libre sin modificar el saldo físico', () => {
    const before = cash.balance;
    expect(() => validateAllocation({ householdId: household, account: cash, fundHouseholdId: household, amount: 4_001, allocations })).toThrow(/supera/);
    validateAllocation({ householdId: household, account: cash, fundHouseholdId: household, amount: 4_000, allocations });
    expect(cash.balance).toBe(before);
  });
  it('rechaza cuentas y fondos de otro hogar', () => {
    expect(() => validateAllocation({ householdId: household, account: { ...cash, householdId: 'home-b' }, fundHouseholdId: household, amount: 1, allocations })).toThrow(/otro hogar/);
    expect(() => validateAllocation({ householdId: household, account: cash, fundHouseholdId: 'home-b', amount: 1, allocations })).toThrow(/otro hogar/);
  });
  it('al eliminar una asignación devuelve el importe al disponible', () => {
    const remaining = allocations.filter((item) => item.fundId !== 'monthly');
    expect(getAvailableByAccount(cash, remaining, household)).toBe(6_000);
  });
  it('rechaza NaN, importes negativos y cuentas no líquidas', () => {
    expect(() => validateAllocation({ householdId: household, account: cash, fundHouseholdId: household, amount: Number.NaN, allocations })).toThrow(/mayor/);
    expect(() => validateAllocation({ householdId: household, account: { ...cash, type: 'credit_card' }, fundHouseholdId: household, amount: 1, allocations })).toThrow(/liquidez/);
  });
});

describe('fondos predeterminados', () => {
  it('usa upsert idempotente con los siete códigos', async () => {
    vi.resetModules();
    vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: {} }));
    vi.doMock('@/lib/db/queries', () => ({ getDefaultHouseholdId: vi.fn() }));
    const { DEFAULT_FLOW_FUNDS, ensureDefaultFlowFunds } = await import('@/lib/flows/service');
    const stored = new Map<string, unknown>();
    const upsert = vi.fn(async (rows: Array<{ code: string }>) => { rows.forEach((row) => stored.set(row.code, row)); return { error: null }; });
    const client = { from: () => ({ upsert }) };
    await ensureDefaultFlowFunds(household, client as never);
    await ensureDefaultFlowFunds(household, client as never);
    expect(DEFAULT_FLOW_FUNDS).toHaveLength(7);
    expect(stored.size).toBe(7);
    expect(upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: 'household_id,code', ignoreDuplicates: true });
  });
});
