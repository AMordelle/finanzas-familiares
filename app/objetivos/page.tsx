import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { calculateGoalProgressStatus, calculateGoalSuggestedSaving } from '@/lib/financial/engine';

export default function ObjetivosPage() {
  const goal = { name: 'Boda primo', targetAmount: 6000, savedAmount: 2100, targetDate: '2026-12-15' };
  return (
    <AppShell title="Objetivos financieros">
      <Card>
        <h2 className="font-semibold">{goal.name}</h2>
        <p className="mt-2 text-sm">Ahorro sugerido semanal: ${calculateGoalSuggestedSaving(goal)}</p>
        <p className="text-sm">Estado: {calculateGoalProgressStatus(goal)}</p>
      </Card>
    </AppShell>
  );
}
