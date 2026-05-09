import React from 'react';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createFinancialClosureAction, deleteFinancialClosureAction, recalculateFinancialClosureAction } from '@/app/cierre/actions';
import { ClosureCard } from '@/components/cierre/closure-card';
import { getFinancialClosures } from '@/lib/db/queries';

export default async function CierrePage() {
  const { hasHousehold, closures } = await getFinancialClosures();

  return (
    <AppShell title="Cierre">
      <div className="space-y-6">
        <Card>
          <p className="text-sm font-medium text-primaria">Cierre</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Compara cómo empezaste y cómo terminaste un periodo.</h2>
          <p className="mt-2 text-slate-600">Crea cierres semanales o mensuales para guardar una foto del dinero operativo real sin modificar saldos ni movimientos.</p>
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
            <p className="text-sm text-slate-600">Cada cierre inicia compacto. Abre solo el periodo que quieras revisar.</p>
          </div>

          {closures.length ? (
            closures.map((closure) => (
              <ClosureCard
                key={closure.id}
                closure={closure}
                recalculateAction={recalculateFinancialClosureAction}
                deleteAction={deleteFinancialClosureAction}
              />
            ))
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
