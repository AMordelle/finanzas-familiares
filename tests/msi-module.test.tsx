import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MsiManager } from '@/components/msi/msi-manager';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private filters: Array<{ field: string; value: unknown; op: 'eq' | 'in' }> = [];
  private selected = '*';
  private payload: any = null;

  constructor(private table: string, private db: Record<string, any[]>) {}

  select(columns = '*') { this.selected = columns; return this; }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  eq(field: string, value: unknown) { this.filters.push({ field, value, op: 'eq' }); return this; }
  in(field: string, value: unknown[]) { this.filters.push({ field, value, op: 'in' }); return this; }
  order() { return this; }
  limit() { return this; }

  then(resolve: (v: any) => any) { return Promise.resolve(this.execute()).then(resolve); }
  single() { const result = this.execute(); return Promise.resolve({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error }); }
  maybeSingle() { return this.single(); }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => filter.op === 'eq' ? row[filter.field] === filter.value : (filter.value as unknown[]).includes(row[filter.field]));
  }

  private execute() {
    const rows = this.db[this.table] ?? [];
    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item, index) => ({
        id: item.id ?? `${this.table}-${rows.length + index + 1}`,
        created_at: item.created_at ?? '2026-05-10T00:00:00.000Z',
        updated_at: item.updated_at ?? '2026-05-10T00:00:00.000Z',
        ...item
      }));
      this.db[this.table] = [...rows, ...inserted];
      return { data: this.pickColumns(inserted), error: null };
    }
    if (this.action === 'update') {
      const matchedIndexes = rows.map((row, index) => this.matches(row) ? index : -1).filter((index) => index >= 0);
      const updated = rows.map((row) => this.matches(row) ? { ...row, ...this.payload } : row);
      const changed = matchedIndexes.map((index) => updated[index]);
      this.db[this.table] = updated;
      return { data: this.pickColumns(changed), error: null };
    }
    if (this.action === 'delete') {
      this.db[this.table] = rows.filter((row) => !this.matches(row));
      return { data: [], error: null };
    }
    return { data: this.pickColumns(rows.filter((row) => this.matches(row))), error: null };
  }

  private pickColumns(rows: any[]) {
    if (this.selected === '*') return rows;
    const cols = this.selected.split(',').map((col) => col.trim());
    return rows.map((row) => Object.fromEntries(cols.map((col) => [col, row[col]])));
  }
}

function createFakeSupabase() {
  const db: Record<string, any[]> = {
    profiles: [{ id: 'profile-1', created_at: '2026-01-01T00:00:00.000Z' }],
    household_members: [{ id: 'member-1', profile_id: 'profile-1', household_id: 'house-1' }],
    accounts: [
      { id: 'acc-tdc', household_id: 'house-1', name: 'TDC BBVA', type: 'credit_card', balance: '0', is_active: true },
      { id: 'acc-cash', household_id: 'house-1', name: 'Efectivo', type: 'operational_cash', balance: '1000', is_active: true }
    ],
    transaction_groups: [],
    transactions: [],
    msi_purchases: [],
    msi_installments: [],
    income_sources: [],
    obligations: [],
    variable_spending_profiles: [],
    financial_snapshots: []
  };
  return { db, from: (table: string) => new FakeQueryBuilder(table, db) };
}

vi.mock('@/lib/db/supabase', () => ({ supabaseAdmin: createFakeSupabase() }));

describe('módulo MSI', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registra solo la mensualidad, crea compra MSI e installments', async () => {
    const { supabaseAdmin } = await import('@/lib/db/supabase');
    const { saveConversationalTransaction } = await import('@/lib/db/queries');

    await saveConversationalTransaction({
      rawText: 'Gasté 1200 en ropa a 3 MSI con TDC BBVA',
      normalizedText: 'gaste 1200 en ropa a 3 msi con tdc bbva',
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      action: 'msi_purchase',
      amount: 400,
      totalAmount: 1200,
      months: 3,
      monthlyAmount: 400,
      description: 'Ropa',
      category: 'ropa',
      sourceAccountId: 'acc-tdc',
      sourceAccountName: 'TDC BBVA',
      sourceAccountType: 'credit_card',
      sourceAccount: 'tdc bbva',
      destinationAccount: undefined,
      missingFields: [],
      missingFieldKinds: [],
      confidence: 0.94
    } as any);

    expect(supabaseAdmin.db.transactions.map((tx: any) => tx.amount)).toEqual(['400.00', '400.00']);
    expect(supabaseAdmin.db.transactions.some((tx: any) => tx.amount === '1200.00')).toBe(false);
    expect(supabaseAdmin.db.msi_purchases[0]).toMatchObject({ total_amount: '1200.00', months: 3, monthly_amount: '400.00' });
    expect(supabaseAdmin.db.msi_installments).toHaveLength(3);
    expect(supabaseAdmin.db.msi_installments.every((item: any) => item.status === 'pending')).toBe(true);
  });

  it('rechaza MSI con cuenta no crediticia', async () => {
    const { saveConversationalTransaction } = await import('@/lib/db/queries');
    await expect(saveConversationalTransaction({
      rawText: 'Gasté 1200 en ropa a 3 MSI con efectivo',
      normalizedText: 'gaste 1200 en ropa a 3 msi con efectivo',
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      action: 'msi_purchase',
      amount: 400,
      totalAmount: 1200,
      months: 3,
      monthlyAmount: 400,
      description: 'Ropa',
      category: 'ropa',
      sourceAccountId: 'acc-cash',
      sourceAccountName: 'Efectivo',
      sourceAccountType: 'operational_cash',
      sourceAccount: 'efectivo',
      missingFields: [],
      missingFieldKinds: [],
      confidence: 0.94
    } as any)).rejects.toThrow('tarjetas o cuentas de crédito');
  });

  it('marca pagos como pagados, revierte a pendiente y no crea movimientos', async () => {
    const { supabaseAdmin } = await import('@/lib/db/supabase');
    const { markMsiInstallmentAsPaid, restoreMsiInstallmentToPending } = await import('@/lib/db/queries');
    supabaseAdmin.db.msi_purchases.push({ id: 'purchase-1', household_id: 'house-1', account_id: 'acc-tdc', description: 'Ropa', category: 'ropa', total_amount: '1200.00', months: 1, monthly_amount: '1200.00', purchase_date: '2026-05-10T00:00:00.000Z', status: 'active', created_at: '2026-05-10T00:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' });
    supabaseAdmin.db.msi_installments.push({ id: 'inst-1', household_id: 'house-1', msi_purchase_id: 'purchase-1', installment_number: 1, amount: '1200.00', due_date: null, status: 'pending', paid_at: null, created_at: '2026-05-10T00:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' });
    const txCount = supabaseAdmin.db.transactions.length;

    await markMsiInstallmentAsPaid({ installmentId: 'inst-1' });
    expect(supabaseAdmin.db.msi_installments.find((item: any) => item.id === 'inst-1').status).toBe('paid');
    expect(supabaseAdmin.db.msi_purchases.find((item: any) => item.id === 'purchase-1').status).toBe('completed');
    expect(supabaseAdmin.db.transactions).toHaveLength(txCount);

    await restoreMsiInstallmentToPending({ installmentId: 'inst-1' });
    expect(supabaseAdmin.db.msi_installments.find((item: any) => item.id === 'inst-1').status).toBe('pending');
    expect(supabaseAdmin.db.msi_purchases.find((item: any) => item.id === 'purchase-1').status).toBe('active');
    expect(supabaseAdmin.db.transactions).toHaveLength(txCount);
  });

  it('renderiza la pantalla MSI en español con resumen y controles', () => {
    const html = renderToStaticMarkup(<MsiManager initialData={{
      hasHousehold: true,
      summary: { activePurchases: 1, pendingTotal: 800, pendingInstallments: 2, paidInstallments: 1 },
      purchases: [{
        id: 'purchase-1', householdId: 'house-1', accountId: 'acc-tdc', accountName: 'TDC BBVA', description: 'Ropa', category: 'ropa', totalAmount: 1200, months: 3, monthlyAmount: 400, purchaseDate: '2026-05-10T00:00:00.000Z', status: 'active', createdAt: '2026-05-10T00:00:00.000Z', updatedAt: '2026-05-10T00:00:00.000Z', installments: [
          { id: 'i1', householdId: 'house-1', msiPurchaseId: 'purchase-1', installmentNumber: 1, amount: 400, dueDate: null, status: 'paid', paidAt: '2026-05-10T00:00:00.000Z', createdAt: '', updatedAt: '' },
          { id: 'i2', householdId: 'house-1', msiPurchaseId: 'purchase-1', installmentNumber: 2, amount: 400, dueDate: null, status: 'pending', paidAt: null, createdAt: '', updatedAt: '' }
        ] }
      ]
    }} />);
    expect(html).toContain('Compras activas');
    expect(html).toContain('Total pendiente MSI');
    expect(html).toContain('Ropa');
    expect(html).toContain('Marcar como pagado');
    expect(html).toContain('Regresar a pendiente');
  });
});
