import { describe, expect, it } from 'vitest';
import { buildMissingFlowPeriods, calculateFlowFinancialState } from '@/lib/flows/periods';

const base = { householdId: 'home', fundId: 'fund', periodType: 'monthly' as const, createdAt: '2026-01-15T10:00:00Z', targetAmount: 100 };

describe('historial de periodos de Flujos', () => {
  it('genera todos los periodos faltantes desde el alta hasta el actual', () => {
    const periods = buildMissingFlowPeriods({ ...base, now: new Date('2026-04-20T00:00:00Z'), existing: [] });
    expect(periods.map((period) => period.periodStart)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']);
  });

  it('no vuelve a crear periodos ya persistidos', () => {
    const existing = buildMissingFlowPeriods({ ...base, now: new Date('2026-03-20T00:00:00Z'), existing: [] });
    expect(buildMissingFlowPeriods({ ...base, now: new Date('2026-03-20T00:00:00Z'), existing })).toEqual([]);
  });

  it('arrastra el déficit de todos los periodos al calcular la necesidad vigente', () => {
    const state = calculateFlowFinancialState([{ targetAmount: 100 }, { targetAmount: 100 }, { targetAmount: 100 }], 180);
    expect(state).toMatchObject({ accumulatedNeed: 300, availableReserve: 180, difference: -120, status: 'atrasado' });
  });

  it.each([
    [200, 'al_corriente'],
    [199, 'atrasado'],
    [250, 'adelantado']
  ] as const)('calcula el estado %s como %s', (reserve, status) => {
    expect(calculateFlowFinancialState([{ targetAmount: 200 }], reserve).status).toBe(status);
  });

  it('preserva el objetivo capturado en los periodos históricos tras un cambio', () => {
    const historical = buildMissingFlowPeriods({ ...base, now: new Date('2026-02-20T00:00:00Z'), existing: [] });
    const newer = buildMissingFlowPeriods({ ...base, targetAmount: 250, now: new Date('2026-03-20T00:00:00Z'), existing: historical });
    expect(historical.map((period) => period.targetAmount)).toEqual([100, 100]);
    expect(newer).toMatchObject([{ periodStart: '2026-03-01', targetAmount: 250 }]);
  });
});
