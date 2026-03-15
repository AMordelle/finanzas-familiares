import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { buildLocalInterpretation } from '@/lib/ai/transactionInterpreter';

export default function RegistroPage() {
  const ejemplo = buildLocalInterpretation('Gasté 600 en gasolina');

  return (
    <AppShell title="Registro conversacional">
      <Card>
        <h2 className="text-xl font-semibold">Escribe como hablas</h2>
        <p className="mt-2 text-slate-600">Ejemplo: “Gasté 600 en gasolina con efectivo”.</p>
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
          <p className="font-medium">Interpretación JSON (demo):</p>
          <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(ejemplo, null, 2)}</pre>
        </div>
      </Card>
    </AppShell>
  );
}
