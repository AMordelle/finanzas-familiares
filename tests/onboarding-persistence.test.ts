import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'upsert' = 'select';
  private filters: Array<{ field: string; value: unknown }> = [];
  private limitValue: number | null = null;
  private orderBy: { field: string; ascending: boolean } | null = null;
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
    this.orderBy = { field, ascending: options?.ascending ?? true };
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

  private execute() {
    const rows = this.db[this.table] ?? [];

    if (this.action === 'insert') {
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item) => ({
        id: item.id ?? `${this.table}-${rows.length + 1}`,
        created_at: item.created_at ?? new Date().toISOString(),
        ...item
      }));
      this.db[this.table] = [...rows, ...inserted];
      return { data: this.pickColumns(inserted), error: null };
    }

    if (this.action === 'upsert') {
      const item = this.payload;
      const index = rows.findIndex((row) => row.id === item.id);
      if (index >= 0) {
        rows[index] = { ...rows[index], ...item };
      } else {
        rows.push({ ...item, created_at: new Date().toISOString() });
      }
      this.db[this.table] = rows;
      return { data: this.pickColumns([item]), error: null };
    }

    let selectedRows = [...rows];
    for (const filter of this.filters) {
      selectedRows = selectedRows.filter((row) => row[filter.field] === filter.value);
    }

    if (this.orderBy) {
      selectedRows.sort((a, b) => {
        const av = a[this.orderBy!.field];
        const bv = b[this.orderBy!.field];
        if (av === bv) return 0;
        if (this.orderBy!.ascending) return av > bv ? 1 : -1;
        return av < bv ? 1 : -1;
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
    profiles: [],
    households: [],
    household_members: [],
    accounts: [],
    income_sources: [],
    obligations: [],
    variable_spending_profiles: [],
    receivables: [],
    financial_snapshots: []
  };

  return {
    db,
    from(table: string) {
      return new FakeQueryBuilder(table, db);
    }
  };
}

const payload = {
  householdName: 'Hogar prueba',
  householdType: 'solo',
  regularIncomes: [{ nombre: 'Sueldo', monto: 20000, periodicidad: 'mensual' }],
  extraordinaryIncomes: [],
  operationalAccounts: [{ nombre: 'Banco', saldoInicial: 900 }],
  fundAccounts: [{ nombre: 'Fondo', saldoInicial: 1200 }],
  debtAccounts: [{ nombre: 'Tarjeta', saldoInicial: 3000, pagoPeriodico: 500, diaPago: 10 }],
  receivables: [{ nombre: 'Cliente', contraparte: 'Cliente', monto: 1500 }],
  fixedExpenses: [{ nombre: 'Renta', monto: 7000, periodicidad: 'mensual' }],
  variableSpending: [{ nombre: 'Comida', monto: 2500 }]
};

describe('onboarding persistence', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('retorna resumen inicial tras guardar onboarding exitosamente', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient }));
    const { createHouseholdOnboarding } = await import('@/lib/db/queries');

    const result = await createHouseholdOnboarding(payload);

    expect(result.indicators.monthlyOFH).toBeGreaterThan(0);
    expect(result.indicators.weeklyOFH).toBeGreaterThan(0);
    expect(result.indicators.regularIncomeMonthly).toBeGreaterThan(0);
    expect(result.indicators.diagnoses.length).toBeGreaterThan(0);
  });

  it('crea hogar + cuentas + snapshot', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient }));

    const { createHouseholdOnboarding } = await import('@/lib/db/queries');
    const result = await createHouseholdOnboarding(payload);

    expect(result.householdId).toBeTruthy();
    expect(fakeClient.db.households.length).toBe(1);
    expect(fakeClient.db.household_members.length).toBe(1);
    expect(fakeClient.db.accounts.length).toBe(4);
    expect(fakeClient.db.financial_snapshots.length).toBe(1);
  });



  it('existing household_members row retorna household id directamente', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-1', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-1', profile_id: 'profile-1', household_id: 'house-1' });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient }));
    const { getDefaultHouseholdId } = await import('@/lib/db/queries');

    const householdId = await getDefaultHouseholdId();
    expect(householdId).toBe('house-1');
  });

  it('dashboard resuelve datos reales después de onboarding', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient }));

    const { createHouseholdOnboarding, getDashboardData } = await import('@/lib/db/queries');
    await createHouseholdOnboarding(payload);

    const dashboard = await getDashboardData();
    expect(dashboard.hasHousehold).toBe(true);
    expect(dashboard.monthlyOFH).toBeGreaterThan(0);
  });

  it('cuentas resuelve cuentas reales después de onboarding', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient }));

    const { createHouseholdOnboarding, getAccountsForRegistration } = await import('@/lib/db/queries');
    await createHouseholdOnboarding(payload);

    const accounts = await getAccountsForRegistration();
    expect(accounts.length).toBeGreaterThan(0);
  });

  it('registro setup deja de estar bloqueado después de onboarding', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient }));

    const { createHouseholdOnboarding, getRegistrationSetupStatus } = await import('@/lib/db/queries');
    await createHouseholdOnboarding(payload);

    const setup = await getRegistrationSetupStatus();
    expect(setup.hasHousehold).toBe(true);
    expect(setup.accounts.length).toBeGreaterThan(0);
  });
});
