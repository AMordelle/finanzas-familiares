import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { getMovementsHistory } from '@/lib/db/queries';

function formatMoney(amount: number) {
  return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default async function MovimientosPage() {
  const { hasHousehold, movements } = await getMovementsHistory();

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

      <div className="mt-4 space-y-3">
        {movements.map((movement) => (
          <Card key={movement.id}>
            <div className="flex flex-col gap-2 text-sm text-slate-700 md:flex-row md:items-start md:justify-between">
              <div>
                <p><span className="font-semibold">Fecha:</span> {formatDate(movement.fecha)}</p>
                <p><span className="font-semibold">Tipo de movimiento:</span> {movement.tipoMovimiento}</p>
                <p><span className="font-semibold">Descripción:</span> {movement.descripcion}</p>
                <p><span className="font-semibold">Cuenta origen:</span> {movement.cuentaOrigen ?? 'N/A'}</p>
                <p><span className="font-semibold">Cuenta destino:</span> {movement.cuentaDestino ?? 'N/A'}</p>
              </div>
              <p className="text-base font-semibold text-slate-900">{formatMoney(movement.monto)}</p>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
