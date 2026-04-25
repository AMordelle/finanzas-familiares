import type { FinancialRadar } from '@/lib/finance/financialRadar';

export type TacticalPressureLevel = 'low' | 'medium' | 'high';
export type StructuralPressureLevel = 'low' | 'medium' | 'high';
export type RecommendationTone = 'optimista' | 'prudente' | 'contencion';

export type SharedTacticalMetrics = {
  availableNow: number;
  upcoming7dLoad: number;
  upcoming8to14dLoad: number;
  tacticalMargin: number;
  frictionBufferRequired: number;
  marginAfterFrictionBuffer: number;
  tacticalPressureLevel: TacticalPressureLevel;
  structuralPressureLevel: StructuralPressureLevel;
  recommendationTone: RecommendationTone;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

export function deriveSharedTacticalMetrics(input: {
  availableNow: number;
  upcoming7dLoad: number;
  upcoming8to14dLoad?: number;
  structuralPressureLevel?: StructuralPressureLevel;
}): SharedTacticalMetrics {
  const availableNow = roundMoney(Math.max(input.availableNow, 0));
  const upcoming7dLoad = roundMoney(Math.max(input.upcoming7dLoad, 0));
  const upcoming8to14dLoad = roundMoney(Math.max(input.upcoming8to14dLoad ?? 0, 0));

  const tacticalMargin = roundMoney(availableNow - upcoming7dLoad);
  const frictionBufferRequired = roundMoney(Math.max(
    upcoming7dLoad * 0.2,
    upcoming8to14dLoad * 0.6,
    500
  ));
  const marginAfterFrictionBuffer = roundMoney(tacticalMargin - frictionBufferRequired);

  const tacticalPressureLevel: TacticalPressureLevel = tacticalMargin < 0
    ? 'high'
    : marginAfterFrictionBuffer < 0
      ? 'medium'
      : 'low';

  const structuralPressureLevel: StructuralPressureLevel = input.structuralPressureLevel ?? 'medium';

  const recommendationTone: RecommendationTone = tacticalPressureLevel === 'high'
    ? 'contencion'
    : tacticalPressureLevel === 'medium' || structuralPressureLevel === 'high'
      ? 'prudente'
      : 'optimista';

  return {
    availableNow,
    upcoming7dLoad,
    upcoming8to14dLoad,
    tacticalMargin,
    frictionBufferRequired,
    marginAfterFrictionBuffer,
    tacticalPressureLevel,
    structuralPressureLevel,
    recommendationTone
  };
}

export function sharedMetricsFromRadar(radar: FinancialRadar): SharedTacticalMetrics {
  return deriveSharedTacticalMetrics({
    availableNow: radar.availableNow,
    upcoming7dLoad: radar.upcomingLoad,
    upcoming8to14dLoad: radar.nearFutureLoad
  });
}
