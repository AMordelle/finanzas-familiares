import React from 'react';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { buildProjectionScenario, type ProjectionTrend } from '@/lib/finance/projection';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

function formatSignedCurrency(value: number) {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatCurrencyMXN(value)}`;
}

function trendLabel(trend: ProjectionTrend) {
  if (trend === 'up') return 'Sube';
  if (trend === 'down') return 'Baja';
  return 'Estable';
}

function trendClass(value: number) {
  if (value < 0) return 'text-amber-700';
  if (value > 0) return 'text-emerald-700';
  return 'text-slate-700';
}

function moneyTone(value: number) {
  if (value <= 0) return 'text-red-700';
  if (value < 1000) return 'text-amber-700';
  return 'text-slate-900';
}

function scenarioSentence(ending: number, change: number) {
  const direction = change < 0 ? 'bajaría' : change > 0 ? 'subiría' : 'se mantendría sin cambio relevante';
  const amount = change === 0 ? '' : ` ${formatCurrencyMXN(Math.abs(change))}`;
  return `Si todo sigue igual, terminarías en 12 semanas con ${formatCurrencyMXN(ending)}. Tu dinero ${direction}${amount}.`;
}

export default async function ProjectionPage() {
  const scenario = await buildProjectionScenario();
  const { summary } = scenario;

  return (
    <AppShell title="Proyección">
      <section className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-950">Proyección</h2>
        <p className="max-w-3xl text-sm text-slate-600">
          Visualiza cómo podría comportarse tu dinero operativo durante las próximas 12 semanas si todo sigue igual.
        </p>
      </section>

      <section className="mt-6">
        <Card>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Resumen del escenario actual</h3>
              <p className={`mt-2 text-sm font-medium ${trendClass(summary.projectedChange)}`}>{scenarioSentence(summary.endingOperationalMoney, summary.projectedChange)}</p>
            </div>
            <p className="text-xs text-slate-500">Generado: {new Date(scenario.generatedAt).toLocaleDateString('es-MX')}</p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Dinero operativo actual</p>
              <p className={`mt-2 text-xl font-semibold ${moneyTone(summary.startingOperationalMoney)}`}>{formatCurrencyMXN(summary.startingOperationalMoney)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Proyección a 12 semanas</p>
              <p className={`mt-2 text-xl font-semibold ${moneyTone(summary.endingOperationalMoney)}`}>{formatCurrencyMXN(summary.endingOperationalMoney)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cambio proyectado</p>
              <p className={`mt-2 text-xl font-semibold ${trendClass(summary.projectedChange)}`}>{formatSignedCurrency(summary.projectedChange)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Punto más bajo</p>
              <p className={`mt-2 text-xl font-semibold ${moneyTone(summary.lowestProjectedMoney)}`}>{formatCurrencyMXN(summary.lowestProjectedMoney)}</p>
              <p className="mt-1 text-xs text-slate-500">Semana {summary.lowestProjectedWeek}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tendencia</p>
              <p className={`mt-2 text-xl font-semibold ${trendClass(summary.projectedChange)}`}>{trendLabel(summary.trend)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Confianza</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{summary.confidence === 'high' ? 'Alta' : summary.confidence === 'medium' ? 'Media' : 'Baja'}</p>
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h3 className="text-lg font-semibold text-slate-950">Tabla de 12 semanas</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Semana</th>
                  <th className="px-3 py-2">Inicio</th>
                  <th className="px-3 py-2">Ingresos estimados</th>
                  <th className="px-3 py-2">Gastos estimados</th>
                  <th className="px-3 py-2">Compromisos</th>
                  <th className="px-3 py-2">Eventos</th>
                  <th className="px-3 py-2">Final</th>
                  <th className="px-3 py-2">Cambio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scenario.weeks.map((week) => (
                  <tr key={week.weekNumber} className={week.closingOperationalMoney <= 0 ? 'bg-red-50' : undefined}>
                    <td className="px-3 py-3 font-medium text-slate-900">Semana {week.weekNumber}</td>
                    <td className="px-3 py-3 text-slate-700">{formatCurrencyMXN(week.openingOperationalMoney)}</td>
                    <td className="px-3 py-3 text-emerald-700">{formatCurrencyMXN(week.estimatedIncome)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatCurrencyMXN(week.estimatedVariableExpenses)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatCurrencyMXN(week.estimatedCommitments)}</td>
                    <td className="px-3 py-3 text-slate-700">{formatCurrencyMXN(week.extraordinaryEvents)}</td>
                    <td className={`px-3 py-3 font-semibold ${moneyTone(week.closingOperationalMoney)}`}>{formatCurrencyMXN(week.closingOperationalMoney)}</td>
                    <td className={`px-3 py-3 font-medium ${trendClass(week.netChange)}`}>{formatSignedCurrency(week.netChange)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h3 className="text-lg font-semibold text-slate-950">Notas y limitaciones</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {summary.dataLimitations.map((note) => <li key={note}>• {note}</li>)}
          </ul>
        </Card>
      </section>
    </AppShell>
  );
}
