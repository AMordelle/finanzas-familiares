'use client';

import React from 'react';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { FinancialRadar } from '@/lib/finance/financialRadar';
import type { FinancialStatus } from '@/lib/finance/financialStatus';

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
  initialOpenCard?: OpenCard;
};

type OpenCard = 'radar' | 'estado' | null;

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

function stageLabel(stage: FinancialStatus['stage']) {
  if (stage === 'optimizacion') return 'Optimización';
  if (stage === 'estabilizacion') return 'Estabilización';
  return 'Recuperación';
}

export function AnalyticsAdvisorCards({ radar, financialPressure, financialStatus, initialOpenCard = null }: Props) {
  const [openCard, setOpenCard] = useState<OpenCard>(initialOpenCard);

  const estadoRadar = useMemo(() => estadoFromMargin(radar), [radar]);
  const estadoEstructural = useMemo(() => estadoEstructuralBadge(financialStatus), [financialStatus]);

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
    </section>
  );
}
