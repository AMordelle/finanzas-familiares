import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

const grupos = {
  'Dinero operativo': ['Efectivo', 'Cuenta BBVA'],
  Fondos: ['Fondo de emergencia'],
  Inversiones: ['CETES hogar'],
  Deudas: ['Tarjeta BBVA', 'Crédito auto'],
  'Por cobrar': ['Préstamo a Juan']
};

export default function CuentasPage() {
  return (
    <AppShell title="Cuentas del hogar">
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(grupos).map(([tipo, cuentas]) => (
          <Card key={tipo}>
            <h2 className="font-semibold">{tipo}</h2>
            <ul className="mt-2 space-y-2 text-sm">{cuentas.map((c) => <li key={c}>• {c}</li>)}</ul>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
