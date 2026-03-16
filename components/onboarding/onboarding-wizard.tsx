'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { submitOnboardingAction } from '@/app/onboarding/actions';
import { onboardingPayloadSchema, type OnboardingPayload } from '@/lib/onboarding/flow';

type Item = Record<string, string | number>;

const emptyPayload: OnboardingPayload = {
  householdName: '',
  householdType: 'solo',
  regularIncomes: [{ nombre: '', monto: 0, periodicidad: 'mensual' }],
  extraordinaryIncomes: [],
  operationalAccounts: [{ nombre: '', saldoInicial: 0 }],
  fundAccounts: [],
  debtAccounts: [],
  receivables: [],
  fixedExpenses: [],
  variableSpending: []
};

const periodicidades = ['semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual'] as const;

export function OnboardingWizard() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<OnboardingPayload>(emptyPayload);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const title = useMemo(() => {
    const map: Record<number, string> = {
      1: 'Hogar',
      2: 'Ingresos regulares',
      3: 'Ingresos extraordinarios',
      4: 'Cuentas y dinero disponible',
      5: 'Fondos e inversiones',
      6: 'Deudas',
      7: 'Por cobrar',
      8: 'Gastos fijos',
      9: 'Gastos variables estimados',
      10: 'Resumen inicial'
    };
    return map[step];
  }, [step]);

  const appendRow = (key: keyof OnboardingPayload, item: Item) => {
    setForm((prev) => ({ ...prev, [key]: [...(prev[key] as any[]), item] }));
  };

  const updateRow = (key: keyof OnboardingPayload, index: number, field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: (prev[key] as any[]).map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: field.includes('monto') || field.includes('saldo') || field.includes('pago') || field === 'mesEsperado' || field === 'diaPago' ? Number(value || 0) : value } : row))
    }));
  };

  const removeRow = (key: keyof OnboardingPayload, index: number) => {
    setForm((prev) => ({ ...prev, [key]: (prev[key] as any[]).filter((_, rowIndex) => rowIndex !== index) }));
  };

  const next = () => {
    setError(null);
    if (step < 10) setStep((current) => current + 1);
  };

  const back = () => {
    setError(null);
    if (step > 1) setStep((current) => current - 1);
  };

  const finish = () => {
    setError(null);
    startTransition(async () => {
      try {
        const parsed = onboardingPayloadSchema.parse(form);
        await submitOnboardingAction(parsed);
        router.push('/dashboard');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No fue posible guardar el onboarding.');
      }
    });
  };

  return (
    <Card>
      <p className="text-sm text-slate-500">Paso {Math.min(step, 9)} de 9</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      {step === 1 && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-700">¿Para quién quieres llevar las finanzas?</p>
          <div className="grid gap-2 md:grid-cols-3">
            {[
              { value: 'solo', label: 'Solo para mí' },
              { value: 'pareja', label: 'Para mí y mi pareja' },
              { value: 'familia', label: 'Para mi familia' }
            ].map((option) => (
              <button key={option.value} type="button" className={`rounded-lg border p-3 text-left ${form.householdType === option.value ? 'border-teal-600 bg-teal-50' : 'border-slate-200'}`} onClick={() => setForm((prev) => ({ ...prev, householdType: option.value as any }))}>
                {option.label}
              </button>
            ))}
          </div>
          <label className="block text-sm">Nombre del hogar
            <input className="mt-1 w-full rounded-md border border-slate-300 p-2" value={form.householdName} onChange={(event) => setForm((prev) => ({ ...prev, householdName: event.target.value }))} />
          </label>
        </div>
      )}

      {step >= 2 && step <= 9 && (
        <StepRows step={step} form={form} appendRow={appendRow} updateRow={updateRow} removeRow={removeRow} />
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex gap-2">
        {step > 1 && step <= 9 && <Button variant="outline" onClick={back} disabled={isPending}>Anterior</Button>}
        {step < 9 && <Button onClick={next} disabled={isPending}>Continuar</Button>}
        {step === 9 && <Button onClick={finish} disabled={isPending}>Finalizar onboarding</Button>}
      </div>
    </Card>
  );
}

function StepRows({ step, form, appendRow, updateRow, removeRow }: any) {
  const config: Record<number, { key: keyof OnboardingPayload; fields: string[]; labels: Record<string, string>; addLabel: string; optional?: boolean }> = {
    2: { key: 'regularIncomes', fields: ['nombre', 'monto', 'periodicidad'], labels: { nombre: 'Nombre', monto: 'Monto aproximado', periodicidad: 'Periodicidad' }, addLabel: 'Agregar ingreso regular' },
    3: { key: 'extraordinaryIncomes', fields: ['nombre', 'monto', 'mesEsperado'], labels: { nombre: 'Nombre', monto: 'Monto aproximado', mesEsperado: 'Mes esperado (1-12)' }, addLabel: 'Agregar ingreso extraordinario', optional: true },
    4: { key: 'operationalAccounts', fields: ['nombre', 'saldoInicial'], labels: { nombre: 'Nombre de cuenta', saldoInicial: 'Saldo inicial (opcional)' }, addLabel: 'Agregar cuenta operativa' },
    5: { key: 'fundAccounts', fields: ['nombre', 'saldoInicial'], labels: { nombre: 'Nombre de fondo/cuenta', saldoInicial: 'Saldo (opcional)' }, addLabel: 'Agregar fondo o inversión', optional: true },
    6: { key: 'debtAccounts', fields: ['nombre', 'saldoInicial', 'pagoPeriodico', 'diaPago'], labels: { nombre: 'Nombre de deuda', saldoInicial: 'Saldo aproximado', pagoPeriodico: 'Pago periódico', diaPago: 'Fecha de pago (opcional)' }, addLabel: 'Agregar deuda', optional: true },
    7: { key: 'receivables', fields: ['nombre', 'contraparte', 'monto'], labels: { nombre: 'Nombre', contraparte: 'Contraparte', monto: 'Monto pendiente' }, addLabel: 'Agregar por cobrar', optional: true },
    8: { key: 'fixedExpenses', fields: ['nombre', 'monto', 'periodicidad'], labels: { nombre: 'Nombre', monto: 'Monto', periodicidad: 'Periodicidad' }, addLabel: 'Agregar gasto fijo', optional: true },
    9: { key: 'variableSpending', fields: ['nombre', 'monto'], labels: { nombre: 'Nombre', monto: 'Monto mensual estimado' }, addLabel: 'Agregar gasto variable', optional: true }
  };

  const current = config[step];
  const rows = form[current.key] as any[];

  return (
    <div className="mt-4 space-y-3">
      {current.optional && <p className="text-sm text-slate-500">Este paso es opcional.</p>}
      {rows.length === 0 && <p className="text-sm text-slate-500">Sin registros aún.</p>}
      {rows.map((row, index) => (
        <div key={`${current.key}-${index}`} className="rounded-lg border border-slate-200 p-3">
          <div className="grid gap-2 md:grid-cols-2">
            {current.fields.map((field) => (
              <label key={field} className="text-sm">
                {current.labels[field]}
                {field === 'periodicidad' ? (
                  <select className="mt-1 w-full rounded-md border border-slate-300 p-2" value={row[field] ?? 'mensual'} onChange={(event) => updateRow(current.key, index, field, event.target.value)}>
                    {periodicidades.map((periodicidad) => <option key={periodicidad} value={periodicidad}>{periodicidad}</option>)}
                  </select>
                ) : (
                  <input className="mt-1 w-full rounded-md border border-slate-300 p-2" type={field === 'nombre' || field === 'contraparte' ? 'text' : 'number'} min={0} value={row[field] ?? ''} onChange={(event) => updateRow(current.key, index, field, event.target.value)} />
                )}
              </label>
            ))}
          </div>
          <button type="button" className="mt-2 text-xs text-red-600" onClick={() => removeRow(current.key, index)}>Eliminar</button>
        </div>
      ))}
      <Button type="button" variant="outline" onClick={() => appendRow(current.key, Object.fromEntries(current.fields.map((field) => [field, field === 'periodicidad' ? 'mensual' : field === 'nombre' || field === 'contraparte' ? '' : 0])))}>
        {current.addLabel}
      </Button>
    </div>
  );
}
