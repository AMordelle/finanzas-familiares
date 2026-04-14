import React from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { MetricCard } from '@/components/metric-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDashboardData } from '@/lib/db/queries';
import { FinancialRadarCard } from '@/components/dashboard/financial-radar-card';

const statusLabelMap = {
  healthy: 'Saludable',
  warning: 'Atención',
  critical: 'Crítico'
} as const;

export default async function DashboardPage() {
  const data = await getDashboardData();
  const monthlyOFH = Number.isFinite(Number(data.monthlyOFH)) ? Number(data.monthlyOFH) : 0;
  const weeklyOFH = Number.isFinite(Number(data.weeklyOFH)) ? Number(data.weeklyOFH) : 0;
  const availableMoney = Number.isFinite(Number(data.availableMoney)) ? Number(data.availableMoney) : 0;
  const diagnoses = Array.isArray(data.diagnoses) ? data.diagnoses : [];
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
  const financialPressure = data.financialPressure;
  const financialInsight = data.financialInsight;
  const financialRadar = data.financialRadar;
  const hasCoverage = financialPressure ? financialPressure.gap <= 0 : false;
  const absoluteGap = financialPressure ? Math.abs(financialPressure.gap) : 0;
  const breakdown = financialPressure?.breakdown;

  if (!data.hasHousehold) {
    return (
      <AppShell title="Dashboard principal">
        <Card>
          <h2 className="text-xl font-semibold">Aún no tienes datos financieros</h2>
          <p className="mt-2 text-slate-600">Completa el onboarding para crear tu hogar, cuentas e indicadores iniciales.</p>
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
    <AppShell title="Dashboard principal">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="OFH mensual" value={`$${monthlyOFH.toLocaleString('es-MX')}`} />
        <MetricCard label="Objetivo semanal" value={`$${weeklyOFH.toLocaleString('es-MX')}`} />
        <MetricCard label="Dinero disponible hoy" value={`$${availableMoney.toLocaleString('es-MX')}`} />
      </section>
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        {financialRadar ? <FinancialRadarCard radar={financialRadar} /> : null}
        {financialPressure ? (
          <Card>
            <h3 className="font-semibold">Estado financiero actual</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p><span className="font-medium text-slate-900">Dinero necesario hoy:</span> ${financialPressure.requiredMoney.toLocaleString('es-MX')}</p>
              <p><span className="font-medium text-slate-900">Dinero disponible:</span> ${financialPressure.availableMoney.toLocaleString('es-MX')}</p>
              <p className={hasCoverage ? 'text-emerald-700' : 'text-rose-700'}>
                <span className="font-medium">Brecha actual:</span>{' '}
                {hasCoverage ? `Estás cubierto. Te sobran $${absoluteGap.toLocaleString('es-MX')}.` : `Te faltan $${absoluteGap.toLocaleString('es-MX')}.`}
              </p>
              <p>
                <span className="font-medium text-slate-900">Estado:</span> {statusLabelMap[financialPressure.status]}
              </p>
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium text-slate-900">¿De dónde sale este cálculo?</p>
              <div className="mt-2 space-y-1">
                <p><span className="font-medium text-slate-900">Deudas próximas:</span> ${Number(breakdown?.debts ?? 0).toLocaleString('es-MX')}</p>
                <p><span className="font-medium text-slate-900">Gastos fijos próximos:</span> ${Number(breakdown?.fixedExpenses ?? 0).toLocaleString('es-MX')}</p>
                <p><span className="font-medium text-slate-900">Gasto operativo estimado:</span> ${Number(breakdown?.operationalEstimate ?? 0).toLocaleString('es-MX')}</p>
              </div>
              <p className="mt-2 text-xs text-slate-600">Dinero necesario hoy = deudas + gastos fijos + gasto operativo estimado</p>
            </div>
            </div>
          </Card>
        ) : null}
        {financialInsight ? (
          <Card>
            <h3 className="font-semibold">Explicación financiera</h3>
            <p className="mt-3 text-sm text-slate-700">{financialInsight.explanation}</p>
            <h4 className="mt-4 text-sm font-semibold text-slate-900">Qué está causando presión</h4>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {(financialInsight.topCauses.length ? financialInsight.topCauses : ['Sin causas prioritarias detectadas']).map((cause) => <li key={cause}>• {cause}</li>)}
            </ul>
            <h4 className="mt-4 text-sm font-semibold text-slate-900">Qué hacer primero</h4>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {(financialInsight.suggestions.length ? financialInsight.suggestions : ['Sin sugerencias disponibles']).map((suggestion) => <li key={suggestion}>• {suggestion}</li>)}
            </ul>
          </Card>
        ) : null}
        <Card>
          <h3 className="font-semibold">Diagnósticos prioritarios</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">{(diagnoses.length ? diagnoses : ['Sin diagnósticos por ahora']).map((d) => <li key={d}>• {d}</li>)}</ul>
        </Card>
        <Card>
          <h3 className="font-semibold">Recomendaciones</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">{(recommendations.length ? recommendations : ['Sin recomendaciones por ahora']).map((r) => <li key={r}>• {r}</li>)}</ul>
        </Card>
      </section>
    </AppShell>
  );
}
