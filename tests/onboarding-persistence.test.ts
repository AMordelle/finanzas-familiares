import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'upsert' | 'update' = 'select';
  private filters: Array<{ field: string; value: unknown }> = [];
  private inFilters: Array<{ field: string; values: unknown[] }> = [];
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

  update(payload: any) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ field, value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.inFilters.push({ field, values });
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
      const inserted = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((item, index) => ({
        id: item.id ?? `${this.table}-${rows.length + index + 1}`,
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

    if (this.action === 'update') {
      const matches = (row: Record<string, unknown>) => this.filters.every((filter) => row[filter.field] === filter.value);
      const updatedRows = rows.map((row) => (matches(row) ? { ...row, ...this.payload } : row));
      this.db[this.table] = updatedRows;
      const changed = updatedRows.filter((row) => matches(row));
      return { data: this.pickColumns(changed), error: null };
    }

    let selectedRows = [...rows];
    for (const filter of this.filters) {
      selectedRows = selectedRows.filter((row) => row[filter.field] === filter.value);
    }

    for (const filter of this.inFilters) {
      selectedRows = selectedRows.filter((row) => filter.values.includes(row[filter.field]));
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

  it('usa DEV_PROFILE_ID de forma consistente en desarrollo', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'perfil-env', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-env', profile_id: 'perfil-env', household_id: 'hogar-env' });

    process.env.DEV_PROFILE_ID = 'perfil-env';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getOrCreateActiveProfileId, getDefaultHouseholdId } = await import('@/lib/db/queries');

    const profileId = await getOrCreateActiveProfileId();
    const householdId = await getDefaultHouseholdId();

    expect(profileId).toBe('perfil-env');
    expect(householdId).toBe('hogar-env');

    delete process.env.DEV_PROFILE_ID;
  });

  it('retorna resumen inicial tras guardar onboarding exitosamente', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding } = await import('@/lib/db/queries');

    const result = await createHouseholdOnboarding(payload);

    expect(result.indicators.monthlyOFH).toBeGreaterThan(0);
    expect(result.indicators.weeklyOFH).toBeGreaterThan(0);
    expect(result.indicators.regularIncomeMonthly).toBeGreaterThan(0);
    expect(result.indicators.diagnoses.length).toBeGreaterThan(0);
  });

  it('crea hogar + cuentas + snapshot', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));

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

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDefaultHouseholdId } = await import('@/lib/db/queries');

    const householdId = await getDefaultHouseholdId();
    expect(householdId).toBe('house-1');
  });

  it('dashboard resuelve datos reales después de onboarding', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));

    const { createHouseholdOnboarding, getDashboardData } = await import('@/lib/db/queries');
    await createHouseholdOnboarding(payload);

    const dashboard = await getDashboardData();
    expect(dashboard.hasHousehold).toBe(true);
    expect(dashboard.monthlyOFH).toBeGreaterThan(0);
  });

  it('cuentas resuelve cuentas reales después de onboarding', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));

    const { createHouseholdOnboarding, getAccountsForRegistration } = await import('@/lib/db/queries');
    await createHouseholdOnboarding(payload);

    const accounts = await getAccountsForRegistration();
    expect(accounts.length).toBeGreaterThan(0);
  });

  it('registro setup deja de estar bloqueado después de onboarding', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));

    const { createHouseholdOnboarding, getRegistrationSetupStatus } = await import('@/lib/db/queries');
    await createHouseholdOnboarding(payload);

    const setup = await getRegistrationSetupStatus();
    expect(setup.hasHousehold).toBe(true);
    expect(setup.accounts.length).toBeGreaterThan(0);
  });

  it('snapshot generado tras recálculo incluye availableMoney', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-x', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-x', profile_id: 'profile-x', household_id: 'house-x' });
    fakeClient.db.accounts.push({ id: 'acc-1', household_id: 'house-x', name: 'Efectivo', type: 'operativa', balance: '1500' });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { recalculateIndicators } = await import('@/lib/db/queries');

    await recalculateIndicators('house-x');

    const snapshot = fakeClient.db.financial_snapshots[0];
    const payload = JSON.parse(snapshot.payload);
    expect(payload.availableMoney).toBe(1500);
    expect(payload.monthlyOFH).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(payload.diagnoses)).toBe(true);
    expect(Array.isArray(payload.recommendations)).toBe(true);
  });

  it('dashboard renderiza seguro con payload parcial sin availableMoney', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-p', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-p', profile_id: 'profile-p', household_id: 'house-p' });
    fakeClient.db.financial_snapshots.push({
      id: 'snap-p',
      household_id: 'house-p',
      payload: JSON.stringify({ monthlyOFH: 1234 }),
      created_at: new Date().toISOString()
    });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDashboardData } = await import('@/lib/db/queries');

    const dashboard = await getDashboardData();
    expect(dashboard.monthlyOFH).toBe(1234);
    expect(dashboard.availableMoney).toBe(0);
    expect(dashboard.recommendations.length).toBeGreaterThan(0);
  });

  it('dashboard lee snapshot actualizado después de guardar movimiento', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-m', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-m', profile_id: 'profile-m', household_id: 'house-m' });
    fakeClient.db.accounts.push({ id: 'acc-m', household_id: 'house-m', name: 'Efectivo', type: 'operativa', balance: '2100' });

    process.env.DEV_PROFILE_ID = 'profile-m';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { saveConversationalTransaction, getDashboardData } = await import('@/lib/db/queries');

    await saveConversationalTransaction({
      action: 'gasto',
      amount: 300,
      category: 'comida',
      description: 'Gasto comida',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const dashboard = await getDashboardData();
    expect(dashboard.hasHousehold).toBe(true);
    expect(dashboard.availableMoney).toBe(1800);

    delete process.env.DEV_PROFILE_ID;
  });


  it('movimientos devuelve historial real en orden cronológico inverso', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-h', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-h', profile_id: 'profile-h', household_id: 'house-h' });
    fakeClient.db.accounts.push(
      { id: 'acc-efectivo', household_id: 'house-h', name: 'Efectivo', type: 'operativa', balance: '1000' },
      { id: 'acc-banco', household_id: 'house-h', name: 'Banco', type: 'operativa', balance: '2000' }
    );
    fakeClient.db.transaction_groups.push(
      { id: 'g-antiguo', household_id: 'house-h', note: 'Gasto supermercado', created_at: '2024-01-01T10:00:00.000Z' },
      { id: 'g-reciente', household_id: 'house-h', note: 'Transferencia interna', created_at: '2024-02-01T10:00:00.000Z' }
    );
    fakeClient.db.transactions.push(
      { id: 't1', group_id: 'g-antiguo', account_id: null, type: 'debit', category: 'comida', amount: '350.00', happened_at: '2024-01-01T10:00:00.000Z' },
      { id: 't2', group_id: 'g-antiguo', account_id: 'acc-efectivo', type: 'credit', category: 'salida_cuenta', amount: '350.00', happened_at: '2024-01-01T10:00:00.000Z' },
      { id: 't3', group_id: 'g-reciente', account_id: 'acc-banco', type: 'debit', category: 'transferencia', amount: '500.00', happened_at: '2024-02-01T10:00:00.000Z' },
      { id: 't4', group_id: 'g-reciente', account_id: 'acc-efectivo', type: 'credit', category: 'transferencia', amount: '500.00', happened_at: '2024-02-01T10:00:00.000Z' }
    );

    process.env.DEV_PROFILE_ID = 'profile-h';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getMovementsHistory } = await import('@/lib/db/queries');

    const result = await getMovementsHistory();
    expect(result.hasHousehold).toBe(true);
    expect(result.movements.length).toBe(2);
    expect(result.movements[0]?.id).toBe('g-reciente');
    expect(result.movements[0]?.tipoMovimiento).toBe('Transferencia');
    expect(result.movements[0]?.cuentaOrigen).toBe('Efectivo');
    expect(result.movements[0]?.cuentaDestino).toBe('Banco');
    expect(result.movements[1]?.tipoMovimiento).toBe('Gasto');

    delete process.env.DEV_PROFILE_ID;
  });

  it('movimientos devuelve estado vacío amigable cuando no hay registros', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-empty', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-empty', profile_id: 'profile-empty', household_id: 'house-empty' });

    process.env.DEV_PROFILE_ID = 'profile-empty';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getMovementsHistory } = await import('@/lib/db/queries');

    const result = await getMovementsHistory();
    expect(result.hasHousehold).toBe(true);
    expect(result.movements).toEqual([]);

    delete process.env.DEV_PROFILE_ID;
  });


  it('actualiza saldos y conserva OFH de configuración tras gasto e ingreso', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding, saveConversationalTransaction } = await import('@/lib/db/queries');

    process.env.DEV_PROFILE_ID = 'profile-balance';

    await createHouseholdOnboarding({
      householdName: 'Caso controlado',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 10000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [
        { nombre: 'efectivo', saldoInicial: 1000 },
        { nombre: 'banco', saldoInicial: 4000 }
      ],
      fundAccounts: [],
      debtAccounts: [],
      receivables: [],
      fixedExpenses: [{ nombre: 'Servicios', monto: 500, periodicidad: 'mensual' }],
      variableSpending: [{ nombre: 'Gasto variable', monto: 3000 }]
    });

    await saveConversationalTransaction({
      action: 'gasto',
      amount: 600,
      category: 'alimentos',
      description: 'Gasto en efectivo',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const efectivo = fakeClient.db.accounts.find((acc) => acc.name === 'efectivo');
    expect(Number(efectivo.balance)).toBe(400);

    const firstSnapshot = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);
    expect(firstSnapshot.monthlyOFH).toBe(3850);
    expect(firstSnapshot.availableMoney).toBe(4400);

    await saveConversationalTransaction({
      action: 'ingreso',
      amount: 2000,
      category: 'ingreso_general',
      description: 'Ingreso a banco',
      sourceAccount: undefined,
      destinationAccount: 'banco',
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const banco = fakeClient.db.accounts.find((acc) => acc.name === 'banco');
    expect(Number(banco.balance)).toBe(6000);

    const secondSnapshot = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);
    expect(secondSnapshot.monthlyOFH).toBe(3850);
    expect(secondSnapshot.availableMoney).toBe(6400);

    delete process.env.DEV_PROFILE_ID;
  });

  it('snapshot post-transacción mantiene estructura financiera completa', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-snapshot', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-snapshot', profile_id: 'profile-snapshot', household_id: 'house-snapshot' });
    fakeClient.db.accounts.push(
      { id: 'acc-op', household_id: 'house-snapshot', name: 'Caja', type: 'operativa', balance: '5000' },
      { id: 'acc-debt', household_id: 'house-snapshot', name: 'Tarjeta Oro', type: 'deuda', balance: '1000' },
      { id: 'acc-fondo', household_id: 'house-snapshot', name: 'Fondo', type: 'fondo', balance: '2000' }
    );
    fakeClient.db.income_sources.push({ id: 'inc-1', household_id: 'house-snapshot', name: 'Sueldo (mensual)', amount: '10000', recurring: true });
    fakeClient.db.obligations.push({ id: 'ob-1', household_id: 'house-snapshot', name: 'Renta', amount: '2000' });
    fakeClient.db.variable_spending_profiles.push({ id: 'var-1', household_id: 'house-snapshot', category: 'Comida', monthly_estimate: '1500' });

    process.env.DEV_PROFILE_ID = 'profile-snapshot';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { saveConversationalTransaction } = await import('@/lib/db/queries');

    await saveConversationalTransaction({
      action: 'gasto',
      amount: 300,
      category: 'gasto_variable',
      description: 'Compra',
      sourceAccount: 'caja',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const snapshot = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);

    expect(snapshot.monthlyOFH).toBeGreaterThan(0);
    expect(snapshot.weeklyOFH).toBeGreaterThan(0);
    expect(snapshot.regularIncomeMonthly).toBe(10000);
    expect(snapshot.annualAverageMonthlyIncome).toBe(10000);
    expect(snapshot.immediateMRF).toBeGreaterThan(0);
    expect(snapshot.extendedMRF).toBeGreaterThan(0);
    expect(snapshot.availableMoney).toBe(4700);
    expect(Array.isArray(snapshot.diagnoses)).toBe(true);
    expect(Array.isArray(snapshot.recommendations)).toBe(true);
    expect(snapshot.financialInput.fixedExpenses).toBe(2000);
    expect(snapshot.financialInput.avgVariableExpenses).toBe(1500);
    expect(snapshot.totals.totalExpenses).toBeGreaterThan(0);

    delete process.env.DEV_PROFILE_ID;
  });

});
