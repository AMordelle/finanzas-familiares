import { AppShell } from '@/components/app-shell';
import { MetricCard } from '@/components/metric-card';
import { Card } from '@/components/ui/card';
import { buildRecommendations, buildTopDiagnoses, calculateAvailableMoney, calculateMonthlyOFH, calculateWeeklyOFH } from '@/lib/financial/engine';

export default function DashboardPage() {
  const input = {
    fixedExpenses: 18000,
    avgVariableExpenses: 9000,
    debtPayments: 3500,
    periodicExpensesMonthlyEquivalent: 1200,
    safetyMarginPct: 10,
    regularIncomeMonthly: 30000,
    annualExtraIncome: 36000,
    operativeMoney: 22000,
    liquidFunds: 15000,
    liquidInvestments: 18000,
    debtBalance: 85000,
    totalFixedExpenses: 18000,
    variableSeries: [6200, 7100, 8400, 9800],
    reservesUsageLastMonth: 1200
  };

  const ofh = calculateMonthlyOFH(input);
  const semanal = calculateWeeklyOFH(ofh);
  const disponible = calculateAvailableMoney(input.operativeMoney);
  const diagnosticos = buildTopDiagnoses(input);
  const recomendaciones = buildRecommendations(diagnosticos);

  return (
    <AppShell title="Dashboard principal">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard label="OFH mensual" value={`$${ofh.toLocaleString('es-MX')}`} />
        <MetricCard label="Objetivo semanal" value={`$${semanal.toLocaleString('es-MX')}`} />
        <MetricCard label="Dinero disponible hoy" value={`$${disponible.toLocaleString('es-MX')}`} />
      </section>
      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="font-semibold">Diagnósticos prioritarios</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">{diagnosticos.map((d) => <li key={d}>• {d}</li>)}</ul>
        </Card>
        <Card>
          <h3 className="font-semibold">Recomendaciones</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">{recomendaciones.map((r) => <li key={r}>• {r}</li>)}</ul>
        </Card>
      </section>
    </AppShell>
  );
}
