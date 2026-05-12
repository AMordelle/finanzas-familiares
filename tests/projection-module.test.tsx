import { describe, expect, it } from 'vitest';
import { buildProjectionScenario, classifyFinancialMovement } from '@/lib/finance/projection';

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

class FakeQueryBuilder {
  private filters: Array<{ field: string; op: 'eq' | 'in' | 'gte'; value: unknown }> = [];
  private orderBy: Array<{ field: string; ascending: boolean }> = [];
  private limitValue: number | null = null;

  constructor(private table: string, private db: Db) {}

  select() { return this; }
  eq(field: string, value: unknown) { this.filters.push({ field, op: 'eq', value }); return this; }
  in(field: string, value: unknown[]) { this.filters.push({ field, op: 'in', value }); return this; }
  gte(field: string, value: unknown) { this.filters.push({ field, op: 'gte', value }); return this; }
  order(field: string, options?: { ascending?: boolean }) { this.orderBy.push({ field, ascending: options?.ascending ?? true }); return this; }
  limit(value: number) { this.limitValue = value; return this; }
  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(resolve: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return Promise.resolve(this.execute()).then(resolve, reject); }
  maybeSingle() { const result = this.execute(); return Promise.resolve({ data: result.data[0] ?? null, error: result.error }); }

  private matches(row: Row) {
    return this.filters.every((filter) => {
      if (filter.op === 'eq') return row[filter.field] === filter.value;
      if (filter.op === 'in') return (filter.value as unknown[]).includes(row[filter.field]);
      if (filter.op === 'gte') return String(row[filter.field] ?? '') >= String(filter.value ?? '');
      return true;
    });
  }

  private execute() {
    let data = (this.db[this.table] ?? []).filter((row) => this.matches(row));
    for (const order of [...this.orderBy].reverse()) {
      data = [...data].sort((a, b) => {
        const av = (a[order.field] as string | null | undefined) ?? '';
        const bv = (b[order.field] as string | null | undefined) ?? '';
        return av === bv ? 0 : (av > bv ? 1 : -1) * (order.ascending ? 1 : -1);
      });
    }
    if (this.limitValue !== null) data = data.slice(0, this.limitValue);
    return { data, error: null };
  }
}

function createFakeSupabase(dbOverrides: Partial<Db> = {}) {
  const db: Db = {
    household_members: [{ id: 'member-1', household_id: 'house-1' }],
    accounts: [
      { id: 'cash-1', household_id: 'house-1', name: 'Efectivo', type: 'operational_cash', balance: '1200.00', is_active: true },
      { id: 'bank-1', household_id: 'house-1', name: 'Banco', type: 'operativa', balance: '800.00', is_active: true },
      { id: 'card-1', household_id: 'house-1', name: 'TDC', type: 'credit_card', balance: '4500.00', is_active: true },
      { id: 'loan-1', household_id: 'house-1', name: 'Deuda', type: 'loan', balance: '5000.00', is_active: true },
      { id: 'fund-1', household_id: 'house-1', name: 'Fondo', type: 'savings_fund', balance: '3000.00', is_active: true },
      { id: 'receivable-1', household_id: 'house-1', name: 'Por cobrar', type: 'receivable', balance: '900.00', is_active: true },
      { id: 'inactive-cash', household_id: 'house-1', name: 'Caja vieja', type: 'operational_cash', balance: '999.00', is_active: false }
    ],
    transaction_groups: [
      { id: 'income-1', household_id: 'house-1' },
      { id: 'income-2', household_id: 'house-1' },
      { id: 'expense-1', household_id: 'house-1' },
      { id: 'expense-2', household_id: 'house-1' },
      { id: 'transfer-1', household_id: 'house-1' }
    ],
    transactions: [
      { group_id: 'income-1', type: 'debit', category: 'entrada_cuenta', amount: '1000.00', happened_at: '2026-05-05T12:00:00.000Z' },
      { group_id: 'income-1', type: 'credit', category: 'ingreso_sueldo', amount: '1000.00', happened_at: '2026-05-05T12:00:00.000Z' },
      { group_id: 'income-2', type: 'debit', category: 'entrada_cuenta', amount: '600.00', happened_at: '2026-04-28T12:00:00.000Z' },
      { group_id: 'income-2', type: 'credit', category: 'devolucion_sat', amount: '600.00', happened_at: '2026-04-28T12:00:00.000Z' },
      { group_id: 'expense-1', type: 'debit', category: 'super', amount: '1000.00', happened_at: '2026-05-06T12:00:00.000Z' },
      { group_id: 'expense-1', type: 'credit', category: 'salida_cuenta', amount: '1000.00', happened_at: '2026-05-06T12:00:00.000Z' },
      { group_id: 'expense-2', type: 'debit', category: 'comida', amount: '1000.00', happened_at: '2026-04-29T12:00:00.000Z' },
      { group_id: 'expense-2', type: 'credit', category: 'salida_cuenta', amount: '1000.00', happened_at: '2026-04-29T12:00:00.000Z' },
      { group_id: 'transfer-1', type: 'debit', category: 'transferencia', amount: '999.00', happened_at: '2026-05-03T12:00:00.000Z' },
      { group_id: 'transfer-1', type: 'credit', category: 'transferencia', amount: '999.00', happened_at: '2026-05-03T12:00:00.000Z' }
    ],
    msi_installments: [
      { id: 'msi-1', household_id: 'house-1', msi_purchase_id: 'purchase-1', installment_number: 1, amount: '200.00', due_date: '2026-05-13', status: 'pending' },
      { id: 'msi-2', household_id: 'house-1', msi_purchase_id: 'purchase-2', installment_number: 2, amount: '250.00', due_date: null, status: 'pending' },
      { id: 'msi-paid', household_id: 'house-1', installment_number: 3, amount: '999.00', due_date: '2026-05-20', status: 'paid' }
    ],
    msi_purchases: [
      { id: 'purchase-1', description: 'Lavadora' },
      { id: 'purchase-2', description: 'Celular' }
    ],
    extra_work_entries: [
      { id: 'extra-1', household_id: 'house-1', status: 'pending', quantity: '4' }
    ],
    calendar_events: [
      { id: 'event-1', household_id: 'house-1', label: 'Reembolso fechado', amount: '100.00', event_date: '2026-05-20T12:00:00.000Z' }
    ],
    ...dbOverrides
  };
  return { db, from: (table: string) => new FakeQueryBuilder(table, db) };
}

describe('classifyFinancialMovement', () => {
  it('clasifica movimientos recurrentes, extraordinarios e internos', () => {
    expect(classifyFinancialMovement({ category: 'ingreso_nomina', amount: 1000 }).classification).toBe('recurrent');
    expect(classifyFinancialMovement({ category: 'devolucion_sat', amount: 26000 }).classification).toBe('extraordinary');
    expect(classifyFinancialMovement({ category: 'aguinaldo', amount: 12000 }).classification).toBe('extraordinary');
    expect(classifyFinancialMovement({ category: 'bono_unico', amount: 5000 }).classification).toBe('extraordinary');
    expect(classifyFinancialMovement({ category: 'transferencia', hasMirrorMovement: true }).classification).toBe('internal');
  });
});

describe('buildProjectionScenario', () => {
  it('calcula una proyección base de 12 semanas sin modificar datos reales', async () => {
    const fakeClient = createFakeSupabase();
    const before = JSON.stringify(fakeClient.db);
    const scenario = await buildProjectionScenario('house-1', fakeClient as NonNullable<Parameters<typeof buildProjectionScenario>[1]>, new Date('2026-05-12T10:00:00.000Z'));

    expect(scenario.summary.startingOperationalMoney).toBe(2000);
    expect(scenario.summary.startingOperationalMoney).not.toBe(2000 + 4500 + 5000 + 3000 + 900 + 999);
    expect(scenario.weeks).toHaveLength(12);
    expect(scenario.weeks[0].estimatedIncome).toBe(250);
    expect(scenario.weeks[0].estimatedVariableExpenses).toBe(500);
    expect(scenario.weeks[0].estimatedCommitments).toBe(450);
    expect(scenario.weeks[0].extraordinaryEvents).toBe(0);
    expect(scenario.weeks[0].closingOperationalMoney).toBe(1300);
    expect(scenario.weeks[1].openingOperationalMoney).toBe(scenario.weeks[0].closingOperationalMoney);
    expect(scenario.weeks[1].extraordinaryEvents).toBe(100);
    expect(scenario.summary.endingOperationalMoney).toBe(scenario.weeks[11].closingOperationalMoney);
    expect(scenario.summary.projectedChange).toBe(scenario.summary.endingOperationalMoney - scenario.summary.startingOperationalMoney);
    expect(scenario.summary.lowestProjectedMoney).toBe(-1350);
    expect(scenario.summary.lowestProjectedWeek).toBe(12);
    expect(scenario.summary.trend).toBe('down');
    expect(scenario.calculation.income.periodStart).toBe('2026-04-14');
    expect(scenario.calculation.income.includedMovements).toHaveLength(1);
    expect(scenario.calculation.income.excludedMovements.some((item) => item.reason.includes('transferencia'))).toBe(true);
    expect(scenario.calculation.income.ordinaryIncome).toBe(1000);
    expect(scenario.calculation.income.extraordinaryIncluded).toBe(0);
    expect(scenario.calculation.income.extraordinaryExcluded).toBe(600);
    expect(scenario.recurringWeeklyIncome).toBe(250);
    expect(scenario.recurringWeeklyExpenses).toBe(500);
    expect(scenario.extraordinaryDetected[0]).toMatchObject({ description: 'devolucion_sat', amount: 600 });
    expect(scenario.internalExcluded[0]).toMatchObject({ description: 'transferencia', amount: 999 });
    expect(scenario.calculation.expenses.includedMovements).toHaveLength(2);
    expect(scenario.calculation.expenses.byCategory[0]).toEqual({ category: 'super', amount: 1000 });
    expect(scenario.calculation.commitments.byWeek[0].items.map((item) => item.description)).toEqual(expect.arrayContaining(['Lavadora', 'Celular']));
    expect(scenario.calculation.events.includedEvents[0]).toMatchObject({ label: 'Reembolso fechado', weekNumber: 2, amount: 100 });
    expect(scenario.calculation.warnings).toContain('Se detectaron movimientos extraordinarios y no se incluyeron en el promedio recurrente.');
    expect(scenario.summary.dataLimitations).toContain('Hay extras pendientes por cobrar; se muestran como pendientes y no se suman a la proyección base.');
    expect(JSON.stringify(fakeClient.db)).toBe(before);
  });

  it('detecta tendencia estable y al alza', async () => {
    const stable = await buildProjectionScenario('house-1', createFakeSupabase({
      transaction_groups: [],
      transactions: [],
      msi_installments: [],
      calendar_events: [],
      msi_purchases: [
      { id: 'purchase-1', description: 'Lavadora' },
      { id: 'purchase-2', description: 'Celular' }
    ],
    extra_work_entries: []
    }) as NonNullable<Parameters<typeof buildProjectionScenario>[1]>, new Date('2026-05-12T10:00:00.000Z'));
    expect(stable.summary.trend).toBe('stable');

    const up = await buildProjectionScenario('house-1', createFakeSupabase({
      transaction_groups: [{ id: 'income-1', household_id: 'house-1' }],
      transactions: [
        { group_id: 'income-1', type: 'debit', category: 'entrada_cuenta', amount: '400.00', happened_at: '2026-05-05T12:00:00.000Z' },
        { group_id: 'income-1', type: 'credit', category: 'ingreso_nomina', amount: '400.00', happened_at: '2026-05-05T12:00:00.000Z' }
      ],
      msi_installments: [],
      calendar_events: [],
      msi_purchases: [
      { id: 'purchase-1', description: 'Lavadora' },
      { id: 'purchase-2', description: 'Celular' }
    ],
    extra_work_entries: []
    }) as NonNullable<Parameters<typeof buildProjectionScenario>[1]>, new Date('2026-05-12T10:00:00.000Z'));
    expect(up.summary.trend).toBe('up');
  });
});
