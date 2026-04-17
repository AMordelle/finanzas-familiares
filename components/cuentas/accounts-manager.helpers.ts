const groupedLabels = {
  operational_cash: 'Dinero operativo',
  savings_fund: 'Fondos de ahorro',
  investment: 'Inversiones',
  credit_card: 'Tarjetas de crédito',
  loan: 'Préstamos',
  receivable: 'Por cobrar'
} as const;

export type ManagedAccountType = keyof typeof groupedLabels;

const groupedOrder: ManagedAccountType[] = ['operational_cash', 'credit_card', 'receivable', 'savings_fund', 'investment', 'loan'];

export type ManagedAccountLike = {
  id: string;
  name: string;
  type: string;
  balance: number;
  isActive: boolean;
  periodicPayment: number | null;
  paymentDay: number | null;
  counterparty: string | null;
};

export type AccountGroupSummary<T extends ManagedAccountLike = ManagedAccountLike> = {
  key: ManagedAccountType;
  label: string;
  accounts: T[];
  totalBalance: number;
};

export function accountsFormVisibilityReducer(state: boolean, action: 'expand_new' | 'start_edit' | 'cancel' | 'submit_success_create' | 'submit_success_edit') {
  switch (action) {
    case 'expand_new':
    case 'start_edit':
      return true;
    case 'cancel':
    case 'submit_success_create':
      return false;
    case 'submit_success_edit':
      return true;
    default:
      return state;
  }
}

export function normalizeType(rawType: string): ManagedAccountType | null {
  const aliases: Record<string, ManagedAccountType> = {
    operativa: 'operational_cash',
    fondo: 'savings_fund',
    inversion: 'investment',
    deuda: 'loan',
    por_cobrar: 'receivable',
    operational_cash: 'operational_cash',
    savings_fund: 'savings_fund',
    investment: 'investment',
    credit_card: 'credit_card',
    loan: 'loan',
    receivable: 'receivable'
  };

  return aliases[rawType] ?? null;
}

export function buildAccountGroupSummaries<T extends ManagedAccountLike>(accounts: T[]): AccountGroupSummary<T>[] {
  const groupedByType = accounts.reduce<Partial<Record<ManagedAccountType, T[]>>>((acc, account) => {
    const normalized = normalizeType(account.type);
    if (!normalized) return acc;
    acc[normalized] = [...(acc[normalized] ?? []), account];
    return acc;
  }, {});

  return groupedOrder
    .filter((groupKey) => (groupedByType[groupKey]?.length ?? 0) > 0)
    .map((groupKey) => {
      const groupAccounts = groupedByType[groupKey] ?? [];
      return {
        key: groupKey,
        label: groupedLabels[groupKey],
        accounts: groupAccounts,
        totalBalance: groupAccounts.reduce((total, account) => total + account.balance, 0)
      };
    });
}
