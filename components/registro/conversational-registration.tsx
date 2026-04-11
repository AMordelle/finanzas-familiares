'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { applyFollowUpAnswer, type TransactionIntent } from '@/lib/ai/transactionInterpreter';
import type { AccountOption } from '@/lib/db/queries';
import { interpretTransactionAction, saveInterpretedTransactionAction } from '@/app/registro/actions';

type Props = {
  accounts: AccountOption[];
  hasHousehold: boolean;
};

const missingFieldQuestions: Record<string, string> = {
  sourceAccount: '¿De qué cuenta salió el dinero?',
  destinationAccount: '¿A qué cuenta entró el dinero?',
  debtAccount: '¿A qué tarjeta o préstamo pagaste?'
};

export function ConversationalRegistration({ accounts, hasHousehold }: Props) {
  const [input, setInput] = useState('');
  const [intent, setIntent] = useState<TransactionIntent | null>(null);
  const [followUpValue, setFollowUpValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isSavingRef = useRef(false);

  const isCreditExpenseSourceInvalid = useMemo(
    () => !!intent && intent.intent === 'expense_debt_account' && intent.sourceAccountType !== 'credit_card',
    [intent]
  );
  const isReadyToConfirm = useMemo(
    () => !!intent && intent.missingFieldKinds.length === 0 && !isCreditExpenseSourceInvalid,
    [intent, isCreditExpenseSourceInvalid]
  );
  const hasAccounts = accounts.length > 0;

  if (!hasHousehold) {
    return <Card><h2 className="text-xl font-semibold">Registro conversacional</h2><p className="mt-3 text-sm text-slate-700">Aún no has configurado tu hogar y tus cuentas. Primero completa la configuración inicial para poder registrar movimientos.</p><div className="mt-4"><Button asChild><Link href="/onboarding">Ir al onboarding</Link></Button></div></Card>;
  }

  const handleInterpret = () => {
    setSuccessMessage(null);
    setError(null);
    setFollowUpValue('');
    startTransition(async () => {
      try {
        const next = await interpretTransactionAction(input);
        setIntent(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo interpretar el movimiento.');
      }
    });
  };

  const handleMissingFieldApply = () => {
    if (!intent || !followUpValue.trim()) return;
    startTransition(async () => {
      const resolved = await applyFollowUpAnswer(intent, followUpValue.trim(), accounts);
      setIntent(resolved);
      setFollowUpValue('');
    });
  };

  const allowedAccounts = useMemo(() => {
    if (!intent?.nextPromptAllowedAccountTypes) return accounts;
    const normalizeType = (type: string) => {
      if (type === 'deuda') return 'credit_card';
      if (type === 'fondo') return 'savings_fund';
      if (type === 'inversion') return 'investment';
      if (type === 'por_cobrar') return 'receivable';
      return type;
    };
    const filtered = accounts.filter((account) => intent.nextPromptAllowedAccountTypes?.includes(normalizeType(account.type) as never));
    const needsCreditCardSelector = intent.nextPromptAllowedAccountTypes.includes('credit_card');
    if (needsCreditCardSelector && filtered.length === 0) {
      const fallbackCreditCards = accounts.filter((account) => normalizeType(account.type) === 'credit_card' || account.type === 'deuda');
      if (fallbackCreditCards.length > 0) return fallbackCreditCards;
    }
    return filtered;
  }, [accounts, intent]);

  const handleSave = () => {
    if (!intent || intent.missingFieldKinds.length > 0 || isCreditExpenseSourceInvalid || isSavingRef.current) return;
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
      <textarea className="mt-4 min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" value={input} placeholder="Describe tu movimiento en lenguaje natural" onChange={(event) => setInput(event.target.value)} />
      <div className="mt-4"><Button onClick={handleInterpret} disabled={isPending || !input.trim()}>{isPending ? 'Interpretando...' : 'Interpretar movimiento'}</Button></div>

      {intent && intent.missingFieldKinds.length > 0 && (
        <div className="mt-6 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Faltan datos para completar el movimiento:</p>
          <p className="text-sm text-slate-700">{intent.nextPrompt ?? missingFieldQuestions[intent.missingFields[0] ?? 'sourceAccount']}</p>
          {intent.nextPromptInputType === 'guided_choice' && (
            <select className="w-full rounded-md border border-slate-300 bg-white p-2" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)}>
              <option value="">Selecciona una opción</option>
              <option value="tarjeta">Una tarjeta</option>
              <option value="prestamo">Un préstamo</option>
              <option value="gasto">Un gasto normal</option>
              <option value="transferencia">Una transferencia</option>
            </select>
          )}
          {intent.nextPromptInputType === 'text_input' && (
            <input className="w-full rounded-md border border-slate-300 bg-white p-2" placeholder="Escribe el detalle" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)} />
          )}
          {intent.nextPromptInputType === 'account_selector' && hasAccounts && (
            <select className="w-full rounded-md border border-slate-300 bg-white p-2" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)}>
              <option value="">Selecciona una cuenta</option>
              {allowedAccounts.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}
            </select>
          )}
          <Button onClick={handleMissingFieldApply} disabled={!followUpValue.trim()}>Continuar</Button>
        </div>
      )}

      {intent && isCreditExpenseSourceInvalid && (
        <div className="mt-6 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Faltan datos para completar el movimiento:</p>
          <p className="text-sm text-slate-700">¿Con qué tarjeta de crédito pagaste?</p>
        </div>
      )}

      {isReadyToConfirm && intent && <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold">Confirmación</h3><ul className="mt-3 space-y-1 text-sm text-slate-700"><li>Tipo de movimiento: {intent.visibleType}</li><li>Monto: ${intent.amount.toLocaleString('es-MX')}</li><li>Descripción: {intent.description}</li><li>Cuenta origen: {intent.sourceAccountName ?? 'N/A'}</li><li>Cuenta destino: {intent.destinationAccountName ?? 'N/A'}</li><li>Categoría: {intent.category}</li></ul><p className="mt-3 text-sm font-medium text-slate-900">{intent.humanConfirmation}</p><div className="mt-4 flex gap-2"><Button onClick={handleSave} disabled={isPending}>{isPending ? 'Guardando...' : 'Confirmar'}</Button><Button variant="outline" onClick={() => setIntent(null)} disabled={isPending}>Cancelar</Button></div></div>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {successMessage && <p className="mt-4 text-sm text-emerald-700">{successMessage}</p>}
    </Card>
  );
}
