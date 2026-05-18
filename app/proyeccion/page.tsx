import React from 'react';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { buildWeeklyProjectionSummary, type WeeklyProjectionCell, type WeeklyProjectionColumnSummary } from '@/lib/db/queries';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

function DateRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  return <span className="text-xs text-slate-500">{startDate} → {endDate}</span>;
}

function ColumnCellDetail({ cell, column }: { cell: WeeklyProjectionCell; column: WeeklyProjectionColumnSummary }) {
  if (cell.projectedFromAverage) {
    return (
      <details className="mt-1 text-left text-[11px] text-slate-600">
        <summary className="cursor-pointer text-slate-700">Auditar</summary>
        <div className="mt-2 min-w-64 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p className="font-medium">{column.columnName}: promedio usado {formatCurrencyMXN(cell.averageUsed ?? 0)}</p>
          <p>Este importe viene del promedio de las {cell.historicalValues?.length ?? 0} semanas históricas válidas.</p>
          <ul className="space-y-1">
            {(cell.historicalValues ?? []).map((value) => <li key={value.label}>{value.label}: {formatCurrencyMXN(value.amount)}</li>)}
          </ul>
          {cell.categoryBreakdown.length > 0 && <CategoryBreakdownList column={column} />}
        </div>
      </details>
    );
  }

  return (
    <details className="mt-1 text-left text-[11px] text-slate-600">
      <summary className="cursor-pointer text-slate-700">Auditar</summary>
      <div className="mt-2 min-w-72 space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <p className="font-medium">{column.columnName}: total {formatCurrencyMXN(cell.amount)}</p>
        {cell.categoryBreakdown.length === 0 ? <p>Sin movimientos en esta celda.</p> : cell.categoryBreakdown.map((category) => (
          <div key={category.category}>
            <p className="font-medium text-slate-700">{category.categoryName}: {formatCurrencyMXN(category.total)}</p>
            {category.subcategories.map((subcategory) => (
              <div key={`${category.category}-${subcategory.subcategory}`} className="ml-3">
                <p>{subcategory.subcategory}: {formatCurrencyMXN(subcategory.total)}</p>
                <ul className="ml-3 list-disc space-y-1">
                  {subcategory.movements.map((movement) => (
                    <li key={movement.id}>{movement.date} · {movement.description} · {movement.accountName ?? 'Sin cuenta'} · {formatCurrencyMXN(movement.amount)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}

function CategoryBreakdownList({ column }: { column: WeeklyProjectionColumnSummary }) {
  return (
    <div className="space-y-2">
      {column.categoryBreakdown.map((category) => (
        <div key={category.category} className="rounded-lg bg-slate-50 p-2">
          <p className="font-medium text-slate-700">{category.categoryName}: {formatCurrencyMXN(category.total)}</p>
          <dl className="mt-2 space-y-1 text-slate-600">
            {category.subcategories.map((subcategory) => (
              <div key={`${category.category}-${subcategory.subcategory}`} className="flex items-center justify-between gap-3">
                <dt className="truncate">{subcategory.subcategory}</dt>
                <dd className="font-medium text-slate-700">{formatCurrencyMXN(subcategory.total)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}


function CompactSubcategoryBreakdown({ column }: { column: WeeklyProjectionColumnSummary }) {
  const subcategoryTotals = new Map<string, number>();
  for (const category of column.categoryBreakdown) {
    for (const subcategory of category.subcategories) {
      subcategoryTotals.set(subcategory.subcategory, (subcategoryTotals.get(subcategory.subcategory) ?? 0) + subcategory.total);
    }
  }
  const rows = [...subcategoryTotals.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (!rows.length) return <p className="text-xs text-slate-500">Sin movimientos históricos válidos.</p>;

  return (
    <dl className="space-y-1 text-xs text-slate-600">
      {rows.map(([subcategory, total]) => (
        <div key={subcategory} className="flex items-center justify-between gap-3 border-b border-slate-100 last:border-0">
          <dt className="truncate py-0.5 pl-1">{subcategory}</dt>
          <dd className="whitespace-nowrap py-0.5 pr-1 font-medium text-slate-800">{formatCurrencyMXN(total)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ColumnSummaryTable({ title, columns }: { title: string; columns: WeeklyProjectionColumnSummary[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        <span className="text-xs text-slate-400">{columns.length} columnas</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Columna financiera</th>
              <th className="px-3 py-2 font-medium">Promedio semanal</th>
              <th className="px-3 py-2 font-medium">Total histórico usado</th>
              <th className="px-3 py-2 font-medium">Semanas usadas</th>
              <th className="px-3 py-2 font-medium">Categorías incluidas</th>
              <th className="px-3 py-2 font-medium">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {columns.map((column) => (
              <tr key={column.columnId} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">{column.type === 'income' ? 'Ingreso' : 'Gasto'}</td>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">{column.columnName}</td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-800">{formatCurrencyMXN(column.averageWeekly)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{formatCurrencyMXN(column.total)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-700">{column.weeksUsed}</td>
                <td className="min-w-56 px-3 py-2 text-slate-600">{column.categories.length ? column.categories.map((category) => category.name).join(', ') : 'Sin categorías asignadas'}</td>
                <td className="min-w-56 px-3 py-2">
                  <details className="group text-xs text-slate-600">
                    <summary className="cursor-pointer font-medium text-slate-700 group-open:mb-2">Ver</summary>
                    <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                      <CompactSubcategoryBreakdown column={column} />
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default async function ProyeccionPage() {
  const summary = await buildWeeklyProjectionSummary();

  if (!summary.hasHousehold) {
    return (
      <AppShell title="Proyección">
        <Card><p className="text-sm text-slate-600">Completa onboarding para usar Proyección.</p></Card>
      </AppShell>
    );
  }

  const generalCards = [
    ['Dinero operativo actual', summary.operationalMoney],
    ['Promedio semanal de ingresos', summary.averageWeeklyIncome],
    ['Promedio semanal de gastos', summary.averageWeeklyExpense]
  ] as const;

  return (
    <AppShell title="Proyección">
      <Card>
        <h2 className="font-semibold">Proyección semanal configurable</h2>
        <p className="mt-2 text-sm text-slate-600">Movimiento → categoría principal → columna configurada → semana → promedio por columna → proyección futura a 12 semanas.</p>
        {!summary.hasConfiguration && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Primero crea categorías y columnas para que Proyección pueda agrupar tus movimientos.</p>}
      </Card>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Resumen general">
        {generalCards.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{formatCurrencyMXN(value)}</p>
          </Card>
        ))}
      </section>

      <Card>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="font-semibold">Resumen de columnas financieras</h3>
            <p className="text-sm text-slate-600">Vista compacta de columnas configuradas, promedios y categorías incluidas.</p>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          <ColumnSummaryTable title="Ingresos" columns={summary.columns.filter((column) => column.type === 'income')} />
          <ColumnSummaryTable title="Gastos" columns={summary.columns.filter((column) => column.type === 'expense')} />
        </div>
      </Card>

      <Card>
        <h3 className="font-semibold">Tabla semanal · histórico real, semana actual y proyección</h3>
        <p className="mt-2 text-sm text-slate-600">La semana actual parcial se muestra para seguimiento, pero no se usa en promedios.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-slate-600">
                <th className="sticky left-0 z-10 border border-slate-200 bg-slate-100 p-2">Bloque / semana</th>
                {summary.columns.map((column) => <th key={column.columnId} className="border border-slate-200 p-2">{column.columnName}</th>)}
                <th className="border border-slate-200 p-2">Total ingresos</th>
                <th className="border border-slate-200 p-2">Total gastos</th>
                <th className="border border-slate-200 p-2">Balance semanal</th>
                <th className="border border-slate-200 p-2">Fondo / dinero operativo</th>
              </tr>
            </thead>
            <tbody>
              {summary.tableRows.map((row) => (
                <tr key={row.id} className={row.block === 'current' ? 'bg-amber-50' : row.block === 'projection' ? 'bg-sky-50/50' : 'bg-white'}>
                  <th className="sticky left-0 z-10 border border-slate-200 bg-inherit p-2 text-left align-top">
                    <span className="block font-medium">{row.block === 'historical' ? 'Histórico real' : row.block === 'current' ? 'Semana actual parcial' : 'Proyección'}</span>
                    <span className="block">{row.label}</span>
                    <DateRange startDate={row.startDate} endDate={row.endDate} />
                  </th>
                  {summary.columns.map((column) => {
                    const cell = row.cells[column.columnId];
                    return <td key={`${row.id}-${column.columnId}`} className="min-w-48 border border-slate-200 p-2 align-top"><span className="font-medium">{formatCurrencyMXN(cell?.amount ?? 0)}</span>{cell && <ColumnCellDetail cell={cell} column={column} />}</td>;
                  })}
                  <td className="border border-slate-200 p-2 font-semibold">{formatCurrencyMXN(row.totalIncome)}</td>
                  <td className="border border-slate-200 p-2 font-semibold">{formatCurrencyMXN(row.totalExpense)}</td>
                  <td className="border border-slate-200 p-2 font-semibold">{formatCurrencyMXN(row.balance)}</td>
                  <td className="border border-slate-200 p-2 font-semibold">{formatCurrencyMXN(row.operationalMoney)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {summary.unclassified.length > 0 && (
        <Card>
          <h3 className="font-semibold">Sin clasificar</h3>
          <p className="mt-2 text-sm text-slate-600">Estas categorías principales tienen movimientos, no están asignadas a ninguna columna activa y no están marcadas como no proyectables.</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            {summary.unclassified.map((item) => <li key={item.category}>• {item.categoryName ?? item.category}: {formatCurrencyMXN(item.total)} ({item.movementCount} movimientos)</li>)}
          </ul>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold">Cómo se armó este escenario</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Columnas activas usadas: {summary.scenarioNotes.activeColumns}.</li>
          <li>Categorías asignadas: {summary.columns.map((column) => `${column.columnName}: ${column.categories.map((category) => category.name).join(', ') || 'sin categorías'}`).join(' · ')}.</li>
          <li>Semanas históricas válidas: {summary.scenarioNotes.validHistoricalWeeks}; cada una tiene ingresos y gastos mayores a cero.</li>
          <li>Semana actual excluida del promedio: {summary.scenarioNotes.currentWeekExcluded ? 'sí' : 'no'}.</li>
          <li>Categorías sin clasificar: {summary.scenarioNotes.unclassifiedCategories}.</li>
          <li>Categorías no proyectables ignoradas: {summary.scenarioNotes.ignoredNoProjectableCategories}.</li>
        </ul>
        {summary.excludedWeeks.length > 0 && <p className="mt-3 text-sm text-slate-500">Semanas excluidas por no tener ingresos y gastos: {summary.excludedWeeks.map((week) => `${week.startDate}→${week.endDate}`).join(', ')}.</p>}
      </Card>
    </AppShell>
  );
}
