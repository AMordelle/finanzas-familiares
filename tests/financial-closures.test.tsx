import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Db = Record<string, any[]>;

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private filters: Array<{ field: string; op: 'eq' | 'in' | 'gte' | 'lte'; value: any }> = [];
  private orderBy: Array<{ field: string; ascending: boolean }> = [];
  private limitValue: number | null = null;
  private payload: any = null;

  constructor(private table: string, private db: Db) {}

  select(_columns = '*') {
    return this;
  }

  insert(payload: any) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  upsert(payload: any) {
    this.action = 'upsert';
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ field, op: 'eq', value });
    return this;
  }

  in(field: string, value: any[]) {
    this.filters.push({ field, op: 'in', value });
    return this;
  }

  gte(field: string, value: any) {
    this.filters.push({ field, op: 'gte', value });
    return this;
  }

  lte(field: string, value: any) {
    this.filters.push({ field, op: 'lte', value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ field, ascending: options?.ascending ?? true });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  then(resolve: (value: any) => any) {
    return Promise.resolve(this.execute()).then(resolve);
  }

  single() {
    const result = this.execute();
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return Promise.resolve({ data: row ?? null, error: result.error });
  }

  maybeSingle() {
    const result = this.execute();
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    return Promise.resolve({ data: row ?? null, error: result.error });
  }

  private matches(row: Record<string, any>) {
    return this.filters.every((filter) => {
      if (filter.op === 'eq') return row[filter.field] === filter.value;
      if (filter.op === 'in') return filter.value.includes(row[filter.field]);
      if (filter.op === 'gte') return row[filter.field] >= filter.value;
      if (filter.op === 'lte') return row[filter.field] <= filter.value;
      return true;
    });
  }

  private execute() {
    const rows = this.db[this.table] ?? [];

    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item, index) => ({
        id: item.id ?? `${this.table}-${rows.length + index + 1}`,
        created_at: item.created_at ?? '2026-05-09T00:00:00.000Z',
        updated_at: item.updated_at ?? '2026-05-09T00:00:00.000Z',
        ...item
      }));
      this.db[this.table] = [...rows, ...inserted];
      return { data: inserted, error: null };
    }

    if (this.action === 'upsert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const item of items) {
        const existingIndex = rows.findIndex((row) => row.id === item.id);
        if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...item };
        else rows.push({ created_at: '2026-05-09T00:00:00.000Z', ...item });
      }
      return { data: items, error: null };
    }

    if (this.action === 'update') {
      const updated = rows.filter((row) => this.matches(row)).map((row) => Object.assign(row, this.payload));
      return { data: updated, error: null };
    }

    if (this.action === 'delete') {
      const deleted = rows.filter((row) => this.matches(row));
      this.db[this.table] = rows.filter((row) => !this.matches(row));
      return { data: deleted, error: null };
    }

    let data = rows.filter((row) => this.matches(row));
    for (const order of [...this.orderBy].reverse()) {
      data = [...data].sort((a, b) => {
        if (a[order.field] === b[order.field]) return 0;
        return (a[order.field] > b[order.field] ? 1 : -1) * (order.ascending ? 1 : -1);
      });
    }
    if (this.limitValue !== null) data = data.slice(0, this.limitValue);
    return { data, error: null };
  }
}

function createFakeSupabase(dbOverrides: Partial<Db> = {}) {
  const db: Db = {
    profiles: [{ id: 'profile-1', full_name: 'Usuario', created_at: '2026-05-01T00:00:00.000Z' }],
    household_members: [{ id: 'member-1', profile_id: 'profile-1', household_id: 'house-1' }],
    accounts: [
      { id: 'cash-1', household_id: 'house-1', name: 'Efectivo', type: 'operational_cash', balance: '1200.00', is_active: true },
      { id: 'bank-1', household_id: 'house-1', name: 'Banco', type: 'operational_cash', balance: '700.00', is_active: true },
      { id: 'card-1', household_id: 'house-1', name: 'TDC BBVA', type: 'credit_card', balance: '5000.00', is_active: true },
      { id: 'fund-1', household_id: 'house-1', name: 'Fondo emergencia', type: 'savings_fund', balance: '3000.00', is_active: true },
      { id: 'receivable-1', household_id: 'house-1', name: 'Préstamo Juan', type: 'receivable', balance: '900.00', is_active: true },
      { id: 'other-1', household_id: 'house-2', name: 'Otro hogar', type: 'operational_cash', balance: '9999.00', is_active: true }
    ],
    transaction_groups: [
      { id: 'income-1', household_id: 'house-1', note: 'Ingreso sueldo', created_at: '2026-05-03T00:00:00.000Z' },
      { id: 'expense-1', household_id: 'house-1', note: 'Supermercado', created_at: '2026-05-04T00:00:00.000Z' },
      { id: 'transfer-1', household_id: 'house-1', note: 'Traspaso', created_at: '2026-05-05T00:00:00.000Z' },
      { id: 'other-income', household_id: 'house-2', note: 'Otro ingreso', created_at: '2026-05-04T00:00:00.000Z' }
    ],
    transactions: [
      { id: 'tx-1', group_id: 'income-1', account_id: 'cash-1', type: 'debit', category: 'entrada_cuenta', amount: '500.00', happened_at: '2026-05-03T12:00:00.000Z' },
      { id: 'tx-2', group_id: 'income-1', account_id: null, type: 'credit', category: 'ingreso_sueldo', amount: '500.00', happened_at: '2026-05-03T12:00:00.000Z' },
      { id: 'tx-3', group_id: 'expense-1', account_id: null, type: 'debit', category: 'supermercado', amount: '200.00', happened_at: '2026-05-04T12:00:00.000Z' },
      { id: 'tx-4', group_id: 'expense-1', account_id: 'cash-1', type: 'credit', category: 'salida_cuenta', amount: '200.00', happened_at: '2026-05-04T12:00:00.000Z' },
      { id: 'tx-5', group_id: 'transfer-1', account_id: 'bank-1', type: 'debit', category: 'transferencia', amount: '100.00', happened_at: '2026-05-05T12:00:00.000Z' },
      { id: 'tx-6', group_id: 'transfer-1', account_id: 'cash-1', type: 'credit', category: 'transferencia', amount: '100.00', happened_at: '2026-05-05T12:00:00.000Z' },
      { id: 'tx-7', group_id: 'other-income', account_id: 'other-1', type: 'debit', category: 'entrada_cuenta', amount: '900.00', happened_at: '2026-05-04T12:00:00.000Z' },
      { id: 'tx-8', group_id: 'other-income', account_id: null, type: 'credit', category: 'ingreso_otro', amount: '900.00', happened_at: '2026-05-04T12:00:00.000Z' }
    ],
    financial_closures: [],
    ...dbOverrides
  };

  return {
    db,
    from(table: string) {
      return new FakeQueryBuilder(table, db);
    },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'profile-1' } }, error: null }))
    }
  };
}

describe('cierres financieros', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEV_PROFILE_ID = 'profile-1';
  });

  it('crea cierre semanal con totales principales solo operativos y snapshots completos', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createFinancialClosure } = await import('@/lib/db/queries');

    const closure = await createFinancialClosure({ type: 'weekly', periodStart: '2026-05-01', periodEnd: '2026-05-07', notes: 'Semana de prueba' });

    expect(closure.type).toBe('weekly');
    expect(closure.incomeTotal).toBe(500);
    expect(closure.expenseTotal).toBe(200);
    expect(closure.netFlow).toBe(300);
    expect(closure.closingTotal).toBe(1900);
    expect(closure.openingTotal).toBe(1600);
    expect(closure.netChange).toBe(300);
    expect(closure.accountSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'cash-1', accountScope: 'operational', openingBalance: 1000, closingBalance: 1200, difference: 200 }),
      expect.objectContaining({ accountId: 'bank-1', accountScope: 'operational', openingBalance: 600, closingBalance: 700, difference: 100 }),
      expect.objectContaining({ accountId: 'card-1', accountScope: 'complementary', closingBalance: 5000 }),
      expect.objectContaining({ accountId: 'fund-1', accountScope: 'complementary', closingBalance: 3000 }),
      expect.objectContaining({ accountId: 'receivable-1', accountScope: 'complementary', closingBalance: 900 })
    ]));
    expect(closure.accountSnapshots.reduce((acc, account) => acc + account.closingBalance, 0)).toBe(10800);
    expect(fakeClient.db.financial_closures).toHaveLength(1);
  });

  it('crea cierre mensual', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createFinancialClosure } = await import('@/lib/db/queries');

    const closure = await createFinancialClosure({ type: 'monthly', periodStart: '2026-05-01', periodEnd: '2026-05-31' });

    expect(closure.type).toBe('monthly');
    expect(closure.periodStart).toBe('2026-05-01');
    expect(closure.periodEnd).toBe('2026-05-31');
  });

  it('rechaza fecha inicial posterior a fecha final', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createFinancialClosure } = await import('@/lib/db/queries');

    await expect(createFinancialClosure({ type: 'weekly', periodStart: '2026-05-10', periodEnd: '2026-05-01' })).rejects.toThrow('La fecha inicial no puede ser posterior');
    expect(fakeClient.db.financial_closures).toHaveLength(0);
  });

  it('lista cierres por household sin mezclar otros hogares', async () => {
    const fakeClient = createFakeSupabase({
      financial_closures: [
        { id: 'closure-1', household_id: 'house-1', type: 'weekly', period_start: '2026-05-01', period_end: '2026-05-07', opening_total: '100.00', closing_total: '150.00', net_change: '50.00', income_total: '80.00', expense_total: '30.00', net_flow: '50.00', account_snapshots: [], movement_summary: null, notes: null, created_at: '2026-05-08T00:00:00.000Z', updated_at: '2026-05-08T00:00:00.000Z' },
        { id: 'closure-2', household_id: 'house-2', type: 'monthly', period_start: '2026-05-01', period_end: '2026-05-31', opening_total: '999.00', closing_total: '999.00', net_change: '0.00', income_total: '0.00', expense_total: '0.00', net_flow: '0.00', account_snapshots: [], movement_summary: null, notes: null, created_at: '2026-05-08T00:00:00.000Z', updated_at: '2026-05-08T00:00:00.000Z' }
      ]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getFinancialClosures } = await import('@/lib/db/queries');

    const result = await getFinancialClosures();

    expect(result.hasHousehold).toBe(true);
    expect(result.closures).toHaveLength(1);
    expect(result.closures[0].id).toBe('closure-1');
  });

  it('crear cierre no modifica cuentas ni movimientos', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createFinancialClosure } = await import('@/lib/db/queries');
    const accountsBefore = JSON.stringify(fakeClient.db.accounts);
    const transactionsBefore = JSON.stringify(fakeClient.db.transactions);

    await createFinancialClosure({ type: 'weekly', periodStart: '2026-05-01', periodEnd: '2026-05-07' });

    expect(JSON.stringify(fakeClient.db.accounts)).toBe(accountsBefore);
    expect(JSON.stringify(fakeClient.db.transactions)).toBe(transactionsBefore);
  });


  it('tarjetas, fondos y receivables quedan como complementarias y no inflan dinero operativo', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createFinancialClosure } = await import('@/lib/db/queries');

    const closure = await createFinancialClosure({ type: 'weekly', periodStart: '2026-05-01', periodEnd: '2026-05-07' });

    expect(closure.closingTotal).toBe(1900);
    expect(closure.accountSnapshots.filter((account) => account.accountScope === 'complementary').map((account) => account.accountId)).toEqual(['card-1', 'fund-1', 'receivable-1']);
  });

  it('recalcular cierre actualiza snapshot y mantiene el mismo id', async () => {
    const fakeClient = createFakeSupabase({
      financial_closures: [{
        id: 'closure-recalc',
        household_id: 'house-1',
        type: 'weekly',
        period_start: '2026-05-01',
        period_end: '2026-05-07',
        opening_total: '9999.00',
        closing_total: '9999.00',
        net_change: '0.00',
        income_total: '0.00',
        expense_total: '0.00',
        net_flow: '0.00',
        account_snapshots: [],
        movement_summary: null,
        notes: 'Mantener nota',
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-08T00:00:00.000Z'
      }]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { recalculateFinancialClosure } = await import('@/lib/db/queries');

    const closure = await recalculateFinancialClosure({ closureId: 'closure-recalc' });

    expect(closure.id).toBe('closure-recalc');
    expect(closure.createdAt).toBe('2026-05-08T00:00:00.000Z');
    expect(closure.notes).toBe('Mantener nota');
    expect(closure.openingTotal).toBe(1600);
    expect(closure.closingTotal).toBe(1900);
    expect(closure.accountSnapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'card-1', accountScope: 'complementary' })
    ]));
  });

  it('recalcular y eliminar validan ownership por household', async () => {
    const fakeClient = createFakeSupabase({
      financial_closures: [{
        id: 'foreign-closure',
        household_id: 'house-2',
        type: 'weekly',
        period_start: '2026-05-01',
        period_end: '2026-05-07',
        opening_total: '1.00',
        closing_total: '1.00',
        net_change: '0.00',
        income_total: '0.00',
        expense_total: '0.00',
        net_flow: '0.00',
        account_snapshots: [],
        movement_summary: null,
        notes: null,
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-08T00:00:00.000Z'
      }]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { deleteFinancialClosure, recalculateFinancialClosure } = await import('@/lib/db/queries');

    await expect(recalculateFinancialClosure({ closureId: 'foreign-closure' })).rejects.toThrow('No se encontró');
    await expect(deleteFinancialClosure({ closureId: 'foreign-closure' })).rejects.toThrow('No se encontró');
    expect(fakeClient.db.financial_closures).toHaveLength(1);
  });

  it('eliminar cierre funciona y lo remueve del listado', async () => {
    const fakeClient = createFakeSupabase({
      financial_closures: [{
        id: 'closure-delete',
        household_id: 'house-1',
        type: 'monthly',
        period_start: '2026-05-01',
        period_end: '2026-05-31',
        opening_total: '100.00',
        closing_total: '120.00',
        net_change: '20.00',
        income_total: '20.00',
        expense_total: '0.00',
        net_flow: '20.00',
        account_snapshots: [],
        movement_summary: null,
        notes: null,
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-08T00:00:00.000Z'
      }]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { deleteFinancialClosure, getFinancialClosures } = await import('@/lib/db/queries');

    await deleteFinancialClosure({ closureId: 'closure-delete' });
    const result = await getFinancialClosures();

    expect(result.closures).toHaveLength(0);
    expect(fakeClient.db.financial_closures).toHaveLength(0);
  });
});

describe('CierrePage', () => {
  it('renderiza pantalla /cierre con formulario y lista', async () => {
    vi.resetModules();
    vi.doMock('@/components/app-shell', () => ({
      AppShell: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>
    }));
    vi.doMock('@/app/cierre/actions', () => ({ createFinancialClosureAction: vi.fn(), recalculateFinancialClosureAction: vi.fn(), deleteFinancialClosureAction: vi.fn() }));
    vi.doMock('@/lib/db/queries', () => ({
      getFinancialClosures: vi.fn(async () => ({
        hasHousehold: true,
        closures: [{
          id: 'closure-1',
          householdId: 'house-1',
          type: 'weekly',
          periodStart: '2026-05-01',
          periodEnd: '2026-05-07',
          openingTotal: 1600,
          closingTotal: 1900,
          netChange: 300,
          incomeTotal: 500,
          expenseTotal: 200,
          netFlow: 300,
          accountSnapshots: [
            { accountId: 'cash-1', accountName: 'Efectivo', accountType: 'operational_cash', accountScope: 'operational', openingBalance: 1000, closingBalance: 1200, difference: 200 },
            { accountId: 'card-1', accountName: 'TDC BBVA', accountType: 'credit_card', accountScope: 'complementary', openingBalance: 4500, closingBalance: 5000, difference: 500 }
          ],
          movementSummary: null,
          notes: 'Semana de prueba',
          createdAt: '2026-05-08T00:00:00.000Z',
          updatedAt: '2026-05-08T00:00:00.000Z'
        }]
      }))
    }));
    const CierrePage = (await import('@/app/cierre/page')).default;

    const html = renderToStaticMarkup(await CierrePage());

    expect(html).toContain('Cierre');
    expect(html).toContain('Compara cómo empezaste y cómo terminaste un periodo.');
    expect(html).toContain('Tipo de cierre');
    expect(html).toContain('Fecha inicial');
    expect(html).toContain('Fecha final');
    expect(html).toContain('Crear cierre');
    expect(html).toContain('Cierres creados');
    expect(html).toContain('Semanal');
    expect(html).toContain('Dinero operativo real');
    expect(html).toContain('Ver cuentas complementarias');
    expect(html).toContain('Cuentas operativas');
    expect(html).toContain('Cuentas complementarias');
    expect(html).toContain('Recalcular cierre');
    expect(html).toContain('Eliminar cierre');
    expect(html).toContain('Efectivo');
    expect(html).toContain('TDC BBVA');
  });
});
