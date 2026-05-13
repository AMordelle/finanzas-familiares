import React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getProjectionData } from '@/lib/db/queries';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

function signedMoney(value: number) {
  const formatted = formatCurrencyMXN(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function moneyClass(value: number) {
  if (value > 0) return 'text-emerald-700';
  if (value < 0) return 'text-red-700';
  return 'text-slate-700';
}

export default async function ProjectionPage() {
  const scenario = await getProjectionData();

  if (!scenario.hasHousehold) {
    return (
      <AppShell title="Proyección">
        <Card>
          <h2 className="text-xl font-semibold">Aún no tienes datos financieros</h2>
          <p className="mt-2 text-slate-600">Completa el onboarding para crear tu hogar, cuentas y movimientos antes de proyectar tu dinero operativo.</p>
          <div className="mt-4">
            <Button asChild>
              <Link href="/onboarding">Ir al onboarding</Link>
            </Button>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Proyección">
      <p className="mb-4 text-slate-700">Visualiza cómo podría evolucionar tu dinero operativo durante las próximas 12 semanas.</p>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Dinero operativo actual</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrencyMXN(scenario.dineroOperativoActual)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Proyección a 12 semanas</p>
          <p className={`mt-2 text-2xl font-semibold ${moneyClass(scenario.projectionAt12Weeks)}`}>{formatCurrencyMXN(scenario.projectionAt12Weeks)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Cambio proyectado</p>
          <p className={`mt-2 text-2xl font-semibold ${moneyClass(scenario.projectedChange)}`}>{signedMoney(scenario.projectedChange)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Balance semanal promedio</p>
          <p className={`mt-2 text-2xl font-semibold ${moneyClass(scenario.averageWeeklyBalance)}`}>{signedMoney(scenario.averageWeeklyBalance)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Semana más baja</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{scenario.lowestWeek ? `${scenario.lowestWeek.label}: ${formatCurrencyMXN(scenario.lowestWeek.dineroOperativoProyectado)}` : 'Sin datos'}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Tendencia</p>
          <p className={`mt-2 text-2xl font-semibold ${scenario.trend === 'positiva' ? 'text-emerald-700' : scenario.trend === 'negativa' ? 'text-red-700' : 'text-slate-700'}`}>{scenario.trend}</p>
        </Card>
      </section>

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tabla de 12 semanas</h2>
            <p className="text-sm text-slate-600">Columnas financieras agregadas; no se proyecta movimiento por movimiento.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1500px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="p-2">Semana</th>
                <th className="p-2 text-emerald-700">Nómina</th>
                <th className="p-2 text-emerald-700">Caja ahorro</th>
                <th className="p-2 text-emerald-700">Ingresos extra</th>
                <th className="p-2 text-emerald-700">Eventos extraordinarios</th>
                <th className="p-2 text-emerald-800">Total ingresos</th>
                <th className="p-2 text-amber-700">Gasto familiar fijo</th>
                <th className="p-2 text-amber-700">Gastos variables</th>
                <th className="p-2 text-amber-700">Servicios y suscripciones</th>
                <th className="p-2 text-amber-700">Deuda / tarjetas</th>
                <th className="p-2 text-amber-700">MSI / compras a meses</th>
                <th className="p-2 text-amber-700">Ahorro / inversión</th>
                <th className="p-2 text-amber-800">Total gastos</th>
                <th className="p-2">Balance semanal</th>
                <th className="p-2">Dinero operativo proyectado</th>
              </tr>
            </thead>
            <tbody>
              {scenario.weeks.map((week) => (
                <tr key={week.weekNumber} className="border-b last:border-0">
                  <td className="whitespace-nowrap p-2 font-medium text-slate-900">{week.label}<br /><span className="text-xs font-normal text-slate-500">{week.startDate} a {week.endDate}</span></td>
                  <td className="p-2 text-emerald-700">{formatCurrencyMXN(week.nomina)}</td>
                  <td className="p-2 text-emerald-700">{formatCurrencyMXN(week.cajaAhorro)}</td>
                  <td className="p-2 text-emerald-700">{formatCurrencyMXN(week.ingresosExtra)}</td>
                  <td className="p-2 text-emerald-700">{formatCurrencyMXN(week.eventosExtraordinarios)}</td>
                  <td className="p-2 font-semibold text-emerald-800">{formatCurrencyMXN(week.totalIngresos)}</td>
                  <td className="p-2 text-amber-700">{formatCurrencyMXN(week.gastoFamiliarFijo)}</td>
                  <td className="p-2 text-amber-700">{formatCurrencyMXN(week.gastosVariables)}</td>
                  <td className="p-2 text-amber-700">{formatCurrencyMXN(week.serviciosSuscripciones)}</td>
                  <td className="p-2 text-amber-700">{formatCurrencyMXN(week.deudaTarjetas)}</td>
                  <td className="p-2 text-amber-700">{formatCurrencyMXN(week.msiComprasMeses)}</td>
                  <td className="p-2 text-amber-700">{formatCurrencyMXN(week.ahorroInversion)}</td>
                  <td className="p-2 font-semibold text-amber-800">{formatCurrencyMXN(week.totalGastos)}</td>
                  <td className={`p-2 font-semibold ${moneyClass(week.balanceSemanal)}`}>{signedMoney(week.balanceSemanal)}</td>
                  <td className={`p-2 font-semibold ${week.dineroOperativoProyectado < 0 ? 'text-red-700' : 'text-slate-900'}`}>{formatCurrencyMXN(week.dineroOperativoProyectado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="text-lg font-semibold">Cómo se armó este escenario</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {scenario.explanations.map((explanation) => (
            <div key={explanation.key} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{explanation.label}</h3>
                <span className="whitespace-nowrap text-sm font-semibold text-slate-700">{formatCurrencyMXN(explanation.baseValue)}</span>
              </div>
              <p className="mt-2 text-sm text-slate-700">{explanation.criteria}</p>
              <p className="mt-2 text-xs text-slate-500">{explanation.estimated ? 'Estimado automáticamente para esta v1.' : 'No se promedia automáticamente.'}</p>
              {explanation.warning ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{explanation.warning}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
