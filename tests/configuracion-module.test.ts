import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private filters: Array<{ field: string; value: unknown }> = [];
  private inFilters: Array<{ field: string; values: unknown[] }> = [];
  private selected = '*';
  private payload: any = null;
  private orderBy: { field: string; ascending: boolean } | null = null;
  constructor(private table: string, private db: Record<string, any[]>, private queryLog?: Array<{ table: string; selected: string; inFilters: Array<{ field: string; values: unknown[] }> }>) {}
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
    this.queryLog?.push({ table: this.table, selected: this.selected, inFilters: this.inFilters.map((filter) => ({ field: filter.field, values: [...filter.values] })) });
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
  const queryLog: Array<{ table: string; selected: string; inFilters: Array<{ field: string; values: unknown[] }> }> = [];
  return { db, queryLog, from: (table: string) => new FakeQueryBuilder(table, db, queryLog) };
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
    const incomeCategory = await q.createFinancialCategory({ name: 'Nómina', type: 'income' });
    const incomeColumn = await q.createProjectionColumn({ name: 'Nómina', type: 'income', displayOrder: 0 });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: incomeColumn.id, financialCategoryId: incomeCategory.id });
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
    fake.db.transaction_groups.push({ id: 'group-income-valid-week', household_id: 'house-1', note: 'Nómina', created_at: '2026-05-01T13:00:00.000Z' });
    fake.db.transactions.push({ id: 'tx-income-valid-week', group_id: 'group-income-valid-week', account_id: null, type: 'credit', category: incomeCategory.key, subcategory: null, amount: '500.00', happened_at: '2026-05-01T13:00:00.000Z' });
    expect(Number(fake.db.accounts[0].balance)).toBe(Number(balanceBefore));

    const projection = await q.buildWeeklyProjectionSummary(fake as any);
    const expenseProjection = projection.columns.find((item) => item.columnKey === 'gastos_variables');
    expect(expenseProjection).toMatchObject({ columnKey: 'gastos_variables', total: 120 });
    expect(expenseProjection?.subcategoryBreakdown).toEqual([{ subcategory: 'oxxo', total: 120 }]);
  });

  it('muestra movimientos sin columna como sin clasificar', async () => {
    const q = await import('@/lib/db/queries');
    await q.createFinancialCategory({ name: 'Gastos variables', type: 'expense' });
    fake.db.transaction_groups.push({ id: 'group-2', household_id: 'house-1', note: 'Farmacia', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push({ id: 'tx-3', group_id: 'group-2', account_id: null, type: 'debit', category: 'gastos_variables', subcategory: 'farmacia', amount: '80.00', happened_at: '2026-05-01T12:00:00.000Z' });
    const projection = await q.buildWeeklyProjectionSummary(fake as any);
    expect(projection.unclassified.map(({ category, total, movementCount }) => ({ category, total, movementCount }))).toEqual([{ category: 'gastos_variables', total: 80, movementCount: 1 }]);
  });


  it('construye Proyección con columnas activas, semanas válidas, semana actual, 12 semanas y detalles auditables', async () => {
    const q = await import('@/lib/db/queries');
    fake.db.accounts.push({ id: 'acc-operativa', household_id: 'house-1', name: 'BBVA', type: 'operational_cash', balance: '2000', is_active: true });

    const nomina = await q.createFinancialCategory({ name: 'Nómina', type: 'income' });
    const eventos = await q.createFinancialCategory({ name: 'Eventos', type: 'income' });
    const gastos = await q.createFinancialCategory({ name: 'Gastos variables', type: 'expense' });
    const msi = await q.createFinancialCategory({ name: 'MCI MSI', type: 'expense' });
    const sinColumna = await q.createFinancialCategory({ name: 'Sin columna', type: 'expense' });
    const noProjectable = await q.createFinancialCategory({ name: 'Transferencias', type: 'expense', noProjectable: true });
    await q.createFinancialSubcategory({ financialCategoryId: gastos.id, name: 'Oxxo' });

    const nominaColumn = await q.createProjectionColumn({ name: 'Nómina', type: 'income', displayOrder: 2 });
    const eventosColumn = await q.createProjectionColumn({ name: 'Eventos', type: 'income', displayOrder: 1 });
    const gastosColumn = await q.createProjectionColumn({ name: 'Gastos variables', type: 'expense', displayOrder: 3 });
    const msiColumn = await q.createProjectionColumn({ name: 'MCI/MSI', type: 'expense', displayOrder: 1 });
    const inactiveColumn = await q.createProjectionColumn({ name: 'Inactiva', type: 'expense', displayOrder: 5 });
    await q.toggleProjectionColumn({ columnId: inactiveColumn.id, isActive: false });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: nominaColumn.id, financialCategoryId: nomina.id });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: eventosColumn.id, financialCategoryId: eventos.id });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: gastosColumn.id, financialCategoryId: gastos.id });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: msiColumn.id, financialCategoryId: msi.id });

    fake.db.transaction_groups.push(
      { id: 'week-valid-1', household_id: 'house-1', note: 'Semana válida 1', created_at: '2026-04-28T12:00:00.000Z' },
      { id: 'week-valid-2', household_id: 'house-1', note: 'Semana válida 2', created_at: '2026-05-05T12:00:00.000Z' },
      { id: 'week-excluded', household_id: 'house-1', note: 'Solo ingreso', created_at: '2026-05-12T12:00:00.000Z' },
      { id: 'week-current', household_id: 'house-1', note: 'Actual parcial', created_at: '2026-05-18T12:00:00.000Z' }
    );
    fake.db.transactions.push(
      { id: 'tx-income-1', group_id: 'week-valid-1', account_id: 'acc-operativa', type: 'credit', category: nomina.key, subcategory: null, amount: '1000.00', happened_at: '2026-04-28T12:00:00.000Z' },
      { id: 'tx-event-1', group_id: 'week-valid-1', account_id: null, type: 'credit', category: eventos.key, subcategory: null, amount: '50.00', happened_at: '2026-04-28T12:00:00.000Z' },
      { id: 'tx-expense-1', group_id: 'week-valid-1', account_id: 'acc-operativa', type: 'debit', category: gastos.key, subcategory: 'oxxo', amount: '400.00', happened_at: '2026-04-29T12:00:00.000Z' },
      { id: 'tx-msi-1', group_id: 'week-valid-1', account_id: null, type: 'debit', category: msi.key, subcategory: null, amount: '100.00', happened_at: '2026-04-30T12:00:00.000Z' },
      { id: 'tx-income-2', group_id: 'week-valid-2', account_id: 'acc-operativa', type: 'credit', category: nomina.key, subcategory: null, amount: '1200.00', happened_at: '2026-05-05T12:00:00.000Z' },
      { id: 'tx-expense-2', group_id: 'week-valid-2', account_id: 'acc-operativa', type: 'debit', category: gastos.key, subcategory: 'oxxo', amount: '600.00', happened_at: '2026-05-06T12:00:00.000Z' },
      { id: 'tx-unclassified', group_id: 'week-valid-2', account_id: null, type: 'debit', category: sinColumna.key, subcategory: null, amount: '70.00', happened_at: '2026-05-06T12:00:00.000Z' },
      { id: 'tx-ignored', group_id: 'week-valid-2', account_id: null, type: 'debit', category: noProjectable.key, subcategory: null, amount: '999.00', happened_at: '2026-05-06T12:00:00.000Z' },
      { id: 'tx-income-excluded', group_id: 'week-excluded', account_id: null, type: 'credit', category: nomina.key, subcategory: null, amount: '3000.00', happened_at: '2026-05-12T12:00:00.000Z' },
      { id: 'tx-current-income', group_id: 'week-current', account_id: null, type: 'credit', category: nomina.key, subcategory: null, amount: '5000.00', happened_at: '2026-05-18T12:00:00.000Z' }
    );
    const txBefore = JSON.stringify(fake.db.transactions);
    const accountsBefore = JSON.stringify(fake.db.accounts);

    const projection = await q.buildWeeklyProjectionSummary(fake as any);
    expect(projection.columns.map((column) => column.columnName)).toEqual(['Eventos', 'Nómina', 'MCI/MSI', 'Gastos variables']);
    expect(projection.historicalWeeksUsed).toBe(2);
    expect(projection.excludedWeeks).toHaveLength(1);
    expect(projection.tableRows.filter((row) => row.block === 'current')).toHaveLength(1);
    expect(projection.tableRows.filter((row) => row.block === 'projection')).toHaveLength(12);
    expect(projection.averageWeeklyIncome).toBe(1125);
    expect(projection.averageWeeklyExpense).toBe(550);
    expect(projection.columns.find((column) => column.columnName === 'Gastos variables')?.averageWeekly).toBe(500);
    expect(projection.columns.find((column) => column.columnName === 'Eventos')?.averageWeekly).toBe(25);
    expect(projection.tableRows.find((row) => row.id === 'projection-1')?.cells[eventosColumn.id]?.amount).toBe(0);
    expect(projection.tableRows.find((row) => row.id === 'projection-1')?.cells[gastosColumn.id]?.historicalValues).toEqual([{ label: 'Histórico real 1', amount: 400 }, { label: 'Histórico real 2', amount: 600 }]);
    expect(projection.tableRows.find((row) => row.block === 'historical')?.cells[gastosColumn.id]?.movements[0]).toMatchObject({ description: 'Semana válida 1', accountName: 'BBVA', amount: 400 });
    expect(projection.unclassified.map(({ category, total, movementCount }) => ({ category, total, movementCount }))).toEqual([{ category: sinColumna.key, total: 70, movementCount: 1 }]);
    expect(projection.unclassified.some((item) => item.category === noProjectable.key)).toBe(false);
    expect(JSON.stringify(fake.db.transactions)).toBe(txBefore);
    expect(JSON.stringify(fake.db.accounts)).toBe(accountsBefore);

    const page = await import('@/app/proyeccion/page');
    const html = renderToStaticMarkup(await page.default());
    const summarySection = html.slice(html.indexOf('aria-label="Resumen general"'), html.indexOf('Resumen de columnas financieras'));
    expect(summarySection.match(/tracking-wide/g)).toHaveLength(3);
    expect(summarySection).toContain('Dinero operativo actual');
    expect(summarySection).toContain('Promedio semanal de ingresos');
    expect(summarySection).toContain('Promedio semanal de gastos');
    expect(summarySection).not.toContain('Semanas históricas usadas');
    expect(summarySection).not.toContain('Balance semanal promedio');
    expect(summarySection).not.toContain('Proyección a 12 semanas');
    expect(summarySection).not.toContain('Cambio proyectado');
    expect(html).not.toContain('aria-label="Tarjetas por columna"');
    const columnsSection = html.slice(html.indexOf('Resumen de columnas financieras'), html.indexOf('Tabla semanal'));
    expect(columnsSection).toContain('Ingresos');
    expect(columnsSection).toContain('Gastos');
    expect(columnsSection).toContain('Columna financiera');
    expect(columnsSection).toContain('Total histórico usado');
    expect(columnsSection).toContain('Categorías incluidas');
    expect(columnsSection).toContain('Acción');
    expect(columnsSection).toContain('Ver');
    expect(columnsSection.indexOf('Eventos')).toBeLessThan(columnsSection.indexOf('Nómina'));
    expect(columnsSection.indexOf('Nómina')).toBeLessThan(columnsSection.indexOf('MCI/MSI'));
    expect(columnsSection.indexOf('MCI/MSI')).toBeLessThan(columnsSection.indexOf('Gastos variables'));
    expect(columnsSection).toContain('oxxo');
    expect(columnsSection).not.toContain('Promedio:');
    expect(columnsSection).not.toContain('Histórico:');
    expect(columnsSection).not.toContain('Gastos variables:');
    expect(columnsSection).not.toContain('Semana válida 1');
    expect(html).toContain('Semana actual parcial');
    expect(html).toContain('Proyección semana 12');
    expect(html).toContain('Auditar');
    expect(html).not.toContain('Semana válida 1');
    expect(html).not.toContain('Sin cuenta');
    expect(html).not.toContain('promedio usado');
    expect(html).not.toContain('Este importe viene');
    expect(html).toContain('Sin clasificar');
    expect(html).toContain('Cómo se armó este escenario');
  });

  it('detecta auditoría de categorías faltantes, inactivas y sin columna con aislamiento por hogar', async () => {
    const q = await import('@/lib/db/queries');
    const activeUnassigned = await q.createFinancialCategory({ name: 'Gastos variables', type: 'expense' });
    const inactive = await q.createFinancialCategory({ name: 'Archivada', type: 'expense' });
    await q.toggleFinancialCategory({ categoryId: inactive.id, isActive: false });
    const assigned = await q.createFinancialCategory({ name: 'Renta', type: 'expense' });
    const column = await q.createProjectionColumn({ name: 'Fijos', type: 'expense', displayOrder: 1 });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: column.id, financialCategoryId: assigned.id });

    fake.db.transaction_groups.push(
      { id: 'group-legacy', household_id: 'house-1', note: 'Legacy', created_at: '2026-05-01T12:00:00.000Z' },
      { id: 'group-unassigned', household_id: 'house-1', note: 'Farmacia', created_at: '2026-05-02T12:00:00.000Z' },
      { id: 'group-inactive', household_id: 'house-1', note: 'Archivo', created_at: '2026-05-03T12:00:00.000Z' },
      { id: 'group-assigned', household_id: 'house-1', note: 'Renta', created_at: '2026-05-04T12:00:00.000Z' },
      { id: 'group-other-house', household_id: 'house-2', note: 'Otro hogar', created_at: '2026-05-05T12:00:00.000Z' }
    );
    fake.db.transactions.push(
      { id: 'tx-legacy', group_id: 'group-legacy', account_id: null, type: 'debit', category: 'tdc_s', subcategory: null, amount: '100.00', happened_at: '2026-05-01T12:00:00.000Z' },
      { id: 'tx-unassigned', group_id: 'group-unassigned', account_id: null, type: 'debit', category: activeUnassigned.key, subcategory: null, amount: '80.00', happened_at: '2026-05-02T12:00:00.000Z' },
      { id: 'tx-inactive', group_id: 'group-inactive', account_id: null, type: 'debit', category: inactive.key, subcategory: null, amount: '60.00', happened_at: '2026-05-03T12:00:00.000Z' },
      { id: 'tx-assigned', group_id: 'group-assigned', account_id: null, type: 'debit', category: assigned.key, subcategory: null, amount: '500.00', happened_at: '2026-05-04T12:00:00.000Z' },
      { id: 'tx-other-house', group_id: 'group-other-house', account_id: null, type: 'debit', category: 'legacy_other', subcategory: null, amount: '999.00', happened_at: '2026-05-05T12:00:00.000Z' }
    );

    const data = await q.getConfigurationData(fake as any);
    expect(data.categoryAudit.summary).toMatchObject({ problemCategoryCount: 3, problemMovementCount: 3, problemTotal: 240 });
    expect(data.categoryAudit.groups.map((group) => [group.category, group.status])).toEqual(expect.arrayContaining([
      ['tdc_s', 'missing_category'],
      ['gastos_variables', 'unassigned_projection'],
      ['archivada', 'inactive_category']
    ]));
    expect(data.categoryAudit.groups.some((group) => group.category === 'renta' || group.category === 'legacy_other')).toBe(false);
  });

  it('excluye categorías no proyectables de Proyección y rechaza asignarlas a columnas', async () => {
    const q = await import('@/lib/db/queries');
    const transfer = await q.createFinancialCategory({ name: 'Transferencia interna', type: 'both', noProjectable: true });
    const column = await q.createProjectionColumn({ name: 'Operación', type: 'expense', displayOrder: 1 });
    await expect(q.assignCategoryToProjectionColumn({ projectionColumnId: column.id, financialCategoryId: transfer.id })).rejects.toThrow('excluidas de Proyección');

    fake.db.transaction_groups.push({ id: 'group-transfer', household_id: 'house-1', note: 'Mover dinero', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push({ id: 'tx-transfer', group_id: 'group-transfer', account_id: null, type: 'debit', category: transfer.key, subcategory: null, amount: '300.00', happened_at: '2026-05-01T12:00:00.000Z' });

    const projection = await q.buildWeeklyProjectionSummary(fake as any);
    expect(projection.unclassified).toEqual([]);
    const data = await q.getConfigurationData(fake as any);
    expect(data.categoryAudit.groups).toEqual([]);
    expect(data.categoryAudit.noProjectableGroups[0]).toMatchObject({ category: 'transferencia_interna', movementCount: 1, total: 300 });
  });

  it('rechaza marcar como no proyectable una categoría ya asignada a una columna activa', async () => {
    const q = await import('@/lib/db/queries');
    const category = await q.createFinancialCategory({ name: 'Ingresos extra', type: 'income' });
    const column = await q.createProjectionColumn({ name: 'Extras', type: 'income', displayOrder: 1 });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: column.id, financialCategoryId: category.id });
    await expect(q.updateFinancialCategory({ categoryId: category.id, name: 'Ingresos extra', type: 'income', noProjectable: true, isActive: true })).rejects.toThrow('Quita primero esta categoría');
  });

  it('reclasifica un movimiento desde auditoría validando subcategoría sin modificar saldos ni montos', async () => {
    const q = await import('@/lib/db/queries');
    fake.db.accounts.push({ id: 'acc-1', household_id: 'house-1', name: 'BBVA', type: 'operational_cash', balance: '1000', is_active: true });
    const category = await q.createFinancialCategory({ name: 'Gastos variables', type: 'expense' });
    const subcategory = await q.createFinancialSubcategory({ financialCategoryId: category.id, name: 'Oxxo' });
    const other = await q.createFinancialCategory({ name: 'Servicios', type: 'expense' });
    await q.createFinancialSubcategory({ financialCategoryId: other.id, name: 'Luz' });
    fake.db.transaction_groups.push({ id: 'group-audit', household_id: 'house-1', note: 'Oxxo viejo', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push(
      { id: 'tx-audit-primary', group_id: 'group-audit', account_id: null, type: 'debit', category: 'legacy_oxxo', subcategory: null, amount: '120.00', happened_at: '2026-05-01T12:00:00.000Z' },
      { id: 'tx-audit-account', group_id: 'group-audit', account_id: 'acc-1', type: 'credit', category: 'salida_cuenta', subcategory: null, amount: '120.00', happened_at: '2026-05-01T12:00:00.000Z' }
    );
    const balanceBefore = fake.db.accounts[0].balance;
    await expect(q.reclassifyCategoryAuditMovement({ movementId: 'group-audit', category: category.key, subcategory: 'luz' }, fake as any)).rejects.toThrow('subcategoría seleccionada');
    await q.reclassifyCategoryAuditMovement({ movementId: 'group-audit', category: category.key, subcategory: subcategory.key }, fake as any);

    expect(fake.db.accounts[0].balance).toBe(balanceBefore);
    expect(fake.db.transactions.find((tx) => tx.id === 'tx-audit-primary')).toMatchObject({ category: 'gastos_variables', subcategory: 'oxxo', amount: '120.00' });
    expect(fake.db.transactions.find((tx) => tx.id === 'tx-audit-account')).toMatchObject({ category: 'salida_cuenta', subcategory: null, amount: '120.00' });
  });

  it('la UI muestra agrupación y detalle de movimientos afectados', async () => {
    vi.doMock('@/app/configuracion/actions', () => ({
      assignCategoryToProjectionColumnAction: vi.fn(),
      createFinancialCategoryAction: vi.fn(),
      createFinancialSubcategoryAction: vi.fn(),
      createProjectionColumnAction: vi.fn(),
      deleteFinancialCategoryAction: vi.fn(),
      deleteFinancialSubcategoryAction: vi.fn(),
      deleteProjectionColumnAction: vi.fn(),
      reclassifyCategoryAuditMovementAction: vi.fn(),
      removeCategoryFromProjectionColumnAction: vi.fn(),
      toggleFinancialCategoryAction: vi.fn(),
      toggleFinancialSubcategoryAction: vi.fn(),
      toggleProjectionColumnAction: vi.fn(),
      updateFinancialCategoryAction: vi.fn(),
      updateFinancialSubcategoryAction: vi.fn(),
      updateProjectionColumnAction: vi.fn()
    }));
    vi.doMock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
    const { ConfigurationManager } = await import('@/components/configuracion/configuration-manager');
    const html = renderToStaticMarkup(React.createElement(ConfigurationManager, { data: {
      hasHousehold: true,
      householdId: 'house-1',
      categories: [{ id: 'cat-1', householdId: 'house-1', name: 'Gastos variables', key: 'gastos_variables', type: 'expense', isActive: true, noProjectable: false, canDelete: true, deleteBlockedReason: null, createdAt: 'x', updatedAt: 'x', subcategories: [{ id: 'sub-1', householdId: 'house-1', financialCategoryId: 'cat-1', name: 'Oxxo', key: 'oxxo', isActive: true, canDelete: true, deleteBlockedReason: null, createdAt: 'x', updatedAt: 'x' }] }],
      projectionColumns: [],
      categoryAudit: {
        groups: [{ category: 'legacy_oxxo', categoryName: null, status: 'missing_category', total: 120, movementCount: 1, movements: [{ id: 'group-1', date: '2026-05-01T12:00:00.000Z', description: 'Oxxo viejo', accountName: 'BBVA', type: 'Gasto', amount: 120, category: 'legacy_oxxo', subcategory: null, status: 'missing_category' }] }],
        noProjectableGroups: [],
        summary: { problemCategoryCount: 1, problemMovementCount: 1, problemTotal: 120, noProjectableMovementCount: 0 }
      }
    } }));

    expect(html).toContain('Auditoría de categorías');
    expect(html).toContain('Categoría: legacy_oxxo');
    expect(html).toContain('Oxxo viejo');
    expect(html).toContain('Sin categoría configurada');
  });


  it('elimina categoría sin movimientos, subcategorías ni asignaciones', async () => {
    const q = await import('@/lib/db/queries');
    const category = await q.createFinancialCategory({ name: 'Vieja sin uso', type: 'expense' });
    await q.deleteFinancialCategory({ categoryId: category.id }, fake as any);
    expect(fake.db.financial_categories.some((row) => row.id === category.id)).toBe(false);
  });

  it('rechaza eliminar categoría con movimientos, con subcategorías o asignada a columna', async () => {
    const q = await import('@/lib/db/queries');
    const withMovements = await q.createFinancialCategory({ name: 'Con movimientos', type: 'expense' });
    fake.db.transaction_groups.push({ id: 'group-cat-movement', household_id: 'house-1', note: 'Uso', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push({ id: 'tx-cat-movement', group_id: 'group-cat-movement', account_id: null, type: 'debit', category: withMovements.key, subcategory: null, amount: '10.00', happened_at: '2026-05-01T12:00:00.000Z' });
    await expect(q.deleteFinancialCategory({ categoryId: withMovements.id }, fake as any)).rejects.toThrow('todavía tiene movimientos, subcategorías o columnas asociadas');

    const withSubcategory = await q.createFinancialCategory({ name: 'Con subcategoría', type: 'expense' });
    await q.createFinancialSubcategory({ financialCategoryId: withSubcategory.id, name: 'Detalle' });
    await expect(q.deleteFinancialCategory({ categoryId: withSubcategory.id }, fake as any)).rejects.toThrow('todavía tiene movimientos, subcategorías o columnas asociadas');

    const assigned = await q.createFinancialCategory({ name: 'Asignada', type: 'expense' });
    const column = await q.createProjectionColumn({ name: 'Columna asignada', type: 'expense', displayOrder: 1 });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: column.id, financialCategoryId: assigned.id });
    await expect(q.deleteFinancialCategory({ categoryId: assigned.id }, fake as any)).rejects.toThrow('todavía tiene movimientos, subcategorías o columnas asociadas');
  });

  it('valida dependencias de configuración consultando transactions en chunks de 100 grupos', async () => {
    const q = await import('@/lib/db/queries');
    const category = await q.createFinancialCategory({ name: 'Chunked config', type: 'expense' });
    fake.db.transaction_groups.push(
      ...Array.from({ length: 205 }, (_, index) => ({
        id: `group-chunk-${index + 1}`,
        household_id: 'house-1',
        note: `Grupo ${index + 1}`,
        created_at: '2026-05-01T12:00:00.000Z'
      }))
    );
    fake.db.transactions.push({
      id: 'tx-config-chunk',
      group_id: 'group-chunk-205',
      account_id: null,
      type: 'debit',
      category: category.key,
      subcategory: null,
      amount: '10.00',
      happened_at: '2026-05-01T12:00:00.000Z'
    });

    const data = await q.getConfigurationData(fake as any);

    expect(data.categories.find((item) => item.id === category.id)).toMatchObject({
      canDelete: false,
      deleteBlockedReason: expect.stringContaining('todavía tiene movimientos')
    });
    const dependencyQueries = fake.queryLog.filter((entry) =>
      entry.table === 'transactions'
      && entry.selected === 'id,group_id,category,subcategory'
      && entry.inFilters.some((filter) => filter.field === 'group_id')
    );
    expect(dependencyQueries.map((entry) => entry.inFilters.find((filter) => filter.field === 'group_id')?.values.length)).toEqual([100, 100, 5]);
  });

  it('elimina subcategoría sin movimientos y rechaza subcategoría usada', async () => {
    const q = await import('@/lib/db/queries');
    const category = await q.createFinancialCategory({ name: 'Gastos hogar', type: 'expense' });
    const unused = await q.createFinancialSubcategory({ financialCategoryId: category.id, name: 'Sin uso' });
    await q.deleteFinancialSubcategory({ subcategoryId: unused.id }, fake as any);
    expect(fake.db.financial_subcategories.some((row) => row.id === unused.id)).toBe(false);

    const used = await q.createFinancialSubcategory({ financialCategoryId: category.id, name: 'Usada' });
    fake.db.transaction_groups.push({ id: 'group-subcat', household_id: 'house-1', note: 'Subcat', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push({ id: 'tx-subcat', group_id: 'group-subcat', account_id: null, type: 'debit', category: category.key, subcategory: used.key, amount: '20.00', happened_at: '2026-05-01T12:00:00.000Z' });
    await expect(q.deleteFinancialSubcategory({ subcategoryId: used.id }, fake as any)).rejects.toThrow('subcategoría porque todavía tiene movimientos asociados');
  });

  it('elimina columna sin categorías y rechaza columna con categorías asignadas', async () => {
    const q = await import('@/lib/db/queries');
    const emptyColumn = await q.createProjectionColumn({ name: 'Temporal', type: 'expense', displayOrder: 1 });
    await q.deleteProjectionColumn({ columnId: emptyColumn.id }, fake as any);
    expect(fake.db.projection_columns.some((row) => row.id === emptyColumn.id)).toBe(false);

    const category = await q.createFinancialCategory({ name: 'Servicios columna', type: 'expense' });
    const assignedColumn = await q.createProjectionColumn({ name: 'Con asignaciones', type: 'expense', displayOrder: 2 });
    await q.assignCategoryToProjectionColumn({ projectionColumnId: assignedColumn.id, financialCategoryId: category.id });
    await expect(q.deleteProjectionColumn({ columnId: assignedColumn.id }, fake as any)).rejects.toThrow('todavía tiene categorías asignadas');
  });

  it('eliminación respeta household y no modifica movimientos, saldos ni cuentas', async () => {
    const q = await import('@/lib/db/queries');
    const category = await q.createFinancialCategory({ name: 'Limpieza segura', type: 'expense' });
    const otherHouseCategory = { id: 'cat-other-house', household_id: 'house-2', name: 'Otra casa', key: 'otra_casa', type: 'expense', no_projectable: false, is_active: true, created_at: 'x', updated_at: 'x' };
    fake.db.financial_categories.push(otherHouseCategory);
    fake.db.accounts.push({ id: 'acc-safe', household_id: 'house-1', name: 'BBVA', type: 'operational_cash', balance: '1234', is_active: true });
    fake.db.transaction_groups.push({ id: 'group-safe', household_id: 'house-1', note: 'Sin tocar', created_at: '2026-05-01T12:00:00.000Z' });
    fake.db.transactions.push({ id: 'tx-safe', group_id: 'group-safe', account_id: 'acc-safe', type: 'debit', category: 'otra_categoria', subcategory: null, amount: '99.00', happened_at: '2026-05-01T12:00:00.000Z' });
    const txBefore = JSON.stringify(fake.db.transactions);
    const accountsBefore = JSON.stringify(fake.db.accounts);

    await expect(q.deleteFinancialCategory({ categoryId: otherHouseCategory.id }, fake as any)).rejects.toThrow('No se encontró la categoría');
    await q.deleteFinancialCategory({ categoryId: category.id }, fake as any);

    expect(JSON.stringify(fake.db.transactions)).toBe(txBefore);
    expect(JSON.stringify(fake.db.accounts)).toBe(accountsBefore);
    expect(fake.db.financial_categories.some((row) => row.id === otherHouseCategory.id)).toBe(true);
  });

});
