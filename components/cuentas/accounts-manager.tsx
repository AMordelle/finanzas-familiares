'use client';

import React from 'react';
import { GripVertical } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createAccountAction, deactivateAccountAction, reorderAccountsAction, updateAccountAction } from '@/app/cuentas/actions';
import type { ManagedAccount } from '@/lib/db/queries';
import { accountsFormVisibilityReducer, buildAccountGroupSummaries, normalizeType, type AccountGroupSummary, type ManagedAccountType } from '@/components/cuentas/accounts-manager.helpers';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import { cn } from '@/lib/utils';

const accountTypeOptions = [
  { value: 'operational_cash', label: 'Dinero operativo' },
  { value: 'savings_fund', label: 'Fondo de ahorro' },
  { value: 'investment', label: 'Inversión' },
  { value: 'credit_card', label: 'Tarjeta de crédito' },
  { value: 'loan', label: 'Préstamo' },
  { value: 'receivable', label: 'Por cobrar' }
] as const;

type FormState = {
  accountId?: string;
  type: ManagedAccountType;
  name: string;
  balance: number;
  periodicPayment: number | null;
  paymentDay: number | null;
  counterparty: string;
};

type DragMeasurement = {
  id: string;
  top: number;
  height: number;
};

type DragState = {
  activeId: string;
  groupKey: ManagedAccountType;
  startY: number;
  currentY: number;
  activeIndex: number;
  overIndex: number;
  activeHeight: number;
  itemShift: number;
  measurements: DragMeasurement[];
};

const defaultForm: FormState = {
  type: 'operational_cash',
  name: '',
  balance: 0,
  periodicPayment: null,
  paymentDay: null,
  counterparty: ''
};

function toForm(account: ManagedAccount): FormState {
  return {
    accountId: account.id,
    type: normalizeType(account.type) ?? 'operational_cash',
    name: account.name,
    balance: account.balance,
    periodicPayment: account.periodicPayment,
    paymentDay: account.paymentDay,
    counterparty: account.counterparty ?? ''
  };
}

function requiresPeriodicPayment(type: ManagedAccountType) {
  return type === 'loan';
}

function supportsPeriodicFields(type: ManagedAccountType) {
  return type === 'credit_card' || type === 'loan';
}

function arrayMove<T>(items: T[], oldIndex: number, newIndex: number) {
  if (oldIndex === newIndex) return items;
  const next = [...items];
  const [moved] = next.splice(oldIndex, 1);
  next.splice(newIndex, 0, moved);
  return next;
}

export function buildReorderedAccounts(accounts: ManagedAccount[], groupKey: ManagedAccountType, activeId: string, overId: string) {
  if (activeId === overId) return accounts;

  const groupAccounts = accounts.filter((account) => normalizeType(account.type) === groupKey);
  const oldIndex = groupAccounts.findIndex((account) => account.id === activeId);
  const newIndex = groupAccounts.findIndex((account) => account.id === overId);
  if (oldIndex < 0 || newIndex < 0) return accounts;

  const reorderedGroup = arrayMove(groupAccounts, oldIndex, newIndex);
  let cursor = 0;
  return accounts.map((account) => (normalizeType(account.type) === groupKey ? reorderedGroup[cursor++] : account));
}

export function getAccountIdsForGroup(accounts: ManagedAccount[], groupKey: ManagedAccountType) {
  return accounts
    .filter((account) => normalizeType(account.type) === groupKey)
    .map((account) => account.id);
}

export async function persistOptimisticAccountReorder({
  accounts,
  groupKey,
  activeId,
  overId,
  persist
}: {
  accounts: ManagedAccount[];
  groupKey: ManagedAccountType;
  activeId: string;
  overId: string;
  persist: (payload: { accountIds: string[] }) => Promise<unknown>;
}) {
  const nextAccounts = buildReorderedAccounts(accounts, groupKey, activeId, overId);
  const accountIds = getAccountIdsForGroup(nextAccounts, groupKey);
  await persist({ accountIds });
  return { nextAccounts, accountIds };
}

function getClosestIndex(pointerY: number, measurements: DragMeasurement[]) {
  return measurements.reduce((closest, measurement, index) => {
    const center = measurement.top + measurement.height / 2;
    const closestCenter = measurements[closest].top + measurements[closest].height / 2;
    return Math.abs(pointerY - center) < Math.abs(pointerY - closestCenter) ? index : closest;
  }, 0);
}

function getItemTransform(accountId: string, dragState: DragState | null) {
  if (!dragState) return undefined;
  const itemIndex = dragState.measurements.findIndex((item) => item.id === accountId);
  if (itemIndex < 0) return undefined;

  if (accountId === dragState.activeId) {
    return `translate3d(0, ${dragState.currentY - dragState.startY}px, 0) scale(1.015)`;
  }

  const isMovingDown = dragState.overIndex > dragState.activeIndex;
  const isMovingUp = dragState.overIndex < dragState.activeIndex;
  if (isMovingDown && itemIndex > dragState.activeIndex && itemIndex <= dragState.overIndex) {
    return `translate3d(0, -${dragState.itemShift}px, 0)`;
  }
  if (isMovingUp && itemIndex >= dragState.overIndex && itemIndex < dragState.activeIndex) {
    return `translate3d(0, ${dragState.itemShift}px, 0)`;
  }

  return undefined;
}

function DraggableAccountItem({
  account,
  isDragging,
  transform,
  disabled,
  onDeactivate,
  onEdit,
  onPointerStart
}: {
  account: ManagedAccount;
  isDragging: boolean;
  transform: string | undefined;
  disabled: boolean;
  onDeactivate: (accountId: string) => void;
  onEdit: (account: ManagedAccount) => void;
  onPointerStart: (event: React.PointerEvent<HTMLButtonElement>, accountId: string) => void;
}) {
  return (
    <li
      data-account-id={account.id}
      style={{
        transform,
        transition: isDragging ? 'none' : 'transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
        zIndex: isDragging ? 20 : undefined,
        position: 'relative'
      }}
      className={cn(
        'rounded-md border border-slate-200 bg-white p-2 will-change-transform',
        isDragging && 'border-teal-300 opacity-90 shadow-xl ring-2 ring-teal-100'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            aria-label={`Arrastrar ${account.name}`}
            className="mt-0.5 cursor-grab rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            onPointerDown={(event) => onPointerStart(event, account.id)}
            disabled={disabled}
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-medium">{account.name}</p>
            <p className="text-xs text-slate-600">Saldo: {formatCurrencyMXN(account.balance)}</p>
            {!account.isActive && <p className="text-xs text-amber-700">Cuenta desactivada</p>}
          </div>
        </div>
        {account.isActive && (
          <div className="flex shrink-0 gap-1">
            <Button variant="outline" onClick={() => onEdit(account)} disabled={disabled}>Editar</Button>
            <Button variant="outline" onClick={() => onDeactivate(account.id)} disabled={disabled}>Desactivar</Button>
          </div>
        )}
      </div>
    </li>
  );
}

function AccountGroupCard({
  group,
  disabled,
  dragState,
  onDeactivate,
  onEdit,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel
}: {
  group: AccountGroupSummary<ManagedAccount>;
  disabled: boolean;
  dragState: DragState | null;
  onDeactivate: (accountId: string) => void;
  onEdit: (account: ManagedAccount) => void;
  onDragStart: (state: DragState) => void;
  onDragMove: (currentY: number, overIndex: number) => void;
  onDragEnd: (state: DragState) => void;
  onDragCancel: () => void;
}) {
  const listRef = useRef<HTMLUListElement | null>(null);

  const onPointerStart = (event: React.PointerEvent<HTMLButtonElement>, activeId: string) => {
    if (disabled || group.accounts.length < 2 || !listRef.current) return;
    event.preventDefault();

    const measurements = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-account-id]'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.dataset.accountId ?? '',
          top: rect.top,
          height: rect.height
        };
      })
      .filter((measurement) => Boolean(measurement.id));

    const activeIndex = measurements.findIndex((item) => item.id === activeId);
    if (activeIndex < 0) return;

    const nextDragState: DragState = {
      activeId,
      groupKey: group.key,
      startY: event.clientY,
      currentY: event.clientY,
      activeIndex,
      overIndex: activeIndex,
      activeHeight: measurements[activeIndex].height,
      itemShift: measurements[activeIndex].height + 8,
      measurements
    };

    let latestDragState = nextDragState;
    onDragStart(nextDragState);

    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const overIndex = getClosestIndex(moveEvent.clientY, measurements);
      latestDragState = { ...latestDragState, currentY: moveEvent.clientY, overIndex };
      onDragMove(moveEvent.clientY, overIndex);
    };

    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      onDragEnd(latestDragState);
    };

    const cancel = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      onDragCancel();
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  };

  const activeGroupDragState = dragState?.groupKey === group.key ? dragState : null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{group.label} — {formatCurrencyMXN(group.totalBalance)}</h3>
          <p className="text-xs text-slate-600">{group.accounts.length} {group.accounts.length === 1 ? 'cuenta' : 'cuentas'}</p>
        </div>
      </div>

      <ul ref={listRef} className="mt-2 space-y-2 text-sm">
        {group.accounts.map((account) => (
          <DraggableAccountItem
            key={account.id}
            account={account}
            isDragging={activeGroupDragState?.activeId === account.id}
            transform={getItemTransform(account.id, activeGroupDragState)}
            disabled={disabled}
            onDeactivate={onDeactivate}
            onEdit={onEdit}
            onPointerStart={onPointerStart}
          />
        ))}
      </ul>
    </Card>
  );
}

export function AccountsManager({ accounts }: { accounts: ManagedAccount[] }) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [orderedAccounts, setOrderedAccounts] = useState(accounts);
  const orderedAccountsRef = useRef(accounts);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSavingOrderRef = useRef(false);

  useEffect(() => {
    setOrderedAccounts(accounts);
    orderedAccountsRef.current = accounts;
  }, [accounts]);

  const setLocalOrderedAccounts = (nextAccounts: ManagedAccount[]) => {
    orderedAccountsRef.current = nextAccounts;
    setOrderedAccounts(nextAccounts);
  };

  const groupedSummaries = useMemo(() => buildAccountGroupSummaries(orderedAccounts), [orderedAccounts]);

  const activeAccounts = orderedAccounts.filter((account) => account.isActive);
  const inactiveAccounts = orderedAccounts.filter((account) => !account.isActive);

  const clearState = () => {
    setMessage(null);
    setError(null);
  };

  const resetFormAndCollapse = () => {
    setForm(defaultForm);
    setIsFormExpanded(accountsFormVisibilityReducer(isFormExpanded, 'cancel'));
  };

  const submit = () => {
    clearState();
    const isEditing = Boolean(form.accountId);

    startTransition(async () => {
      try {
        const payload = {
          accountId: form.accountId,
          name: form.name,
          type: form.type,
          balance: form.balance,
          periodicPayment: supportsPeriodicFields(form.type) ? form.periodicPayment : null,
          paymentDay: supportsPeriodicFields(form.type) ? form.paymentDay : null,
          counterparty: form.type === 'receivable' ? form.counterparty : null
        };

        if (isEditing) {
          await updateAccountAction(payload);
          setMessage('Cuenta actualizada correctamente.');
          setIsFormExpanded((current) => accountsFormVisibilityReducer(current, 'submit_success_edit'));
        } else {
          await createAccountAction(payload);
          setMessage('Cuenta creada correctamente.');
          setIsFormExpanded((current) => accountsFormVisibilityReducer(current, 'submit_success_create'));
        }

        setForm(defaultForm);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'No fue posible guardar la cuenta.');
      }
    });
  };

  const onDeactivate = (accountId: string) => {
    clearState();
    startTransition(async () => {
      try {
        await deactivateAccountAction({ accountId });
        setMessage('Cuenta desactivada correctamente.');
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : 'No fue posible desactivar la cuenta.');
      }
    });
  };

  const onEdit = (account: ManagedAccount) => {
    setForm(toForm(account));
    setIsFormExpanded((current) => accountsFormVisibilityReducer(current, 'start_edit'));
  };

  const onDragEnd = (finishedDrag: DragState) => {
    setDragState(null);
    if (finishedDrag.overIndex === finishedDrag.activeIndex || isSavingOrderRef.current) return;

    const previousAccounts = orderedAccountsRef.current;
    const overId = finishedDrag.measurements[finishedDrag.overIndex]?.id;
    if (!overId) return;

    const nextAccounts = buildReorderedAccounts(previousAccounts, finishedDrag.groupKey, finishedDrag.activeId, overId);
    const accountIds = getAccountIdsForGroup(nextAccounts, finishedDrag.groupKey);
    setLocalOrderedAccounts(nextAccounts);
    clearState();
    isSavingOrderRef.current = true;

    startTransition(async () => {
      try {
        await reorderAccountsAction({ accountIds });
      } catch (actionError) {
        setLocalOrderedAccounts(previousAccounts);
        setError(actionError instanceof Error ? actionError.message : 'No fue posible guardar el nuevo orden. Se restauró el orden anterior.');
      } finally {
        isSavingOrderRef.current = false;
      }
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        {!isFormExpanded ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-700">Crea una cuenta solo cuando la necesites.</p>
            <Button onClick={() => setIsFormExpanded((current) => accountsFormVisibilityReducer(current, 'expand_new'))}>+ Nueva cuenta</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{form.accountId ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
              <Button variant="outline" onClick={resetFormAndCollapse} disabled={isPending}>Cancelar</Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                Tipo
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 p-2"
                  value={form.type}
                  onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value as ManagedAccountType }))}
                >
                  {accountTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                {form.type === 'receivable' ? 'Nombre / contraparte' : 'Nombre'}
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 p-2"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>

              <label className="text-sm">
                {form.type === 'credit_card' ? 'Saldo actual de deuda' : form.type === 'receivable' ? 'Monto pendiente' : 'Saldo actual'}
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 p-2"
                  type="number"
                  min={0}
                  value={form.balance}
                  onChange={(event) => setForm((prev) => ({ ...prev, balance: Number(event.target.value || 0) }))}
                />
              </label>

              {form.type === 'receivable' && (
                <label className="text-sm">
                  Contraparte
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 p-2"
                    value={form.counterparty}
                    onChange={(event) => setForm((prev) => ({ ...prev, counterparty: event.target.value }))}
                  />
                </label>
              )}

              {supportsPeriodicFields(form.type) && (
                <label className="text-sm">
                  Pago periódico {requiresPeriodicPayment(form.type) ? '' : '(opcional)'}
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 p-2"
                    type="number"
                    min={0}
                    value={form.periodicPayment ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, periodicPayment: event.target.value === '' ? null : Number(event.target.value) }))}
                  />
                </label>
              )}

              {supportsPeriodicFields(form.type) && (
                <label className="text-sm">
                  Fecha de pago (opcional)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 p-2"
                    type="number"
                    min={1}
                    max={31}
                    value={form.paymentDay ?? ''}
                    onChange={(event) => setForm((prev) => ({ ...prev, paymentDay: event.target.value === '' ? null : Number(event.target.value) }))}
                  />
                </label>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {message && <p className="mt-3 text-sm text-teal-700">{message}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={submit} disabled={isPending}>{form.accountId ? 'Guardar cambios' : 'Crear cuenta'}</Button>
            </div>
          </>
        )}
      </Card>

      {!isFormExpanded && (error || message) && (
        <p className={cn('text-sm', error ? 'text-red-600' : 'text-teal-700')}>{error ?? message}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {groupedSummaries.map((group) => (
          <AccountGroupCard
            key={group.key}
            group={group}
            disabled={isPending || isSavingOrderRef.current}
            dragState={dragState}
            onDeactivate={onDeactivate}
            onEdit={onEdit}
            onDragStart={(state) => {
              clearState();
              setDragState(state);
            }}
            onDragMove={(currentY, overIndex) => {
              setDragState((current) => (current ? { ...current, currentY, overIndex } : current));
            }}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragState(null)}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h3 className="font-semibold">Activas</h3>
          <p className="mt-1 text-2xl font-semibold text-teal-700">{activeAccounts.length}</p>
        </Card>
        <Card>
          <h3 className="font-semibold">Desactivadas</h3>
          <p className="mt-1 text-2xl font-semibold text-amber-700">{inactiveAccounts.length}</p>
        </Card>
      </div>
    </div>
  );
}
