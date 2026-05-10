import { beforeEach, describe, expect, it, vi } from 'vitest';

type Db = Record<string, any[]>;

class FakeQueryBuilder {
  private filters: Array<{ field: string; op: 'eq' | 'in' | 'gte'; value: any }> = [];
  private orderBy: Array<{ field: string; ascending: boolean }> = [];
  private limitValue: number | null = null;

  constructor(private table: string, private db: Db) {}

  select(_columns = '*') { return this; }
  eq(field: string, value: any) { this.filters.push({ field, op: 'eq', value }); return this; }
  in(field: string, value: any[]) { this.filters.push({ field, op: 'in', value }); return this; }
  gte(field: string, value: any) { this.filters.push({ field, op: 'gte', value }); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orderBy.push({ field, ascending: options?.ascending ?? true }); return this; }
  limit(value: number) { this.limitValue = value; return this; }
  then(resolve: (value: any) => any) { return Promise.resolve(this.execute()).then(resolve); }
  maybeSingle() { const result = this.execute(); return Promise.resolve({ data: result.data[0] ?? null, error: result.error }); }

  private matches(row: Record<string, any>) {
    return this.filters.every((filter) => {
      if (filter.op === 'eq') return row[filter.field] === filter.value;
      if (filter.op === 'in') return filter.value.includes(row[filter.field]);
      if (filter.op === 'gte') return row[filter.field] >= filter.value;
      return true;
    });
  }

  private execute() {
    let data = (this.db[this.table] ?? []).filter((row) => this.matches(row));
    for (const order of [...this.orderBy].reverse()) {
      data = [...data].sort((a, b) => (a[order.field] === b[order.field] ? 0 : (a[order.field] > b[order.field] ? 1 : -1) * (order.ascending ? 1 : -1)));
    }
    if (this.limitValue !== null) data = data.slice(0, this.limitValue);
    return { data, error: null };
  }
}

function createFakeSupabase(dbOverrides: Partial<Db> = {}) {
  const db: Db = {
    household_members: [{ id: 'member-1', household_id: 'house-1' }],
    accounts: [
      { id: 'cash-1', household_id: 'house-1', name: 'Efectivo', type: 'operational_cash', balance: '1200.00', is_active: true },
      { id: 'bank-1', household_id: 'house-1', name: 'Banco', type: 'operativa', balance: '800.00', is_active: true },
      { id: 'card-1', household_id: 'house-1', name: 'TDC BBVA', type: 'credit_card', balance: '4500.00', is_active: true },
      { id: 'fund-1', household_id: 'house-1', name: 'Fondo emergencia', type: 'savings_fund', balance: '3000.00', is_active: true },
      { id: 'receivable-1', household_id: 'house-1', name: 'Cliente por cobrar', type: 'receivable', balance: '900.00', is_active: true },
      { id: 'loan-1', household_id: 'house-1', name: 'Préstamo', type: 'loan', balance: '10000.00', is_active: true }
    ],
    financial_closures: [
      { id: 'weekly-new', household_id: 'house-1', type: 'weekly', period_start: '2026-05-01', period_end: '2026-05-07', opening_total: '2300.00', closing_total: '2000.00', net_change: '-300.00', income_total: '1000.00', expense_total: '1300.00', net_flow: '-300.00', created_at: '2026-05-08T00:00:00.000Z' },
      { id: 'weekly-old', household_id: 'house-1', type: 'weekly', period_start: '2026-04-24', period_end: '2026-04-30', opening_total: '2100.00', closing_total: '2300.00', net_change: '200.00', income_total: '900.00', expense_total: '700.00', net_flow: '200.00', created_at: '2026-05-01T00:00:00.000Z' },
      { id: 'monthly-new', household_id: 'house-1', type: 'monthly', period_start: '2026-04-01', period_end: '2026-04-30', opening_total: '1800.00', closing_total: '2300.00', net_change: '500.00', income_total: '4000.00', expense_total: '3500.00', net_flow: '500.00', created_at: '2026-05-01T00:00:00.000Z' }
    ],
    transaction_groups: [
      { id: 'income-1', household_id: 'house-1' },
      { id: 'expense-1', household_id: 'house-1' },
      { id: 'expense-2', household_id: 'house-1' },
      { id: 'old-expense', household_id: 'house-1' }
    ],
    transactions: [
      { id: 'tx-1', group_id: 'income-1', account_id: 'cash-1', type: 'debit', category: 'entrada_cuenta', amount: '1000.00', happened_at: '2026-05-08T12:00:00.000Z' },
      { id: 'tx-2', group_id: 'income-1', account_id: null, type: 'credit', category: 'ingreso_fijo', amount: '1000.00', happened_at: '2026-05-08T12:00:00.000Z' },
      { id: 'tx-3', group_id: 'expense-1', account_id: null, type: 'debit', category: 'comida', amount: '300.00', happened_at: '2026-05-09T12:00:00.000Z' },
      { id: 'tx-4', group_id: 'expense-1', account_id: 'cash-1', type: 'credit', category: 'salida_cuenta', amount: '300.00', happened_at: '2026-05-09T12:00:00.000Z' },
      { id: 'tx-5', group_id: 'expense-2', account_id: null, type: 'debit', category: 'transporte', amount: '250.00', happened_at: '2026-04-20T12:00:00.000Z' },
      { id: 'tx-6', group_id: 'expense-2', account_id: 'bank-1', type: 'credit', category: 'salida_cuenta', amount: '250.00', happened_at: '2026-04-20T12:00:00.000Z' },
      { id: 'tx-7', group_id: 'old-expense', account_id: null, type: 'debit', category: 'comida', amount: '999.00', happened_at: '2026-03-01T12:00:00.000Z' },
      { id: 'tx-8', group_id: 'old-expense', account_id: 'cash-1', type: 'credit', category: 'salida_cuenta', amount: '999.00', happened_at: '2026-03-01T12:00:00.000Z' }
    ],
    extra_work_entries: [
      { id: 'extra-1', household_id: 'house-1', type: 'overtime', quantity: '4.50', status: 'pending' },
      { id: 'extra-2', household_id: 'house-1', type: 'piecework', quantity: '2.00', status: 'pending' },
      { id: 'extra-3', household_id: 'house-1', type: 'meals', quantity: '180.00', status: 'pending' },
      { id: 'extra-4', household_id: 'house-1', type: 'overtime', quantity: '9.00', status: 'paid' }
    ],
    ...dbOverrides
  };
  return { db, from: (table: string) => new FakeQueryBuilder(table, db) };
}

describe('Financial Advisor Engine v1', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.OPENAI_API_KEY;
  });

  it('buildFinancialAdvisorContext calcula dinero operativo con criterio de cierre y excluye tarjetas/fondos/receivables', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: fakeClient, supabase: fakeClient }));
    const { buildFinancialAdvisorContext } = await import('@/lib/finance/financialAdvisor');

    const context = await buildFinancialAdvisorContext('house-1', fakeClient as never, new Date('2026-05-10T00:00:00.000Z'));

    expect(context.operationalMoney.currentAmount).toBe(2000);
    expect(context.operationalMoney.includedAccounts).toEqual(['Efectivo', 'Banco']);
    expect(context.operationalMoney.excludedAccounts).toEqual(expect.arrayContaining(['TDC BBVA', 'Fondo emergencia', 'Cliente por cobrar', 'Préstamo']));
  });

  it('incluye cierres recientes, ingresos/gastos, top categorías, extras pendientes y tarjetas como presión', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: fakeClient, supabase: fakeClient }));
    const { buildFinancialAdvisorContext } = await import('@/lib/finance/financialAdvisor');

    const context = await buildFinancialAdvisorContext('house-1', fakeClient as never, new Date('2026-05-10T00:00:00.000Z'));

    expect(context.recentClosures.latestWeekly).toMatchObject({ periodStart: '2026-05-01', periodEnd: '2026-05-07', netChange: -300 });
    expect(context.recentClosures.previousWeekly).toMatchObject({ periodStart: '2026-04-24', periodEnd: '2026-04-30', netChange: 200 });
    expect(context.recentClosures.latestMonthly).toMatchObject({ periodStart: '2026-04-01', periodEnd: '2026-04-30', netFlow: 500 });
    expect(context.recentMovements).toMatchObject({ last7DaysIncome: 1000, last7DaysExpenses: 300, last30DaysIncome: 1000, last30DaysExpenses: 550 });
    expect(context.recentMovements.topExpenseCategoriesLast30Days).toEqual([{ category: 'Comida', amount: 300 }, { category: 'Transporte', amount: 250 }]);
    expect(context.pendingExtras).toEqual({ overtimeHours: 4.5, pieceworkUnits: 2, mealsAmount: 180 });
    expect(context.creditCards).toEqual([{ name: 'TDC BBVA', balance: 4500, type: 'credit_card' }]);
  });

  it('fallback funciona sin IA y marca risk/tight según los datos', async () => {
    const fakeClient = createFakeSupabase({
      accounts: [
        { id: 'cash-1', household_id: 'house-1', name: 'Efectivo', type: 'operational_cash', balance: '0.00', is_active: true },
        { id: 'card-1', household_id: 'house-1', name: 'TDC BBVA', type: 'credit_card', balance: '4500.00', is_active: true }
      ]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: fakeClient, supabase: fakeClient }));
    const { buildFinancialAdvisorContext, generateFinancialAdvisorAnalysis, generateFinancialAdvisorFallbackAnalysis } = await import('@/lib/finance/financialAdvisor');
    const context = await buildFinancialAdvisorContext('house-1', fakeClient as never, new Date('2026-05-10T00:00:00.000Z'));

    const fallback = generateFinancialAdvisorFallbackAnalysis(context);
    const analysis = await generateFinancialAdvisorAnalysis(context);

    expect(fallback.status).toBe('risk');
    expect(analysis.status).toBe('risk');
    expect(analysis.topRisks.length).toBeGreaterThan(0);
  });

  it('server action devuelve análisis estructurado sin modificar cuentas, movimientos ni cierres', async () => {
    const fakeClient = createFakeSupabase();
    const before = JSON.stringify({ accounts: fakeClient.db.accounts, transactions: fakeClient.db.transactions, closures: fakeClient.db.financial_closures });
    vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: fakeClient, supabase: fakeClient }));
    const { analyzeFinancialAdvisorAction } = await import('@/app/dashboard/actions');

    const result = await analyzeFinancialAdvisorAction();

    expect(result.analysis).toEqual(expect.objectContaining({ status: expect.any(String), headline: expect.any(String), recommendedAction: expect.any(String) }));
    expect(JSON.stringify({ accounts: fakeClient.db.accounts, transactions: fakeClient.db.transactions, closures: fakeClient.db.financial_closures })).toBe(before);
  });
});

