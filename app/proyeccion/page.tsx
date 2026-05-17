import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { buildWeeklyProjectionSummary } from '@/lib/db/queries';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

export default async function ProyeccionPage() {
  const summary = await buildWeeklyProjectionSummary();

  if (!summary.hasHousehold) {
    return (
      <AppShell title="Proyección">
        <Card><p className="text-sm text-slate-600">Completa onboarding para usar Proyección.</p></Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Proyección">
      <Card>
        <h2 className="font-semibold">Proyección semanal por categorías principales</h2>
        <p className="mt-2 text-sm text-slate-600">Movimiento → categoría principal → columna configurada → suma semanal. Las subcategorías solo aparecen como desglose informativo.</p>
        {!summary.hasConfiguration && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Primero crea categorías y columnas para que Proyección pueda agrupar tus movimientos.</p>}
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {summary.columns.map((column) => (
          <Card key={column.columnId}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{column.type === 'income' ? 'Ingreso' : 'Gasto'}</p>
            <h3 className="mt-1 font-semibold">{column.columnName}</h3>
            <p className="mt-2 text-2xl font-semibold">{formatCurrencyMXN(column.total)}</p>
            {column.subcategoryBreakdown.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-700">Cómo se armó este escenario</summary>
                <ul className="mt-2 space-y-1 text-slate-600">
                  {column.subcategoryBreakdown.map((item) => <li key={item.subcategory}>• {item.subcategory}: {formatCurrencyMXN(item.total)}</li>)}
                </ul>
              </details>
            )}
          </Card>
        ))}
      </div>

      {summary.unclassified.length > 0 && (
        <Card>
          <h3 className="font-semibold">Sin clasificar</h3>
          <p className="mt-2 text-sm text-slate-600">Estas categorías principales tienen movimientos pero no están asignadas a una columna activa. Asígnalas en Configuración.</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {summary.unclassified.map((item) => <li key={item.category}>• {item.category}: {formatCurrencyMXN(item.total)} ({item.movementCount} movimientos)</li>)}
          </ul>
        </Card>
      )}
    </AppShell>
  );
}
