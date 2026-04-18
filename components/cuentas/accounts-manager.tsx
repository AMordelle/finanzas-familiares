import React from 'react';
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createAccountAction, deactivateAccountAction, updateAccountAction } from '@/app/cuentas/actions';
import type { ManagedAccount } from '@/lib/db/queries';
import { accountsFormVisibilityReducer, buildAccountGroupSummaries, normalizeType, type ManagedAccountType } from '@/components/cuentas/accounts-manager.helpers';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

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

export function AccountsManager({ accounts }: { accounts: ManagedAccount[] }) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const groupedSummaries = useMemo(() => buildAccountGroupSummaries(accounts), [accounts]);

  const activeAccounts = accounts.filter((account) => account.isActive);
  const inactiveAccounts = accounts.filter((account) => !account.isActive);

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
            <h2 className="text-lg font-semibold">{form.accountId ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
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
              <Button variant="outline" onClick={resetFormAndCollapse} disabled={isPending}>Cancelar</Button>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {groupedSummaries.map((group) => (
          <Card key={group.key}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{group.label} — {formatCurrencyMXN(group.totalBalance)}</h3>
                <p className="text-xs text-slate-600">{group.accounts.length} {group.accounts.length === 1 ? 'cuenta' : 'cuentas'}</p>
              </div>
            </div>

            <ul className="mt-2 space-y-2 text-sm">
              {group.accounts.map((account) => (
                <li key={account.id} className="rounded-md border border-slate-200 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-xs text-slate-600">Saldo: {formatCurrencyMXN(account.balance)}</p>
                      {!account.isActive && <p className="text-xs text-amber-700">Cuenta desactivada</p>}
                    </div>
                    {account.isActive && (
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setForm(toForm(account));
                            setIsFormExpanded((current) => accountsFormVisibilityReducer(current, 'start_edit'));
                          }}
                          disabled={isPending}
                        >
                          Editar
                        </Button>
                        <Button variant="outline" onClick={() => onDeactivate(account.id)} disabled={isPending}>Desactivar</Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {activeAccounts.length === 0 && <Card><p className="text-sm text-slate-700">No hay cuentas activas todavía.</p></Card>}

      {inactiveAccounts.length > 0 && (
        <Card>
          <h3 className="font-semibold">Cuentas desactivadas</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            {inactiveAccounts.map((account) => (
              <li key={account.id}>• {account.name}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
