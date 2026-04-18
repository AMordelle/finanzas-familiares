import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountsManager } from '@/components/cuentas/accounts-manager';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

vi.mock('@/app/cuentas/actions', () => ({
  createAccountAction: vi.fn(),
  updateAccountAction: vi.fn(),
  deactivateAccountAction: vi.fn()
}));

const accounts = [
  {
    id: 'acc-1',
    name: 'Cuenta principal',
    type: 'operational_cash',
    balance: 23233.91,
    isActive: true,
    periodicPayment: null,
    paymentDay: null,
    counterparty: null
  },
  {
    id: 'acc-2',
    name: 'Caja secundaria',
    type: 'operational_cash',
    balance: 1000,
    isActive: true,
    periodicPayment: null,
    paymentDay: null,
    counterparty: null
  },
  {
    id: 'acc-3',
    name: 'Tarjeta',
    type: 'credit_card',
    balance: 14412.82,
    isActive: true,
    periodicPayment: 1200,
    paymentDay: 15,
    counterparty: null
  }
];

describe('Accounts grouped totals formatting', () => {
  it('shows exact cents in grouped totals and does not round to integer values', () => {
    const html = renderToStaticMarkup(<AccountsManager accounts={accounts} />);

    expect(html).toContain('Dinero operativo — $24,233.91');
    expect(html).toContain('Tarjetas de crédito — $14,412.82');
    expect(html).not.toContain('Dinero operativo — $24,234');
    expect(html).not.toContain('Tarjetas de crédito — $14,413');
  });

  it('uses one money formatter with two decimals consistently in account grouping UI', () => {
    expect(formatCurrencyMXN(5848.37)).toBe('$5,848.37');
    expect(formatCurrencyMXN(14412.8)).toBe('$14,412.80');

    const html = renderToStaticMarkup(<AccountsManager accounts={accounts} />);
    expect(html).toContain('Saldo: $23,233.91');
    expect(html).toContain('Saldo: $1,000.00');
    expect(html).toContain('2 cuentas');
  });
});
