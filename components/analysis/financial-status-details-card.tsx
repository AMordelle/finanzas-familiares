import React from 'react';
import { Card } from '@/components/ui/card';
import type { FinancialStatus } from '@/lib/finance/financialStatus';

function stageLabel(stage: FinancialStatus['stage']) {
  if (stage === 'optimizacion') return 'Optimización';
  if (stage === 'estabilizacion') return 'Estabilización';
  return 'Recuperación';
}

function estadoEstructuralBadge(financialStatus: FinancialStatus | null) {
  if (!financialStatus) return { label: 'Sin datos', style: 'bg-slate-100 text-slate-700' };
  if (financialStatus.status === 'solido') return { label: 'Sólido', style: 'bg-emerald-100 text-emerald-700' };
  if (financialStatus.status === 'en_transicion') return { label: 'En transición', style: 'bg-sky-100 text-sky-700' };
  if (financialStatus.status === 'ajustado') return { label: 'Ajustado', style: 'bg-amber-100 text-amber-700' };
  return { label: 'Vulnerable', style: 'bg-rose-100 text-rose-700' };
}

type Props = {
  financialStatus: FinancialStatus | null;
};

export function FinancialStatusDetailsCard({ financialStatus }: Props) {
  if (!financialStatus) {
    return (
      <Card>
        <h3 className="font-semibold text-slate-900">Estado financiero actual</h3>
        <p className="mt-2 text-sm text-slate-600">Aún no hay datos suficientes para calcular el estado estructural.</p>
      </Card>
    );
  }

  const badge = estadoEstructuralBadge(financialStatus);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-slate-900">Estado financiero actual</h3>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${badge.style}`}>{badge.label}</span>
      </div>
      <p className="mt-2 text-sm text-slate-700">{financialStatus.shortLine}</p>

      <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-700">
        <p>
          <span className="font-medium text-slate-900">Interpretación general:</span> {financialStatus.interpretation}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Etapa actual: <span className="font-medium text-slate-700">{stageLabel(financialStatus.stage)}</span>
        </p>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fortalezas actuales</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {financialStatus.strengths.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Riesgos actuales</p>
          <ul className="mt-1 space-y-1 text-sm text-slate-700">
            {financialStatus.risks.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        </div>
        <p className="mt-3">
          <span className="font-medium text-slate-900">En qué enfocarse ahora:</span> {financialStatus.nextFocus}
        </p>
        {financialStatus.assumptions.length ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supuestos</p>
            <ul className="mt-1 space-y-1 text-xs text-slate-500">
              {financialStatus.assumptions.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
