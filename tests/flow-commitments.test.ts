import { describe, expect, it } from 'vitest';
import { getCommitmentDueDatesBetween, getNextCommitmentDueDate } from '@/lib/flows/commitments';
import { calculateFlowTarget } from '@/lib/flows/targets';

const commitment = (overrides = {}) => ({ id: 'predial', householdId: 'home', flowFundId: 'annual', name: 'Predial', amount: 1200, periodType: 'annual' as const, calendarDay: 31, calendarMonth: 1, isActive: true, ...overrides });

describe('calendario de compromisos por subcategoría', () => {
  it('permite dos compromisos anuales del mismo flujo en meses distintos', () => {
    expect(getCommitmentDueDatesBetween(commitment(), '2026-01-01', '2026-12-31').map((item) => item.dueDate)).toEqual(['2026-01-31']);
    expect(getCommitmentDueDatesBetween(commitment({ id: 'escuela', name: 'Gastos escolares', calendarMonth: 7, calendarDay: 15 }), '2026-01-01', '2026-12-31').map((item) => item.dueDate)).toEqual(['2026-07-15']);
  });
  it('respeta inicios semestrales diferentes y nunca retrocede antes del seguimiento', () => {
    expect(getCommitmentDueDatesBetween(commitment({ periodType: 'semiannual', calendarMonth: 2, calendarDay: 15 }), '2026-07-20', '2027-12-31').map((item) => item.dueDate)).toEqual(['2026-08-15', '2027-02-15', '2027-08-15']);
    expect(getNextCommitmentDueDate(commitment({ periodType: 'monthly', calendarMonth: null, calendarDay: 30 }), '2026-07-20')).toBe('2026-07-30');
  });
  it('no programa una subcategoría sin calendario', () => {
    expect(getCommitmentDueDatesBetween(commitment({ calendarDay: null }), '2026-01-01', '2026-12-31')).toEqual([]);
  });
  it('suma los importes activos de subcategorías como único objetivo del flujo', () => {
    expect(calculateFlowTarget({ id: 'annual', periodType: 'annual', targetType: 'calculated', manualTargetAmount: null }, [
      { flowFundId: 'annual', plannedAmount: 1200, plannedPeriodType: 'annual', isActive: true },
      { flowFundId: 'annual', plannedAmount: 900, plannedPeriodType: 'annual', isActive: true }
    ])).toBe(2100);
  });
});
