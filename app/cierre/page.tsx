import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { buildPeriodClosureSummary } from '@/lib/financial/engine';

export default function CierrePage() {
  const texto = buildPeriodClosureSummary(8400, 8900, 9000);
  return (
    <AppShell title="Cierre de periodo">
      <Card>
        <h2 className="font-semibold">Resumen semanal / mensual</h2>
        <p className="mt-2">{texto}</p>
      </Card>
    </AppShell>
  );
}
