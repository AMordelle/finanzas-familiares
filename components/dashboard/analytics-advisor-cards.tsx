'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { PriorityDiagnostic } from '@/lib/finance/priorityDiagnostics';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

type FinancialPressureData = {
  requiredMoney: number;
  availableMoney: number;
  gap: number;
  status: 'healthy' | 'warning' | 'critical';
  breakdown: {
    debts: number;
    fixedExpenses: number;
    operationalEstimate: number;
  };
};

type Props = {
  radar: FinancialRadar | null;
  financialPressure: FinancialPressureData | null;
  priorityDiagnostics: PriorityDiagnostic[];
  initialOpenCard?: OpenCard;
};

type OpenCard = 'radar' | 'diagnosticos' | null;

export function toggleAnalyticsCard(current: OpenCard, target: Exclude<OpenCard, null>) {
  return current === target ? null : target;
}

function estadoFromMargin(radar: FinancialRadar | null) {
  if (!radar) return { label: 'Sin datos', style: 'bg-slate-100 text-slate-700' };
  if (radar.status === 'presion') return { label: 'Presión', style: 'bg-rose-100 text-rose-700' };
  if (radar.status === 'atencion') return { label: 'Atención', style: 'bg-amber-100 text-amber-700' };
  return { label: 'Estable', style: 'bg-emerald-100 text-emerald-700' };
}

function diagnosticsBadge(priorityDiagnostics: PriorityDiagnostic[]) {
  if (!priorityDiagnostics.length) return { label: 'Sin datos', style: 'bg-slate-100 text-slate-700' };
  if (priorityDiagnostics[0]?.level === 'high') return { label: 'Alta prioridad', style: 'bg-rose-100 text-rose-700' };
  if (priorityDiagnostics[0]?.level === 'medium') return { label: 'Priorizar', style: 'bg-amber-100 text-amber-700' };
  return { label: 'Estable', style: 'bg-emerald-100 text-emerald-700' };
}

function itemAccent(level: PriorityDiagnostic['level']) {
  if (level === 'high') return 'border-l-rose-300';
  if (level === 'medium') return 'border-l-amber-300';
  return 'border-l-emerald-300';
}

function metricDetailClass() {
  return 'mt-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600';
}

export function AnalyticsAdvisorCards({ radar, financialPressure: _financialPressure, priorityDiagnostics, initialOpenCard = null }: Props) {
  const [openCard, setOpenCard] = useState<OpenCard>(initialOpenCard);

  const estadoRadar = useMemo(() => estadoFromMargin(radar), [radar]);
  const estadoDiagnosticos = useMemo(() => diagnosticsBadge(priorityDiagnostics), [priorityDiagnostics]);
  const collapsedDiagnostics = priorityDiagnostics.slice(0, 2);

  return (
    <section className="mt-4 grid gap-4 md:grid-cols-2">
      {radar ? (
        <Card className="p-0">
          <button type="button" className="min-h-[148px] w-full p-4 text-left" onClick={() => setOpenCard((v) => toggleAnalyticsCard(v, 'radar'))} aria-expanded={openCard === 'radar'}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">Radar Financiero</h3>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${estadoRadar.style}`}>
                {radar.status === 'estable' ? 'Estable' : radar.status === 'atencion' ? 'Atención' : 'Presión'}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{radar.whatToDoToday}</p>
            <p className="mt-3 text-sm text-slate-700"><span className="font-medium text-slate-900">Carga {radar.windowLabel}:</span> {formatCurrencyMXN(radar.upcomingLoad)}</p>
          </button>
          {openCard === 'radar' ? (
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-700">
              <p><span className="font-medium text-slate-900">Qué hacer hoy:</span> {radar.whatToDoToday}</p>
              <p className="mt-2"><span className="font-medium text-slate-900">Por qué importa:</span> {radar.whyItMatters}</p>
              <p className="mt-2"><span className="font-medium text-slate-900">Qué viene pronto:</span> {radar.whatIsComing}</p>
              <p className="mt-2"><span className="font-medium text-slate-900">Próximo paso ideal:</span> {radar.nextBestAction}</p>
              <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-3">
                <p><span className="font-medium text-slate-900">Disponible actual:</span> {formatCurrencyMXN(radar.availableNow)}</p>
                <div>
                  <p><span className="font-medium text-slate-900">Carga {radar.windowLabel}:</span> {formatCurrencyMXN(radar.upcomingLoad)}</p>
                  <details className={metricDetailClass()}>
                    <summary className="cursor-pointer font-medium text-slate-700">Ver detalle</summary>
                    <ul className="mt-1 space-y-1">
                      {radar.breakdowns.upcoming7dLoad.map((item) => (
                        <li key={`${item.label}-${item.amount}`}>• {item.label}: {formatCurrencyMXN(item.amount)}</li>
                      ))}
                    </ul>
                  </details>
                </div>
                <p><span className="font-medium text-slate-900">Margen estimado:</span> {formatCurrencyMXN(radar.estimatedMargin)}</p>
              </div>
              <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                <p><span className="font-medium text-slate-900">Faltante sin fricción:</span> {formatCurrencyMXN(Math.max(radar.breakdowns.frictionGap.gap, 0))}</p>
                <details className={metricDetailClass()}>
                  <summary className="cursor-pointer font-medium text-slate-700">Ver detalle</summary>
                  <p className="mt-1">{radar.breakdowns.frictionGap.formula}</p>
                  <p className="mt-1">({formatCurrencyMXN(radar.breakdowns.frictionGap.buffer)} + {formatCurrencyMXN(radar.breakdowns.frictionGap.immediateLoad)}) - {formatCurrencyMXN(radar.breakdowns.frictionGap.availableLiquidity)} = {formatCurrencyMXN(radar.breakdowns.frictionGap.gap)}</p>
                </details>
              </div>
              {radar.nearFutureLoad > 0 ? (
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">Presión cercana (8-14 días):</span> {formatCurrencyMXN(radar.nearFutureLoad)}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {priorityDiagnostics.length ? (
        <Card className="p-0">
          <button type="button" className="min-h-[148px] w-full p-4 text-left" onClick={() => setOpenCard((v) => toggleAnalyticsCard(v, 'diagnosticos'))} aria-expanded={openCard === 'diagnosticos'}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">Diagnósticos prioritarios</h3>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${estadoDiagnosticos.style}`}>{estadoDiagnosticos.label}</span>
            </div>
            <ul className="mt-3 space-y-2">
              {collapsedDiagnostics.map((diagnostic) => (
                <li key={diagnostic.key} className="text-sm text-slate-700 line-clamp-2">• {diagnostic.title}</li>
              ))}
            </ul>
          </button>
          {openCard === 'diagnosticos' ? (
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-700">
              <ul className="space-y-3">
                {priorityDiagnostics.slice(0, 3).map((diagnostic) => (
                  <li key={diagnostic.key} className={`rounded-md border-l-2 bg-slate-50 p-3 ${itemAccent(diagnostic.level)}`}>
                    <p className="font-medium text-slate-900">{diagnostic.title}</p>
                    <p className="mt-2 text-sm text-slate-700">{diagnostic.explanation}</p>
                    {diagnostic.evidence.length ? (
                      <details className={metricDetailClass()}>
                        <summary className="cursor-pointer font-medium text-slate-700">Ver detalle</summary>
                        <ul className="mt-1 space-y-1">
                          {diagnostic.evidence.map((evidence) => (
                            <li key={`${diagnostic.key}-${evidence.label}`}>• {evidence.label}: {evidence.value}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-600"><span className="font-medium text-slate-800">Siguiente paso:</span> {diagnostic.recommendedAction}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
