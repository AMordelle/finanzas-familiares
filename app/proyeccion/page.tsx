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

      <section className="grid gap-3 md:grid-cols-2" aria-label="Tarjetas por columna">
        {summary.columns.map((column) => (
          <Card key={column.columnId}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{column.type === 'income' ? 'Ingreso' : 'Gasto'}</p>
            <h3 className="mt-1 font-semibold">{column.columnName}</h3>
            <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-slate-500">Promedio semanal</p><p className="font-semibold">{formatCurrencyMXN(column.averageWeekly)}</p></div>
              <div><p className="text-slate-500">Total histórico usado</p><p className="font-semibold">{formatCurrencyMXN(column.total)}</p></div>
              <div><p className="text-slate-500">Semanas usadas</p><p className="font-semibold">{column.weeksUsed}</p></div>
            </div>
            <p className="mt-3 text-sm text-slate-600">Categorías: {column.categories.length ? column.categories.map((category) => category.name).join(', ') : 'Sin categorías asignadas'}</p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-700">Resumen por subcategoría</summary>
              <div className="mt-2">
                {column.categoryBreakdown.length ? <CategoryBreakdownList column={column} /> : <p className="text-slate-600">Sin movimientos históricos válidos para esta columna.</p>}
              </div>
            </details>
          </Card>
        ))}
      </section>

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
