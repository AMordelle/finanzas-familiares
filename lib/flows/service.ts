import { z } from 'zod';
import { supabaseAdmin } from '@/lib/db/supabase';
import { getDefaultHouseholdId } from '@/lib/db/queries';
import { getAllocatedByAccount, getAllocatedByFund, getTotalAllocated, getTotalLiquidity, getUnallocatedMoney, type FlowAccount, type FlowAllocationAmount } from './calculations';

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

type Client = typeof supabaseAdmin;

export async function ensureDefaultFlowFunds(householdId: string, client: Client = supabaseAdmin) {
  const rows = DEFAULT_FLOW_FUNDS.map(([name, code, periodType], index) => ({ household_id: householdId, name, code, period_type: periodType, priority: index + 1, is_active: true }));
  const { error } = await client.from('flow_funds').upsert(rows, { onConflict: 'household_id,code', ignoreDuplicates: true });
  if (error) throw new Error(`No fue posible preparar los fondos: ${error.message}`);
}

export async function getFlowsData(client: Client = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) return { hasHousehold: false as const, liquidity: 0, allocated: 0, unallocated: 0, funds: [], accounts: [], allocations: [] };
  await ensureDefaultFlowFunds(householdId, client);
  const [accountsResult, fundsResult, allocationsResult] = await Promise.all([
    client.from('accounts').select('id,name,type,balance,is_active,household_id').eq('household_id', householdId).eq('is_active', true).in('type', ['operativa', 'operational_cash']).order('display_order'),
    client.from('flow_funds').select('id,name,code,priority,is_active,household_id').eq('household_id', householdId).order('priority'),
    client.from('flow_allocations').select('id,household_id,fund_id,account_id,amount,notes,created_at').eq('household_id', householdId).order('created_at', { ascending: false })
  ]);
  const error = accountsResult.error ?? fundsResult.error ?? allocationsResult.error;
  if (error) throw new Error(`No fue posible consultar Flujos: ${error.message}`);
  const accounts = (accountsResult.data ?? []).map((row) => ({ id: row.id, name: row.name, type: row.type, balance: Number(row.balance), isActive: row.is_active, householdId: row.household_id }));
  const allocations = (allocationsResult.data ?? []).map((row) => ({ id: row.id, householdId: row.household_id, fundId: row.fund_id, accountId: row.account_id, amount: Number(row.amount), notes: row.notes, createdAt: row.created_at }));
  const amounts: FlowAllocationAmount[] = allocations;
  const flowAccounts: FlowAccount[] = accounts;
  const funds = (fundsResult.data ?? []).map((row) => ({ id: row.id, name: row.name, code: row.code, priority: row.priority, isActive: row.is_active, totalAllocated: getAllocatedByFund(amounts, householdId, row.id) }));
  return { hasHousehold: true as const, householdId, liquidity: getTotalLiquidity(flowAccounts, householdId), allocated: getTotalAllocated(amounts, householdId), unallocated: getUnallocatedMoney(flowAccounts, amounts, householdId), funds, accounts: accounts.map((account) => ({ ...account, available: account.balance - getAllocatedByAccount(amounts, householdId, account.id) })), allocations };
}

export async function createFlowAllocation(input: z.infer<typeof flowAllocationCreateSchema>, client: Client = supabaseAdmin) {
  const householdId = await getDefaultHouseholdId(client);
  if (!householdId) throw new Error('Primero configura un hogar.');
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
