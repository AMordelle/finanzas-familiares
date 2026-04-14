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
  single() { const result = this.execute(); return Promise.resolve({ data: result.data[0] ?? null, error: null }); }
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

function createFakeSupabase() {
  const db: Record<string, any[]> = {
    profiles: [{ id: 'profile-1' }],
    household_members: [{ id: 'hm-1', profile_id: 'profile-1', household_id: 'house-1' }],
    financial_snapshots: [{ id: 'snap-1', household_id: 'house-1', payload: JSON.stringify({ monthlyOFH: 10000, weeklyOFH: 2300, availableMoney: 5000, diagnoses: [], recommendations: [] }) }],
    accounts: [{ id: 'acc-1', household_id: 'house-1', name: 'Cuenta TDD', type: 'operational_cash', balance: '3000', is_active: true }],
    obligations: [{ id: 'ob-1', household_id: 'house-1', name: 'BBVA', amount: '1200', due_day: 18 }],
    variable_spending_profiles: [{ id: 'v-1', household_id: 'house-1', monthly_estimate: '2600' }],
    transaction_groups: [{ id: 'tg-1', household_id: 'house-1' }],
    transactions: [{ id: 'tx-1', group_id: 'tg-1', type: 'debit', amount: '800', happened_at: '2026-04-13T00:00:00Z' }]
  };

  return {
    from(table: string) { return new FakeQueryBuilder(table, db); }
  };
}

describe('dashboard data regression with radar', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEV_PROFILE_ID = 'profile-1';
  });

  it('mantiene dashboard y agrega financialRadar sin romper campos existentes', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));

    const { getDashboardData } = await import('@/lib/db/queries');
    const dashboard = await getDashboardData();

    expect(dashboard.hasHousehold).toBe(true);
    expect(dashboard.monthlyOFH).toBe(10000);
    expect(dashboard.recommendations.length).toBeGreaterThan(0);
    expect(dashboard.financialRadar).not.toBeNull();
    expect(dashboard.financialRadar?.upcomingLoad).toBeGreaterThan(0);
    expect(dashboard.financialRadar?.windowDays).toBe(7);
    expect(dashboard.financialRadar?.nearFutureLoad).toBeGreaterThanOrEqual(0);
  });
});
