import { AppShell } from '@/components/app-shell';
import { ConversationalRegistration } from '@/components/registro/conversational-registration';
import { getAccountsForRegistration } from '@/lib/db/queries';

export default async function RegistroPage() {
  const accounts = await getAccountsForRegistration();

  return (
    <AppShell title="Registro conversacional">
      <ConversationalRegistration accounts={accounts} />
    </AppShell>
  );
}
