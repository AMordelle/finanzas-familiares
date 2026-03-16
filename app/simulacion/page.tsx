import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { simulationExplainer } from '@/lib/ai/simulationExplainer';

export default function SimulacionPage() {
  const mensaje = simulationExplainer({
    strategy: 'mixta',
    mrfBefore: 1.8,
    mrfAfter: 2.4,
    debtPressureBefore: 0.22,
    debtPressureAfter: 0.17
  });

  return (
    <AppShell title="Simulador financiero">
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Modo demostración</p>
        <h2 className="mt-2 font-semibold">Escenarios</h2>
        <p className="mt-2 text-sm text-slate-600">Esta sección todavía usa datos de ejemplo y no refleja datos persistidos del hogar.</p>
        <p className="mt-4">{mensaje}</p>
      </Card>
    </AppShell>
  );
}
