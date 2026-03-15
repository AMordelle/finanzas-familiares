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
        <h2 className="font-semibold">Escenarios</h2>
        <p className="mt-2 text-sm text-slate-600">Pagar deuda, fortalecer fondo, guardar efectivo, estrategia mixta y apartar meta.</p>
        <p className="mt-4">{mensaje}</p>
      </Card>
    </AppShell>
  );
}
