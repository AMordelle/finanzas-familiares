import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeQueryBuilder {
  private action: 'select' | 'insert' = 'select';
  private filters: Array<{ field: string; value: unknown }> = [];
  private inFilters: Array<{ field: string; values: unknown[] }> = [];
  private limitValue: number | null = null;
  private orderBy: { field: string; ascending: boolean } | null = null;
  private selected = '*';
  private payload: any = null;

  constructor(private table: string, private db: Record<string, any[]>) {}

  select(columns = '*') { this.selected = columns; return this; }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
  eq(field: string, value: unknown) { this.filters.push({ field, value }); return this; }
  in(field: string, values: unknown[]) { this.inFilters.push({ field, values }); return this; }
  limit(value: number) { this.limitValue = value; return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orderBy = { field, ascending: options?.ascending ?? true }; return this; }
  then(resolve: (v: any) => any) { return Promise.resolve(this.execute()).then(resolve); }
  maybeSingle() { const result = this.execute(); return Promise.resolve({ data: result.data[0] ?? null, error: null }); }

  private execute() {
    const rows = this.db[this.table] ?? [];
    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item, index) => ({ id: item.id ?? `${this.table}-${rows.length + index + 1}`, ...item }));
      this.db[this.table] = [...rows, ...inserted];
      return { data: inserted, error: null };
    }

    let selectedRows = [...rows];
    for (const filter of this.filters) selectedRows = selectedRows.filter((row) => row[filter.field] === filter.value);
    for (const filter of this.inFilters) selectedRows = selectedRows.filter((row) => filter.values.includes(row[filter.field]));
    if (this.orderBy) {
      selectedRows.sort((a, b) => {
        const av = a[this.orderBy!.field];
        const bv = b[this.orderBy!.field];
        if (av === bv) return 0;
        return this.orderBy!.ascending ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
      });
    }
    if (this.limitValue !== null) selectedRows = selectedRows.slice(0, this.limitValue);

    if (this.selected === '*') return { data: selectedRows, error: null };
    const cols = this.selected.split(',').map((col) => col.trim());
    return {
      data: selectedRows.map((row) => {
        const picked: Record<string, unknown> = {};
        for (const col of cols) picked[col] = row[col];
        return picked;
      }),
      error: null
    };
  }
}

function createFakeSupabase(overrides?: Partial<Record<string, any[]>>) {
  const db: Record<string, any[]> = {
    households: [{ id: 'house-1', name: 'Hogar Test' }],
    income_sources: [{ id: 'inc-1', household_id: 'house-1', name: 'Nómina', amount: '22000', recurring: true }],
    obligations: [{ id: 'ob-1', household_id: 'house-1', name: 'Renta', amount: '8500', due_day: 5 }],
    calendar_events: [{ id: 'evt-1', household_id: 'house-1', label: 'Utilidades', amount: '12000', event_date: '2026-05-05T00:00:00Z' }],
    goals: [{ id: 'goal-1', household_id: 'house-1', name: 'Fondo emergencias', target_amount: '60000', saved_amount: '22000', target_date: '2026-12-01T00:00:00Z' }],
    recurring_patterns: [{ id: 'rp-1', household_id: 'house-1', pattern_type: 'gasto-transporte', active: true }],
    financial_snapshots: [{ id: 'snap-1', household_id: 'house-1', payload: JSON.stringify({ diagnoses: ['Priorizar deudas'], financialInput: { debtPayments: 2000 } }) }],
    accounts: [
      { id: 'acc-1', household_id: 'house-1', name: 'Cuenta operativa', type: 'operational_cash', balance: '6500', is_active: true, periodic_payment: null },
      { id: 'acc-2', household_id: 'house-1', name: 'Tarjeta', type: 'credit_card', balance: '18000', is_active: true, periodic_payment: '2000' },
      { id: 'acc-3', household_id: 'house-1', name: 'Fondo', type: 'savings_fund', balance: '3200', is_active: true, periodic_payment: null }
    ],
    variable_spending_profiles: [{ id: 'v-1', household_id: 'house-1', monthly_estimate: '4000' }],
    transaction_groups: [{ id: 'tg-1', household_id: 'house-1' }],
    transactions: [
      { id: 'tx-1', group_id: 'tg-1', type: 'debit', category: 'comida', account_id: 'acc-1', amount: '1300', happened_at: '2026-04-10T00:00:00Z' },
      { id: 'tx-2', group_id: 'tg-1', type: 'credit', category: 'nomina', account_id: 'acc-1', amount: '22000', happened_at: '2026-04-01T00:00:00Z' }
    ],
    receivables: [{ id: 'rcv-1', household_id: 'house-1', pending_amount: '2500', status: 'activo' }]
  };

  return {
    from(table: string) { return new FakeQueryBuilder(table, { ...db, ...overrides }); }
  };
}

describe('buildHouseholdRecommendationContext', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('extrae contexto declarado', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');

    const context = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });

    expect(context.declared.recurringIncomePlan[0]?.name).toBe('Nómina');
    expect(context.declared.fixedObligations[0]?.name).toBe('Renta');
    expect(context.declared.priorities).toContain('Priorizar deudas');
  });

  it('extrae realidad observada', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');

    const context = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });

    expect(context.observed.actualCurrentLiquidity).toBe(9700);
    expect(context.observed.debtBalances).toBe(18000);
    expect(context.observed.recentExpenses).toBe(1300);
    expect(context.observed.recentIncome).toBe(22000);
  });

  it('calcula capa proyectada', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');

    const context = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });

    expect(context.projected.upcoming7dLoad).toBeGreaterThan(0);
    expect(context.projected.monthlyBaseCoverage).toBeGreaterThan(1);
    expect(['low', 'medium', 'high']).toContain(context.projected.tacticalPressure);
  });

  it('genera señales derivadas', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');

    const context = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });

    expect(['recuperacion', 'estabilizacion', 'optimizacion']).toContain(context.derived.householdStage);
    expect(context.derived.baseMonthlyMargin).toBeGreaterThan(0);
    expect(Array.isArray(context.derived.confidenceNotes)).toBe(true);
  });

  it('degrada con gracia cuando faltan fuentes', async () => {
    const fakeClient = createFakeSupabase({
      income_sources: [],
      obligations: [],
      calendar_events: [],
      transactions: [],
      financial_snapshots: []
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');

    const context = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });

    expect(context.declared.recurringIncomePlan).toEqual([]);
    expect(context.derived.assumptions.length).toBeGreaterThan(0);
    expect(context.projected.upcoming7dLoad).toBeGreaterThanOrEqual(0);
  });

  it('mantiene obligación no pagada en carga próxima', async () => {
    const fakeClient = createFakeSupabase({
      obligations: [{ id: 'ob-1', household_id: 'house-1', name: 'Pago TDC BBVA', amount: '2000', due_day: 19 }],
      accounts: [
        { id: 'acc-1', household_id: 'house-1', name: 'Cuenta operativa', type: 'operational_cash', balance: '6500', is_active: true, periodic_payment: null },
        { id: 'acc-2', household_id: 'house-1', name: 'TDC BBVA', type: 'credit_card', balance: '18000', is_active: true, periodic_payment: '2000' }
      ],
      transactions: [{ id: 'tx-2', group_id: 'tg-1', type: 'credit', category: 'nomina', account_id: 'acc-1', amount: '22000', happened_at: '2026-04-01T00:00:00Z' }]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');
    const context = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });
    expect(context.projected.reconciledObligations[0]?.status).toBe('pending');
    expect(context.projected.reconciledObligations[0]?.remainingAmount).toBe(2000);
    expect(context.projected.upcoming7dLoad).toBeGreaterThanOrEqual(2000);
  });

  it('retira obligación de carga próxima cuando pago de deuda la cubre', async () => {
    const fakeClient = createFakeSupabase({
      obligations: [{ id: 'ob-1', household_id: 'house-1', name: 'Pago TDC BBVA', amount: '2000', due_day: 19 }],
      accounts: [
        { id: 'acc-1', household_id: 'house-1', name: 'Cuenta operativa', type: 'operational_cash', balance: '6500', is_active: true, periodic_payment: null },
        { id: 'acc-2', household_id: 'house-1', name: 'TDC BBVA', type: 'credit_card', balance: '18000', is_active: true, periodic_payment: '2000' }
      ],
      transactions: [
        { id: 'tx-1', group_id: 'tg-1', type: 'debit', category: 'deuda', account_id: 'acc-2', amount: '2000', happened_at: '2026-04-18T00:00:00Z' },
        { id: 'tx-2', group_id: 'tg-1', type: 'credit', category: 'salida_cuenta', account_id: 'acc-1', amount: '2000', happened_at: '2026-04-18T00:00:00Z' }
      ]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');
    const context = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });
    expect(context.projected.reconciledObligations[0]?.status).toBe('paid');
    expect(context.projected.reconciledObligations[0]?.remainingAmount).toBe(0);
    expect(context.projected.radar.upcoming).not.toContain('Pago TDC BBVA');
  });

  it('reduce obligación cuando el pago es parcial y conserva siguiente ciclo', async () => {
    const fakeClient = createFakeSupabase({
      obligations: [{ id: 'ob-1', household_id: 'house-1', name: 'Pago TDC MPAGO', amount: '3000', due_day: 19 }],
      accounts: [
        { id: 'acc-1', household_id: 'house-1', name: 'Cuenta operativa', type: 'operational_cash', balance: '6500', is_active: true, periodic_payment: null },
        { id: 'acc-2', household_id: 'house-1', name: 'TDC MPAGO', type: 'credit_card', balance: '18000', is_active: true, periodic_payment: '2000' }
      ],
      transactions: [
        { id: 'tx-1', group_id: 'tg-1', type: 'debit', category: 'deuda', account_id: 'acc-2', amount: '1000', happened_at: '2026-04-18T00:00:00Z' }
      ]
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { buildHouseholdRecommendationContext } = await import('@/lib/finance/recommendationContext');
    const inCycle = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-04-19T00:00:00Z') });
    const nextCycle = await buildHouseholdRecommendationContext('house-1', fakeClient as any, { now: new Date('2026-05-20T00:00:00Z') });
    expect(inCycle.projected.reconciledObligations[0]?.status).toBe('partial');
    expect(inCycle.projected.reconciledObligations[0]?.remainingAmount).toBe(2000);
    expect(nextCycle.projected.reconciledObligations[0]?.status).toBe('pending');
    expect(nextCycle.projected.reconciledObligations[0]?.remainingAmount).toBe(3000);
  });
});
