'use client';

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import {
  recommendExtraordinaryIncomeDistribution,
  type ExtraordinaryIncomeContext,
  type RecommendationMode
} from '@/lib/finance/extraordinaryIncomeAdvisor';

type Props = {
  context: ExtraordinaryIncomeContext;
  suggestedAmount: number;
  suggestedLabel?: string;
};

const modeLabel: Record<RecommendationMode, string> = {
  conservador: 'Conservador',
  balanceado: 'Balanceado',
  agresivo: 'Agresivo'
};

const modeStyle: Record<RecommendationMode, string> = {
  conservador: 'border-sky-200 bg-sky-50',
  balanceado: 'border-emerald-200 bg-emerald-50',
  agresivo: 'border-amber-200 bg-amber-50'
};

export function ExtraordinaryIncomeAdvisorCard({ context, suggestedAmount, suggestedLabel = 'Ingreso extraordinario' }: Props) {
  const [amount, setAmount] = useState(String(Number(suggestedAmount.toFixed(2))));
  const [label, setLabel] = useState(suggestedLabel);

  const parsedAmount = Number(amount);

  const recommendation = useMemo(() => recommendExtraordinaryIncomeDistribution({
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    label,
    context
  }), [context, label, parsedAmount]);

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Distribución inteligente de ingreso extraordinario</h3>
          <p className="mt-1 text-sm text-slate-600">Compara escenarios para decidir con calma qué hacer con este ingreso no rutinario.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Recomendado: {modeLabel[recommendation.recommendedMode]}</span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Etiqueta del ingreso
          <input
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <label className="text-sm text-slate-700">
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
      <p className="mt-1 text-xs text-slate-500">Ingreso detectado: {formatCurrencyMXN(recommendation.detectedExtraordinaryIncome)} · Etiqueta: {recommendation.label}</p>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {recommendation.scenarios.map((scenario) => (
          <article
            key={scenario.recommendationMode}
            className={`rounded-lg border p-3 ${modeStyle[scenario.recommendationMode]} ${scenario.recommendationMode === recommendation.recommendedMode ? 'ring-2 ring-slate-700/20' : ''}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{modeLabel[scenario.recommendationMode]}</p>
            <p className="mt-1 text-sm text-slate-700">{scenario.summary}</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {scenario.allocations.map((allocation) => (
                <li key={allocation.bucket}>
                  <p className="font-medium capitalize">{allocation.bucket}: {formatCurrencyMXN(allocation.amount)} ({allocation.percentage.toFixed(1)}%)</p>
                  <p className="text-xs text-slate-600">{allocation.reason}</p>
                </li>
              ))}
            </ul>
            {scenario.warnings.length ? (
              <ul className="mt-3 space-y-1 text-xs text-rose-700">
                {scenario.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
              </ul>
            ) : null}
            <p className="mt-3 text-xs text-slate-700"><span className="font-semibold">Siguiente paso:</span> {scenario.nextStep}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}
