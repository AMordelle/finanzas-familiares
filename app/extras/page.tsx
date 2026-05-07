import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ExtrasManager } from '@/components/extras/extras-manager';
import { getPendingExtraWorkEntries } from '@/lib/db/queries';

export default async function ExtrasPage() {
  const data = await getPendingExtraWorkEntries();

  if (!data.hasHousehold) {
    return (
      <AppShell title="Extras">
        <Card>
          <h2 className="font-semibold">Primero configura tu hogar</h2>
          <p className="mt-2 text-sm text-slate-700">Necesitas un hogar activo para registrar tiempos extra y destajos pendientes de pago.</p>
          <div className="mt-4">
            <Button asChild>
              <Link href="/onboarding">Ir al onboarding</Link>
            </Button>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Extras">
      <ExtrasManager initialData={data} />
    </AppShell>
  );
}
