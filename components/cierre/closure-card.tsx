'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ClosureActions } from '@/components/cierre/closure-actions';
import type { FinancialClosure, FinancialClosureType } from '@/lib/db/queries';

const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN'
});

function formatMoney(value: number) {
  return currency.format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function typeLabel(type: FinancialClosureType) {
  return type === 'weekly' ? 'Semanal' : 'Mensual';
}

function AmountMetric({ label, value }: { label: string; value: number }) {
  const tone = value > 0 ? 'text-emerald-700' : value < 0 ? 'text-rose-700' : 'text-slate-700';
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold ${tone}`}>{formatMoney(value)}</dd>
    </div>
  );
}

function AccountChangesTable({ accounts }: { accounts: FinancialClosure['accountSnapshots'] }) {
  if (!accounts.length) {
    return <p className="mt-3 text-sm text-slate-600">No hay cuentas en esta sección.</p>;
  }

  return (
    <div className="mt-3 overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Cuenta</th>
            <th className="px-3 py-2">Saldo inicial</th>
            <th className="px-3 py-2">Saldo final</th>
            <th className="px-3 py-2">Diferencia</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {accounts.map((account) => (
            <tr key={account.accountId}>
              <td className="px-3 py-2 font-medium text-slate-800">
                {account.accountName}
                <span className="ml-2 text-xs font-normal text-slate-500">{account.accountType}</span>
              </td>
              <td className="px-3 py-2">{formatMoney(account.openingBalance)}</td>
              <td className="px-3 py-2">{formatMoney(account.closingBalance)}</td>
              <td className={account.difference < 0 ? 'px-3 py-2 text-rose-700' : 'px-3 py-2 text-emerald-700'}>{formatMoney(account.difference)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ClosureCard({
  closure,
  recalculateAction,
  deleteAction,
  initialOpen = false
}: {
  closure: FinancialClosure;
  recalculateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  initialOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const operationalAccounts = closure.accountSnapshots.filter((account) => account.accountScope === 'operational');
  const complementaryAccounts = closure.accountSnapshots.filter((account) => account.accountScope === 'complementary');

  return (
    <Card className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {typeLabel(closure.type)} · {formatDate(closure.periodStart)} — {formatDate(closure.periodEnd)}
          </h3>
          <p className="mt-1 text-sm font-medium text-emerald-800">
            Dinero operativo final: {formatMoney(closure.closingTotal)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="self-start md:self-center"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? 'Ocultar cierre' : 'Ver cierre'}
        </Button>
      </div>

      {isOpen ? (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <section>
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Dinero operativo real</h4>
            <dl className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <AmountMetric label="Total inicial" value={closure.openingTotal} />
              <AmountMetric label="Total final" value={closure.closingTotal} />
              <AmountMetric label="Cambio neto" value={closure.netChange} />
              <AmountMetric label="Ingresos del periodo" value={closure.incomeTotal} />
              <AmountMetric label="Gastos del periodo" value={closure.expenseTotal} />
              <AmountMetric label="Balance del periodo" value={closure.netFlow} />
            </dl>
            <p className="mt-2 text-xs text-slate-500">El total inicial/final usa solo cuentas operativas líquidas; las complementarias se muestran aparte.</p>
          </section>

          <details className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <summary className="cursor-pointer font-semibold text-emerald-900">Ver cuentas complementarias</summary>
            <AccountChangesTable accounts={complementaryAccounts} />
          </details>

          <details className="rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer font-semibold text-slate-800">Ver detalle del cierre</summary>
            <div className="mt-4 space-y-5">
              <section>
                <h4 className="font-semibold text-slate-900">Resumen general</h4>
                <dl className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <AmountMetric label="Total inicial" value={closure.openingTotal} />
                  <AmountMetric label="Total final" value={closure.closingTotal} />
                  <AmountMetric label="Cambio neto" value={closure.netChange} />
                  <AmountMetric label="Ingresos" value={closure.incomeTotal} />
                  <AmountMetric label="Gastos" value={closure.expenseTotal} />
                  <AmountMetric label="Balance" value={closure.netFlow} />
                </dl>
              </section>

              <section>
                <h4 className="font-semibold text-slate-900">Cuentas operativas</h4>
                <AccountChangesTable accounts={operationalAccounts} />
              </section>

              <section>
                <h4 className="font-semibold text-slate-900">Cuentas complementarias</h4>
                <AccountChangesTable accounts={complementaryAccounts} />
              </section>

              {closure.notes ? (
                <section>
                  <h4 className="font-semibold text-slate-900">Notas</h4>
                  <p className="mt-2 whitespace-pre-line rounded-xl bg-amber-50 p-3 text-sm text-slate-700">{closure.notes}</p>
                </section>
              ) : null}
            </div>
          </details>

          <div className="rounded-xl border border-slate-200 p-4">
            <h4 className="mb-3 font-semibold text-slate-900">Acciones</h4>
            <ClosureActions
              closureId={closure.id}
              recalculateAction={recalculateAction}
              deleteAction={deleteAction}
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
