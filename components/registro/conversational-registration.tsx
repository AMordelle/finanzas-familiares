'use client';

import React from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { APPROVED_CATEGORY_CATALOG } from '@/lib/ai/semanticCategory';
import { type TransactionIntent } from '@/lib/ai/transactionInterpreter';
import type { AccountOption } from '@/lib/db/queries';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import { applyFollowUpAnswerAction, interpretTransactionAction, saveInterpretedTransactionAction } from '@/app/registro/actions';

type Props = {
  accounts: AccountOption[];
  hasHousehold: boolean;
  initialIntent?: TransactionIntent | null;
};

const missingFieldQuestions: Record<string, string> = {
  sourceAccount: '¿De qué cuenta salió el dinero?',
  destinationAccount: '¿A qué cuenta entró el dinero?',
  debtAccount: '¿A qué tarjeta o préstamo pagaste?'
};

function isCreditCardLikeSource(intent: TransactionIntent | null) {
  if (!intent || intent.intent !== 'expense_debt_account') return true;
  if (!intent.sourceAccountName) return false;
  if (intent.sourceAccountType === 'credit_card') return true;
  if (intent.sourceAccountType !== 'loan') return false;
  return /\b(tdc|tarjeta|credit)\b/i.test(intent.sourceAccountName);
}

export function ConversationalRegistration({ accounts, hasHousehold, initialIntent = null }: Props) {
  const [input, setInput] = useState('');
  const [intent, setIntent] = useState<TransactionIntent | null>(initialIntent);
  const [movementDate, setMovementDate] = useState(() => toDateInputValue(new Date()));
  const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(APPROVED_CATEGORY_CATALOG[0]);
  const [isManualCategoryOverride, setIsManualCategoryOverride] = useState(false);
  const [followUpValue, setFollowUpValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (!intent?.category) return;
    setSelectedCategory(intent.category);
    setIsManualCategoryOverride(false);
  }, [intent]);

  const isReadyToConfirm = useMemo(
    () => !!intent && intent.missingFieldKinds.length === 0 && isCreditCardLikeSource(intent),
    [intent]
  );
  const hasAccounts = accounts.length > 0;

  if (!hasHousehold) {
    return (
      <Card>
        <h2 className="text-xl font-semibold">Registro conversacional</h2>
        <p className="mt-3 text-sm text-slate-700">Aún no has configurado tu hogar y tus cuentas. Primero completa la configuración inicial para poder registrar movimientos.</p>
        <div className="mt-4">
          <Button asChild><Link href="/onboarding">Ir al onboarding</Link></Button>
        </div>
      </Card>
    );
  }

  const handleInterpret = () => {
    setSuccessMessage(null);
    setError(null);
    setFollowUpValue('');
    startTransition(async () => {
      try {
        const next = await interpretTransactionAction(input);
        setIntent(next);
        setMovementDate(toDateInputValue(new Date()));
        setIsCustomDatePickerOpen(false);
        setIsManualCategoryOverride(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo interpretar el movimiento.');
      }
    });
  };

  const handleMissingFieldApply = () => {
    if (!intent || !followUpValue.trim()) return;
    startTransition(async () => {
      const resolved = await applyFollowUpAnswerAction(intent, followUpValue.trim());
      setIntent(resolved);
      setFollowUpValue('');
      setIsManualCategoryOverride(false);
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
    if (!intent || intent.missingFieldKinds.length > 0 || !isCreditCardLikeSource(intent) || isSavingRef.current) return;
    setError(null);
    isSavingRef.current = true;
    startTransition(async () => {
      try {
        const result = await saveInterpretedTransactionAction({
          ...intent,
          movementDate,
          categoryOverride: isManualCategoryOverride ? selectedCategory : undefined
        });
        setInput('');
        setIntent(null);
        setMovementDate(toDateInputValue(new Date()));
        setSelectedCategory(APPROVED_CATEGORY_CATALOG[0]);
        setIsManualCategoryOverride(false);
        setIsCustomDatePickerOpen(false);
        setSuccessMessage(result.message);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
      } finally {
        isSavingRef.current = false;
      }
    });
  };

  const displayedCategory = selectedCategory || intent?.category || 'otros_gastos';

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

      {isReadyToConfirm && intent && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">Confirmación</h3>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>Tipo de movimiento: {intent.visibleType}</li>
            <li>Monto: {formatCurrencyMXN(intent.amount)}</li>
            <li>Descripción: {intent.description}</li>
            <li>Cuenta origen: {intent.sourceAccountName ?? 'N/A'}</li>
            <li>Cuenta destino: {intent.destinationAccountName ?? 'N/A'}</li>
            <li className="flex flex-wrap items-center gap-2">
              <span>Categoría:</span>
              <span className="font-medium">{displayedCategory}</span>
              <span className="text-xs text-slate-500">({isManualCategoryOverride ? 'Manual' : 'IA'})</span>
            </li>
          </ul>

          <select
            className="mt-2 w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
            value={displayedCategory}
            onChange={(event) => {
              setSelectedCategory(event.target.value);
              setIsManualCategoryOverride(event.target.value !== (intent.category ?? ''));
            }}
          >
            {APPROVED_CATEGORY_CATALOG.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <li className="mt-3 list-none pt-2 text-sm text-slate-900">Fecha del movimiento: <span className="font-medium">{formatMovementDateLabel(movementDate)}</span></li>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { setMovementDate(toDateInputValue(new Date())); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Hoy</Button>
            <Button type="button" variant="outline" onClick={() => { setMovementDate(toDateInputValue(getRelativeDate(-1))); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Ayer</Button>
            <Button type="button" variant="outline" onClick={() => setIsCustomDatePickerOpen((current) => !current)} disabled={isPending}>Elegir fecha</Button>
          </div>
          {isCustomDatePickerOpen && <input className="mt-2 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" type="date" value={movementDate} max={toDateInputValue(new Date())} onChange={(event) => setMovementDate(event.target.value)} />}
          <p className="mt-3 text-sm font-medium text-slate-900">{intent.humanConfirmation}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>{isPending ? 'Guardando...' : 'Confirmar'}</Button>
            <Button variant="outline" onClick={() => { setIntent(null); setMovementDate(toDateInputValue(new Date())); setSelectedCategory(APPROVED_CATEGORY_CATALOG[0]); setIsManualCategoryOverride(false); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Cancelar</Button>
          </div>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {successMessage && <p className="mt-4 text-sm text-emerald-700">{successMessage}</p>}
    </Card>
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRelativeDate(daysOffset: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date;
}

function formatMovementDateLabel(value: string) {
  const today = toDateInputValue(new Date());
  if (value === today) return 'Hoy';
  if (value === toDateInputValue(getRelativeDate(-1))) return 'Ayer';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return 'Hoy';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}
