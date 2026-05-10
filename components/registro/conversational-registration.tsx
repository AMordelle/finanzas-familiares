'use client';

import React from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { APPROVED_CATEGORY_CATALOG } from '@/lib/ai/semanticCategory';
import { type BatchTransactionInterpretation, type TransactionIntent } from '@/lib/ai/transactionInterpreter';
import type { AccountOption } from '@/lib/db/queries';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import { applyFollowUpAnswerAction, interpretTransactionAction, saveInterpretedTransactionAction, saveInterpretedTransactionBatchAction } from '@/app/registro/actions';

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
  const [interpretation, setInterpretation] = useState<BatchTransactionInterpretation | null>(initialIntent ? { mode: 'single', items: [initialIntent], missingFields: [], needsConfirmation: true } : null);
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
    const firstItem = interpretation?.items[0];
    if (!firstItem?.category || interpretation?.mode === 'batch') return;
    setSelectedCategory(firstItem.category);
    setIsManualCategoryOverride(false);
  }, [interpretation]);

  const activeIntent = interpretation?.mode === 'single' ? interpretation.items[0] : null;
  const batchItems = interpretation?.items ?? [];
  const incompleteItems = batchItems.filter((item) => item.missingFieldKinds.length > 0 || !isCreditCardLikeSource(item));
  const isBatch = interpretation?.mode === 'batch';
  const isReadyToConfirm = useMemo(
    () => !!interpretation && incompleteItems.length === 0 && batchItems.length > 0,
    [interpretation, incompleteItems.length, batchItems.length]
  );
  const hasAccounts = accounts.length > 0;

  const handleInterpret = () => {
    setSuccessMessage(null);
    setError(null);
    setFollowUpValue('');
    startTransition(async () => {
      try {
        const next = await interpretTransactionAction(input);
        setInterpretation(next);
        setMovementDate(toDateInputValue(new Date()));
        setIsCustomDatePickerOpen(false);
        setIsManualCategoryOverride(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo interpretar el movimiento.');
      }
    });
  };

  const handleMissingFieldApply = () => {
    if (!activeIntent || !followUpValue.trim()) return;
    startTransition(async () => {
      const resolved = await applyFollowUpAnswerAction(activeIntent, followUpValue.trim());
      setInterpretation({ mode: 'single', items: [resolved], missingFields: resolved.missingFields, needsConfirmation: true });
      setFollowUpValue('');
      setIsManualCategoryOverride(false);
    });
  };

  const allowedAccounts = useMemo(() => {
    if (!activeIntent?.nextPromptAllowedAccountTypes) return accounts;
    const normalizeType = (type: string) => {
      if (type === 'deuda') return 'credit_card';
      if (type === 'fondo') return 'savings_fund';
      if (type === 'inversion') return 'investment';
      if (type === 'por_cobrar') return 'receivable';
      return type;
    };
    const filtered = accounts.filter((account) => activeIntent.nextPromptAllowedAccountTypes?.includes(normalizeType(account.type) as never));
    const needsCreditCardSelector = activeIntent.nextPromptAllowedAccountTypes.includes('credit_card');
    if (needsCreditCardSelector && filtered.length === 0) {
      const fallbackCreditCards = accounts.filter((account) => normalizeType(account.type) === 'credit_card' || account.type === 'deuda');
      if (fallbackCreditCards.length > 0) return fallbackCreditCards;
    }
    return filtered;
  }, [accounts, activeIntent]);

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


  const handleSave = () => {
    if (!interpretation || incompleteItems.length > 0 || isSavingRef.current) return;
    setError(null);
    isSavingRef.current = true;
    startTransition(async () => {
      try {
        const result = isBatch
          ? await saveInterpretedTransactionBatchAction({
            ...interpretation,
            movementDate
          })
          : await saveInterpretedTransactionAction({
            ...interpretation.items[0],
            movementDate,
            categoryOverride: isManualCategoryOverride ? selectedCategory : undefined
          });
        setInput('');
        setInterpretation(null);
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

  const displayedCategory = selectedCategory || activeIntent?.category || 'otros_gastos';

  return (
    <Card>
      <h2 className="text-xl font-semibold">Registro por lote</h2>
      <p className="mt-2 text-slate-600">Escribe un movimiento o una lista de movimientos. Puedes separar cada movimiento por renglón.</p>
      <textarea className="mt-4 min-h-36 w-full rounded-lg border border-slate-300 p-3 text-sm" value={input} placeholder={`Ejemplo:\nGasté 600 en gasolina con efectivo\nGasté 300 en Oxxo con TDC BBVA\nRecibí 200 de Juan en Prime IPTV`} onChange={(event) => setInput(event.target.value)} />
      <div className="mt-4"><Button onClick={handleInterpret} disabled={isPending || !input.trim()}>{isPending ? 'Interpretando...' : 'Interpretar movimiento(s)'}</Button></div>

      {activeIntent && activeIntent.missingFieldKinds.length > 0 && (
        <div className="mt-6 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Faltan datos para completar el movimiento:</p>
          <p className="text-sm text-slate-700">{activeIntent.nextPrompt ?? missingFieldQuestions[activeIntent.missingFields[0] ?? 'sourceAccount']}</p>
          {activeIntent.nextPromptInputType === 'guided_choice' && (
            <select className="w-full rounded-md border border-slate-300 bg-white p-2" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)}>
              <option value="">Selecciona una opción</option>
              <option value="tarjeta">Una tarjeta</option>
              <option value="prestamo">Un préstamo</option>
              <option value="gasto">Un gasto normal</option>
              <option value="transferencia">Una transferencia</option>
            </select>
          )}
          {activeIntent.nextPromptInputType === 'text_input' && (
            <input className="w-full rounded-md border border-slate-300 bg-white p-2" placeholder="Escribe el detalle" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)} />
          )}
          {activeIntent.nextPromptInputType === 'account_selector' && hasAccounts && (
            <select className="w-full rounded-md border border-slate-300 bg-white p-2" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)}>
              <option value="">Selecciona una cuenta</option>
              {allowedAccounts.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}
            </select>
          )}
          <Button onClick={handleMissingFieldApply} disabled={!followUpValue.trim()}>Continuar</Button>
        </div>
      )}

      {interpretation && isBatch && incompleteItems.length > 0 && (
        <div className="mt-6 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Hay {batchItems.length - incompleteItems.length} movimientos listos y {incompleteItems.length} necesita{incompleteItems.length === 1 ? '' : 'n'} aclaración.</p>
          <p className="text-sm text-slate-700">Corrige el texto completo y vuelve a interpretar el lote. No se guardará nada hasta que todos estén completos.</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
            {incompleteItems.map((item) => (
              <li key={item.rawText}>
                <span className="font-medium">{item.rawText}</span> · faltan: {item.missingFieldKinds.join(', ')}
              </li>
            ))}
          </ol>
        </div>
      )}

      {isReadyToConfirm && interpretation && isBatch && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">Detecté {batchItems.length} movimientos:</h3>
          <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm text-slate-700">
            {batchItems.map((item) => (
              <li key={`${item.rawText}-${item.amount}`}>
                <p className="font-medium text-slate-900">{item.visibleType} · {formatCurrencyMXN(item.amount)} · {item.category ?? 'Sin categoría'}{item.sourceAccountName ? ` · desde ${item.sourceAccountName}` : ''}{item.destinationAccountName ? ` · hacia ${item.destinationAccountName}` : ''}</p>
                <p>Texto original: “{item.rawText}”</p>
                <p>Descripción: {item.description}</p>
              </li>
            ))}
          </ol>
          <li className="mt-3 list-none pt-2 text-sm text-slate-900">Fecha del lote: <span className="font-medium">{formatMovementDateLabel(movementDate)}</span></li>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { setMovementDate(toDateInputValue(new Date())); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Hoy</Button>
            <Button type="button" variant="outline" onClick={() => { setMovementDate(toDateInputValue(getRelativeDate(-1))); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Ayer</Button>
            <Button type="button" variant="outline" onClick={() => setIsCustomDatePickerOpen((current) => !current)} disabled={isPending}>Elegir fecha</Button>
          </div>
          {isCustomDatePickerOpen && <input className="mt-2 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" type="date" value={movementDate} max={toDateInputValue(new Date())} onChange={(event) => setMovementDate(event.target.value)} />}
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>{isPending ? 'Guardando...' : 'Guardar movimientos'}</Button>
            <Button variant="outline" onClick={() => { setInterpretation(null); setMovementDate(toDateInputValue(new Date())); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Cancelar</Button>
          </div>
        </div>
      )}

      {isReadyToConfirm && interpretation && activeIntent && !isBatch && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">Confirmación</h3>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>Tipo de movimiento: {activeIntent.visibleType}</li>
            <li>Monto: {formatCurrencyMXN(activeIntent.amount)}</li>
            <li>Descripción: {activeIntent.description}</li>
            <li>Cuenta origen: {activeIntent.sourceAccountName ?? 'N/A'}</li>
            <li>Cuenta destino: {activeIntent.destinationAccountName ?? 'N/A'}</li>
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
              setIsManualCategoryOverride(event.target.value !== (activeIntent.category ?? ''));
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
          <p className="mt-3 text-sm font-medium text-slate-900">{activeIntent.humanConfirmation}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>{isPending ? 'Guardando...' : 'Confirmar'}</Button>
            <Button variant="outline" onClick={() => { setInterpretation(null); setMovementDate(toDateInputValue(new Date())); setSelectedCategory(APPROVED_CATEGORY_CATALOG[0]); setIsManualCategoryOverride(false); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Cancelar</Button>
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
