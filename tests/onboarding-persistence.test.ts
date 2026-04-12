import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeQueryBuilder {
  private action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
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

  delete() {
    this.action = 'delete';
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

    if (this.action === 'delete') {
      const matches = (row: Record<string, unknown>) => this.filters.every((filter) => row[filter.field] === filter.value);
      const deletedRows = rows.filter((row) => matches(row));
      this.db[this.table] = rows.filter((row) => !matches(row));
      return { data: this.pickColumns(deletedRows), error: null };
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
    expect(dashboard.financialPressure).toBeNull();
    expect(dashboard.financialInsight).toBeNull();
  });

  it('dashboard expone financialPressure cuando existe en snapshot', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-fp', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-fp', profile_id: 'profile-fp', household_id: 'house-fp' });
    fakeClient.db.financial_snapshots.push({
      id: 'snap-fp',
      household_id: 'house-fp',
      payload: JSON.stringify({
        monthlyOFH: 2000,
        financialPressure: {
          requiredMoney: 3200,
          availableMoney: 2100,
          gap: 1100,
          status: 'critical'
        }
      }),
      created_at: new Date().toISOString()
    });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDashboardData } = await import('@/lib/db/queries');

    const dashboard = await getDashboardData();
    expect(dashboard.financialPressure).toEqual({
      requiredMoney: 3200,
      availableMoney: 2100,
      gap: 1100,
      status: 'critical',
      breakdown: {
        debts: 0,
        fixedExpenses: 0,
        operationalEstimate: 0
      }
    });
  });


  it('dashboard normaliza breakdown de financialPressure cuando existe en snapshot', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-bd', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-bd', profile_id: 'profile-bd', household_id: 'house-bd' });
    fakeClient.db.financial_snapshots.push({
      id: 'snap-bd',
      household_id: 'house-bd',
      payload: JSON.stringify({
        financialPressure: {
          requiredMoney: 3200,
          availableMoney: 2100,
          gap: 1100,
          status: 'warning',
          breakdown: {
            debts: 900,
            fixedExpenses: 1400,
            operationalEstimate: 900
          }
        }
      }),
      created_at: new Date().toISOString()
    });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDashboardData } = await import('@/lib/db/queries');

    const dashboard = await getDashboardData();
    expect(dashboard.financialPressure?.breakdown).toEqual({
      debts: 900,
      fixedExpenses: 1400,
      operationalEstimate: 900
    });
  });

  it('dashboard usa fallback seguro cuando financialPressure no trae breakdown completo', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-bd-partial', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-bd-partial', profile_id: 'profile-bd-partial', household_id: 'house-bd-partial' });
    fakeClient.db.financial_snapshots.push({
      id: 'snap-bd-partial',
      household_id: 'house-bd-partial',
      payload: JSON.stringify({
        financialPressure: {
          requiredMoney: 1800,
          availableMoney: 1600,
          gap: 200,
          status: 'warning',
          breakdown: {
            debts: 450
          }
        }
      }),
      created_at: new Date().toISOString()
    });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDashboardData } = await import('@/lib/db/queries');

    const dashboard = await getDashboardData();
    expect(dashboard.financialPressure).toEqual({
      requiredMoney: 1800,
      availableMoney: 1600,
      gap: 200,
      status: 'warning',
      breakdown: {
        debts: 450,
        fixedExpenses: 0,
        operationalEstimate: 0
      }
    });
  });

  it('dashboard conserva status de financialPressure para mapear etiqueta de estado', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-status', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-status', profile_id: 'profile-status', household_id: 'house-status' });
    fakeClient.db.financial_snapshots.push({
      id: 'snap-status',
      household_id: 'house-status',
      payload: JSON.stringify({
        financialPressure: {
          requiredMoney: 1500,
          availableMoney: 1600,
          gap: -100,
          status: 'healthy'
        }
      }),
      created_at: new Date().toISOString()
    });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDashboardData } = await import('@/lib/db/queries');

    const dashboard = await getDashboardData();
    expect(dashboard.financialPressure?.status).toBe('healthy');
  });

  it('dashboard expone insight AI solo cuando viene en snapshot', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-ai', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-ai', profile_id: 'profile-ai', household_id: 'house-ai' });
    fakeClient.db.financial_snapshots.push({
      id: 'snap-ai',
      household_id: 'house-ai',
      payload: JSON.stringify({
        financialPressure: {
          requiredMoney: 2800,
          availableMoney: 2000,
          gap: 800,
          status: 'warning'
        },
        financialInsight: {
          explanation: 'Hay presión por compromisos de esta semana.',
          topCauses: ['deudas ($1,500)'],
          suggestions: ['Prioriza pagos críticos.']
        }
      }),
      created_at: new Date().toISOString()
    });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDashboardData } = await import('@/lib/db/queries');

    const dashboard = await getDashboardData();
    expect(dashboard.financialInsight?.explanation).toContain('presión');
    expect(dashboard.financialInsight?.topCauses.length).toBe(1);
    expect(dashboard.financialInsight?.suggestions.length).toBe(1);
  });

  it('dashboard no truena con snapshot viejo parcial de financialPressure', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-legacy', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-legacy', profile_id: 'profile-legacy', household_id: 'house-legacy' });
    fakeClient.db.financial_snapshots.push({
      id: 'snap-legacy',
      household_id: 'house-legacy',
      payload: JSON.stringify({
        financialPressure: {
          requiredMoney: 1000,
          gap: 300
        }
      }),
      created_at: new Date().toISOString()
    });

    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getDashboardData } = await import('@/lib/db/queries');

    const dashboard = await getDashboardData();
    expect(dashboard.financialPressure).toBeNull();
    expect(dashboard.financialInsight).toBeNull();
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

  it('saveConversationalTransaction usa hoy por defecto en happened_at', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-date-default', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-date-default', profile_id: 'profile-date-default', household_id: 'house-date-default' });
    fakeClient.db.accounts.push({ id: 'acc-date-default', household_id: 'house-date-default', name: 'Efectivo', type: 'operativa', balance: '1000' });

    process.env.DEV_PROFILE_ID = 'profile-date-default';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-11T09:30:00.000Z'));
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { saveConversationalTransaction } = await import('@/lib/db/queries');

    await saveConversationalTransaction({
      action: 'gasto',
      amount: 120,
      category: 'comida',
      description: 'Desayuno',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    } as any);

    expect(fakeClient.db.transactions[0]?.happened_at).toBe('2026-04-11T09:30:00.000Z');
    vi.useRealTimers();
    delete process.env.DEV_PROFILE_ID;
  });

  it('saveConversationalTransaction respeta fecha custom/yesterday y mantiene created_at independiente', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-date-custom', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-date-custom', profile_id: 'profile-date-custom', household_id: 'house-date-custom' });
    fakeClient.db.accounts.push({ id: 'acc-date-custom', household_id: 'house-date-custom', name: 'Efectivo', type: 'operativa', balance: '1000' });

    process.env.DEV_PROFILE_ID = 'profile-date-custom';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { saveConversationalTransaction } = await import('@/lib/db/queries');

    await saveConversationalTransaction({
      action: 'gasto',
      amount: 50,
      category: 'transporte',
      description: 'Taxi',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    } as any, { happenedAt: '2026-04-10T12:00:00.000Z' });

    await saveConversationalTransaction({
      action: 'gasto',
      amount: 70,
      category: 'cafe',
      description: 'Café',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    } as any, { happenedAt: '2026-04-01T12:00:00.000Z' });

    const firstMovementLines = fakeClient.db.transactions.filter((tx) => tx.group_id === fakeClient.db.transaction_groups[0]?.id);
    const secondMovementLines = fakeClient.db.transactions.filter((tx) => tx.group_id === fakeClient.db.transaction_groups[1]?.id);

    expect(firstMovementLines.every((tx) => tx.happened_at === '2026-04-10T12:00:00.000Z')).toBe(true);
    expect(secondMovementLines.every((tx) => tx.happened_at === '2026-04-01T12:00:00.000Z')).toBe(true);
    expect(firstMovementLines.every((tx) => tx.created_at !== tx.happened_at)).toBe(true);
    expect(secondMovementLines.every((tx) => tx.created_at !== tx.happened_at)).toBe(true);

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
    expect(result.movements[0]?.categoria).toBe('transferencia');
    expect(result.movements[0]?.cuentaOrigen).toBe('Efectivo');
    expect(result.movements[0]?.cuentaDestino).toBe('Banco');
    expect(result.movements[1]?.tipoMovimiento).toBe('Gasto');
    expect(result.movements[1]?.categoria).toBe('comida');

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

  it('movimientos conserva categoría real sin sobreescribirla con etiquetas de presentación', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-category', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-category', profile_id: 'profile-category', household_id: 'house-category' });
    fakeClient.db.accounts.push({ id: 'acc-banco-cat', household_id: 'house-category', name: 'Banco', type: 'operativa', balance: '2000' });
    fakeClient.db.transaction_groups.push({ id: 'g-category', household_id: 'house-category', note: 'Ingreso adicional', created_at: '2024-03-01T10:00:00.000Z' });
    fakeClient.db.transactions.push({ id: 't-cat', group_id: 'g-category', account_id: 'acc-banco-cat', type: 'debit', category: 'ingreso_extra', amount: '440.00', happened_at: '2024-03-01T10:00:00.000Z' });

    process.env.DEV_PROFILE_ID = 'profile-category';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getMovementsHistory } = await import('@/lib/db/queries');

    const result = await getMovementsHistory();
    expect(result.movements[0]?.categoria).toBe('ingreso_extra');

    delete process.env.DEV_PROFILE_ID;
  });

  it('movimientos ignora categorías internas y prioriza la categoría visible del usuario', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-system-category', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-system-category', profile_id: 'profile-system-category', household_id: 'house-system-category' });
    fakeClient.db.accounts.push({ id: 'acc-bank-system-category', household_id: 'house-system-category', name: 'Banco', type: 'operativa', balance: '2000' });
    fakeClient.db.transaction_groups.push({ id: 'g-system-category', household_id: 'house-system-category', note: 'Ingreso extra', created_at: '2024-03-02T10:00:00.000Z' });
    fakeClient.db.transactions.push(
      { id: 't-system-internal', group_id: 'g-system-category', account_id: 'acc-bank-system-category', type: 'debit', category: 'entrada_cuenta', amount: '440.00', happened_at: '2024-03-02T10:00:00.000Z' },
      { id: 't-system-visible', group_id: 'g-system-category', account_id: null, type: 'credit', category: 'ingreso_extra', amount: '440.00', happened_at: '2024-03-02T10:00:00.000Z' }
    );

    process.env.DEV_PROFILE_ID = 'profile-system-category';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getMovementsHistory } = await import('@/lib/db/queries');

    const result = await getMovementsHistory();
    expect(result.movements[0]?.categoria).toBe('ingreso_extra');
    expect(result.movements[0]?.categoria).not.toBe('entrada_cuenta');

    delete process.env.DEV_PROFILE_ID;
  });

  it('movimientos reconstruye préstamo otorgado agrupado con destino y categoría semántica', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-loan-history', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-loan-history', profile_id: 'profile-loan-history', household_id: 'house-loan-history' });
    fakeClient.db.accounts.push(
      { id: 'acc-cash-loan-history', household_id: 'house-loan-history', name: 'Efectivo', type: 'operativa', balance: '5000' },
      { id: 'acc-silvia-loan-history', household_id: 'house-loan-history', name: 'Silvia', type: 'por_cobrar', balance: '3000' }
    );
    fakeClient.db.transaction_groups.push({
      id: 'g-loan-history',
      household_id: 'house-loan-history',
      note: 'Le preste 3000 a Silvia con Efectivo',
      created_at: '2024-03-03T10:00:00.000Z'
    });
    fakeClient.db.transactions.push(
      { id: 't-loan-history-1', group_id: 'g-loan-history', account_id: null, type: 'debit', category: 'por_cobrar', amount: '3000.00', happened_at: '2024-03-03T10:00:00.000Z' },
      { id: 't-loan-history-2', group_id: 'g-loan-history', account_id: 'acc-cash-loan-history', type: 'credit', category: 'salida_cuenta', amount: '3000.00', happened_at: '2024-03-03T10:00:00.000Z' }
    );

    process.env.DEV_PROFILE_ID = 'profile-loan-history';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getMovementsHistory } = await import('@/lib/db/queries');

    const result = await getMovementsHistory();
    expect(result.movements[0]?.cuentaOrigen).toBe('Efectivo');
    expect(result.movements[0]?.cuentaDestino).toBe('Silvia');
    expect(result.movements[0]?.categoria).toBe('prestamo_otorgado');

    delete process.env.DEV_PROFILE_ID;
  });

  it('movimientos no muestra por_cobrar cuando existe categoría semántica de préstamo otorgado', async () => {
    const fakeClient = createFakeSupabase();
    fakeClient.db.profiles.push({ id: 'profile-loan-category', created_at: new Date().toISOString() });
    fakeClient.db.household_members.push({ id: 'hm-loan-category', profile_id: 'profile-loan-category', household_id: 'house-loan-category' });
    fakeClient.db.accounts.push(
      { id: 'acc-cash-loan-category', household_id: 'house-loan-category', name: 'Efectivo', type: 'operativa', balance: '5000' },
      { id: 'acc-silvia-loan-category', household_id: 'house-loan-category', name: 'Silvia', type: 'por_cobrar', balance: '3000' }
    );
    fakeClient.db.transaction_groups.push({
      id: 'g-loan-category',
      household_id: 'house-loan-category',
      note: 'Préstamo a Silvia',
      created_at: '2024-03-04T10:00:00.000Z'
    });
    fakeClient.db.transactions.push(
      { id: 't-loan-category-1', group_id: 'g-loan-category', account_id: null, type: 'debit', category: 'por_cobrar', amount: '700.00', happened_at: '2024-03-04T10:00:00.000Z' },
      { id: 't-loan-category-2', group_id: 'g-loan-category', account_id: 'acc-cash-loan-category', type: 'credit', category: 'salida_cuenta', amount: '700.00', happened_at: '2024-03-04T10:00:00.000Z' }
    );

    process.env.DEV_PROFILE_ID = 'profile-loan-category';
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { getMovementsHistory } = await import('@/lib/db/queries');

    const result = await getMovementsHistory();
    expect(result.movements[0]?.categoria).toBe('prestamo_otorgado');
    expect(result.movements[0]?.categoria).not.toBe('por_cobrar');

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

  it('eliminar gasto en efectivo revierte balances y snapshot sin alterar OFH', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding, saveConversationalTransaction, deleteMovement } = await import('@/lib/db/queries');

    process.env.DEV_PROFILE_ID = 'profile-delete-expense';

    await createHouseholdOnboarding({
      householdName: 'Caso A',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 10000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [{ nombre: 'efectivo', saldoInicial: 1000 }, { nombre: 'banco', saldoInicial: 4000 }],
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
      description: 'Gasto efectivo',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const snapshotAfterSave = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);
    expect(snapshotAfterSave.availableMoney).toBe(4400);

    const movementId = fakeClient.db.transaction_groups.at(-1).id;
    await deleteMovement({ movementId });

    const efectivo = fakeClient.db.accounts.find((acc) => acc.name === 'efectivo');
    expect(Number(efectivo.balance)).toBe(1000);

    const snapshotAfterDelete = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);
    expect(snapshotAfterDelete.availableMoney).toBe(5000);
    expect(snapshotAfterDelete.monthlyOFH).toBe(snapshotAfterSave.monthlyOFH);

    delete process.env.DEV_PROFILE_ID;
  });

  it('editar monto de gasto en efectivo corrige balances y snapshot', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding, saveConversationalTransaction, updateMovement } = await import('@/lib/db/queries');

    process.env.DEV_PROFILE_ID = 'profile-edit-expense';

    await createHouseholdOnboarding({
      householdName: 'Caso B',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 10000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [{ nombre: 'efectivo', saldoInicial: 1000 }, { nombre: 'banco', saldoInicial: 4000 }],
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
      description: 'Gasto efectivo',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const movementId = fakeClient.db.transaction_groups.at(-1).id;
    const efectivoId = fakeClient.db.accounts.find((acc) => acc.name === 'efectivo').id;
    await updateMovement({
      movementId,
      description: 'Gasto corregido',
      amount: 300,
      sourceAccountId: efectivoId,
      destinationAccountId: null
    });

    const efectivo = fakeClient.db.accounts.find((acc) => acc.name === 'efectivo');
    expect(Number(efectivo.balance)).toBe(700);

    const snapshot = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);
    expect(snapshot.availableMoney).toBe(4700);
    expect(snapshot.monthlyOFH).toBeGreaterThan(0);

    delete process.env.DEV_PROFILE_ID;
  });

  it('eliminar ingreso corrige banco y mantiene OFH estable', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding, saveConversationalTransaction, deleteMovement } = await import('@/lib/db/queries');

    process.env.DEV_PROFILE_ID = 'profile-delete-income';

    await createHouseholdOnboarding({
      householdName: 'Caso C',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 10000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [{ nombre: 'efectivo', saldoInicial: 1000 }, { nombre: 'banco', saldoInicial: 4000 }],
      fundAccounts: [],
      debtAccounts: [],
      receivables: [],
      fixedExpenses: [{ nombre: 'Servicios', monto: 500, periodicidad: 'mensual' }],
      variableSpending: [{ nombre: 'Gasto variable', monto: 3000 }]
    });

    await saveConversationalTransaction({
      action: 'ingreso',
      amount: 2000,
      category: 'ingreso_general',
      description: 'Ingreso banco',
      sourceAccount: undefined,
      destinationAccount: 'banco',
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const snapshotAfterSave = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);
    const banco = fakeClient.db.accounts.find((acc) => acc.name === 'banco');
    expect(Number(banco.balance)).toBe(6000);

    const movementId = fakeClient.db.transaction_groups.at(-1).id;
    await deleteMovement({ movementId });

    const bancoAfterDelete = fakeClient.db.accounts.find((acc) => acc.name === 'banco');
    expect(Number(bancoAfterDelete.balance)).toBe(4000);
    const snapshotAfterDelete = JSON.parse(fakeClient.db.financial_snapshots.at(-1).payload);
    expect(snapshotAfterDelete.availableMoney).toBe(5000);
    expect(snapshotAfterDelete.monthlyOFH).toBe(snapshotAfterSave.monthlyOFH);

    delete process.env.DEV_PROFILE_ID;
  });

  it('dashboard mantiene valores numéricos seguros después de editar y eliminar', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding, saveConversationalTransaction, updateMovement, deleteMovement, getDashboardData } = await import('@/lib/db/queries');

    process.env.DEV_PROFILE_ID = 'profile-dashboard-safe';

    await createHouseholdOnboarding({
      householdName: 'Caso D',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 10000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [{ nombre: 'efectivo', saldoInicial: 1000 }, { nombre: 'banco', saldoInicial: 4000 }],
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
      description: 'Gasto efectivo',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    });

    const movementId = fakeClient.db.transaction_groups.at(-1).id;
    const efectivoId = fakeClient.db.accounts.find((acc) => acc.name === 'efectivo').id;
    await updateMovement({
      movementId,
      description: 'Gasto corregido',
      amount: 300,
      sourceAccountId: efectivoId,
      destinationAccountId: null
    });

    await deleteMovement({ movementId });
    const dashboard = await getDashboardData();

    expect(Number.isFinite(dashboard.monthlyOFH)).toBe(true);
    expect(Number.isFinite(dashboard.weeklyOFH)).toBe(true);
    expect(Number.isFinite(dashboard.availableMoney)).toBe(true);

    delete process.env.DEV_PROFILE_ID;
  });

  it('compra con tarjeta incrementa deuda sin bajar availableMoney', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding, saveConversationalTransaction, getDashboardData } = await import('@/lib/db/queries');
    const { interpretTransaction } = await import('@/lib/ai/transactionInterpreter');

    process.env.DEV_PROFILE_ID = 'profile-credit-purchase';

    await createHouseholdOnboarding({
      householdName: 'Caso Tarjeta Compra',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 12000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [{ nombre: 'Banco', saldoInicial: 4000 }],
      fundAccounts: [],
      debtAccounts: [{ nombre: 'TDC BBVA', saldoInicial: 1000, pagoPeriodico: 500, diaPago: 15 }],
      receivables: [],
      fixedExpenses: [],
      variableSpending: []
    });

    const intent = await interpretTransaction('Gasté 1000 en ropa con tarjeta BBVA', [
      { name: 'Banco', type: 'operational_cash' },
      { name: 'TDC BBVA', type: 'credit_card' }
    ]);

    await saveConversationalTransaction(intent);
    const dashboard = await getDashboardData();
    const tdc = fakeClient.db.accounts.find((acc) => acc.name === 'TDC BBVA');
    const banco = fakeClient.db.accounts.find((acc) => acc.name === 'Banco');

    expect(intent.action).toBe('gasto');
    expect(Number(tdc.balance)).toBe(2000);
    expect(Number(banco.balance)).toBe(4000);
    expect(dashboard.availableMoney).toBe(4000);

    delete process.env.DEV_PROFILE_ID;
  });

  it('pago a tarjeta se interpreta como pago_deuda y reduce banco + deuda', async () => {
    const fakeClient = createFakeSupabase();
    vi.doMock('@/lib/db/supabase', () => ({ supabase: fakeClient, supabaseAdmin: fakeClient }));
    const { createHouseholdOnboarding, saveConversationalTransaction, getDashboardData, getMovementsHistory } = await import('@/lib/db/queries');
    const { interpretTransaction } = await import('@/lib/ai/transactionInterpreter');

    process.env.DEV_PROFILE_ID = 'profile-credit-payment';

    await createHouseholdOnboarding({
      householdName: 'Caso Tarjeta Pago',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 14000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [{ nombre: 'Banco', saldoInicial: 4000 }],
      fundAccounts: [],
      debtAccounts: [{ nombre: 'TDC BBVA', saldoInicial: 2000, pagoPeriodico: 500, diaPago: 15 }],
      receivables: [],
      fixedExpenses: [],
      variableSpending: []
    });

    const intent = await interpretTransaction('Pagué 500 a la TDC BBVA desde banco', [
      { name: 'Banco', type: 'operational_cash' },
      { name: 'TDC BBVA', type: 'credit_card' }
    ]);

    await saveConversationalTransaction(intent);

    const banco = fakeClient.db.accounts.find((acc) => acc.name === 'Banco');
    const tdc = fakeClient.db.accounts.find((acc) => acc.name === 'TDC BBVA');
    const groupId = fakeClient.db.transaction_groups.at(-1)?.id;
    const transactions = fakeClient.db.transactions.filter((tx) => tx.group_id === groupId);
    const history = await getMovementsHistory();
    const dashboard = await getDashboardData();

    expect(intent.action).toBe('pago_deuda');
    expect(intent.category).toBe('pago_deuda');
    expect(intent.humanConfirmation).toContain('Registrar pago de deuda de $500');
    expect(transactions).toHaveLength(2);
    expect(transactions.every((tx) => Boolean(tx.account_id))).toBe(true);
    expect(transactions.find((tx) => tx.type === 'credit')?.account_id).toBe(banco.id);
    expect(transactions.find((tx) => tx.type === 'debit')?.account_id).toBe(tdc.id);
    expect(Number(banco.balance)).toBe(3500);
    expect(Number(tdc.balance)).toBe(1500);
    expect(history.movements[0]?.tipoMovimiento).toBe('Pago de deuda');
    expect(history.movements[0]?.cuentaOrigen).toBe('Banco');
    expect(history.movements[0]?.cuentaDestino).toBe('TDC BBVA');
    expect(dashboard.availableMoney).toBe(3500);

    delete process.env.DEV_PROFILE_ID;
  });

});
