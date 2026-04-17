'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';
import type { PriorityDiagnostic } from '@/lib/finance/priorityDiagnostics';

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
  financialStatus: FinancialStatus | null;
  priorityDiagnostics: PriorityDiagnostic[];
  initialOpenCard?: OpenCard;
};

type OpenCard = 'radar' | 'estado' | 'diagnosticos' | null;

export function toggleAnalyticsCard(current: OpenCard, target: Exclude<OpenCard, null>) {
  return current === target ? null : target;
}

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('es-MX')}`;
}

function estadoFromMargin(radar: FinancialRadar | null) {
  if (!radar) return { label: 'Sin datos', style: 'bg-slate-100 text-slate-700' };
  if (radar.status === 'presion') return { label: 'Presión', style: 'bg-rose-100 text-rose-700' };
  if (radar.status === 'atencion') return { label: 'Atención', style: 'bg-amber-100 text-amber-700' };
  return { label: 'Estable', style: 'bg-emerald-100 text-emerald-700' };
}

function estadoEstructuralBadge(financialStatus: FinancialStatus | null) {
  if (!financialStatus) return { label: 'Sin datos', style: 'bg-slate-100 text-slate-700' };
  if (financialStatus.status === 'solido') return { label: 'Sólido', style: 'bg-emerald-100 text-emerald-700' };
  if (financialStatus.status === 'en_transicion') return { label: 'En transición', style: 'bg-sky-100 text-sky-700' };
  if (financialStatus.status === 'ajustado') return { label: 'Ajustado', style: 'bg-amber-100 text-amber-700' };
  return { label: 'Vulnerable', style: 'bg-rose-100 text-rose-700' };
}

function diagnosticsBadge(priorityDiagnostics: PriorityDiagnostic[]) {
  if (!priorityDiagnostics.length) return { label: 'Sin datos', style: 'bg-slate-100 text-slate-700' };
  if (priorityDiagnostics[0]?.level === 'high') return { label: 'Alta prioridad', style: 'bg-rose-100 text-rose-700' };
  if (priorityDiagnostics[0]?.level === 'medium') return { label: 'Priorizar', style: 'bg-amber-100 text-amber-700' };
  return { label: 'Estable', style: 'bg-emerald-100 text-emerald-700' };
}

function stageLabel(stage: FinancialStatus['stage']) {
  if (stage === 'optimizacion') return 'Optimización';
  if (stage === 'estabilizacion') return 'Estabilización';
  return 'Recuperación';
}

function levelLabel(level: PriorityDiagnostic['level']) {
  if (level === 'high') return { label: 'Alta', style: 'bg-rose-100 text-rose-700' };
  if (level === 'medium') return { label: 'Media', style: 'bg-amber-100 text-amber-700' };
  return { label: 'Baja', style: 'bg-emerald-100 text-emerald-700' };
}

export function AnalyticsAdvisorCards({ radar, financialPressure, financialStatus, priorityDiagnostics, initialOpenCard = null }: Props) {
  const [openCard, setOpenCard] = useState<OpenCard>(initialOpenCard);

  const estadoRadar = useMemo(() => estadoFromMargin(radar), [radar]);
  const estadoEstructural = useMemo(() => estadoEstructuralBadge(financialStatus), [financialStatus]);
  const estadoDiagnosticos = useMemo(() => diagnosticsBadge(priorityDiagnostics), [priorityDiagnostics]);
  const collapsedDiagnostics = priorityDiagnostics.slice(0, 2);

  return (
    <section className="mt-4 grid gap-4 md:grid-cols-3">
      {radar ? (
        <Card className="p-0">
          <button type="button" className="min-h-[148px] w-full p-4 text-left" onClick={() => setOpenCard((v) => toggleAnalyticsCard(v, 'radar'))} aria-expanded={openCard === 'radar'}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">Radar Financiero</h3>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${estadoRadar.style}`}>
                {radar.status === 'estable' ? 'Estable' : radar.status === 'atencion' ? 'Atención' : 'Presión'}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{radar.actionToday}</p>
            <p className="mt-3 text-sm text-slate-700"><span className="font-medium text-slate-900">Carga {radar.windowLabel}:</span> {formatMoney(radar.upcomingLoad)}</p>
          </button>
          {openCard === 'radar' ? (
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-700">
              <p><span className="font-medium text-slate-900">Qué hacer hoy:</span> {radar.actionTodayDetail}</p>
              <p className="mt-2"><span className="font-medium text-slate-900">Qué viene pronto:</span> {radar.upcoming}</p>
              <p className="mt-2"><span className="font-medium text-slate-900">Riesgo actual:</span> {radar.riskText}</p>
              <p className="mt-2"><span className="font-medium text-slate-900">Próximo paso ideal:</span> {radar.nextBestStep}</p>
              <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-3">
                <p><span className="font-medium text-slate-900">Disponible actual:</span> {formatMoney(radar.availableNow)}</p>
                <p><span className="font-medium text-slate-900">Carga {radar.windowLabel}:</span> {formatMoney(radar.upcomingLoad)}</p>
                <p><span className="font-medium text-slate-900">Margen estimado:</span> {formatMoney(radar.estimatedMargin)}</p>
              </div>
              {radar.nearFutureLoad > 0 ? (
                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">Presión cercana (8-14 días):</span> {formatMoney(radar.nearFutureLoad)}
                </p>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {financialPressure && financialStatus ? (
        <Card className="p-0">
          <button type="button" className="min-h-[148px] w-full p-4 text-left" onClick={() => setOpenCard((v) => toggleAnalyticsCard(v, 'estado'))} aria-expanded={openCard === 'estado'}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold text-slate-900">Estado financiero actual</h3>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${estadoEstructural.style}`}>{estadoEstructural.label}</span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{financialStatus.shortLine}</p>
          </button>
          {openCard === 'estado' ? (
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-700">
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
                <p className="mt-2 text-xs text-slate-500">{financialStatus.assumptions[0]}</p>
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
              {collapsedDiagnostics.map((diagnostic) => {
                const level = levelLabel(diagnostic.level);
                return (
                  <li key={diagnostic.key} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${level.style}`}>{level.label}</span>
                    <span className="line-clamp-2">{diagnostic.title}</span>
                  </li>
                );
              })}
            </ul>
          </button>
          {openCard === 'diagnosticos' ? (
            <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-700">
              <ul className="space-y-3">
                {priorityDiagnostics.slice(0, 3).map((diagnostic) => {
                  const level = levelLabel(diagnostic.level);
                  return (
                    <li key={diagnostic.key} className="rounded-md bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-slate-900">{diagnostic.title}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${level.style}`}>{level.label}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{diagnostic.explanation}</p>
                      {diagnostic.action ? (
                        <p className="mt-2 text-xs text-slate-600"><span className="font-medium text-slate-800">Siguiente paso:</span> {diagnostic.action}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}
