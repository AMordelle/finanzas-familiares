import { AppShell } from '@/components/app-shell';
import { ConversationalRegistration } from '@/components/registro/conversational-registration';
import { getRegistrationSetupStatus } from '@/lib/db/queries';

export default async function RegistroPage() {
  const setup = await getRegistrationSetupStatus();

  return (
    <AppShell title="Registro conversacional">
      <ConversationalRegistration accounts={setup.accounts} hasHousehold={setup.hasHousehold} />
    </AppShell>
  );
}
