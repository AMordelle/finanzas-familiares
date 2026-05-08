import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extrasFormVisibilityReducer, quantityLabel, quantityWithUnit, typeLabel } from '@/components/extras/extras-manager.helpers';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private filters: Array<{ field: string; value: unknown }> = [];
  private limitValue: number | null = null;
  private orderBy: Array<{ field: string; ascending: boolean }> = [];
  private selected = '*';
  private payload: any = null;

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

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ field, ascending: options?.ascending ?? true });
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
    return this.filters.every((filter) => row[filter.field] === filter.value);
  }

  private execute() {
    const rows = this.db[this.table] ?? [];

    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item, index) => ({
        id: item.id ?? `${this.table}-${rows.length + index + 1}`,
        created_at: item.created_at ?? new Date().toISOString(),
        updated_at: item.updated_at ?? new Date().toISOString(),
        ...item
      }));
      this.db[this.table] = [...rows, ...inserted];
      return { data: this.pickColumns(inserted), error: null };
    }

    if (this.action === 'upsert') {
      const item = this.payload;
      this.db[this.table] = [...rows, { ...item, created_at: new Date().toISOString() }];
      return { data: this.pickColumns([item]), error: null };
    }

    if (this.action === 'update') {
      const updatedRows = rows.map((row) => (this.matches(row) ? { ...row, ...this.payload } : row));
      this.db[this.table] = updatedRows;
      return { data: this.pickColumns(updatedRows.filter((row) => this.matches(row))), error: null };
    }

    let selectedRows = rows.filter((row) => this.matches(row));

    if (this.orderBy.length) {
      selectedRows = [...selectedRows].sort((a, b) => {
        for (const order of this.orderBy) {
          const av = a[order.field];
          const bv = b[order.field];
          if (av === bv) continue;
          if (order.ascending) return av > bv ? 1 : -1;
          return av < bv ? 1 : -1;
        }
        return 0;
      });
    }

    if (this.limitValue !== null) selectedRows = selectedRows.slice(0, this.limitValue);
    return { data: this.pickColumns(selectedRows), error: null };
  }

  private pickColumns(rows: any[]) {
    if (this.selected === '*') return rows;
    const cols = this.selected.split(',').map((col) => col.trim().split('!')[0]);
    return rows.map((row) => Object.fromEntries(cols.map((col) => [col, row[col]])));
  }
}

function createFakeSupabase() {
  const db: Record<string, any[]> = {
    profiles: [{ id: 'profile-1', created_at: '2026-01-01T00:00:00.000Z' }],
    household_members: [{ id: 'member-1', profile_id: 'profile-1', household_id: 'house-1' }],
    extra_work_entries: [],
    transaction_groups: [],
    transactions: [],
    accounts: [],
    income_sources: [],
    financial_snapshots: []
  };

  return {
    db,
    from(table: string) {
      return new FakeQueryBuilder(table, db);
    }
  };
}

describe('UI del módulo Extras', () => {
  it('la tarjeta de registro inicia contraída y se despliega bajo demanda', () => {
    expect(extrasFormVisibilityReducer(false, 'collapse')).toBe(false);
    expect(extrasFormVisibilityReducer(false, 'expand_new')).toBe(true);
  });

  it('la tarjeta se contrae después de registrar correctamente', () => {
    expect(extrasFormVisibilityReducer(true, 'submit_success')).toBe(false);
  });

  it('expone etiquetas dinámicas para comidas', () => {
    expect(typeLabel('meals')).toBe('Comidas');
    expect(quantityLabel('meals')).toBe('Importe');
    expect(quantityWithUnit({
      id: 'meal-1',
      householdId: 'house-1',
      workDate: '2026-05-07',
      type: 'meals',
      quantity: 250,
      status: 'pending',
      paidAt: null,
      notes: null,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z'
    })).toBe('Comidas · $250');
  });
});

describe('módulo Extras', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.DEV_PROFILE_ID = 'profile-1';
  });

  it('crea tiempo extra pendiente', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createExtraWorkEntry } = await import('@/lib/db/queries');

    const entry = await createExtraWorkEntry({ workDate: '2026-05-02', type: 'overtime', quantity: 8, notes: 'Sábado' });

    expect(entry.status).toBe('pending');
    expect(entry.type).toBe('overtime');
    expect(entry.quantity).toBe(8);
    expect(fakeClient.db.extra_work_entries).toHaveLength(1);
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
  });

  it('crea destajo pendiente', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createExtraWorkEntry } = await import('@/lib/db/queries');

    const entry = await createExtraWorkEntry({ workDate: '2026-05-04', type: 'piecework', quantity: 2 });

    expect(entry.status).toBe('pending');
    expect(entry.type).toBe('piecework');
    expect(entry.quantity).toBe(2);
  });

  it('crea comidas pendientes con importes monetarios decimales sin movimientos financieros', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createExtraWorkEntry } = await import('@/lib/db/queries');

    const entry = await createExtraWorkEntry({ workDate: '2026-05-05', type: 'meals', quantity: 250.5, notes: 'Línea foránea' });

    expect(entry.status).toBe('pending');
    expect(entry.type).toBe('meals');
    expect(entry.quantity).toBe(250.5);
    expect(fakeClient.db.extra_work_entries).toHaveLength(1);
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
    expect(fakeClient.db.income_sources).toHaveLength(0);
    expect(fakeClient.db.financial_snapshots).toHaveLength(0);
  });

  it('rechaza cantidad cero, negativa y tipos inválidos', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createExtraWorkEntry } = await import('@/lib/db/queries');

    await expect(createExtraWorkEntry({ workDate: '2026-05-04', type: 'overtime', quantity: 0 })).rejects.toThrow();
    await expect(createExtraWorkEntry({ workDate: '2026-05-04', type: 'piecework', quantity: -1 })).rejects.toThrow();
    await expect(createExtraWorkEntry({ workDate: '2026-05-04', type: 'bono', quantity: 1 })).rejects.toThrow();
    expect(fakeClient.db.extra_work_entries).toHaveLength(0);
  });

  it('muestra solo pendientes, calcula resumen y aisla por household', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push(
      { id: 'old-paid', household_id: 'house-1', work_date: '2026-05-01', type: 'overtime', quantity: '8', status: 'paid', paid_at: '2026-05-06T00:00:00.000Z', notes: null, created_at: '2026-05-01T10:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z' },
      { id: 'hours', household_id: 'house-1', work_date: '2026-05-03', type: 'overtime', quantity: '8', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-03T10:00:00.000Z', updated_at: '2026-05-03T10:00:00.000Z' },
      { id: 'pieces', household_id: 'house-1', work_date: '2026-05-04', type: 'piecework', quantity: '2', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-04T10:00:00.000Z', updated_at: '2026-05-04T10:00:00.000Z' },
      { id: 'meals', household_id: 'house-1', work_date: '2026-05-05', type: 'meals', quantity: '1250.50', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-05T10:00:00.000Z', updated_at: '2026-05-05T10:00:00.000Z' },
      { id: 'other-house', household_id: 'house-2', work_date: '2026-05-06', type: 'meals', quantity: '500', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-06T10:00:00.000Z', updated_at: '2026-05-06T10:00:00.000Z' }
    );
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getPendingExtraWorkEntries } = await import('@/lib/db/queries');

    const data = await getPendingExtraWorkEntries();

    expect(data.pendingEntries.map((entry: any) => entry.id)).toEqual(['meals', 'pieces', 'hours']);
    expect(data.pendingEntries.find((entry: any) => entry.id === 'meals')?.quantity).toBe(1250.5);
    expect(data.summary).toEqual({ pendingCount: 3, pendingOvertimeHours: 8, pendingPieceworkUnits: 2, pendingMealsAmount: 1250.5 });
  });

  it('marca un registro como pagado, desaparece de pendientes y conserva el registro en BD', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push({
      id: 'extra-1',
      household_id: 'house-1',
      work_date: '2026-05-02',
      type: 'meals',
      quantity: '180.75',
      status: 'pending',
      paid_at: null,
      notes: null,
      created_at: '2026-05-02T10:00:00.000Z',
      updated_at: '2026-05-02T10:00:00.000Z'
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getPendingExtraWorkEntries, markExtraWorkEntryAsPaid } = await import('@/lib/db/queries');

    const paid = await markExtraWorkEntryAsPaid({ entryId: 'extra-1' });
    const pending = await getPendingExtraWorkEntries();

    expect(paid.status).toBe('paid');
    expect(paid.paidAt).toBeTruthy();
    expect(pending.pendingEntries).toHaveLength(0);
    expect(fakeClient.db.extra_work_entries).toHaveLength(1);
    expect(fakeClient.db.extra_work_entries[0].status).toBe('paid');
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
    expect(fakeClient.db.financial_snapshots).toHaveLength(0);
  });
});
