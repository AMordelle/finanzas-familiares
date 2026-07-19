import { DEFAULT_FLOW_FUNDS } from './defaults';
import { FLOW_PERIOD_TYPES, type FlowPeriodType, type FlowTargetType } from './targets';

export function isFlowPeriodType(value: unknown): value is FlowPeriodType {
  return typeof value === 'string' && (FLOW_PERIOD_TYPES as readonly string[]).includes(value);
}

export function getBuiltInFlowPeriodType(code: string | null | undefined): FlowPeriodType | null {
  return DEFAULT_FLOW_FUNDS.find((flow) => flow[1] === code)?.[2] ?? null;
}

export function normalizeFlowPeriodType(value: unknown, code?: string | null): FlowPeriodType | null {
  if (isFlowPeriodType(value)) return value;
  return getBuiltInFlowPeriodType(code);
}

export function buildFlowFormPayload(input: { flowId?: string; name: string; periodType: string; targetType: FlowTargetType; manualTargetAmount: string; trackingStartDate?: string; isActive?: boolean }) {
  if (!isFlowPeriodType(input.periodType)) throw new Error('Selecciona una periodicidad válida antes de guardar el flujo.');
  if (input.trackingStartDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(input.trackingStartDate)) throw new Error('Selecciona una fecha válida para iniciar el seguimiento.');
  return {
    ...(input.flowId ? { flowId: input.flowId } : {}),
    name: input.name,
    periodType: input.periodType,
    targetType: input.targetType,
    manualTargetAmount: input.targetType === 'manual' ? Number(input.manualTargetAmount || 0) : null,
    ...(input.trackingStartDate === undefined ? {} : { trackingStartDate: input.trackingStartDate }),
    ...(input.isActive === undefined ? {} : { isActive: input.isActive })
  };
}
