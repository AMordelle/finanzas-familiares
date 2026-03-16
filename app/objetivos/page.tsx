import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { calculateGoalProgressStatus, calculateGoalSuggestedSaving } from '@/lib/financial/engine';

export default function ObjetivosPage() {
  const goal = { name: 'Boda primo', targetAmount: 6000, savedAmount: 2100, targetDate: '2026-12-15' };
  return (
    <AppShell title="Objetivos financieros">
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Modo demostración</p>
        <h2 className="mt-2 font-semibold">{goal.name}</h2>
        <p className="mt-2 text-sm text-slate-600">Este módulo sigue en placeholder y todavía no usa metas persistidas del hogar.</p>
        <p className="mt-3 text-sm">Ahorro sugerido semanal: ${calculateGoalSuggestedSaving(goal)}</p>
        <p className="text-sm">Estado: {calculateGoalProgressStatus(goal)}</p>
      </Card>
    </AppShell>
  );
}
