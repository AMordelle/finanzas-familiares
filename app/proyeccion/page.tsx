import React from 'react';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { buildProjectionScenario, type ProjectionCalculationTransparency, type ProjectionDetectedMovement, type ProjectionTrend } from '@/lib/finance/projection';
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

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-slate-500">{label}</p>;
}

function BreakdownList({ items }: { items: Array<{ category: string; amount: number }> }) {
  if (!items.length) return <EmptyState label="Sin desglose disponible." />;
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-700">
      {items.map((item) => <li key={item.category} className="flex justify-between gap-4"><span>{item.category}</span><span className="font-medium">{formatCurrencyMXN(item.amount)}</span></li>)}
    </ul>
  );
}

function MovementList({ items, emptyLabel }: { items: ProjectionCalculationTransparency['income']['includedMovements']; emptyLabel: string }) {
  if (!items.length) return <EmptyState label={emptyLabel} />;
  return (
    <ul className="mt-2 space-y-2 text-sm text-slate-700">
      {items.map((item) => (
        <li key={`${item.groupId}-${item.date}-${item.category}-${item.amount}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium text-slate-900">{item.category}</span>
            <span className="font-semibold">{formatCurrencyMXN(item.amount)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{item.date}{item.accountName ? ` · ${item.accountName}` : ''}</p>
          <p className="mt-1 text-xs font-medium text-slate-600">Clasificación usada: {item.classification} · {item.classificationSource === 'manual' ? 'manual' : 'automática'}</p>
          <p className="mt-1 text-xs text-slate-600">{item.reason}</p>
        </li>
      ))}
    </ul>
  );
}

function CalculationDetails({
  calculation,
  recurringWeeklyIncome,
  recurringWeeklyExpenses,
  extraordinaryDetected,
  internalExcluded
}: {
  calculation: ProjectionCalculationTransparency;
  recurringWeeklyIncome: number;
  recurringWeeklyExpenses: number;
  extraordinaryDetected: ProjectionDetectedMovement[];
  internalExcluded: ProjectionDetectedMovement[];
}) {
  const commitmentWeeks = calculation.commitments.byWeek.filter((week) => week.items.length > 0);

  return (
    <section className="mt-6">
      <details className="rounded-2xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-lg font-semibold text-slate-950">Ver cómo se calculó esta proyección</summary>
        <div className="mt-4 space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="font-semibold text-slate-950">Flujo recurrente usado para la proyección</h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ingresos recurrentes</p>
                <p className="mt-1 text-lg font-semibold text-emerald-700">{formatCurrencyMXN(recurringWeeklyIncome)} semanales</p>
              </div>
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gastos recurrentes</p>
                <p className="mt-1 text-lg font-semibold text-amber-700">{formatCurrencyMXN(recurringWeeklyExpenses)} semanales</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h5 className="text-sm font-semibold text-slate-900">Eventos extraordinarios detectados</h5>
                {extraordinaryDetected.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {extraordinaryDetected.map((item) => <li key={`${item.description}-${item.date}-${item.amount}`}>• {item.description} · {formatCurrencyMXN(item.amount)} · {item.date} · no incluida en promedio recurrente</li>)}
                  </ul>
                ) : <EmptyState label="No se detectaron movimientos extraordinarios en el historial usado." />}
              </div>
              <div>
                <h5 className="text-sm font-semibold text-slate-900">Movimientos internos excluidos</h5>
                {internalExcluded.length ? (
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {internalExcluded.map((item) => <li key={`${item.description}-${item.date}-${item.amount}`}>• {item.description} · {formatCurrencyMXN(item.amount)} · {item.date}</li>)}
                  </ul>
                ) : <EmptyState label="No se detectaron transferencias internas en el historial usado." />}
              </div>
            </div>
          </div>

          {calculation.warnings.length ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <h4 className="font-semibold text-amber-900">Advertencias de cálculo</h4>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {calculation.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-950">Ingresos estimados</h4>
              <p className="mt-1 text-sm text-slate-600">Periodo: {calculation.income.periodStart} a {calculation.income.periodEnd}</p>
              <p className="mt-1 text-sm text-slate-600">{calculation.income.criterion}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Promedio semanal</p><p className="font-semibold">{formatCurrencyMXN(calculation.income.weeklyAverage)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Ordinarios</p><p className="font-semibold">{formatCurrencyMXN(calculation.income.ordinaryIncome)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Extraordinarios incluidos</p><p className="font-semibold">{formatCurrencyMXN(calculation.income.extraordinaryIncluded)}</p></div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Extraordinarios excluidos: {formatCurrencyMXN(calculation.income.extraordinaryExcluded)}</p>
              <h5 className="mt-4 text-sm font-semibold text-slate-900">Ingresos por categoría</h5>
              <BreakdownList items={calculation.income.byCategory} />
              <h5 className="mt-4 text-sm font-semibold text-slate-900">Ingresos por cuenta</h5>
              <BreakdownList items={calculation.income.byAccount} />
              <h5 className="mt-4 text-sm font-semibold text-slate-900">Movimientos incluidos en ingresos</h5>
              <MovementList items={calculation.income.includedMovements} emptyLabel="No hubo ingresos incluidos en el periodo." />
              <h5 className="mt-4 text-sm font-semibold text-slate-900">Movimientos excluidos de ingresos</h5>
              <MovementList items={calculation.income.excludedMovements} emptyLabel="No hubo movimientos excluidos de ingresos." />
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-950">Gastos estimados</h4>
              <p className="mt-1 text-sm text-slate-600">Periodo: {calculation.expenses.periodStart} a {calculation.expenses.periodEnd}</p>
              <p className="mt-1 text-sm text-slate-600">{calculation.expenses.criterion}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Promedio semanal</p><p className="font-semibold">{formatCurrencyMXN(calculation.expenses.weeklyAverage)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Variables</p><p className="font-semibold">{formatCurrencyMXN(calculation.expenses.variableExpenses)}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Fijos</p><p className="font-semibold">{formatCurrencyMXN(calculation.expenses.fixedExpenses)}</p></div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Pagos/deudas incluidos: {formatCurrencyMXN(calculation.expenses.debtPaymentsIncluded)}</p>
              <h5 className="mt-4 text-sm font-semibold text-slate-900">Categorías principales</h5>
              <BreakdownList items={calculation.expenses.byCategory} />
              <h5 className="mt-4 text-sm font-semibold text-slate-900">Movimientos incluidos en gastos</h5>
              <MovementList items={calculation.expenses.includedMovements} emptyLabel="No hubo gastos incluidos en el periodo." />
              <h5 className="mt-4 text-sm font-semibold text-slate-900">Movimientos excluidos de gastos</h5>
              <MovementList items={calculation.expenses.excludedMovements} emptyLabel="No hubo movimientos excluidos de gastos." />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-950">Compromisos MSI</h4>
              <p className="mt-1 text-sm text-slate-600">{calculation.commitments.criterion}</p>
              {commitmentWeeks.length ? (
                <ul className="mt-3 space-y-3 text-sm text-slate-700">
                  {commitmentWeeks.map((week) => (
                    <li key={week.weekNumber} className="rounded-xl bg-slate-50 p-3">
                      <p className="font-semibold text-slate-900">Semana {week.weekNumber}: {formatCurrencyMXN(week.total)}</p>
                      <ul className="mt-2 space-y-1">
                        {week.items.map((item) => <li key={`${week.weekNumber}-${item.description}-${item.installmentNumber}`}>• {item.description} · pago {item.installmentNumber} · {item.dueDate ?? 'sin fecha'} · {formatCurrencyMXN(item.amount)}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState label="No hay MSI pendientes incluidos." />}
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-950">Eventos extraordinarios</h4>
              <p className="mt-1 text-sm text-slate-600">{calculation.events.criterion}</p>
              {calculation.events.includedEvents.length ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                  {calculation.events.includedEvents.map((event) => <li key={`${event.label}-${event.eventDate}`} className="flex justify-between gap-3 rounded-xl bg-slate-50 p-3"><span>Semana {event.weekNumber} · {event.label} · {event.eventDate}</span><span className="font-semibold">{formatCurrencyMXN(event.amount)}</span></li>)}
                </ul>
              ) : <EmptyState label="No hay eventos extraordinarios registrados dentro de las próximas 12 semanas." />}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

export default async function ProjectionPage() {
  const scenario = await buildProjectionScenario();
  const { summary, calculation } = scenario;

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
              <p className="mt-1 text-xs text-slate-500">Solo cuentas líquidas/operativas.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Proyección a 12 semanas</p>
              <p className={`mt-2 text-xl font-semibold ${moneyTone(summary.endingOperationalMoney)}`}>{formatCurrencyMXN(summary.endingOperationalMoney)}</p>
              <p className="mt-1 text-xs text-slate-500">{calculation.income.shortNote}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cambio proyectado</p>
              <p className={`mt-2 text-xl font-semibold ${trendClass(summary.projectedChange)}`}>{formatSignedCurrency(summary.projectedChange)}</p>
              <p className="mt-1 text-xs text-slate-500">{calculation.expenses.shortNote}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Punto más bajo</p>
              <p className={`mt-2 text-xl font-semibold ${moneyTone(summary.lowestProjectedMoney)}`}>{formatCurrencyMXN(summary.lowestProjectedMoney)}</p>
              <p className="mt-1 text-xs text-slate-500">Semana {summary.lowestProjectedWeek} · {calculation.commitments.shortNote}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tendencia</p>
              <p className={`mt-2 text-xl font-semibold ${trendClass(summary.projectedChange)}`}>{trendLabel(summary.trend)}</p>
              <p className="mt-1 text-xs text-slate-500">{calculation.events.shortNote}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Confianza</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">{summary.confidence === 'high' ? 'Alta' : summary.confidence === 'medium' ? 'Media' : 'Baja'}</p>
              <p className="mt-1 text-xs text-slate-500">Revisa el cálculo antes de tomar decisiones.</p>
            </div>
          </div>
        </Card>
      </section>

      <CalculationDetails
        calculation={calculation}
        recurringWeeklyIncome={scenario.recurringWeeklyIncome}
        recurringWeeklyExpenses={scenario.recurringWeeklyExpenses}
        extraordinaryDetected={scenario.extraordinaryDetected}
        internalExcluded={scenario.internalExcluded}
      />

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
