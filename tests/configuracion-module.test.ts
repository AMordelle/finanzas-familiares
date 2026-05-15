import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: Array<{ field: string; value: unknown }> = [];
  private inFilters: Array<{ field: string; values: unknown[] }> = [];
  private selected = '*';
  private payload: any = null;
  private orderBy: { field: string; ascending: boolean } | null = null;
  constructor(private table: string, private db: Record<string, any[]>) {}
  select(columns = '*') { this.selected = columns; return this; }
  insert(payload: any) { this.action = 'insert'; this.payload = payload; return this; }
  update(payload: any) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  upsert(payload: any) { this.action = 'upsert'; this.payload = payload; return this; }
  eq(field: string, value: unknown) { this.filters.push({ field, value }); return this; }
  in(field: string, values: unknown[]) { this.inFilters.push({ field, values }); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orderBy = { field, ascending: options?.ascending ?? true }; return this; }
  limit() { return this; }
  then(resolve: (v: any) => any) { return Promise.resolve(this.execute()).then(resolve); }
  single() { const r = this.execute(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); }
  maybeSingle() { const r = this.execute(); return Promise.resolve({ data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }); }
  private matches(row: Record<string, unknown>) { return this.filters.every((f) => row[f.field] === f.value) && this.inFilters.every((f) => f.values.includes(row[f.field])); }
  private execute() {
    const rows = this.db[this.table] ?? [];
    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item, index) => ({ id: item.id ?? `${this.table}-${rows.length + index + 1}`, created_at: item.created_at ?? new Date().toISOString(), updated_at: item.updated_at ?? new Date().toISOString(), ...item }));
      this.db[this.table] = [...rows, ...inserted];
      return { data: this.pick(inserted), error: null };
    }
    if (this.action === 'upsert') { this.db[this.table] = [...rows.filter((r) => r.id !== this.payload.id), this.payload]; return { data: this.pick([this.payload]), error: null }; }
    if (this.action === 'update') { const updated = rows.map((r) => this.matches(r) ? { ...r, ...this.payload } : r); this.db[this.table] = updated; return { data: this.pick(updated.filter((r) => this.matches(r))), error: null }; }
    if (this.action === 'delete') { const deleted = rows.filter((r) => this.matches(r)); this.db[this.table] = rows.filter((r) => !this.matches(r)); return { data: this.pick(deleted), error: null }; }
    let selected = rows.filter((r) => this.matches(r));
    if (this.orderBy) selected = selected.sort((a, b) => a[this.orderBy!.field] > b[this.orderBy!.field] ? (this.orderBy!.ascending ? 1 : -1) : -1);
    return { data: this.pick(selected), error: null };
  }
  private pick(rows: any[]) { if (this.selected === '*') return rows; const cols = this.selected.split(',').map((c) => c.trim().split('!')[0]); return rows.map((row) => Object.fromEntries(cols.map((col) => [col, row[col]]))); }
}

function createFakeSupabase() {
  const db: Record<string, any[]> = {
    profiles: [{ id: 'profile-1', full_name: 'Test' }],
    households: [{ id: 'house-1', name: 'Casa' }, { id: 'house-2', name: 'Otra' }],
    household_members: [{ id: 'member-1', profile_id: 'profile-1', household_id: 'house-1' }],
    financial_categories: [], financial_subcategories: [], projection_columns: [], projection_column_categories: [],
    transaction_groups: [], transactions: [], accounts: []
  };
  return { db, from: (table: string) => new FakeQueryBuilder(table, db) };
}

let fake: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  vi.resetModules();
  process.env.NODE_ENV = 'test';
  fake = createFakeSupabase();
  vi.doMock('@/lib/db/supabase', () => ({ supabaseAdmin: fake }));
});

describe('módulo Configuración financiera', () => {
  it('crea, edita y activa/desactiva categorías y subcategorías con normalización por household', async () => {
    const q = await import('@/lib/db/queries');
    const category = await q.createFinancialCategory({ name: 'Gastos Variables', type: 'expense' });
    expect(category).toMatchObject({ householdId: 'house-1', key: 'gastos_variables', type: 'expense', isActive: true });

    const subcategory = await q.createFinancialSubcategory({ financialCategoryId: category.id, name: 'Prime IPTV' });
    expect(subcategory).toMatchObject({ financialCategoryId: category.id, key: 'prime_iptv', isActive: true });

    await q.updateFinancialCategory({ categoryId: category.id, name: 'Gastos variables hogar', type: 'both', isActive: true });
    await q.updateFinancialSubcategory({ subcategoryId: subcategory.id, financialCategoryId: category.id, name: 'Oxxo', isActive: true });
    await q.toggleFinancialCategory({ categoryId: category.id, isActive: false });
    await q.toggleFinancialSubcategory({ subcategoryId: subcategory.id, isActive: false });

    const data = await q.getConfigurationData();
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0]).toMatchObject({ key: 'gastos_variables_hogar', isActive: false });
    expect(data.categories[0]?.subcategories[0]).toMatchObject({ key: 'oxxo', isActive: false });
  });

  it('crea columnas, asigna categorías, rechaza duplicar categoría en dos columnas activas y aisla households', async () => {
    const q = await import('@/lib/db/queries');
    const category = await q.createFinancialCategory({ name: 'Ingresos extra', type: 'income' });
    const column = await q.createProjectionColumn({ name: 'Ingresos extras', type: 'income', description: 'Extras', displayOrder: 2 });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: column.id, financialCategoryId: category.id });
    const other = await q.createProjectionColumn({ name: 'Eventos', type: 'income', displayOrder: 3 });
    await expect(q.assignCategoryToProjectionColumn({ projectionColumnId: other.id, financialCategoryId: category.id })).rejects.toThrow('otra columna activa');

    fake.db.financial_categories.push({ id: 'cat-other', household_id: 'house-2', name: 'Ingresos extra', key: 'ingresos_extra', type: 'income', is_active: true, created_at: 'x', updated_at: 'x' });
    const data = await q.getConfigurationData();
    expect(data.projectionColumns[0]?.categories[0]?.key).toBe('ingresos_extra');
    expect(data.categories.some((item) => item.householdId === 'house-2')).toBe(false);
  });



  it('carga solo categorías/subcategorías activas y valida selecciones del catálogo', async () => {
    const q = await import('@/lib/db/queries');
    const gastos = await q.createFinancialCategory({ name: 'Gastos variables', type: 'expense' });
    const ingresos = await q.createFinancialCategory({ name: 'Ingresos extra', type: 'income' });
    await q.createFinancialSubcategory({ financialCategoryId: gastos.id, name: 'Oxxo' });
    await q.createFinancialSubcategory({ financialCategoryId: ingresos.id, name: 'PrimeIPTV' });
    const inactive = await q.createFinancialCategory({ name: 'Archivada', type: 'expense' });
    await q.toggleFinancialCategory({ categoryId: inactive.id, isActive: false });

    const catalog = await q.getFinancialCategoryCatalog('house-1', fake as any);
    expect(catalog.map((item) => item.key)).toEqual(['gastos_variables', 'ingresos_extra']);
    expect(catalog[0]?.subcategories.map((item) => item.key)).toEqual(['oxxo']);

    await expect(q.validateCategorySelection('house-1', 'no_existe', null, fake as any)).rejects.toThrow('categoría seleccionada no existe');
    await expect(q.validateCategorySelection('house-1', 'gastos_variables', 'prime_iptv', fake as any)).rejects.toThrow('subcategoría seleccionada');
    await expect(q.validateCategorySelection('house-1', 'gastos_variables', null, fake as any)).resolves.toMatchObject({ categoryKey: 'gastos_variables', subcategoryKey: null });
  });

  it('edita movimiento con categoría/subcategoría sin modificar saldos y proyecta por categoría principal sin duplicar subcategorías', async () => {
    const q = await import('@/lib/db/queries');
    fake.db.accounts.push({ id: 'acc-1', household_id: 'house-1', name: 'BBVA', type: 'operational_cash', balance: '1000', is_active: true });
    const category = await q.createFinancialCategory({ name: 'Gastos variables', type: 'expense' });
    await q.createFinancialSubcategory({ financialCategoryId: category.id, name: 'Oxxo' });
    const column = await q.createProjectionColumn({ name: 'Gastos variables', type: 'expense', displayOrder: 1 });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: column.id, financialCategoryId: category.id });
    fake.db.transaction_groups.push({ id: 'group-1', household_id: 'house-1', note: 'Oxxo', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push(
      { id: 'tx-1', group_id: 'group-1', account_id: null, type: 'debit', category: 'comida', subcategory: null, amount: '120.00', happened_at: '2026-05-01T12:00:00.000Z' },
      { id: 'tx-2', group_id: 'group-1', account_id: 'acc-1', type: 'credit', category: 'salida_cuenta', subcategory: null, amount: '120.00', happened_at: '2026-05-01T12:00:00.000Z' }
    );
    const balanceBefore = fake.db.accounts[0].balance;
    await q.updateMovement({ movementId: 'group-1', description: 'Oxxo editado', amount: 120, sourceAccountId: 'acc-1', destinationAccountId: null, category: 'Gastos variables', subcategory: 'Oxxo' });
    expect(Number(fake.db.accounts[0].balance)).toBe(Number(balanceBefore));

    const projection = await q.buildWeeklyProjectionSummary(fake as any);
    expect(projection.columns[0]).toMatchObject({ columnKey: 'gastos_variables', total: 120 });
    expect(projection.columns[0]?.subcategoryBreakdown).toEqual([{ subcategory: 'oxxo', total: 120 }]);
  });

  it('muestra movimientos sin columna como sin clasificar', async () => {
    const q = await import('@/lib/db/queries');
    await q.createFinancialCategory({ name: 'Gastos variables', type: 'expense' });
    fake.db.transaction_groups.push({ id: 'group-2', household_id: 'house-1', note: 'Farmacia', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push({ id: 'tx-3', group_id: 'group-2', account_id: null, type: 'debit', category: 'gastos_variables', subcategory: 'farmacia', amount: '80.00', happened_at: '2026-05-01T12:00:00.000Z' });
    const projection = await q.buildWeeklyProjectionSummary(fake as any);
    expect(projection.unclassified).toEqual([{ category: 'gastos_variables', total: 80, movementCount: 1 }]);
  });
});
