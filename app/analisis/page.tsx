import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { financialNarrator } from '@/lib/ai/financialNarrator';

export default function AnalisisPage() {
  const texto = financialNarrator({
    ofh: 35000,
    availableMoney: 22000,
    diagnoses: ['Consumo de reservas', 'Gasto variable en aumento']
  });

  return (
    <AppShell title="Análisis y asistente financiero">
      <Card>
        <h2 className="font-semibold">Resumen general</h2>
        <p className="mt-3 text-slate-700">{texto}</p>
      </Card>
    </AppShell>
  );
}
