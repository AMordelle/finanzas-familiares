import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export default function OnboardingPage() {
  const pasos = [
    'Entender tu hogar y miembros',
    'Ingresos regulares y extraordinarios',
    'Cuentas y saldos aproximados',
    'Deudas y dinero por cobrar',
    'Gastos fijos y variables estimados'
  ];

  return (
    <AppShell title="Onboarding inicial">
      <Card>
        <h2 className="text-xl font-semibold">Configuración guiada del hogar</h2>
        <p className="mt-2 text-slate-600">Puedes usar montos aproximados, cero o registrar después.</p>
        <ol className="mt-4 space-y-2 text-sm">
          {pasos.map((paso, i) => (
            <li key={paso} className="rounded-lg bg-slate-50 p-3">{i + 1}. {paso}</li>
          ))}
        </ol>
      </Card>
    </AppShell>
  );
}
