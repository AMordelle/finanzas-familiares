'use client';

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import {
  recommendExtraordinaryIncomeDistribution,
  type AllocationBucket,
  type ExtraordinaryIncomeContext,
  type RecommendationMode
} from '@/lib/finance/extraordinaryIncomeAdvisor';

type Props = {
  context: ExtraordinaryIncomeContext;
  suggestedAmount: number;
  suggestedLabel?: string;
  initialExpandedMode?: RecommendationMode | null;
};

const modeLabel: Record<RecommendationMode, string> = {
  conservador: 'Conservador',
  balanceado: 'Balanceado',
  agresivo: 'Agresivo'
};

const bucketLabel: Record<AllocationBucket, string> = {
  liquidez: 'Liquidez',
  colchon: 'Colchón',
  deuda: 'Deuda',
  libre: 'Libre'
};

export function toggleExpandedScenario(current: RecommendationMode | null, mode: RecommendationMode) {
  if (current === mode) return null;
  return mode;
}

export function ExtraordinaryIncomeAdvisorCard({
  context,
  suggestedAmount,
  suggestedLabel = 'Ingreso extraordinario',
  initialExpandedMode = null
}: Props) {
  const [amount, setAmount] = useState(String(Number(suggestedAmount.toFixed(2))));
  const [label, setLabel] = useState(suggestedLabel);
  const [expandedMode, setExpandedMode] = useState<RecommendationMode | null>(initialExpandedMode);

  const parsedAmount = Number(amount);

  const recommendation = useMemo(() => recommendExtraordinaryIncomeDistribution({
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    label,
    context
  }), [context, label, parsedAmount]);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Distribución inteligente de ingreso extraordinario</h3>
          <p className="mt-1 text-sm text-slate-600">Compara escenarios y abre detalles solo cuando los necesites.</p>
          <p className="mt-2 text-xs text-slate-500">
            Detectado: {formatCurrencyMXN(recommendation.detectedExtraordinaryIncome)} · {recommendation.label}
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
          Recomendado: {modeLabel[recommendation.recommendedMode]}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="text-xs text-slate-600">
          Etiqueta del ingreso
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="text-xs text-slate-600">
          Monto detectado
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
      </div>

      <p className="mt-3 text-sm text-slate-700">{recommendation.summary}</p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {recommendation.scenarios.map((scenario) => {
          const isExpanded = expandedMode === scenario.recommendationMode;
          const isRecommended = scenario.recommendationMode === recommendation.recommendedMode;

          return (
            <article
              key={scenario.recommendationMode}
              className={`rounded-lg border bg-white p-3 ${isRecommended ? 'border-slate-400' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{modeLabel[scenario.recommendationMode]}</p>
                  <p className="mt-1 text-sm text-slate-700">{scenario.summary}</p>
                </div>
                {isRecommended ? (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">Sugerido</span>
                ) : null}
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {scenario.allocations.map((allocation) => (
                  <div key={allocation.bucket} className="rounded-md bg-slate-50 px-2 py-1">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-500">{bucketLabel[allocation.bucket]}</dt>
                    <dd className="font-medium text-slate-800">{formatCurrencyMXN(allocation.amount)}</dd>
                  </div>
                ))}
              </dl>

              <button
                type="button"
                className="mt-3 text-xs font-medium text-slate-700 underline decoration-slate-300 underline-offset-2"
                onClick={() => setExpandedMode(toggleExpandedScenario(expandedMode, scenario.recommendationMode))}
              >
                {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
              </button>

              {isExpanded ? (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <ul className="space-y-2 text-xs text-slate-600">
                    {scenario.allocations.map((allocation) => (
                      <li key={`${allocation.bucket}-reason`}>
                        <span className="font-medium text-slate-700">{bucketLabel[allocation.bucket]}:</span> {allocation.reason}
                      </li>
                    ))}
                  </ul>

                  {scenario.warnings.length ? (
                    <ul className="mt-3 space-y-1 text-xs text-amber-700">
                      {scenario.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
                    </ul>
                  ) : null}

                  <p className="mt-3 text-xs text-slate-700"><span className="font-semibold">Siguiente paso:</span> {scenario.nextStep}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </Card>
  );
}
