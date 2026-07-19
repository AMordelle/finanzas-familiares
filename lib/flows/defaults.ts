import type { FlowPeriodType, FlowTargetType } from './targets';

export type DefaultFlowFund = readonly [name: string, code: string, periodType: FlowPeriodType, targetType: FlowTargetType];

export const DEFAULT_FLOW_FUNDS: readonly DefaultFlowFund[] = [
  ['Semanal', 'weekly', 'weekly', 'calculated'],
  ['Mensual', 'monthly', 'monthly', 'calculated'],
  ['Bimestral', 'bimonthly', 'bimonthly', 'calculated'],
  ['Semestral', 'semiannual', 'semiannual', 'calculated'],
  ['Anual', 'annual', 'annual', 'calculated'],
  ['Gastos Variables', 'miscellaneous', 'weekly', 'manual'],
  ['Patrimonio', 'wealth', 'monthly', 'manual']
];
