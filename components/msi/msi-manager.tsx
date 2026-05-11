'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMsiPurchaseAction, markMsiInstallmentAsPaidAction, restoreMsiInstallmentToPendingAction } from '@/app/msi/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import type { MsiData, MsiFinancingType, MsiInstallment, MsiPurchase, MsiSectionSummary } from '@/lib/db/queries';

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

function purchasePendingTotal(purchase: MsiPurchase) {
  return purchase.installments
    .filter((installment) => installment.status === 'pending')
    .reduce((sum, installment) => sum + installment.amount, 0);
}

function paidInstallmentsCount(purchase: MsiPurchase) {
  return purchase.installments.filter((installment) => installment.status === 'paid').length;
}

function SectionSummary({ type, summary }: { type: MsiFinancingType; summary: MsiSectionSummary }) {
  if (type === 'interest_bearing') {
    return (
      <div className="grid gap-2 text-sm sm:grid-cols-5">
        <span>Activas: <strong>{summary.activePurchases}</strong></span>
        <span>Original pendiente: <strong>{formatCurrencyMXN(summary.pendingOriginalTotal)}</strong></span>
        <span>Financiado pendiente: <strong>{formatCurrencyMXN(summary.pendingFinancedTotal)}</strong></span>
        <span>Intereses estimados: <strong>{formatCurrencyMXN(summary.pendingInterestCost)}</strong></span>
        <span>Pagos pendientes: <strong>{summary.pendingInstallments}</strong></span>
      </div>
    );
  }

  return (
    <div className="grid gap-2 text-sm sm:grid-cols-3">
      <span>Activas: <strong>{summary.activePurchases}</strong></span>
      <span>Total original pendiente: <strong>{formatCurrencyMXN(summary.pendingOriginalTotal)}</strong></span>
      <span>Pagos pendientes: <strong>{summary.pendingInstallments}</strong></span>
    </div>
  );
}

export function PurchaseCard({ purchase, isPending, onAction, onDelete }: {
  purchase: MsiPurchase;
  isPending: boolean;
  onAction: (installment: MsiInstallment, nextStatus: 'paid' | 'pending') => void;
  onDelete: (purchase: MsiPurchase) => void;
}) {
  const paidCount = paidInstallmentsCount(purchase);
  const pendingTotal = purchasePendingTotal(purchase);

  return (
    <details className="rounded-xl border bg-white p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">{purchase.description}</p>
            <p className="text-xs text-muted-foreground">{purchase.accountName} · mensualidad {formatCurrencyMXN(purchase.monthlyAmount)}</p>
          </div>
          <div className="text-sm text-slate-700 md:text-right">
            <p>{paidCount}/{purchase.months} pagados</p>
            <p className="font-medium">Pendiente {formatCurrencyMXN(pendingTotal)}</p>
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t pt-4">
        <div className="grid gap-3 text-sm md:grid-cols-4">
          <div><p className="text-muted-foreground">Monto original</p><p className="font-semibold">{formatCurrencyMXN(purchase.originalAmount)}</p></div>
          <div><p className="text-muted-foreground">Total financiado</p><p className="font-semibold">{formatCurrencyMXN(purchase.totalFinancedAmount)}</p></div>
          <div><p className="text-muted-foreground">Costo por intereses</p><p className="font-semibold">{purchase.interestCost > 0 ? formatCurrencyMXN(purchase.interestCost) : 'Sin intereses'}</p></div>
          <div><p className="text-muted-foreground">Meses</p><p className="font-semibold">{purchase.months}</p></div>
          <div><p className="text-muted-foreground">Mensualidad</p><p className="font-semibold">{formatCurrencyMXN(purchase.monthlyAmount)}</p></div>
          <div><p className="text-muted-foreground">Categoría</p><p className="font-semibold">{purchase.category}</p></div>
          <div><p className="text-muted-foreground">Fecha</p><p className="font-semibold">{formatDate(purchase.purchaseDate)}</p></div>
          <div><p className="text-muted-foreground">Estado</p><p className="font-semibold">{purchase.status}</p></div>
        </div>

        <div className="divide-y rounded-xl border">
          {purchase.installments.map((installment) => (
            <div key={installment.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">Pago {installment.installmentNumber}/{purchase.months} · {formatCurrencyMXN(installment.amount)}</p>
                <p className="text-xs text-muted-foreground">{installment.status === 'paid' ? `Pagado ${formatDate(installment.paidAt)}` : 'Pendiente'}</p>
              </div>
              {installment.status === 'pending' ? (
                <Button disabled={isPending} onClick={() => onAction(installment, 'paid')}>Marcar como pagado</Button>
              ) : (
                <Button disabled={isPending} variant="outline" onClick={() => onAction(installment, 'pending')}>Regresar a pendiente</Button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <Button
            className="border-red-200 text-red-700 hover:bg-red-50"
            disabled={isPending}
            variant="outline"
            onClick={() => onDelete(purchase)}
          >
            Eliminar compra
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">Solo elimina el control MSI y sus pagos programados; no modifica movimientos ya registrados.</p>
        </div>
      </div>
    </details>
  );
}

function PurchaseSection({ title, buttonLabel, type, purchases, summary, isPending, onAction, onDelete }: {
  title: string;
  buttonLabel: string;
  type: MsiFinancingType;
  purchases: MsiPurchase[];
  summary: MsiSectionSummary;
  isPending: boolean;
  onAction: (installment: MsiInstallment, nextStatus: 'paid' | 'pending') => void;
  onDelete: (purchase: MsiPurchase) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <SectionSummary type={type} summary={summary} />
        </div>
        <Button variant="outline" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen}>
          {isOpen ? 'Ocultar compras' : buttonLabel}
        </Button>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-3">
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay compras en este apartado.</p>
          ) : purchases.map((purchase) => (
            <PurchaseCard key={purchase.id} purchase={purchase} isPending={isPending} onAction={onAction} onDelete={onDelete} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function MsiManager({ initialData }: { initialData: MsiData }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const groupedPurchases = useMemo(() => ({
    interestFree: initialData.purchases.filter((purchase) => purchase.financingType !== 'interest_bearing'),
    interestBearing: initialData.purchases.filter((purchase) => purchase.financingType === 'interest_bearing')
  }), [initialData.purchases]);

  const runAction = (installment: MsiInstallment, nextStatus: 'paid' | 'pending') => {
    startTransition(async () => {
      try {
        const response = nextStatus === 'paid'
          ? await markMsiInstallmentAsPaidAction({ installmentId: installment.id })
          : await restoreMsiInstallmentToPendingAction({ installmentId: installment.id });
        setMessage(response.message);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el pago MSI.');
      }
    });
  };

  const runDelete = (purchase: MsiPurchase) => {
    const confirmed = window.confirm('¿Eliminar esta compra a meses? Se eliminarán también sus pagos programados. Esta acción no modifica movimientos ya registrados.');
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const response = await deleteMsiPurchaseAction({ purchaseId: purchase.id });
        setMessage(response.message);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'No fue posible eliminar la compra a meses.');
      }
    });
  };

  if (!initialData.hasHousehold) {
    return (
      <Card>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Configura tu hogar</h3>
          <p className="text-sm text-muted-foreground">Necesitas completar onboarding antes de controlar compras a meses.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card><div className="space-y-1"><p className="text-sm text-muted-foreground">MSI · Activas</p><h3 className="text-lg font-semibold">{initialData.summary.interestFree.activePurchases}</h3><p className="text-sm">Pendiente: {formatCurrencyMXN(initialData.summary.interestFree.pendingFinancedTotal)}</p></div></Card>
        <Card><div className="space-y-1"><p className="text-sm text-muted-foreground">Con intereses · Activas</p><h3 className="text-lg font-semibold">{initialData.summary.interestBearing.activePurchases}</h3><p className="text-sm">Pendiente financiado: {formatCurrencyMXN(initialData.summary.interestBearing.pendingFinancedTotal)} · Intereses: {formatCurrencyMXN(initialData.summary.interestBearing.pendingInterestCost)}</p></div></Card>
      </div>

      {message ? <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{message}</p> : null}

      <PurchaseSection
        title="Meses sin intereses"
        buttonLabel="Ver compras sin intereses"
        type="interest_free"
        purchases={groupedPurchases.interestFree}
        summary={initialData.summary.interestFree}
        isPending={isPending}
        onAction={runAction}
        onDelete={runDelete}
      />
      <PurchaseSection
        title="Meses con intereses"
        buttonLabel="Ver compras con intereses"
        type="interest_bearing"
        purchases={groupedPurchases.interestBearing}
        summary={initialData.summary.interestBearing}
        isPending={isPending}
        onAction={runAction}
        onDelete={runDelete}
      />
    </div>
  );
}
