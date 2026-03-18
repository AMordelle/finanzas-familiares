import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccountsManager } from '@/components/cuentas/accounts-manager';
import { getAccountsForManagement, getRegistrationSetupStatus } from '@/lib/db/queries';

export default async function CuentasPage() {
  const setup = await getRegistrationSetupStatus();
  const accounts = await getAccountsForManagement();

  if (!setup.hasHousehold) {
    return (
      <AppShell title="Cuentas del hogar">
        <Card>
          <h2 className="font-semibold">Primero configura tu hogar</h2>
          <p className="mt-2 text-sm text-slate-700">Aún no hay cuentas registradas. Completa onboarding para crear tus cuentas iniciales.</p>
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
    <AppShell title="Cuentas del hogar">
      <AccountsManager accounts={accounts} />
    </AppShell>
  );
}
