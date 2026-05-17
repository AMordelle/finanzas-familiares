import { AppShell } from '@/components/app-shell';
import { ConfigurationManager } from '@/components/configuracion/configuration-manager';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getConfigurationData } from '@/lib/db/queries';

export default async function ConfiguracionPage() {
  const data = await getConfigurationData();

  if (!data.hasHousehold) {
    return (
      <AppShell title="Configuración">
        <Card>
          <h2 className="font-semibold">Primero configura tu hogar</h2>
          <p className="mt-2 text-sm text-slate-600">Necesitas un hogar activo para definir categorías y columnas de Proyección.</p>
          <Button asChild className="mt-4"><Link href="/onboarding">Ir al onboarding</Link></Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Configuración">
      <ConfigurationManager data={data} />
    </AppShell>
  );
}
