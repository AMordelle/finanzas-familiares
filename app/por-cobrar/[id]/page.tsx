import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export default function PorCobrarDetallePage({ params }: { params: { id: string } }) {
  return (
    <AppShell title="Detalle de por cobrar">
      <Card>
        <p className="text-sm text-slate-600">Por cobrar ID: {params.id}</p>
        <p className="mt-2">Soporta pagos parciales, saldo pendiente y marcar incobrable.</p>
      </Card>
    </AppShell>
  );
}
