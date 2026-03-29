'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { AccountOption, MovementHistoryItem } from '@/lib/db/queries';
import { deleteMovementAction, updateMovementAction } from '@/app/movimientos/actions';

type Props = {
  movements: MovementHistoryItem[];
  accounts: AccountOption[];
};

function formatMoney(amount: number) {
  return `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function MovementsHistoryList({ movements, accounts }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      {successMessage && <Card><p className="text-sm text-emerald-700">{successMessage}</p></Card>}
      {errorMessage && <Card><p className="text-sm text-red-600">{errorMessage}</p></Card>}

      <div className="mt-4 space-y-3">
        {movements.map((movement) => {
          const isEditing = editingId === movement.id;

          return (
            <Card key={movement.id}>
              <div className="flex flex-col gap-2 text-sm text-slate-700 md:flex-row md:items-start md:justify-between">
                <div>
                  <p><span className="font-semibold">Fecha:</span> {formatDate(movement.fecha)}</p>
                  <p><span className="font-semibold">Tipo de movimiento:</span> {movement.tipoMovimiento}</p>
                  <p><span className="font-semibold">Categoría:</span> {movement.categoria}</p>
                  <p><span className="font-semibold">Descripción:</span> {movement.descripcion}</p>
                  <p><span className="font-semibold">Cuenta origen:</span> {movement.cuentaOrigen ?? 'N/A'}</p>
                  <p><span className="font-semibold">Cuenta destino:</span> {movement.cuentaDestino ?? 'N/A'}</p>
                </div>
                <p className="text-base font-semibold text-slate-900">{formatMoney(movement.monto)}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={isPending || !movement.puedeEditar}
                  onClick={() => {
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    setEditingId((prev) => (prev === movement.id ? null : movement.id));
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    startTransition(async () => {
                      try {
                        const result = await deleteMovementAction({ movementId: movement.id });
                        setSuccessMessage(result.message);
                        router.refresh();
                      } catch (error) {
                        setErrorMessage(error instanceof Error ? error.message : 'No se pudo eliminar el movimiento.');
                      }
                    });
                  }}
                >
                  {isPending ? 'Procesando...' : 'Eliminar'}
                </Button>
              </div>

              {!movement.puedeEditar && movement.motivoNoEditable && (
                <p className="mt-3 text-xs text-amber-700">{movement.motivoNoEditable}</p>
              )}

              {isEditing && movement.puedeEditar && (
                <EditMovementForm
                  movement={movement}
                  accounts={accounts}
                  disabled={isPending}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(payload) => {
                    setErrorMessage(null);
                    setSuccessMessage(null);
                    startTransition(async () => {
                      try {
                        const result = await updateMovementAction(payload);
                        setSuccessMessage(result.message);
                        setEditingId(null);
                        router.refresh();
                      } catch (error) {
                        setErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar el movimiento.');
                      }
                    });
                  }}
                />
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function EditMovementForm({
  movement,
  accounts,
  disabled,
  onCancel,
  onSubmit
}: {
  movement: MovementHistoryItem;
  accounts: AccountOption[];
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (payload: { movementId: string; description: string; amount: number; sourceAccountId: string | null; destinationAccountId: string | null }) => void;
}) {
  const [description, setDescription] = useState(movement.descripcion);
  const [amount, setAmount] = useState(String(movement.monto));

  const sourceAccountId = accounts.find((account) => account.name === movement.cuentaOrigen)?.id ?? '';
  const destinationAccountId = accounts.find((account) => account.name === movement.cuentaDestino)?.id ?? '';

  const [source, setSource] = useState(sourceAccountId);
  const [destination, setDestination] = useState(destinationAccountId);

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          movementId: movement.id,
          description,
          amount: Number(amount),
          sourceAccountId: source || null,
          destinationAccountId: destination || null
        });
      }}
    >
      <p className="text-sm font-semibold text-slate-900">Editar movimiento</p>
      <label className="block text-sm text-slate-700">
        Descripción
        <input className="mt-1 w-full rounded-md border border-slate-300 p-2" value={description} onChange={(event) => setDescription(event.target.value)} disabled={disabled} />
      </label>
      <label className="block text-sm text-slate-700">
        Monto
        <input className="mt-1 w-full rounded-md border border-slate-300 p-2" type="number" step="0.01" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={disabled} />
      </label>
      <label className="block text-sm text-slate-700">
        Cuenta origen
        <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={source} onChange={(event) => setSource(event.target.value)} disabled={disabled}>
          <option value="">No aplica</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-700">
        Cuenta destino
        <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={destination} onChange={(event) => setDestination(event.target.value)} disabled={disabled}>
          <option value="">No aplica</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={disabled}>{disabled ? 'Guardando...' : 'Guardar cambios'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>Cancelar</Button>
      </div>
    </form>
  );
}
