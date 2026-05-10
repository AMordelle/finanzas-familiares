import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extrasFormVisibilityReducer, paidHistoryVisibilityReducer, quantityLabel, quantityWithUnit, typeLabel } from '@/components/extras/extras-manager.helpers';

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

  delete() {
    this.action = 'delete';
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
      const matchedIndexes = rows.map((row, index) => (this.matches(row) ? index : -1)).filter((index) => index >= 0);
      const updatedRows = rows.map((row) => (this.matches(row) ? { ...row, ...this.payload } : row));
      this.db[this.table] = updatedRows;
      return { data: this.pickColumns(matchedIndexes.map((index) => updatedRows[index])), error: null };
    }

    if (this.action === 'delete') {
      const deletedRows = rows.filter((row) => this.matches(row));
      this.db[this.table] = rows.filter((row) => !this.matches(row));
      return { data: this.pickColumns(deletedRows), error: null };
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

  it('el historial de pagados inicia contraído y se despliega bajo demanda', () => {
    expect(paidHistoryVisibilityReducer(false, 'collapse')).toBe(false);
    expect(paidHistoryVisibilityReducer(false, 'toggle')).toBe(true);
    expect(paidHistoryVisibilityReducer(true, 'toggle')).toBe(false);
    expect(paidHistoryVisibilityReducer(false, 'show')).toBe(true);
  });

  it('renderiza el acceso al historial de pagados sin mostrar sus registros al inicio', async () => {
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
    vi.doMock('@/app/extras/actions', () => ({
      createExtraWorkAction: vi.fn(),
      deleteExtraWorkAction: vi.fn(),
      markExtraWorkAsPaidAction: vi.fn(),
      restoreExtraWorkEntryToPending: vi.fn(),
      updateExtraWorkAction: vi.fn()
    }));
    const { ExtrasManager } = await import('@/components/extras/extras-manager');

    const html = renderToStaticMarkup(React.createElement(ExtrasManager, {
      initialData: {
        hasHousehold: true,
        householdId: 'house-1',
        pendingEntries: [],
        paidEntries: [{
          id: 'paid-ui',
          householdId: 'house-1',
          workDate: '2026-05-04',
          type: 'overtime',
          quantity: 8,
          status: 'paid',
          paidAt: '2026-05-10T00:00:00.000Z',
          notes: 'Pago visible solo al abrir',
          createdAt: '2026-05-04T10:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z'
        }],
        summary: { pendingCount: 0, pendingOvertimeHours: 0, pendingPieceworkUnits: 0, pendingMealsAmount: 0 }
      }
    }));

    expect(html).toContain('Ver historial de pagados (1)');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Pago visible solo al abrir');
    expect(html).not.toContain('Regresar a pendientes');
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
    expect(data.paidEntries.map((entry: any) => entry.id)).toEqual(['old-paid']);
    expect(data.pendingEntries.find((entry: any) => entry.id === 'meals')?.quantity).toBe(1250.5);
    expect(data.summary).toEqual({ pendingCount: 3, pendingOvertimeHours: 8, pendingPieceworkUnits: 2, pendingMealsAmount: 1250.5 });
  });

  it('edita un extra de tiempo extra conservando id, hogar y estado pendiente', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push({
      id: 'hours-edit',
      household_id: 'house-1',
      work_date: '2026-05-02',
      type: 'overtime',
      quantity: '8',
      status: 'pending',
      paid_at: null,
      notes: 'Original',
      created_at: '2026-05-02T10:00:00.000Z',
      updated_at: '2026-05-02T10:00:00.000Z'
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { updateExtraWorkEntry } = await import('@/lib/db/queries');

    const updated = await updateExtraWorkEntry({ entryId: 'hours-edit', workDate: '2026-05-03', type: 'overtime', quantity: 10.5, notes: 'Corregido' });

    expect(updated.id).toBe('hours-edit');
    expect(updated.householdId).toBe('house-1');
    expect(updated.status).toBe('pending');
    expect(updated.workDate).toBe('2026-05-03');
    expect(updated.type).toBe('overtime');
    expect(updated.quantity).toBe(10.5);
    expect(updated.notes).toBe('Corregido');
    expect(fakeClient.db.extra_work_entries).toHaveLength(1);
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
  });

  it('edita un destajo pendiente', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push({
      id: 'piece-edit',
      household_id: 'house-1',
      work_date: '2026-05-04',
      type: 'piecework',
      quantity: '2',
      status: 'pending',
      paid_at: null,
      notes: null,
      created_at: '2026-05-04T10:00:00.000Z',
      updated_at: '2026-05-04T10:00:00.000Z'
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { updateExtraWorkEntry } = await import('@/lib/db/queries');

    const updated = await updateExtraWorkEntry({ entryId: 'piece-edit', workDate: '2026-05-05', type: 'piecework', quantity: 3, notes: 'Tres destajos' });

    expect(updated.type).toBe('piecework');
    expect(updated.quantity).toBe(3);
    expect(updated.notes).toBe('Tres destajos');
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
  });

  it('edita comidas pendientes con importes monetarios', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push({
      id: 'meal-edit',
      household_id: 'house-1',
      work_date: '2026-05-05',
      type: 'meals',
      quantity: '250',
      status: 'pending',
      paid_at: null,
      notes: 'Comida original',
      created_at: '2026-05-05T10:00:00.000Z',
      updated_at: '2026-05-05T10:00:00.000Z'
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { updateExtraWorkEntry } = await import('@/lib/db/queries');

    const updated = await updateExtraWorkEntry({ entryId: 'meal-edit', workDate: '2026-05-06', type: 'meals', quantity: 180.75, notes: '' });

    expect(updated.type).toBe('meals');
    expect(updated.quantity).toBe(180.75);
    expect(updated.notes).toBeNull();
    expect(fakeClient.db.income_sources).toHaveLength(0);
    expect(fakeClient.db.financial_snapshots).toHaveLength(0);
  });

  it('cambia un tiempo extra a comidas y recalcula el resumen', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push(
      { id: 'to-meals', household_id: 'house-1', work_date: '2026-05-05', type: 'overtime', quantity: '8', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-05T10:00:00.000Z', updated_at: '2026-05-05T10:00:00.000Z' },
      { id: 'pieces', household_id: 'house-1', work_date: '2026-05-04', type: 'piecework', quantity: '2', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-04T10:00:00.000Z', updated_at: '2026-05-04T10:00:00.000Z' }
    );
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getPendingExtraWorkEntries, updateExtraWorkEntry } = await import('@/lib/db/queries');

    const updated = await updateExtraWorkEntry({ entryId: 'to-meals', workDate: '2026-05-05', type: 'meals', quantity: 250.5, notes: 'Comidas' });
    const pending = await getPendingExtraWorkEntries();

    expect(updated.type).toBe('meals');
    expect(updated.quantity).toBe(250.5);
    expect(pending.summary).toEqual({ pendingCount: 2, pendingOvertimeHours: 0, pendingPieceworkUnits: 2, pendingMealsAmount: 250.5 });
  });

  it('rechaza edición con cantidad cero o negativa', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push({
      id: 'invalid-edit',
      household_id: 'house-1',
      work_date: '2026-05-05',
      type: 'overtime',
      quantity: '8',
      status: 'pending',
      paid_at: null,
      notes: null,
      created_at: '2026-05-05T10:00:00.000Z',
      updated_at: '2026-05-05T10:00:00.000Z'
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { updateExtraWorkEntry } = await import('@/lib/db/queries');

    await expect(updateExtraWorkEntry({ entryId: 'invalid-edit', workDate: '2026-05-05', type: 'overtime', quantity: 0 })).rejects.toThrow();
    await expect(updateExtraWorkEntry({ entryId: 'invalid-edit', workDate: '2026-05-05', type: 'overtime', quantity: -1 })).rejects.toThrow();
    expect(fakeClient.db.extra_work_entries[0].quantity).toBe('8');
  });

  it('elimina un extra pendiente y ya no aparece en pendientes sin afectar finanzas', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push(
      { id: 'delete-me', household_id: 'house-1', work_date: '2026-05-05', type: 'meals', quantity: '250', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-05T10:00:00.000Z', updated_at: '2026-05-05T10:00:00.000Z' },
      { id: 'keep-me', household_id: 'house-1', work_date: '2026-05-04', type: 'overtime', quantity: '8', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-04T10:00:00.000Z', updated_at: '2026-05-04T10:00:00.000Z' }
    );
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { deleteExtraWorkEntry, getPendingExtraWorkEntries } = await import('@/lib/db/queries');

    const deleted = await deleteExtraWorkEntry({ entryId: 'delete-me' });
    const pending = await getPendingExtraWorkEntries();

    expect(deleted.id).toBe('delete-me');
    expect(fakeClient.db.extra_work_entries.map((entry) => entry.id)).toEqual(['keep-me']);
    expect(pending.pendingEntries.map((entry: any) => entry.id)).toEqual(['keep-me']);
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
    expect(fakeClient.db.income_sources).toHaveLength(0);
    expect(fakeClient.db.financial_snapshots).toHaveLength(0);
  });

  it('rechaza editar y eliminar registros de otro household', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push({
      id: 'other-house-entry',
      household_id: 'house-2',
      work_date: '2026-05-05',
      type: 'meals',
      quantity: '250',
      status: 'pending',
      paid_at: null,
      notes: null,
      created_at: '2026-05-05T10:00:00.000Z',
      updated_at: '2026-05-05T10:00:00.000Z'
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { deleteExtraWorkEntry, updateExtraWorkEntry } = await import('@/lib/db/queries');

    await expect(updateExtraWorkEntry({ entryId: 'other-house-entry', workDate: '2026-05-06', type: 'meals', quantity: 500 })).rejects.toThrow('No se encontró');
    await expect(deleteExtraWorkEntry({ entryId: 'other-house-entry' })).rejects.toThrow('No se encontró');
    expect(fakeClient.db.extra_work_entries).toHaveLength(1);
    expect(fakeClient.db.extra_work_entries[0].household_id).toBe('house-2');
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
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

  it('muestra extras pagados en historial ordenados por paid_at DESC y aislados por household', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push(
      { id: 'paid-old', household_id: 'house-1', work_date: '2026-05-01', type: 'overtime', quantity: '8', status: 'paid', paid_at: '2026-05-08T00:00:00.000Z', notes: 'Viejo', created_at: '2026-05-01T10:00:00.000Z', updated_at: '2026-05-08T00:00:00.000Z' },
      { id: 'pending', household_id: 'house-1', work_date: '2026-05-02', type: 'piecework', quantity: '2', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-02T10:00:00.000Z', updated_at: '2026-05-02T10:00:00.000Z' },
      { id: 'paid-new', household_id: 'house-1', work_date: '2026-05-03', type: 'meals', quantity: '250', status: 'paid', paid_at: '2026-05-10T00:00:00.000Z', notes: 'Reciente', created_at: '2026-05-03T10:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' },
      { id: 'other-house-paid', household_id: 'house-2', work_date: '2026-05-04', type: 'meals', quantity: '500', status: 'paid', paid_at: '2026-05-11T00:00:00.000Z', notes: 'Otro hogar', created_at: '2026-05-04T10:00:00.000Z', updated_at: '2026-05-11T00:00:00.000Z' }
    );
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getExtraWorkHistory, getPendingExtraWorkEntries } = await import('@/lib/db/queries');

    const history = await getExtraWorkHistory();
    const data = await getPendingExtraWorkEntries();

    expect(history.map((entry: any) => entry.id)).toEqual(['paid-new', 'paid-old']);
    expect(data.paidEntries.map((entry: any) => entry.id)).toEqual(['paid-new', 'paid-old']);
    expect(data.paidEntries[0]).toMatchObject({ type: 'meals', quantity: 250, notes: 'Reciente' });
    expect(data.pendingEntries.map((entry: any) => entry.id)).toEqual(['pending']);
  });

  it('regresa un extra pagado a pendientes, limpia paid_at, no duplica y no afecta finanzas', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push({
      id: 'restore-me',
      household_id: 'house-1',
      work_date: '2026-05-04',
      type: 'overtime',
      quantity: '8',
      status: 'paid',
      paid_at: '2026-05-10T00:00:00.000Z',
      notes: 'Pagado por error',
      created_at: '2026-05-04T10:00:00.000Z',
      updated_at: '2026-05-10T00:00:00.000Z'
    });
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getExtraWorkHistory, getPendingExtraWorkEntries, restoreExtraWorkEntryToPending } = await import('@/lib/db/queries');

    const restored = await restoreExtraWorkEntryToPending({ entryId: 'restore-me' });
    const pending = await getPendingExtraWorkEntries();
    const history = await getExtraWorkHistory();

    expect(restored).toMatchObject({ id: 'restore-me', status: 'pending', paidAt: null });
    expect(fakeClient.db.extra_work_entries).toHaveLength(1);
    expect(fakeClient.db.extra_work_entries[0].paid_at).toBeNull();
    expect(pending.pendingEntries.map((entry: any) => entry.id)).toEqual(['restore-me']);
    expect(pending.paidEntries).toHaveLength(0);
    expect(history).toHaveLength(0);
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
    expect(fakeClient.db.income_sources).toHaveLength(0);
    expect(fakeClient.db.financial_snapshots).toHaveLength(0);
  });

  it('rechaza regresar a pendientes registros de otro household o que no estén pagados', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.extra_work_entries.push(
      { id: 'other-paid', household_id: 'house-2', work_date: '2026-05-04', type: 'overtime', quantity: '8', status: 'paid', paid_at: '2026-05-10T00:00:00.000Z', notes: null, created_at: '2026-05-04T10:00:00.000Z', updated_at: '2026-05-10T00:00:00.000Z' },
      { id: 'already-pending', household_id: 'house-1', work_date: '2026-05-05', type: 'meals', quantity: '250', status: 'pending', paid_at: null, notes: null, created_at: '2026-05-05T10:00:00.000Z', updated_at: '2026-05-05T10:00:00.000Z' }
    );
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { restoreExtraWorkEntryToPending } = await import('@/lib/db/queries');

    await expect(restoreExtraWorkEntryToPending({ entryId: 'other-paid' })).rejects.toThrow('No se encontró');
    await expect(restoreExtraWorkEntryToPending({ entryId: 'already-pending' })).rejects.toThrow('No se encontró');
    expect(fakeClient.db.extra_work_entries).toHaveLength(2);
    expect(fakeClient.db.extra_work_entries.map((entry) => entry.status)).toEqual(['paid', 'pending']);
    expect(fakeClient.db.transaction_groups).toHaveLength(0);
    expect(fakeClient.db.transactions).toHaveLength(0);
    expect(fakeClient.db.accounts).toHaveLength(0);
  });
});
