import { describe, expect, it } from 'vitest';
import { accountsFormVisibilityReducer, buildAccountGroupSummaries } from '@/components/cuentas/accounts-manager.helpers';

type ManagedAccountLike = {
  id: string;
  name: string;
  type: string;
  balance: number;
  isActive: boolean;
  periodicPayment: number | null;
  paymentDay: number | null;
  counterparty: string | null;
};

function makeAccount(overrides: Partial<ManagedAccountLike>): ManagedAccountLike {
  return {
    id: overrides.id ?? 'acc-1',
    name: overrides.name ?? 'Cuenta',
    type: overrides.type ?? 'operational_cash',
    balance: overrides.balance ?? 0,
    isActive: overrides.isActive ?? true,
    periodicPayment: overrides.periodicPayment ?? null,
    paymentDay: overrides.paymentDay ?? null,
    counterparty: overrides.counterparty ?? null
  };
}

describe('AccountsManager grouped totals', () => {
  it('renders grouped totals from real account balances', () => {
    const grouped = buildAccountGroupSummaries([
      makeAccount({ id: '1', type: 'operational_cash', balance: 1200 }),
      makeAccount({ id: '2', type: 'operational_cash', balance: 300 }),
      makeAccount({ id: '3', type: 'credit_card', balance: 900 }),
      makeAccount({ id: '4', type: 'receivable', balance: 450 })
    ]);

    expect(grouped.find((group) => group.key === 'operational_cash')?.totalBalance).toBe(1500);
    expect(grouped.find((group) => group.key === 'credit_card')?.totalBalance).toBe(900);
    expect(grouped.find((group) => group.key === 'receivable')?.totalBalance).toBe(450);
    expect(grouped.find((group) => group.key === 'operational_cash')?.accounts).toHaveLength(2);
  });

  it('updates totals when grouped source balances change', () => {
    const initial = buildAccountGroupSummaries([
      makeAccount({ id: '1', type: 'savings_fund', balance: 500 }),
      makeAccount({ id: '2', type: 'savings_fund', balance: 700 })
    ]);

    const updated = buildAccountGroupSummaries([
      makeAccount({ id: '1', type: 'savings_fund', balance: 500 }),
      makeAccount({ id: '2', type: 'savings_fund', balance: 1000 }),
      makeAccount({ id: '3', type: 'savings_fund', balance: 250 })
    ]);

    expect(initial.find((group) => group.key === 'savings_fund')?.totalBalance).toBe(1200);
    expect(updated.find((group) => group.key === 'savings_fund')?.totalBalance).toBe(1750);
  });
});

describe('AccountsManager collapsible form behavior', () => {
  it('form is hidden by default', () => {
    expect(accountsFormVisibilityReducer(false, 'cancel')).toBe(false);
  });

  it('form expands on demand', () => {
    expect(accountsFormVisibilityReducer(false, 'expand_new')).toBe(true);
  });

  it('form collapses on cancel', () => {
    expect(accountsFormVisibilityReducer(true, 'cancel')).toBe(false);
  });

  it('form collapses after successful create', () => {
    expect(accountsFormVisibilityReducer(true, 'submit_success_create')).toBe(false);
  });

  it('keeps form open after successful edit to avoid breaking edit flow', () => {
    expect(accountsFormVisibilityReducer(true, 'submit_success_edit')).toBe(true);
  });
});
