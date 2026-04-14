'use client';

import React from 'react';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import type { FinancialRadar } from '@/lib/finance/financialRadar';

type FinancialRadarCardProps = {
  radar: FinancialRadar;
  initiallyExpanded?: boolean;
};

const badgeStyles: Record<FinancialRadar['status'], string> = {
  estable: 'bg-emerald-100 text-emerald-700',
  atencion: 'bg-amber-100 text-amber-700',
  presion: 'bg-rose-100 text-rose-700'
};

const badgeLabel: Record<FinancialRadar['status'], string> = {
  estable: 'Estable',
  atencion: 'Atención',
  presion: 'Presión'
};

function formatMoney(value: number) {
  return `$${Math.round(value).toLocaleString('es-MX')}`;
}

export function FinancialRadarCard({ radar, initiallyExpanded = false }: FinancialRadarCardProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <Card className="p-0">
      <button
        type="button"
        className="w-full p-4 text-left transition hover:bg-slate-50"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Radar Financiero</h3>
            <p className="mt-1 text-sm text-slate-700">{radar.actionToday}</p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${badgeStyles[radar.status]}`}>{badgeLabel[radar.status]}</span>
        </div>
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-medium text-slate-900">Carga próxima:</span> {formatMoney(radar.upcomingLoad)}
        </p>
      </button>

      {expanded ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-700">
          <div className="space-y-2">
            <p><span className="font-medium text-slate-900">Qué hacer hoy:</span> {radar.actionToday}</p>
            <p><span className="font-medium text-slate-900">Qué viene pronto:</span> {radar.upcoming}</p>
            <p><span className="font-medium text-slate-900">Riesgo actual:</span> {radar.riskText}</p>
            <p><span className="font-medium text-slate-900">Próximo paso ideal:</span> {radar.nextBestStep}</p>
          </div>
          <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 text-xs sm:grid-cols-3">
            <p><span className="font-medium text-slate-900">Disponible actual:</span> {formatMoney(radar.availableNow)}</p>
            <p><span className="font-medium text-slate-900">Carga próxima:</span> {formatMoney(radar.upcomingLoad)}</p>
            <p><span className="font-medium text-slate-900">Margen estimado:</span> {formatMoney(radar.estimatedMargin)}</p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
