'use client';

import React, { useState, useTransition } from 'react';
import { markMsiInstallmentAsPaidAction, restoreMsiInstallmentToPendingAction } from '@/app/msi/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import type { MsiData, MsiInstallment } from '@/lib/db/queries';

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

export function MsiManager({ initialData }: { initialData: MsiData }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runAction = (installment: MsiInstallment, nextStatus: 'paid' | 'pending') => {
    startTransition(async () => {
      try {
        const response = nextStatus === 'paid'
          ? await markMsiInstallmentAsPaidAction({ installmentId: installment.id })
          : await restoreMsiInstallmentToPendingAction({ installmentId: installment.id });
        setMessage(response.message);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el pago MSI.');
      }
    });
  };

  if (!initialData.hasHousehold) {
    return (
      <Card>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Configura tu hogar</h3>
          <p className="text-sm text-muted-foreground">Necesitas completar onboarding antes de controlar compras MSI.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><div className="space-y-1"><p className="text-sm text-muted-foreground">Compras activas</p><h3 className="text-lg font-semibold">{initialData.summary.activePurchases}</h3></div></Card>
        <Card><div className="space-y-1"><p className="text-sm text-muted-foreground">Total pendiente MSI</p><h3 className="text-lg font-semibold">{formatCurrencyMXN(initialData.summary.pendingTotal)}</h3></div></Card>
        <Card><div className="space-y-1"><p className="text-sm text-muted-foreground">Pagos pendientes</p><h3 className="text-lg font-semibold">{initialData.summary.pendingInstallments}</h3></div></Card>
        <Card><div className="space-y-1"><p className="text-sm text-muted-foreground">Pagos completados</p><h3 className="text-lg font-semibold">{initialData.summary.paidInstallments}</h3></div></Card>
      </div>

      {message ? <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{message}</p> : null}

      <div className="space-y-4">
        {initialData.purchases.length === 0 ? (
          <Card><div className="pt-6 text-sm text-muted-foreground">Aún no hay compras MSI registradas desde Registro Conversacional.</div></Card>
        ) : initialData.purchases.map((purchase) => {
          const paidCount = purchase.installments.filter((installment) => installment.status === 'paid').length;
          const pendingTotal = purchase.installments
            .filter((installment) => installment.status === 'pending')
            .reduce((sum, installment) => sum + installment.amount, 0);

          return (
            <Card key={purchase.id}>
              <div className="space-y-1">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">{purchase.description}</h3>
                    <p className="text-sm text-muted-foreground">{purchase.accountName} · {purchase.category} · {formatDate(purchase.purchaseDate)}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase text-slate-600">{purchase.status}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 text-sm md:grid-cols-5">
                  <div><p className="text-muted-foreground">Monto total</p><p className="font-semibold">{formatCurrencyMXN(purchase.totalAmount)}</p></div>
                  <div><p className="text-muted-foreground">Mensualidad</p><p className="font-semibold">{formatCurrencyMXN(purchase.monthlyAmount)}</p></div>
                  <div><p className="text-muted-foreground">Meses</p><p className="font-semibold">{purchase.months}</p></div>
                  <div><p className="text-muted-foreground">Pagos realizados</p><p className="font-semibold">{paidCount} / {purchase.months}</p></div>
                  <div><p className="text-muted-foreground">Total pendiente</p><p className="font-semibold">{formatCurrencyMXN(pendingTotal)}</p></div>
                </div>

                <div className="divide-y rounded-xl border">
                  {purchase.installments.map((installment) => (
                    <div key={installment.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium">Pago {installment.installmentNumber}/{purchase.months} · {formatCurrencyMXN(installment.amount)}</p>
                        <p className="text-xs text-muted-foreground">{installment.status === 'paid' ? `Pagado ${formatDate(installment.paidAt)}` : 'Pendiente'}</p>
                      </div>
                      {installment.status === 'pending' ? (
                        <Button disabled={isPending} onClick={() => runAction(installment, 'paid')}>Marcar como pagado</Button>
                      ) : (
                        <Button disabled={isPending} variant="outline" onClick={() => runAction(installment, 'pending')}>Regresar a pendiente</Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
