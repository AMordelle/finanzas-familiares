import type { FlowPeriodType } from './targets';

export type FlowCommitment = {
  id: string;
  householdId: string;
  flowFundId: string | null;
  name: string;
  amount: number | null;
  periodType: FlowPeriodType | null;
  calendarDay: number | null;
  calendarMonth: number | null;
  isActive: boolean;
};
export type ScheduledCommitment = FlowCommitment & { dueDate: string };
const iso = (date: Date) => date.toISOString().slice(0, 10);
const date = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));

/** A calendar is complete only when the subcategory explicitly supplies every required value. */
export function hasCommitmentCalendar(commitment: Pick<FlowCommitment, 'periodType' | 'calendarDay' | 'calendarMonth'>) {
  if (!commitment.calendarDay || commitment.calendarDay < 1 || commitment.calendarDay > 31) return false;
  return commitment.periodType === 'monthly' || ((commitment.periodType === 'bimonthly' || commitment.periodType === 'semiannual' || commitment.periodType === 'annual') && !!commitment.calendarMonth);
}

export function getCommitmentDueDatesBetween(commitment: FlowCommitment, from: string, to: string): ScheduledCommitment[] {
  if (!commitment.isActive || commitment.amount === null || !hasCommitmentCalendar(commitment)) return [];
  const start = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`);
  const interval = commitment.periodType === 'bimonthly' ? 2 : commitment.periodType === 'semiannual' ? 6 : commitment.periodType === 'annual' ? 12 : 1;
  const anchorMonth = commitment.periodType === 'monthly' ? 0 : commitment.calendarMonth! - 1;
  const dates: ScheduledCommitment[] = [];
  for (let year = start.getUTCFullYear() - 1; year <= end.getUTCFullYear() + 1; year++) for (let month = 0; month < 12; month++) {
    if ((month - anchorMonth + 12) % interval !== 0) continue;
    const due = iso(date(year, month, commitment.calendarDay!));
    if (due >= from && due <= to) dates.push({ ...commitment, dueDate: due });
  }
  return dates.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function getNextCommitmentDueDate(commitment: FlowCommitment, from: string) {
  return getCommitmentDueDatesBetween(commitment, from, `${Number(from.slice(0, 4)) + 2}-12-31`)[0]?.dueDate ?? null;
}
export function getCommitmentsForFlow(commitments: FlowCommitment[], flowFundId: string) { return commitments.filter((item) => item.flowFundId === flowFundId); }
