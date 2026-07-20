import type { FlowPeriodType } from './cycles';

export type FlowPeriod = {
  id?: string;
  householdId: string;
  fundId: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  targetAmount: number;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));
const cadence = (periodType: FlowPeriodType) => periodType === 'weekly' ? 'weekly' : periodType === 'bimonthly' ? 2 : periodType === 'semiannual' ? 6 : periodType === 'annual' ? 12 : 1;

/** Returns the canonical bounds containing `date`; all dates are UTC calendar dates. */
export function getFlowPeriodBounds(periodType: FlowPeriodType, date = new Date()) {
  const normalized = periodType === 'none' ? 'monthly' : periodType;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  let start: Date; let end: Date;
  if (cadence(normalized) === 'weekly') {
    start = utcDate(year, month, date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    end = utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6);
  } else {
    const months = cadence(normalized) as number;
    const firstMonth = months === 12 ? 0 : Math.floor(month / months) * months;
    start = utcDate(year, firstMonth, 1);
    end = utcDate(year, firstMonth + months, 0);
  }
  return { start: isoDate(start), end: isoDate(end), label: `${isoDate(start)} – ${isoDate(end)}` };
}

export function nextFlowPeriodBounds(periodType: FlowPeriodType, previousEnd: string) {
  const [year, month, day] = previousEnd.split('-').map(Number);
  return getFlowPeriodBounds(periodType, utcDate(year, month - 1, day + 1));
}

/**
 * Produces missing immutable period snapshots. The first period begins on the
 * flow creation date's canonical period, so an inactive app never loses debt.
 */
export function buildMissingFlowPeriods(input: { existing: FlowPeriod[]; householdId: string; fundId: string; periodType: FlowPeriodType; createdAt: string; targetAmount: number; now?: Date }) {
  const current = getFlowPeriodBounds(input.periodType, input.now);
  const own = input.existing.filter((period) => period.fundId === input.fundId).sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  let bounds = own.length ? nextFlowPeriodBounds(input.periodType, own.at(-1)!.periodEnd) : getFlowPeriodBounds(input.periodType, new Date(`${input.createdAt.slice(0, 10)}T00:00:00Z`));
  const periods: FlowPeriod[] = [];
  while (bounds.start <= current.start) {
    periods.push({ householdId: input.householdId, fundId: input.fundId, periodStart: bounds.start, periodEnd: bounds.end, periodLabel: bounds.label, targetAmount: input.targetAmount });
    bounds = nextFlowPeriodBounds(input.periodType, bounds.end);
  }
  return periods;
}

export type FlowFinancialState = { accumulatedNeed: number; availableReserve: number; difference: number; status: 'al_corriente' | 'atrasado' | 'adelantado' };
export function calculateFlowFinancialState(periods: Array<Pick<FlowPeriod, 'targetAmount'>>, reserve: number): FlowFinancialState {
  const accumulatedNeed = periods.reduce((total, period) => total + period.targetAmount, 0);
  const difference = reserve - accumulatedNeed;
  return { accumulatedNeed, availableReserve: reserve, difference, status: difference < 0 ? 'atrasado' : difference > 0 ? 'adelantado' : 'al_corriente' };
}
