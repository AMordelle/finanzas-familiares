import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getDefaultHouseholdId } from '@/lib/db/queries';
import { getAllocatedByAccount, getAllocatedByCycle, getTotalAllocated, getTotalLiquidity, getUnallocatedMoney, type FlowAccount, type FlowAllocationAmount } from './calculations';
import { calculateCycleStatus, calculateMissingAmount, calculateRemainingAmount, createCycleIfMissing, type FlowCycle, type FlowPeriodType } from './cycles';

export const DEFAULT_FLOW_FUNDS = [
  ['Semanal', 'weekly', 'weekly'], ['Mensual', 'monthly', 'monthly'], ['Bimestral', 'bimonthly', 'bimonthly'],
  ['Semestral', 'semiannual', 'semiannual'], ['Anual', 'annual', 'annual'], ['Gastos varios', 'miscellaneous', 'none'], ['Patrimonio', 'wealth', 'none']
] as const;

export const flowAllocationCreateSchema = z.object({
  accountId: z.string().uuid('La cuenta no es válida.'),
  fundId: z.string().uuid('El fondo no es válido.'),
  amount: z.coerce.number().finite('El importe no es válido.').positive('El importe debe ser mayor que cero.'),
  notes: z.string().trim().max(500, 'La nota es demasiado larga.').optional().nullable()
});
export const flowAllocationDeleteSchema = z.object({ allocationId: z.string().uuid('La asignación no es válida.') });
export const flowCycleUpdateSchema = z.object({ cycleId: z.string().uuid('El ciclo no es válido.'), amount: z.coerce.number().finite('El importe no es válido.').min(0, 'El importe no puede ser negativo.') });

type Client = typeof supabaseAdmin;

export async function ensureDefaultFlowFunds(householdId: string, client: Client = supabaseAdmin) {
  const rows = DEFAULT_FLOW_FUNDS.map(([name, code, periodType], index) => ({ household_id: householdId, name, code, period_type: periodType, priority: index + 1, is_active: true }));
  const { error } = await client.from('flow_funds').upsert(rows, { onConflict: 'household_id,code', ignoreDuplicates: true });
  if (error) throw new Error(`No fue posible preparar los fondos: ${error.message}`);
}

export async function ensureActiveFlowCycles(householdId: string, funds: Array<{ id: string; period_type: string }>, client: Client = supabaseAdmin, now = new Date()) {
  const { data, error } = await client.from('flow_cycles').select('id,household_id,fund_id,cycle_start,cycle_end,cycle_label,target_amount,consumed_amount,status').eq('household_id', householdId).neq('status', 'closed');
  if (error) throw new Error(`No fue posible consultar los ciclos: ${error.message}`);
  const cycles: FlowCycle[] = (data ?? []).map((row) => ({ id: row.id, householdId: row.household_id, fundId: row.fund_id, cycleStart: row.cycle_start, cycleEnd: row.cycle_end, cycleLabel: row.cycle_label, targetAmount: Number(row.target_amount), consumedAmount: Number(row.consumed_amount), status: row.status }));
  const missing = funds.map((fund) => createCycleIfMissing({ cycles, householdId, fundId: fund.id, periodType: fund.period_type as FlowPeriodType, now })).filter((result) => result.created).map(({ cycle }) => ({ household_id: cycle.householdId, fund_id: cycle.fundId, cycle_start: cycle.cycleStart, cycle_end: cycle.cycleEnd, cycle_label: cycle.cycleLabel, target_amount: cycle.targetAmount, consumed_amount: cycle.consumedAmount, status: cycle.status }));
  if (missing.length) {
    const { error: insertError } = await client.from('flow_cycles').upsert(missing, { onConflict: 'household_id,fund_id,cycle_start,cycle_end', ignoreDuplicates: true });
    if (insertError) throw new Error(`No fue posible preparar los ciclos: ${insertError.message}`);
  }
}

export async function getFlowsData(client: Client = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) return { hasHousehold: false as const, liquidity: 0, allocated: 0, unallocated: 0, funds: [], accounts: [], allocations: [] };
  await ensureDefaultFlowFunds(householdId, client);
  const [accountsResult, fundsResult, allocationsResult] = await Promise.all([
    client.from('accounts').select('id,name,type,balance,is_active,household_id').eq('household_id', householdId).eq('is_active', true).in('type', ['operativa', 'operational_cash']).order('display_order'),
    client.from('flow_funds').select('id,name,code,period_type,priority,is_active,household_id').eq('household_id', householdId).order('priority'),
    client.from('flow_allocations').select('id,household_id,fund_id,cycle_id,account_id,amount,notes,created_at').eq('household_id', householdId).order('created_at', { ascending: false })
  ]);
  const error = accountsResult.error ?? fundsResult.error ?? allocationsResult.error;
  if (error) throw new Error(`No fue posible consultar Flujos: ${error.message}`);
  const fundRows = fundsResult.data ?? [];
  await ensureActiveFlowCycles(householdId, fundRows, client);
  const cyclesResult = await client.from('flow_cycles').select('id,household_id,fund_id,cycle_start,cycle_end,cycle_label,target_amount,consumed_amount,status').eq('household_id', householdId).neq('status', 'closed');
  if (cyclesResult.error) throw new Error(`No fue posible consultar los ciclos: ${cyclesResult.error.message}`);
  const accounts = (accountsResult.data ?? []).map((row) => ({ id: row.id, name: row.name, type: row.type, balance: Number(row.balance), isActive: row.is_active, householdId: row.household_id }));
  const allocations = (allocationsResult.data ?? []).map((row) => ({ id: row.id, householdId: row.household_id, fundId: row.fund_id, cycleId: row.cycle_id, accountId: row.account_id, amount: Number(row.amount), notes: row.notes, createdAt: row.created_at }));
  const amounts: FlowAllocationAmount[] = allocations;
  const flowAccounts: FlowAccount[] = accounts;
  const cycles = cyclesResult.data ?? [];
  const funds = fundRows.map((row) => {
    const cycle = cycles.find((item) => item.fund_id === row.id);
    const assignedAmount = cycle ? getAllocatedByCycle(amounts, householdId, cycle.id) : 0;
    const targetAmount = Number(cycle?.target_amount ?? 0); const consumedAmount = Number(cycle?.consumed_amount ?? 0);
    return { id: row.id, name: row.name, code: row.code, periodType: row.period_type, priority: row.priority, isActive: row.is_active, totalAllocated: assignedAmount, cycle: cycle ? { id: cycle.id, cycleStart: cycle.cycle_start, cycleEnd: cycle.cycle_end, cycleLabel: cycle.cycle_label, targetAmount, assignedAmount, consumedAmount, remainingAmount: calculateRemainingAmount(assignedAmount, consumedAmount), missingAmount: calculateMissingAmount(targetAmount, assignedAmount), status: calculateCycleStatus(assignedAmount, targetAmount, consumedAmount, cycle.status) } : null };
  });
  // Una asignación sigue reservando dinero aunque su ciclo llegue a cerrarse. El cierre futuro
  // deberá liberarla, trasladarla con una asignación nueva o dejarla para reasignación manual.
  return { hasHousehold: true as const, householdId, liquidity: getTotalLiquidity(flowAccounts, householdId), allocated: getTotalAllocated(amounts, householdId), unallocated: getUnallocatedMoney(flowAccounts, amounts, householdId), funds, accounts: accounts.map((account) => ({ ...account, available: account.balance - getAllocatedByAccount(amounts, householdId, account.id) })), allocations };
}

async function updateActiveCycle(cycleId: string, values: { target_amount?: number; consumed_amount?: number }, client: Client = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('Primero configura un hogar.');
  const { data, error } = await client.from('flow_cycles').update({ ...values, updated_at: new Date().toISOString() }).eq('id', cycleId).eq('household_id', householdId).neq('status', 'closed').select('id');
  if (error) throw new Error(`No fue posible actualizar el ciclo: ${error.message}`);
  if (!data?.length) throw new Error('El ciclo activo no existe o pertenece a otro hogar.');
}

export const updateFlowCycleTarget = (cycleId: string, amount: number, client: Client = supabaseAdmin) => updateActiveCycle(cycleId, { target_amount: amount }, client);
export async function updateFlowCycleConsumed(cycleId: string, amount: number, client: Client = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('Primero configura un hogar.');
  const { error } = await client.rpc('update_flow_cycle_consumed', { p_household_id: householdId, p_cycle_id: cycleId, p_amount: amount });
  if (error) throw new Error(error.message.includes('consumed_exceeds_assigned') ? 'El consumo no puede superar el importe asignado al ciclo.' : `No fue posible actualizar el consumo: ${error.message}`);
}

export async function createFlowAllocation(input: z.infer<typeof flowAllocationCreateSchema>, client: Client = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('Primero configura un hogar.');
  const { data: fund, error: fundError } = await client.from('flow_funds').select('id,period_type').eq('id', input.fundId).eq('household_id', householdId).eq('is_active', true).single();
  if (fundError || !fund) throw new Error('El fondo no existe o pertenece a otro hogar.');
  await ensureActiveFlowCycles(householdId, [fund], client);
  const { error } = await client.rpc('create_flow_allocation', { p_household_id: householdId, p_fund_id: input.fundId, p_account_id: input.accountId, p_amount: input.amount, p_notes: input.notes || null });
  if (error) throw new Error(error.message.includes('insufficient') ? 'El importe supera el saldo sin asignar de la cuenta.' : `No fue posible crear la asignación: ${error.message}`);
}

export async function deleteFlowAllocation(allocationId: string, client: Client = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('Primero configura un hogar.');
  const { data, error } = await client.from('flow_allocations').delete().eq('id', allocationId).eq('household_id', householdId).select('id');
  if (error) throw new Error(`No fue posible eliminar la asignación: ${error.message}`);
  if (!data?.length) throw new Error('La asignación no existe o pertenece a otro hogar.');
}
