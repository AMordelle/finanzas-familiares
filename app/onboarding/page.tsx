import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { hasOnboardingForActiveProfile } from '@/lib/db/queries';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export default async function OnboardingPage() {
  const alreadyConfigured = await hasOnboardingForActiveProfile();

  return (
    <AppShell title="Onboarding inicial">
      {alreadyConfigured ? (
        <Card>
          <h2 className="text-xl font-semibold">Ya tienes un hogar configurado</h2>
          <p className="mt-2 text-slate-600">Tu base financiera inicial ya existe. Puedes continuar al dashboard para revisar indicadores y registrar movimientos.</p>
          <div className="mt-4">
            <Button asChild>
              <Link href="/dashboard">Ir al dashboard</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <OnboardingWizard />
      )}
    </AppShell>
  );
}
