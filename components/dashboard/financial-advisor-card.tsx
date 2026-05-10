'use client';

import React, { useState, useTransition } from 'react';
import { analyzeFinancialAdvisorAction } from '@/app/dashboard/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { FinancialAdvisorAnalysis } from '@/lib/finance/financialAdvisor';

type AdvisorActionResult = Awaited<ReturnType<typeof analyzeFinancialAdvisorAction>>;

const statusLabels: Record<FinancialAdvisorAnalysis['status'], string> = {
  healthy: 'Saludable',
  stable: 'Estable',
  tight: 'Ajustado',
  risk: 'Riesgo'
};

function ResultList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
      <ul className="mt-1 space-y-1 text-sm text-slate-700">
        {items.map((item) => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}

export function FinancialAdvisorCard() {
  const [result, setResult] = useState<AdvisorActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const analyze = () => {
    setError(null);
    startTransition(async () => {
      try {
        const nextResult = await analyzeFinancialAdvisorAction();
        setResult(nextResult);
      } catch {
        setError('No se pudo ejecutar el análisis en este momento. Intenta de nuevo después de actualizar tus datos.');
      }
    });
  };

  const analysis = result?.analysis ?? null;

  return (
    <Card className="mt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-semibold">Asesor financiero</h3>
          <p className="mt-2 text-sm text-slate-600">Analiza tu situación actual con base en tus cuentas, movimientos, cierres y extras.</p>
        </div>
        <Button type="button" onClick={analyze} disabled={isPending}>
          {isPending ? 'Analizando...' : 'Analizar mis finanzas'}
        </Button>
      </div>

      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {analysis ? (
        <div className="mt-5 space-y-4 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">Estado: {statusLabels[analysis.status]}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">Confianza: {analysis.confidence}</span>
          </div>
          <div>
            <h4 className="text-base font-semibold text-slate-900">{analysis.headline}</h4>
            <p className="mt-2 text-sm text-slate-700">{analysis.summary}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Preocupación principal</h4>
              <p className="mt-1 text-sm text-slate-700">{analysis.mainConcern}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Señal positiva</h4>
              <p className="mt-1 text-sm text-slate-700">{analysis.positiveSignal}</p>
            </div>
          </div>
          <ResultList title="Riesgos" items={analysis.topRisks} />
          <ResultList title="Oportunidades" items={analysis.opportunities} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Acción recomendada</h4>
              <p className="mt-1 text-sm text-slate-700">{analysis.recommendedAction}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-900">Siguiente mejor acción</h4>
              <p className="mt-1 text-sm text-slate-700">{analysis.nextBestAction}</p>
            </div>
          </div>
          <ResultList title="Limitaciones de datos" items={analysis.dataLimitations} />
        </div>
      ) : null}
    </Card>
  );
}
