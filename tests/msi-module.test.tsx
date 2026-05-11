import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MsiManager, PurchaseCard } from '@/components/msi/msi-manager';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

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
    const { supabaseAdmin: rawSupabaseAdmin } = await import('@/lib/db/supabase');
    const supabaseAdmin = rawSupabaseAdmin as any;
    const { saveConversationalTransaction } = await import('@/lib/db/queries');

    await saveConversationalTransaction({
      rawText: 'Gasté 1200 en ropa a 3 MSI con TDC BBVA',
      normalizedText: 'gaste 1200 en ropa a 3 msi con tdc bbva',
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      action: 'msi_purchase',
      amount: 400,
      totalAmount: 1200,
      financingType: 'interest_free',
      originalAmount: 1200,
      totalFinancedAmount: 1200,
      interestCost: 0,
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
    expect(supabaseAdmin.db.msi_purchases[0]).toMatchObject({ financing_type: 'interest_free', original_amount: '1200.00', total_amount: '1200.00', total_financed_amount: '1200.00', interest_cost: '0.00', months: 3, monthly_amount: '400.00' });
    expect(supabaseAdmin.db.msi_installments).toHaveLength(3);
    expect(supabaseAdmin.db.msi_installments.every((item: any) => item.status === 'pending')).toBe(true);
  });



  it('registra compras con intereses usando mensualidad real e installments reales', async () => {
    const { supabaseAdmin: rawSupabaseAdmin } = await import('@/lib/db/supabase');
    const supabaseAdmin = rawSupabaseAdmin as any;
    const { saveConversationalTransaction } = await import('@/lib/db/queries');

    await saveConversationalTransaction({
      rawText: 'Compré una bocina de 2000 a 6 meses con intereses de 350 al mes con TDC BBVA',
      normalizedText: 'compre una bocina de 2000 a 6 meses con intereses de 350 al mes con tdc bbva',
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      action: 'msi_purchase',
      amount: 350,
      totalAmount: 2000,
      financingType: 'interest_bearing',
      originalAmount: 2000,
      totalFinancedAmount: 2100,
      interestCost: 100,
      months: 6,
      monthlyAmount: 350,
      description: 'Bocina',
      category: 'electronica',
      sourceAccountId: 'acc-tdc',
      sourceAccountName: 'TDC BBVA',
      sourceAccountType: 'credit_card',
      sourceAccount: 'tdc bbva',
      missingFields: [],
      missingFieldKinds: [],
      confidence: 0.94
    } as any);

    expect(supabaseAdmin.db.transactions.slice(-2).map((tx: any) => tx.amount)).toEqual(['350.00', '350.00']);
    expect(supabaseAdmin.db.transactions.some((tx: any) => tx.amount === '2000.00' || tx.amount === '2100.00')).toBe(false);
    expect(supabaseAdmin.db.msi_purchases.at(-1)).toMatchObject({ financing_type: 'interest_bearing', original_amount: '2000.00', total_amount: '2100.00', total_financed_amount: '2100.00', interest_cost: '100.00', months: 6, monthly_amount: '350.00' });
    expect(supabaseAdmin.db.msi_installments.slice(-6)).toHaveLength(6);
    expect(supabaseAdmin.db.msi_installments.slice(-6).every((item: any) => item.amount === '350.00')).toBe(true);
  });

  it('rechaza compra con intereses si total financiado es menor al monto original', async () => {
    const { saveConversationalTransaction } = await import('@/lib/db/queries');
    await expect(saveConversationalTransaction({
      rawText: 'Compré una bocina de 2000 a 6 pagos de 300 con TDC BBVA',
      normalizedText: 'compre una bocina de 2000 a 6 pagos de 300 con tdc bbva',
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      action: 'msi_purchase',
      amount: 300,
      totalAmount: 2000,
      financingType: 'interest_bearing',
      originalAmount: 2000,
      totalFinancedAmount: 1800,
      interestCost: 0,
      months: 6,
      monthlyAmount: 300,
      description: 'Bocina',
      category: 'electronica',
      sourceAccountId: 'acc-tdc',
      sourceAccountName: 'TDC BBVA',
      sourceAccountType: 'credit_card',
      sourceAccount: 'tdc bbva',
      missingFields: [],
      missingFieldKinds: [],
      confidence: 0.94
    } as any)).rejects.toThrow('total financiado');
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
      financingType: 'interest_free',
      originalAmount: 1200,
      totalFinancedAmount: 1200,
      interestCost: 0,
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
    const { supabaseAdmin: rawSupabaseAdmin } = await import('@/lib/db/supabase');
    const supabaseAdmin = rawSupabaseAdmin as any;
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

  it('elimina compra MSI con installments sin tocar movimientos ni saldos y desaparece del módulo', async () => {
    const { supabaseAdmin: rawSupabaseAdmin } = await import('@/lib/db/supabase');
    const supabaseAdmin = rawSupabaseAdmin as any;
    const { deleteMsiPurchase, getMsiPurchases } = await import('@/lib/db/queries');
    supabaseAdmin.db.accounts.find((account: any) => account.id === 'acc-tdc').balance = '900.00';
    supabaseAdmin.db.transaction_groups.push({ id: 'group-delete-control', household_id: 'house-1', note: 'Movimiento mensual', created_at: '2026-05-10T00:00:00.000Z' });
    supabaseAdmin.db.transactions.push({ id: 'tx-delete-control', group_id: 'group-delete-control', account_id: 'acc-tdc', type: 'credit', category: 'salida_cuenta', amount: '400.00', happened_at: '2026-05-10T00:00:00.000Z' });
    supabaseAdmin.db.msi_purchases.push({ id: 'purchase-delete', household_id: 'house-1', account_id: 'acc-tdc', description: 'Compra error', category: 'ropa', financing_type: 'interest_free', original_amount: '1200.00', total_amount: '1200.00', total_financed_amount: '1200.00', interest_cost: '0.00', months: 3, monthly_amount: '400.00', purchase_date: '2026-05-10T00:00:00.000Z', status: 'active', created_at: '2026-05-10T00:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' });
    supabaseAdmin.db.msi_installments.push(
      { id: 'delete-inst-1', household_id: 'house-1', msi_purchase_id: 'purchase-delete', installment_number: 1, amount: '400.00', due_date: null, status: 'pending', paid_at: null, created_at: '2026-05-10T00:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' },
      { id: 'delete-inst-2', household_id: 'house-1', msi_purchase_id: 'purchase-delete', installment_number: 2, amount: '400.00', due_date: null, status: 'pending', paid_at: null, created_at: '2026-05-10T00:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' }
    );
    const txCount = supabaseAdmin.db.transactions.length;
    const balanceBefore = supabaseAdmin.db.accounts.find((account: any) => account.id === 'acc-tdc').balance;

    await deleteMsiPurchase({ purchaseId: 'purchase-delete' });

    expect(supabaseAdmin.db.msi_purchases.some((purchase: any) => purchase.id === 'purchase-delete')).toBe(false);
    expect(supabaseAdmin.db.msi_installments.some((installment: any) => installment.msi_purchase_id === 'purchase-delete')).toBe(false);
    expect(supabaseAdmin.db.transactions).toHaveLength(txCount);
    expect(supabaseAdmin.db.accounts.find((account: any) => account.id === 'acc-tdc').balance).toBe(balanceBefore);
    const data = await getMsiPurchases();
    expect(data.purchases.some((purchase) => purchase.id === 'purchase-delete')).toBe(false);
  });

  it('rechaza eliminar compra MSI de otro household', async () => {
    const { supabaseAdmin: rawSupabaseAdmin } = await import('@/lib/db/supabase');
    const supabaseAdmin = rawSupabaseAdmin as any;
    const { deleteMsiPurchase } = await import('@/lib/db/queries');
    supabaseAdmin.db.msi_purchases.push({ id: 'purchase-other-house', household_id: 'house-2', account_id: 'acc-tdc', description: 'Ajena', category: 'ropa', financing_type: 'interest_free', original_amount: '1200.00', total_amount: '1200.00', total_financed_amount: '1200.00', interest_cost: '0.00', months: 3, monthly_amount: '400.00', purchase_date: '2026-05-10T00:00:00.000Z', status: 'active', created_at: '2026-05-10T00:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' });

    await expect(deleteMsiPurchase({ purchaseId: 'purchase-other-house' })).rejects.toThrow('No se encontró');
    expect(supabaseAdmin.db.msi_purchases.some((purchase: any) => purchase.id === 'purchase-other-house')).toBe(true);
  });

  it('muestra botón eliminar solo dentro del detalle de la compra', () => {
    const purchase = {
      id: 'purchase-ui-delete', householdId: 'house-1', accountId: 'acc-tdc', accountName: 'TDC BBVA', description: 'Ropa', category: 'ropa', financingType: 'interest_free' as const, originalAmount: 1200, totalAmount: 1200, totalFinancedAmount: 1200, interestCost: 0, months: 3, monthlyAmount: 400, purchaseDate: '2026-05-10T00:00:00.000Z', status: 'active' as const, createdAt: '', updatedAt: '', installments: [
        { id: 'i1', householdId: 'house-1', msiPurchaseId: 'purchase-ui-delete', installmentNumber: 1, amount: 400, dueDate: null, status: 'pending' as const, paidAt: null, createdAt: '', updatedAt: '' }
      ]
    };
    const html = renderToStaticMarkup(<PurchaseCard purchase={purchase} isPending={false} onAction={() => undefined} onDelete={() => undefined} />);
    const summaryHtml = html.slice(0, html.indexOf('Monto original'));

    expect(html).toContain('Eliminar compra');
    expect(summaryHtml).not.toContain('Eliminar compra');
    expect(html.indexOf('Eliminar compra')).toBeGreaterThan(html.indexOf('Monto original'));
  });

  it('separa UI en apartados compactos con resúmenes y controles', () => {
    const sectionSummary = (activePurchases: number, pendingOriginalTotal: number, pendingFinancedTotal: number, pendingInterestCost: number, pendingInstallments: number, paidInstallments: number) => ({
      activePurchases,
      pendingOriginalTotal,
      pendingFinancedTotal,
      pendingInterestCost,
      pendingInstallments,
      paidInstallments
    });
    const html = renderToStaticMarkup(<MsiManager initialData={{
      hasHousehold: true,
      summary: {
        activePurchases: 2,
        pendingTotal: 2900,
        pendingInstallments: 7,
        paidInstallments: 1,
        interestFree: sectionSummary(1, 800, 800, 0, 2, 1),
        interestBearing: sectionSummary(1, 2000, 2100, 100, 6, 0)
      },
      purchases: [
        {
          id: 'purchase-1', householdId: 'house-1', accountId: 'acc-tdc', accountName: 'TDC BBVA', description: 'Ropa', category: 'ropa', financingType: 'interest_free', originalAmount: 1200, totalAmount: 1200, totalFinancedAmount: 1200, interestCost: 0, months: 3, monthlyAmount: 400, purchaseDate: '2026-05-10T00:00:00.000Z', status: 'active', createdAt: '2026-05-10T00:00:00.000Z', updatedAt: '2026-05-10T00:00:00.000Z', installments: [
            { id: 'i1', householdId: 'house-1', msiPurchaseId: 'purchase-1', installmentNumber: 1, amount: 400, dueDate: null, status: 'paid', paidAt: '2026-05-10T00:00:00.000Z', createdAt: '', updatedAt: '' },
            { id: 'i2', householdId: 'house-1', msiPurchaseId: 'purchase-1', installmentNumber: 2, amount: 400, dueDate: null, status: 'pending', paidAt: null, createdAt: '', updatedAt: '' }
          ]
        },
        {
          id: 'purchase-2', householdId: 'house-1', accountId: 'acc-tdc', accountName: 'TDC BBVA', description: 'Bocina', category: 'electronica', financingType: 'interest_bearing', originalAmount: 2000, totalAmount: 2100, totalFinancedAmount: 2100, interestCost: 100, months: 6, monthlyAmount: 350, purchaseDate: '2026-05-10T00:00:00.000Z', status: 'active', createdAt: '2026-05-10T00:00:00.000Z', updatedAt: '2026-05-10T00:00:00.000Z', installments: [
            { id: 'i3', householdId: 'house-1', msiPurchaseId: 'purchase-2', installmentNumber: 1, amount: 350, dueDate: null, status: 'pending', paidAt: null, createdAt: '', updatedAt: '' }
          ]
        }
      ]
    }} />);
    expect(html).toContain('Meses sin intereses');
    expect(html).toContain('Meses con intereses');
    expect(html).toContain('Ver compras sin intereses');
    expect(html).toContain('Ver compras con intereses');
    expect(html).toContain('Total original pendiente');
    expect(html).toContain('Financiado pendiente');
    expect(html).toContain('Intereses estimados');
    expect(html).not.toContain('Ropa');
    expect(html).not.toContain('Marcar como pagado');
  });
});
