export const FLOW_CYCLE_STATUSES = ['pending', 'covered', 'consuming', 'closed'] as const;
export type FlowCycleStatus = (typeof FLOW_CYCLE_STATUSES)[number];
export type FlowPeriodType = 'weekly' | 'monthly' | 'bimonthly' | 'semiannual' | 'annual' | 'none';

export type FlowCycle = {
  id?: string;
  householdId: string;
  fundId: string;
  cycleStart: string;
  cycleEnd: string;
  cycleLabel: string;
  targetAmount: number;
  consumedAmount: number;
  status: FlowCycleStatus;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

export function getCyclePeriod(periodType: FlowPeriodType, now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  let start: Date;
  let end: Date;
  if (periodType === 'weekly') {
    const dayFromMonday = (now.getUTCDay() + 6) % 7;
    start = utcDate(year, month, now.getUTCDate() - dayFromMonday);
    end = utcDate(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6);
  } else {
    const size = periodType === 'bimonthly' ? 2 : periodType === 'semiannual' ? 6 : periodType === 'annual' ? 12 : 1;
    const firstMonth = size === 12 ? 0 : Math.floor(month / size) * size;
    start = utcDate(year, firstMonth, 1);
    end = utcDate(year, firstMonth + size, 0);
  }
  return { start: isoDate(start), end: isoDate(end), label: `${isoDate(start)} – ${isoDate(end)}` };
}

export function getActiveCycle(cycles: FlowCycle[], fundId: string) {
  return cycles.find((cycle) => cycle.fundId === fundId && cycle.status !== 'closed');
}

export function createCycleIfMissing(input: { cycles: FlowCycle[]; householdId: string; fundId: string; periodType: FlowPeriodType; now?: Date }) {
  const active = getActiveCycle(input.cycles, input.fundId);
  if (active) return { cycle: active, created: false as const };
  const period = getCyclePeriod(input.periodType === 'none' ? 'monthly' : input.periodType, input.now);
  return { cycle: { householdId: input.householdId, fundId: input.fundId, cycleStart: period.start, cycleEnd: period.end, cycleLabel: period.label, targetAmount: 0, consumedAmount: 0, status: 'pending' as const }, created: true as const };
}

export function calculateCycleStatus(assigned: number, target: number, consumed: number, storedStatus?: FlowCycleStatus): FlowCycleStatus {
  if (storedStatus === 'closed') return 'closed';
  if (assigned < target) return 'pending';
  return consumed > 0 ? 'consuming' : 'covered';
}

export const calculateMissingAmount = (target: number, assigned: number) => Math.max(0, target - assigned);
export const calculateRemainingAmount = (assigned: number, consumed: number) => assigned - consumed;

export function getFundTargets(cycles: FlowCycle[]) {
  return Object.fromEntries(cycles.filter((cycle) => cycle.status !== 'closed').map((cycle) => [cycle.fundId, cycle.targetAmount]));
}
