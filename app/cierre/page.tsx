import React from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createFinancialClosureAction } from '@/app/cierre/actions';
import { getFinancialClosures, type FinancialClosure, type FinancialClosureType } from '@/lib/db/queries';

const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN'
});

function formatMoney(value: number) {
  return currency.format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function typeLabel(type: FinancialClosureType) {
  return type === 'weekly' ? 'Semanal' : 'Mensual';
}

function AmountMetric({ label, value }: { label: string; value: number }) {
  const tone = value > 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-slate-700';
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${tone}`}>{formatMoney(value)}</dd>
    </div>
  );
}

function ClosureCard({ closure }: { closure: FinancialClosure }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primaria">Tipo: {typeLabel(closure.type)}</p>
          <h3 className="text-xl font-semibold text-slate-900">
            {formatDate(closure.periodStart)} — {formatDate(closure.periodEnd)}
          </h3>
        </div>
        <p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
          Balance del periodo: {formatMoney(closure.netFlow)}
        </p>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AmountMetric label="Total inicial" value={closure.openingTotal} />
        <AmountMetric label="Total final" value={closure.closingTotal} />
        <AmountMetric label="Cambio neto" value={closure.netChange} />
        <AmountMetric label="Ingresos del periodo" value={closure.incomeTotal} />
        <AmountMetric label="Gastos del periodo" value={closure.expenseTotal} />
        <AmountMetric label="Balance del periodo" value={closure.netFlow} />
      </dl>

      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer font-semibold text-slate-800">Ver detalle del cierre</summary>
        <div className="mt-4 space-y-5">
          <section>
            <h4 className="font-semibold text-slate-900">Resumen general</h4>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <AmountMetric label="Total inicial" value={closure.openingTotal} />
              <AmountMetric label="Total final" value={closure.closingTotal} />
              <AmountMetric label="Cambio neto" value={closure.netChange} />
              <AmountMetric label="Ingresos" value={closure.incomeTotal} />
              <AmountMetric label="Gastos" value={closure.expenseTotal} />
              <AmountMetric label="Balance" value={closure.netFlow} />
            </dl>
          </section>

          <section>
            <h4 className="font-semibold text-slate-900">Cambios por cuenta</h4>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Cuenta</th>
                    <th className="px-3 py-2">Saldo inicial</th>
                    <th className="px-3 py-2">Saldo final</th>
                    <th className="px-3 py-2">Diferencia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {closure.accountSnapshots.map((account) => (
                    <tr key={account.accountId}>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {account.accountName}
                        <span className="ml-2 text-xs font-normal text-slate-500">{account.accountType}</span>
                      </td>
                      <td className="px-3 py-2">{formatMoney(account.openingBalance)}</td>
                      <td className="px-3 py-2">{formatMoney(account.closingBalance)}</td>
                      <td className={account.difference < 0 ? 'px-3 py-2 text-rose-700' : 'px-3 py-2 text-emerald-700'}>{formatMoney(account.difference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {closure.notes ? (
            <section>
              <h4 className="font-semibold text-slate-900">Notas</h4>
              <p className="mt-2 whitespace-pre-line rounded-xl bg-amber-50 p-3 text-sm text-slate-700">{closure.notes}</p>
            </section>
          ) : null}
        </div>
      </details>
    </Card>
  );
}

export default async function CierrePage() {
  const { hasHousehold, closures } = await getFinancialClosures();

  return (
    <AppShell title="Cierre">
      <div className="space-y-6">
        <Card>
          <p className="text-sm font-medium text-primaria">Cierre</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Compara cómo empezaste y cómo terminaste un periodo.</h2>
          <p className="mt-2 text-slate-600">Crea cierres semanales o mensuales para guardar una foto financiera del hogar sin modificar saldos ni movimientos.</p>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">Crear cierre</h2>
          {!hasHousehold ? (
            <p className="mt-3 text-sm text-slate-600">Primero configura un hogar para poder crear cierres.</p>
          ) : (
            <form action={createFinancialClosureAction} className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                Tipo de cierre
                <select name="type" required className="w-full rounded-xl border border-slate-300 px-3 py-2">
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </label>

              <label className="space-y-1 text-sm font-medium text-slate-700">
                Fecha inicial
                <input name="periodStart" type="date" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>

              <label className="space-y-1 text-sm font-medium text-slate-700">
                Fecha final
                <input name="periodEnd" type="date" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
              </label>

              <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
                Notas opcionales
                <textarea name="notes" rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Ej. Semana con pago de renta, gastos escolares o ingreso extra." />
              </label>

              <div className="md:col-span-2">
                <Button type="submit">Crear cierre</Button>
              </div>
            </form>
          )}
        </Card>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Cierres creados</h2>
            <p className="text-sm text-slate-600">Los valores se guardan como snapshot al momento de crear cada cierre.</p>
          </div>

          {closures.length ? (
            closures.map((closure) => <ClosureCard key={closure.id} closure={closure} />)
          ) : (
            <Card>
              <p className="text-sm text-slate-600">Aún no hay cierres creados. Usa el formulario para guardar el primero.</p>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
