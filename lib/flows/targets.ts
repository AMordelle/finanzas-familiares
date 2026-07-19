export const FLOW_PERIOD_TYPES = ['weekly', 'monthly', 'bimonthly', 'semiannual', 'annual'] as const;
export type FlowPeriodType = typeof FLOW_PERIOD_TYPES[number];
export type FlowTargetType = 'calculated' | 'manual';

const MONTHS_PER_PERIOD: Record<FlowPeriodType, number> = {
  weekly: 12 / 52,
  monthly: 1,
  bimonthly: 2,
  semiannual: 6,
  annual: 12
};

export function convertPlannedAmount(amount: number, from: FlowPeriodType, to: FlowPeriodType) {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return amount * MONTHS_PER_PERIOD[to] / MONTHS_PER_PERIOD[from];
}

export function calculateFlowTarget(flow: { id: string; periodType: FlowPeriodType; targetType: FlowTargetType; manualTargetAmount: number | null }, concepts: Array<{ flowFundId: string | null; plannedAmount: number | null; plannedPeriodType: FlowPeriodType | null; isActive: boolean }>) {
  if (flow.targetType === 'manual') return flow.manualTargetAmount ?? 0;
  return concepts.reduce((total, concept) => {
    if (!concept.isActive || concept.flowFundId !== flow.id || concept.plannedAmount === null || !concept.plannedPeriodType) return total;
    return total + convertPlannedAmount(concept.plannedAmount, concept.plannedPeriodType, flow.periodType);
  }, 0);
}
