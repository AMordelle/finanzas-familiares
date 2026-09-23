import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export default async function DeudaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell title="Detalle de deuda">
      <Card>
        <p className="text-sm text-slate-600">Deuda ID: {id}</p>
        <p className="mt-2">Incluye saldo, pagos próximos y presión en calendario.</p>
      </Card>
    </AppShell>
  );
}
