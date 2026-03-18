import { AppShell } from '@/components/app-shell';
import { MovementsHistoryList } from '@/components/movimientos/movements-history-list';
import { Card } from '@/components/ui/card';
import { getAccountsForRegistration, getMovementsHistory } from '@/lib/db/queries';

export default async function MovimientosPage() {
  const { hasHousehold, movements } = await getMovementsHistory();
  const accounts = hasHousehold ? await getAccountsForRegistration() : [];

  if (!hasHousehold) {
    return (
      <AppShell title="Movimientos">
        <Card>
          <h2 className="font-semibold">Aún no hay historial disponible</h2>
          <p className="mt-2 text-sm text-slate-600">Completa onboarding y registra movimientos para ver tu historial aquí.</p>
        </Card>
      </AppShell>
    );
  }

  if (!movements.length) {
    return (
      <AppShell title="Movimientos">
        <Card>
          <h2 className="font-semibold">Todavía no hay movimientos</h2>
          <p className="mt-2 text-sm text-slate-600">Cuando registres tu primer ingreso, gasto o transferencia en Registro, aparecerá en este historial.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Movimientos">
      <Card>
        <h2 className="font-semibold">Historial cronológico</h2>
        <p className="mt-2 text-sm text-slate-600">Movimientos reales guardados, del más reciente al más antiguo.</p>
      </Card>

      <MovementsHistoryList movements={movements} accounts={accounts} />
    </AppShell>
  );
}
