import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { buildCalendarPressureSummary } from '@/lib/financial/engine';

export default function CalendarioPage() {
  const resumen = buildCalendarPressureSummary(12000, 9000);
  return (
    <AppShell title="Calendario financiero">
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Modo demostración</p>
        <p className="mt-2">Próximos 7 días, próximas semanas y alertas del periodo.</p>
        <p className="mt-2 text-sm text-slate-600">Esta sección aún muestra una simulación fija y no está conectada al hogar persistido.</p>
        <p className="mt-3 text-slate-700">{resumen}</p>
      </Card>
    </AppShell>
  );
}
