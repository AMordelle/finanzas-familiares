import { AppShell } from '@/components/app-shell';
import { MsiManager } from '@/components/msi/msi-manager';
import { getMsiPurchases } from '@/lib/db/queries';

export default async function MsiPage() {
  const data = await getMsiPurchases();

  return (
    <AppShell title="Compras MSI">
      <div className="mb-6">
        <p className="text-muted-foreground">Controla tus compras a meses sin intereses y los pagos pendientes.</p>
      </div>
      <MsiManager initialData={data} />
    </AppShell>
  );
}
