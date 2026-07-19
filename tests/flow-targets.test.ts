import { describe, expect, it } from 'vitest';
import { calculateFlowTarget, convertPlannedAmount } from '@/lib/flows/targets';

describe('flow targets', () => {
  it('derives calculated targets from active planned concepts without storing a total', () => {
    const flow = { id: 'fuel', periodType: 'monthly' as const, targetType: 'calculated' as const, manualTargetAmount: null };
    const concepts = [
      { flowFundId: 'fuel', plannedAmount: 1400, plannedPeriodType: 'monthly' as const, isActive: true },
      { flowFundId: 'fuel', plannedAmount: 100, plannedPeriodType: 'weekly' as const, isActive: true },
      { flowFundId: 'fuel', plannedAmount: 500, plannedPeriodType: 'monthly' as const, isActive: false },
      { flowFundId: 'other', plannedAmount: 2000, plannedPeriodType: 'monthly' as const, isActive: true }
    ];
    expect(calculateFlowTarget(flow, concepts)).toBeCloseTo(1400 + (100 * 52 / 12));
    expect(calculateFlowTarget(flow, [{ ...concepts[0], plannedAmount: 2000 }])).toBe(2000);
  });

  it('uses the manual amount only for manual flows and converts between periods', () => {
    expect(calculateFlowTarget({ id: 'wealth', periodType: 'monthly', targetType: 'manual', manualTargetAmount: 3500 }, [])).toBe(3500);
    expect(convertPlannedAmount(1200, 'monthly', 'annual')).toBe(14400);
  });
});

import { DEFAULT_FLOW_FUNDS } from '@/lib/flows/defaults';

describe('default flow configuration', () => {
  it('sets variable spending and wealth as manual flows with their intended periods', () => {
    expect(DEFAULT_FLOW_FUNDS).toEqual(expect.arrayContaining([
      ['Gastos Variables', 'miscellaneous', 'weekly', 'manual'],
      ['Patrimonio', 'wealth', 'monthly', 'manual']
    ]));
  });

});

import { buildFlowFormPayload, normalizeFlowPeriodType } from '@/lib/flows/configuration';

describe('flow period configuration', () => {
  it('normalizes invalid legacy periods only for built-in flows', () => {
    expect(normalizeFlowPeriodType('none', 'miscellaneous')).toBe('weekly');
    expect(normalizeFlowPeriodType(null, 'wealth')).toBe('monthly');
    expect(normalizeFlowPeriodType('none', 'custom')).toBeNull();
  });

  it('keeps built-in manual flows editable through both target types', () => {
    const variables = { flowId: 'variables', name: 'Gastos Variables', periodType: 'weekly', manualTargetAmount: '0' };
    const wealth = { flowId: 'wealth', name: 'Patrimonio', periodType: 'monthly', manualTargetAmount: '500' };
    expect(buildFlowFormPayload({ ...variables, targetType: 'calculated', isActive: true }).periodType).toBe('weekly');
    expect(buildFlowFormPayload({ ...variables, targetType: 'manual', isActive: true }).targetType).toBe('manual');
    expect(buildFlowFormPayload({ ...wealth, targetType: 'calculated', isActive: true }).periodType).toBe('monthly');
    expect(buildFlowFormPayload({ ...wealth, targetType: 'manual', isActive: true }).targetType).toBe('manual');
  });

  it('never builds a request with an invalid period and explains the required correction', () => {
    expect(() => buildFlowFormPayload({ name: 'Personalizado', periodType: 'none', targetType: 'manual', manualTargetAmount: '' })).toThrow('Selecciona una periodicidad válida');
    expect(() => buildFlowFormPayload({ name: 'Personalizado', periodType: '', targetType: 'calculated', manualTargetAmount: '' })).toThrow('Selecciona una periodicidad válida');
  });
});
