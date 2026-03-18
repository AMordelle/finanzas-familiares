import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private filters: Array<{ field: string; value: unknown; op: 'eq' | 'neq' }> = [];
  private limitValue: number | null = null;
  private selected = '*';
  private payload: any = null;
  private orderBy: Array<{ field: string; ascending: boolean }> = [];

  constructor(private table: string, private db: Record<string, any[]>) {}

  select(columns = '*') {
    this.selected = columns;
    return this;
  }

  insert(payload: any) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  upsert(payload: any) {
    this.action = 'upsert';
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value, op: 'eq' });
    return this;
  }

  neq(field: string, value: unknown) {
    this.filters.push({ field, value, op: 'neq' });
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

  then(resolve: (v: any) => any) {
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

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => {
      if (filter.op === 'eq') return row[filter.field] === filter.value;
      return row[filter.field] !== filter.value;
    });
  }

  private execute() {
    const rows = this.db[this.table] ?? [];

    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item, index) => ({
        id: item.id ?? `${this.table}-${rows.length + index + 1}`,
        created_at: item.created_at ?? new Date().toISOString(),
        ...item
      }));
      this.db[this.table] = [...rows, ...inserted];
      return { data: this.pickColumns(inserted), error: null };
    }

    if (this.action === 'update') {
      const updated = rows.map((row) => (this.matches(row) ? { ...row, ...this.payload } : row));
      this.db[this.table] = updated;
      return { data: this.pickColumns(updated.filter((row) => this.matches(row))), error: null };
    }

    if (this.action === 'upsert') {
      const next = [...rows];
      const index = next.findIndex((row) => row.id === this.payload.id);
      if (index >= 0) {
        next[index] = { ...next[index], ...this.payload };
      } else {
        next.push({ ...this.payload, created_at: new Date().toISOString() });
      }
      this.db[this.table] = next;
      return { data: this.pickColumns([this.payload]), error: null };
    }

    if (this.action === 'delete') {
      const deleted = rows.filter((row) => this.matches(row));
      this.db[this.table] = rows.filter((row) => !this.matches(row));
      return { data: this.pickColumns(deleted), error: null };
    }

    let selectedRows = [...rows].filter((row) => this.matches(row));

    for (const order of this.orderBy) {
      selectedRows.sort((a, b) => {
        if (a[order.field] === b[order.field]) return 0;
        if (order.ascending) return a[order.field] > b[order.field] ? 1 : -1;
        return a[order.field] < b[order.field] ? 1 : -1;
      });
    }

    if (this.limitValue !== null) {
      selectedRows = selectedRows.slice(0, this.limitValue);
    }

    return { data: this.pickColumns(selectedRows), error: null };
  }

  private pickColumns(rows: any[]) {
    if (this.selected === '*') return rows;
    const cols = this.selected.split(',').map((col) => col.trim().split('!')[0]);
    return rows.map((row) => {
      const picked: Record<string, unknown> = {};
      for (const col of cols) picked[col] = row[col];
      return picked;
    });
  }
}

function createFakeSupabase() {
  const db: Record<string, any[]> = {
    profiles: [{ id: 'profile-1', full_name: 'Test user', created_at: new Date().toISOString() }],
    households: [{ id: 'house-1', name: 'Hogar test', created_at: new Date().toISOString() }],
    household_members: [{ id: 'hm-1', profile_id: 'profile-1', household_id: 'house-1', role: 'owner' }],
    accounts: [],
    income_sources: [],
    obligations: [],
    variable_spending_profiles: [],
    receivables: [],
    financial_snapshots: [],
    transaction_groups: [],
    transactions: []
  };

  return {
    db,
    from(table: string) {
      return new FakeQueryBuilder(table, db);
    }
  };
}

describe('accounts management', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEV_PROFILE_ID = 'profile-1';
  });

  it('create operational account', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createAccount } = await import('@/lib/db/queries');

    await createAccount({ name: 'Caja chica', type: 'operational_cash', balance: 1200 }, fakeClient as never);

    expect(fakeClient.db.accounts).toHaveLength(1);
    expect(fakeClient.db.accounts[0]).toMatchObject({
      name: 'Caja chica',
      type: 'operational_cash',
      balance: '1200.00',
      is_active: true
    });
  });

  it('create credit card account', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createAccount } = await import('@/lib/db/queries');

    await createAccount({ name: 'VISA', type: 'credit_card', balance: 3200, periodicPayment: 600, paymentDay: 20 }, fakeClient as never);

    expect(fakeClient.db.accounts[0]).toMatchObject({
      type: 'credit_card',
      periodic_payment: '600.00',
      payment_day: 20
    });
  });

  it('edit account balance', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.accounts.push({ id: '00000000-0000-4000-8000-000000000021', household_id: 'house-1', name: 'Caja', type: 'operational_cash', balance: '100.00', is_active: true });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { updateAccount } = await import('@/lib/db/queries');

    await updateAccount({ accountId: '00000000-0000-4000-8000-000000000021', name: 'Caja principal', type: 'operational_cash', balance: 350 }, fakeClient as never);

    expect(fakeClient.db.accounts[0]).toMatchObject({ name: 'Caja principal', balance: '350.00' });
  });

  it('deactivate account', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.accounts.push({ id: '00000000-0000-4000-8000-000000000022', household_id: 'house-1', name: 'Tarjeta vieja', type: 'credit_card', balance: '700.00', is_active: true });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { deactivateAccount } = await import('@/lib/db/queries');

    await deactivateAccount({ accountId: '00000000-0000-4000-8000-000000000022' }, fakeClient as never);

    expect(fakeClient.db.accounts[0].is_active).toBe(false);
  });

  it('dashboard availableMoney after account changes', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createAccount, getDashboardData } = await import('@/lib/db/queries');

    await createAccount({ name: 'Cuenta operativa', type: 'operational_cash', balance: 890 }, fakeClient as never);
    const dashboard = await getDashboardData(fakeClient as never);

    expect(dashboard.availableMoney).toBe(890);
  });
});
