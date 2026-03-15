import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export default function MovimientosPage() {
  return (
    <AppShell title="Movimientos">
      <Card>
        <h2 className="font-semibold">Historial cronológico</h2>
        <p className="mt-2 text-sm text-slate-600">Filtros: todos, ingresos, gastos, deudas, transferencias, por cobrar.</p>
      </Card>
    </AppShell>
  );
}
