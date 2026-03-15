import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAccountsForRegistration, getRegistrationSetupStatus } from '@/lib/db/queries';

const labels: Record<string, string> = {
  operativa: 'Dinero operativo',
  fondo: 'Fondos',
  inversion: 'Inversiones',
  deuda: 'Deudas',
  por_cobrar: 'Por cobrar'
};

export default async function CuentasPage() {
  const setup = await getRegistrationSetupStatus();
  const accounts = await getAccountsForRegistration();

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

  const grouped = accounts.reduce<Record<string, string[]>>((acc, account) => {
    const label = labels[account.type] ?? account.type;
    acc[label] = [...(acc[label] ?? []), account.name];
    return acc;
  }, {});

  return (
    <AppShell title="Cuentas del hogar">
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(grouped).map(([tipo, cuentas]) => (
          <Card key={tipo}>
            <h2 className="font-semibold">{tipo}</h2>
            <ul className="mt-2 space-y-2 text-sm">{cuentas.map((c) => <li key={c}>• {c}</li>)}</ul>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
