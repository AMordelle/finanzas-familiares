'use client';

import React from 'react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { type BatchTransactionInterpretation, type TransactionIntent } from '@/lib/ai/transactionInterpreter';
import type { AccountOption, FinancialCategoryCatalogItem } from '@/lib/db/queries';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import { applyFollowUpAnswerAction, interpretTransactionAction, saveInterpretedTransactionAction, saveInterpretedTransactionBatchAction } from '@/app/registro/actions';

type Props = {
  accounts: AccountOption[];
  hasHousehold: boolean;
  categoryCatalog?: FinancialCategoryCatalogItem[];
  initialIntent?: TransactionIntent | null;
  initialInterpretation?: BatchTransactionInterpretation | null;
};

function isCreditCardLikeSource(intent: TransactionIntent | null) {
  if (!intent || (intent.intent !== 'expense_debt_account' && intent.action !== 'msi_purchase')) return true;
  if (!intent.sourceAccountName) return false;
  if (intent.sourceAccountType === 'credit_card') return true;
  if (intent.sourceAccountType !== 'loan') return false;
  return /\b(tdc|tarjeta|credit)\b/i.test(intent.sourceAccountName);
}

function formatCatalogLabel(key: string | null | undefined) {
  if (!key) return 'Sin categoría';
  const label = key.replace(/_/g, ' ').trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Sin categoría';
}

function findCatalogCategory(catalog: FinancialCategoryCatalogItem[], key: string | null | undefined) {
  return key ? catalog.find((category) => category.key === key) ?? null : null;
}

function buildCatalogCategoryInputs(interpretation: BatchTransactionInterpretation | null, catalog: FinancialCategoryCatalogItem[]) {
  return (interpretation?.items ?? []).reduce<Record<number, string>>((acc, item, index) => {
    acc[index] = findCatalogCategory(catalog, item.category)?.key ?? '';
    return acc;
  }, {});
}

function buildCatalogSubcategoryInputs(interpretation: BatchTransactionInterpretation | null, catalog: FinancialCategoryCatalogItem[]) {
  return (interpretation?.items ?? []).reduce<Record<number, string>>((acc, item, index) => {
    const category = findCatalogCategory(catalog, item.category);
    acc[index] = category?.subcategories.some((subcategory) => subcategory.key === item.subcategory) ? item.subcategory ?? '' : '';
    return acc;
  }, {});
}

export function ConversationalRegistration({ accounts, hasHousehold, categoryCatalog = [], initialIntent = null, initialInterpretation = null }: Props) {
  const initialRegistrationInterpretation = initialInterpretation ?? (initialIntent ? { mode: 'single' as const, items: [initialIntent], missingFields: [], needsConfirmation: true } : null);
  const [input, setInput] = useState('');
  const [interpretation, setInterpretation] = useState<BatchTransactionInterpretation | null>(initialRegistrationInterpretation);
  const [movementDate, setMovementDate] = useState(() => toDateInputValue(new Date()));
  const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);
  const [categoryInputs, setCategoryInputs] = useState<Record<number, string>>(() => buildCatalogCategoryInputs(initialRegistrationInterpretation, categoryCatalog));
  const [subcategoryInputs, setSubcategoryInputs] = useState<Record<number, string>>(() => buildCatalogSubcategoryInputs(initialRegistrationInterpretation, categoryCatalog));
  const [followUpValue, setFollowUpValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isSavingRef = useRef(false);

  useEffect(() => {
    if (!interpretation) {
      setCategoryInputs({});
      setSubcategoryInputs({});
      return;
    }

    setCategoryInputs(buildCatalogCategoryInputs(interpretation, categoryCatalog));
    setSubcategoryInputs(buildCatalogSubcategoryInputs(interpretation, categoryCatalog));
  }, [interpretation, categoryCatalog]);

  const activeIntent = interpretation?.mode === 'single' ? interpretation.items[0] : null;
  const batchItems = interpretation?.items ?? [];
  const incompleteItems = batchItems.filter((item) => item.missingFieldKinds.length > 0 || !isCreditCardLikeSource(item));
  const isBatch = interpretation?.mode === 'batch';
  const missingCatalogSelectionCount = batchItems.filter((_, index) => !categoryInputs[index]).length;
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

  const updateCategoryInput = (index: number, value: string) => {
    setCategoryInputs((current) => ({ ...current, [index]: value }));
    setSubcategoryInputs((current) => ({ ...current, [index]: '' }));
  };

  const updateSubcategoryInput = (index: number, value: string) => {
    setSubcategoryInputs((current) => ({ ...current, [index]: value }));
  };

  const buildInterpretationWithFinalCategories = () => {
    if (!interpretation) return null;
    const finalItems = interpretation.items.map((item, index) => {
      const category = categoryInputs[index];
      if (!category) throw new Error(`Selecciona una categoría válida para el movimiento ${index + 1}.`);
      return { ...item, category, subcategory: subcategoryInputs[index] || null };
    });
    return { ...interpretation, items: finalItems };
  };

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
    if (!interpretation || incompleteItems.length > 0 || missingCatalogSelectionCount > 0 || isSavingRef.current) return;
    setError(null);
    isSavingRef.current = true;
    startTransition(async () => {
      try {
        const finalInterpretation = buildInterpretationWithFinalCategories();
        if (!finalInterpretation) return;
        const result = isBatch
          ? await saveInterpretedTransactionBatchAction({
            ...finalInterpretation,
            movementDate
          })
          : await saveInterpretedTransactionAction({
            ...finalInterpretation.items[0],
            movementDate,
            categoryOverride: categoryInputs[0],
            subcategoryOverride: subcategoryInputs[0] || null
          });
        setInput('');
        setInterpretation(null);
        setMovementDate(toDateInputValue(new Date()));
        setCategoryInputs({});
        setSubcategoryInputs({});
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

  return (
    <Card>
      <h2 className="text-xl font-semibold">Registro por lote</h2>
      <p className="mt-2 text-slate-600">Escribe un movimiento o una lista de movimientos. Puedes separar cada movimiento por renglón.</p>
      <p className="mt-2 text-sm text-slate-500">Las categorías vienen de Configuración. Si necesitas una nueva, créala primero en Configuración.</p>
      {categoryCatalog.length === 0 && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">No hay categorías activas en tu catálogo. Crea al menos una en Configuración antes de guardar movimientos.</p>}
      <textarea className="mt-4 min-h-36 w-full rounded-lg border border-slate-300 p-3 text-sm" value={input} placeholder={`Ejemplo:\nGasté 600 en gasolina con efectivo\nGasté 300 en Oxxo con TDC BBVA\nRecibí 200 de Juan en Prime IPTV`} onChange={(event) => setInput(event.target.value)} />
      <div className="mt-4"><Button onClick={handleInterpret} disabled={isPending || !input.trim()}>{isPending ? 'Interpretando...' : 'Interpretar movimiento(s)'}</Button></div>

      {activeIntent && activeIntent.missingFieldKinds.length > 0 && (
        <div className="mt-6 space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">Faltan datos para completar el movimiento</p>
          <p className="text-sm text-amber-800">{activeIntent.nextPrompt ?? 'Completa la información faltante.'}</p>
          {activeIntent.nextPromptInputType === 'account_selector' && (
            <select className="w-full rounded-md border border-amber-300 bg-white p-2 text-sm" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)}>
              <option value="">Selecciona una cuenta</option>
              {allowedAccounts.map((account) => <option key={account.id} value={account.name}>{account.name}</option>)}
            </select>
          )}
          {activeIntent.nextPromptInputType !== 'account_selector' && <input className="w-full rounded-md border border-amber-300 bg-white p-2 text-sm" value={followUpValue} onChange={(event) => setFollowUpValue(event.target.value)} />}
          <Button type="button" onClick={handleMissingFieldApply} disabled={!followUpValue.trim() || isPending}>Aplicar respuesta</Button>
        </div>
      )}

      {activeIntent && !hasAccounts && activeIntent.missingFieldKinds.length > 0 && (
        <p className="mt-4 text-sm text-red-600">Necesitas cuentas activas para completar el registro.</p>
      )}

      {isReadyToConfirm && interpretation && isBatch && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">Detecté {batchItems.length} movimientos</h3>
          {missingCatalogSelectionCount > 0 && <p className="mt-2 text-sm text-amber-700">Hay {missingCatalogSelectionCount} movimiento(s) sin categoría válida del catálogo.</p>}
          <ol className="mt-3 space-y-3 text-sm text-slate-700">
            {batchItems.map((item, index) => (
              <li key={`${item.rawText}-${index}`} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="font-medium">{index + 1}. {item.rawText}</p>
                <p>Monto: {formatCurrencyMXN(item.action === 'msi_purchase' ? item.totalAmount ?? item.amount : item.amount)}</p>
                <p>Descripción: {item.description}</p>
                <CatalogSelectionEditor
                  index={index}
                  item={item}
                  catalog={categoryCatalog}
                  categoryValue={categoryInputs[index] ?? ''}
                  subcategoryValue={subcategoryInputs[index] ?? ''}
                  onCategoryChange={updateCategoryInput}
                  onSubcategoryChange={updateSubcategoryInput}
                />
              </li>
            ))}
          </ol>
          <MovementDatePicker movementDate={movementDate} setMovementDate={setMovementDate} isCustomDatePickerOpen={isCustomDatePickerOpen} setIsCustomDatePickerOpen={setIsCustomDatePickerOpen} isPending={isPending} label="Fecha del lote" />
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isPending || missingCatalogSelectionCount > 0}>{isPending ? 'Guardando...' : 'Guardar movimientos'}</Button>
            <Button variant="outline" onClick={() => { setInterpretation(null); setMovementDate(toDateInputValue(new Date())); setCategoryInputs({}); setSubcategoryInputs({}); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Cancelar</Button>
          </div>
        </div>
      )}

      {isReadyToConfirm && interpretation && activeIntent && !isBatch && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-semibold">Confirmación</h3>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>Tipo de movimiento: {activeIntent.visibleType}</li>
            <li>Monto: {formatCurrencyMXN(activeIntent.action === 'msi_purchase' ? activeIntent.totalAmount ?? activeIntent.amount : activeIntent.amount)}</li>
            {activeIntent.action === 'msi_purchase' && activeIntent.financingType === 'interest_bearing' && (
              <li>Con intereses: mensualidad {formatCurrencyMXN(activeIntent.monthlyAmount ?? activeIntent.amount)} · total a pagar {formatCurrencyMXN(activeIntent.totalFinancedAmount ?? activeIntent.amount)} · intereses estimados {formatCurrencyMXN(activeIntent.interestCost ?? 0)}</li>
            )}
            {activeIntent.action === 'msi_purchase' && activeIntent.financingType !== 'interest_bearing' && (
              <li>MSI: mensualidad {formatCurrencyMXN(activeIntent.monthlyAmount ?? activeIntent.amount)} · {activeIntent.months} pagos</li>
            )}
            <li>Descripción: {activeIntent.description}</li>
            <li>Cuenta origen: {activeIntent.sourceAccountName ?? 'N/A'}</li>
            <li>Cuenta destino: {activeIntent.destinationAccountName ?? 'N/A'}</li>
            <li>Categoría sugerida por IA: {formatCatalogLabel(activeIntent.category)}</li>
            <li>Subcategoría sugerida por IA: {activeIntent.subcategory ? formatCatalogLabel(activeIntent.subcategory) : 'Sin subcategoría'}</li>
          </ul>

          <CatalogSelectionEditor
            index={0}
            item={activeIntent}
            catalog={categoryCatalog}
            categoryValue={categoryInputs[0] ?? ''}
            subcategoryValue={subcategoryInputs[0] ?? ''}
            onCategoryChange={updateCategoryInput}
            onSubcategoryChange={updateSubcategoryInput}
          />

          <MovementDatePicker movementDate={movementDate} setMovementDate={setMovementDate} isCustomDatePickerOpen={isCustomDatePickerOpen} setIsCustomDatePickerOpen={setIsCustomDatePickerOpen} isPending={isPending} label="Fecha del movimiento" />
          <p className="mt-3 text-sm font-medium text-slate-900">{activeIntent.humanConfirmation}</p>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isPending || missingCatalogSelectionCount > 0}>{isPending ? 'Guardando...' : 'Confirmar'}</Button>
            <Button variant="outline" onClick={() => { setInterpretation(null); setMovementDate(toDateInputValue(new Date())); setCategoryInputs({}); setSubcategoryInputs({}); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Cancelar</Button>
          </div>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {successMessage && <p className="mt-4 text-sm text-emerald-700">{successMessage}</p>}
    </Card>
  );
}

type CatalogSelectionEditorProps = {
  index: number;
  item: TransactionIntent;
  catalog: FinancialCategoryCatalogItem[];
  categoryValue: string;
  subcategoryValue: string;
  onCategoryChange: (index: number, value: string) => void;
  onSubcategoryChange: (index: number, value: string) => void;
};

function CatalogSelectionEditor({ index, item, catalog, categoryValue, subcategoryValue, onCategoryChange, onSubcategoryChange }: CatalogSelectionEditorProps) {
  const suggestedCategory = findCatalogCategory(catalog, item.category);
  const selectedCategory = findCatalogCategory(catalog, categoryValue);
  const subcategories = selectedCategory?.subcategories ?? [];
  const suggestedSubcategoryExists = Boolean(suggestedCategory?.subcategories.some((subcategory) => subcategory.key === item.subcategory));

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clasificación del catálogo</p>
      <p className="mt-1 text-xs text-slate-500">Categoría sugerida por IA: {formatCatalogLabel(item.category)}</p>
      {item.category && !suggestedCategory && <p className="mt-2 text-xs font-medium text-amber-700">La categoría sugerida no existe en tu catálogo.</p>}
      {item.subcategory && !suggestedSubcategoryExists && <p className="mt-1 text-xs text-amber-700">La subcategoría sugerida no existe bajo esa categoría; selecciona una válida o deja “Sin subcategoría”.</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="block text-sm text-slate-700">
          Categoría
          <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" value={categoryValue} onChange={(event) => onCategoryChange(index, event.target.value)} required>
            <option value="">Selecciona una categoría</option>
            {catalog.map((category) => <option key={category.id} value={category.key}>{category.name}</option>)}
          </select>
        </label>
        <label className="block text-sm text-slate-700">
          Subcategoría
          <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" value={subcategoryValue} onChange={(event) => onSubcategoryChange(index, event.target.value)} disabled={!categoryValue}>
            <option value="">Sin subcategoría</option>
            {subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.key}>{subcategory.name}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

type MovementDatePickerProps = {
  movementDate: string;
  setMovementDate: (value: string) => void;
  isCustomDatePickerOpen: boolean;
  setIsCustomDatePickerOpen: (updater: boolean | ((current: boolean) => boolean)) => void;
  isPending: boolean;
  label: string;
};

function MovementDatePicker({ movementDate, setMovementDate, isCustomDatePickerOpen, setIsCustomDatePickerOpen, isPending, label }: MovementDatePickerProps) {
  return (
    <>
      <li className="mt-3 list-none pt-2 text-sm text-slate-900">{label}: <span className="font-medium">{formatMovementDateLabel(movementDate)}</span></li>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => { setMovementDate(toDateInputValue(new Date())); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Hoy</Button>
        <Button type="button" variant="outline" onClick={() => { setMovementDate(toDateInputValue(getRelativeDate(-1))); setIsCustomDatePickerOpen(false); }} disabled={isPending}>Ayer</Button>
        <Button type="button" variant="outline" onClick={() => setIsCustomDatePickerOpen((current) => !current)} disabled={isPending}>Elegir fecha</Button>
      </div>
      {isCustomDatePickerOpen && <input className="mt-2 w-full rounded-md border border-slate-300 bg-white p-2 text-sm" type="date" value={movementDate} max={toDateInputValue(new Date())} onChange={(event) => setMovementDate(event.target.value)} />}
    </>
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
