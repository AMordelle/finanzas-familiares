export const LIQUID_ACCOUNT_TYPES = ['operativa', 'operational_cash'] as const;

export type FlowAccount = { id: string; householdId: string; type: string; balance: number; isActive: boolean };
export type FlowAllocationAmount = { householdId: string; accountId: string; fundId: string; amount: number };

export function isLiquidAccount(account: FlowAccount) {
  return account.isActive && (LIQUID_ACCOUNT_TYPES as readonly string[]).includes(account.type) && Number.isFinite(account.balance) && account.balance > 0;
}

export function getTotalLiquidity(accounts: FlowAccount[], householdId: string) {
  return accounts.filter((account) => account.householdId === householdId && isLiquidAccount(account)).reduce((total, account) => total + account.balance, 0);
}

export function getTotalAllocated(allocations: FlowAllocationAmount[], householdId: string) {
  return allocations.filter((item) => item.householdId === householdId).reduce((total, item) => total + item.amount, 0);
}

export function getUnallocatedMoney(accounts: FlowAccount[], allocations: FlowAllocationAmount[], householdId: string) {
  return getTotalLiquidity(accounts, householdId) - getTotalAllocated(allocations, householdId);
}

function allocatedBy(allocations: FlowAllocationAmount[], householdId: string, key: 'accountId' | 'fundId', id: string) {
  return allocations.filter((item) => item.householdId === householdId && item[key] === id).reduce((total, item) => total + item.amount, 0);
}

export const getAllocatedByAccount = (allocations: FlowAllocationAmount[], householdId: string, accountId: string) => allocatedBy(allocations, householdId, 'accountId', accountId);
export const getAllocatedByFund = (allocations: FlowAllocationAmount[], householdId: string, fundId: string) => allocatedBy(allocations, householdId, 'fundId', fundId);

export function getAvailableByAccount(account: FlowAccount, allocations: FlowAllocationAmount[], householdId: string) {
  if (account.householdId !== householdId || !isLiquidAccount(account)) return 0;
  return account.balance - getAllocatedByAccount(allocations, householdId, account.id);
}

export function validateAllocation(input: { householdId: string; account: FlowAccount; fundHouseholdId: string; amount: number; allocations: FlowAllocationAmount[] }) {
  if (input.account.householdId !== input.householdId || input.fundHouseholdId !== input.householdId) throw new Error('La cuenta o el fondo pertenece a otro hogar.');
  if (!isLiquidAccount(input.account)) throw new Error('La cuenta no representa liquidez operativa.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('El importe debe ser mayor que cero.');
  if (input.amount > getAvailableByAccount(input.account, input.allocations, input.householdId)) throw new Error('El importe supera el saldo sin asignar de la cuenta.');
  return { ...input.account };
}
