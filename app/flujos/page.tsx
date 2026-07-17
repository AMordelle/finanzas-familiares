import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FlowsManager } from '@/components/flujos/flows-manager';
import { getFlowsData } from '@/lib/flows/service';

export default async function FlujosPage() {
  const data = await getFlowsData();
  if (!data.hasHousehold) return <AppShell title="Flujos"><Card><h2 className="font-semibold">Primero configura tu hogar</h2><p className="mt-2 text-sm text-slate-600">Los fondos virtuales necesitan cuentas de un hogar.</p><Button asChild className="mt-4"><Link href="/onboarding">Ir al onboarding</Link></Button></Card></AppShell>;
  return <AppShell title="Flujos"><FlowsManager initialData={data} /></AppShell>;
}
