import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { MetricCard } from '@/components/metric-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getDashboardData } from '@/lib/db/queries';

export default async function DashboardPage() {
  const data = await getDashboardData();
  const monthlyOFH = Number.isFinite(Number(data.monthlyOFH)) ? Number(data.monthlyOFH) : 0;
  const weeklyOFH = Number.isFinite(Number(data.weeklyOFH)) ? Number(data.weeklyOFH) : 0;
  const availableMoney = Number.isFinite(Number(data.availableMoney)) ? Number(data.availableMoney) : 0;
  const diagnoses = Array.isArray(data.diagnoses) ? data.diagnoses : [];
  const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];

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
