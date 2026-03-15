import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export default function DeudaDetallePage({ params }: { params: { id: string } }) {
  return (
    <AppShell title="Detalle de deuda">
      <Card>
        <p className="text-sm text-slate-600">Deuda ID: {params.id}</p>
        <p className="mt-2">Incluye saldo, pagos próximos y presión en calendario.</p>
      </Card>
    </AppShell>
  );
}
