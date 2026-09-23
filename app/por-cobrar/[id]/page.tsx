import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export default async function PorCobrarDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell title="Detalle de por cobrar">
      <Card>
        <p className="text-sm text-slate-600">Por cobrar ID: {id}</p>
        <p className="mt-2">Soporta pagos parciales, saldo pendiente y marcar incobrable.</p>
      </Card>
    </AppShell>
  );
}
