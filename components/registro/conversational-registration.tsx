'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { TransactionIntent } from '@/lib/ai/transactionInterpreter';
import type { AccountOption } from '@/lib/db/queries';
import { interpretTransactionAction, saveInterpretedTransactionAction } from '@/app/registro/actions';

type Props = {
  accounts: AccountOption[];
  hasHousehold: boolean;
};

const missingFieldQuestions: Record<string, string> = {
  sourceAccount: '¿De qué cuenta salió el dinero?',
  destinationAccount: '¿A qué cuenta entró el dinero?'
};

export function ConversationalRegistration({ accounts, hasHousehold }: Props) {
  const [input, setInput] = useState('');
  const [intent, setIntent] = useState<TransactionIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isSavingRef = useRef(false);

  const isReadyToConfirm = useMemo(() => intent && intent.missingFields.length === 0, [intent]);
  const hasAccounts = accounts.length > 0;

  if (!hasHousehold) {
    return (
      <Card>
        <h2 className="text-xl font-semibold">Registro conversacional</h2>
        <p className="mt-3 text-sm text-slate-700">
          Aún no has configurado tu hogar y tus cuentas. Primero completa la configuración inicial para poder registrar movimientos.
        </p>
        <div className="mt-4">
          <Button asChild>
            <Link href="/onboarding">Ir al onboarding</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const handleInterpret = () => {
    setSuccessMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const next = await interpretTransactionAction(input);
        setIntent(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo interpretar el movimiento.');
      }
    });
  };

  const handleMissingFieldChange = (field: 'sourceAccount' | 'destinationAccount', value: string) => {
    if (!intent) return;
    const updatedIntent: TransactionIntent = {
      ...intent,
      [field]: value,
      missingFields: intent.missingFields.filter((item) => item !== field)
    };
    setIntent(updatedIntent);
  };

  const handleSave = () => {
    if (!intent || intent.missingFields.length > 0 || isSavingRef.current) return;

    setError(null);
    isSavingRef.current = true;
    startTransition(async () => {
      try {
        const result = await saveInterpretedTransactionAction(intent);
        setInput('');
        setIntent(null);
        setSuccessMessage(result.message);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
      } finally {
        isSavingRef.current = false;
      }
    });
  };

  return (
    <Card>
      <h2 className="text-xl font-semibold">Escribe como hablas</h2>
      <p className="mt-2 text-slate-600">Ejemplos: “Gasté 600 en gasolina con efectivo”, “Pagué 1200 del súper con tarjeta”, “Recibí 3000 de tiempo extra”, “Presté 500 a Juan”.</p>

      <textarea
        className="mt-4 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm"
        value={input}
        placeholder="Describe tu movimiento en lenguaje natural"
        onChange={(event) => setInput(event.target.value)}
      />

      <div className="mt-4">
        <Button onClick={handleInterpret} disabled={isPending || !input.trim()}>
          {isPending ? 'Interpretando...' : 'Interpretar movimiento'}
        </Button>
      </div>

      {intent && intent.missingFields.length > 0 && (
        <div className="mt-6 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Faltan datos para completar el movimiento:</p>
          {!hasAccounts && (
            <div className="rounded-md border border-amber-300 bg-white p-3 text-sm text-slate-700">
              <p>No hay cuentas disponibles todavía. Configura tus cuentas en el onboarding.</p>
              <div className="mt-3">
                <Button asChild>
                  <Link href="/onboarding">Ir al onboarding</Link>
                </Button>
              </div>
            </div>
          )}
          {intent.missingFields.map((field) => (
            <label key={field} className="block text-sm text-slate-700">
              {missingFieldQuestions[field] ?? `Completa ${field}`}
              {hasAccounts ? (
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2"
                  defaultValue=""
                  onChange={(event) => handleMissingFieldChange(field as 'sourceAccount' | 'destinationAccount', event.target.value)}
                >
                  <option value="" disabled>
                    Selecciona una cuenta
                  </option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.name.toLowerCase()}>
                      {account.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </label>
          ))}
        </div>
      )}

      {isReadyToConfirm && intent && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">Confirmación</h3>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>Tipo de movimiento: {intent.action}</li>
            <li>Monto: ${intent.amount.toLocaleString('es-MX')}</li>
            <li>Descripción: {intent.description}</li>
            <li>Cuenta origen: {intent.sourceAccount ?? 'N/A'}</li>
            <li>Cuenta destino: {intent.destinationAccount ?? 'N/A'}</li>
            <li>Categoría: {intent.category}</li>
          </ul>
          <p className="mt-3 text-sm font-medium text-slate-900">{intent.humanConfirmation}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>{isPending ? 'Guardando...' : 'Confirmar'}</Button>
            <Button variant="outline" onClick={() => setIntent(null)} disabled={isPending}>Cancelar</Button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {successMessage && <p className="mt-4 text-sm text-emerald-700">{successMessage}</p>}
    </Card>
  );
}
