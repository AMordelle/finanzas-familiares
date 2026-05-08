'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createExtraWorkAction, deleteExtraWorkAction, markExtraWorkAsPaidAction, updateExtraWorkAction } from '@/app/extras/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  extrasFormVisibilityReducer,
  formatMoneyAmount,
  formatQuantity,
  quantityLabel,
  quantityPlaceholder,
  quantityWithUnit,
  typeLabel
} from '@/components/extras/extras-manager.helpers';
import type { ExtrasData, ExtraWorkEntry, ExtraWorkType } from '@/lib/db/queries';

type Props = {
  initialData: ExtrasData;
};

function todayAsInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatWorkDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function ExtrasManager({ initialData }: Props) {
  const router = useRouter();
  const [workDate, setWorkDate] = useState(todayAsInputValue());
  const [type, setType] = useState<ExtraWorkType>('overtime');
  const [quantity, setQuantity] = useState('');
  const [isFormExpanded, setIsFormExpanded] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const quantityInputLabel = useMemo(() => quantityLabel(type), [type]);
  const isEditing = Boolean(editingEntryId);

  const resetForm = ({ collapse = true }: { collapse?: boolean } = {}) => {
    setWorkDate(todayAsInputValue());
    setType('overtime');
    setQuantity('');
    setNotes('');
    setEditingEntryId(null);
    if (collapse) {
      setIsFormExpanded((current) => extrasFormVisibilityReducer(current, 'collapse'));
    }
  };

  const startEditing = (entry: ExtraWorkEntry) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setEditingEntryId(entry.id);
    setWorkDate(entry.workDate);
    setType(entry.type);
    setQuantity(formatQuantity(entry.quantity));
    setNotes(entry.notes ?? '');
    setIsFormExpanded((current) => extrasFormVisibilityReducer(current, 'start_edit'));
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-xl font-semibold">Extras</h2>
        <p className="mt-1 text-sm text-slate-600">Control operativo de tiempos extra, destajos y comidas pendientes de pago.</p>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-500">Pendientes</p>
          <p className="mt-1 text-2xl font-semibold">{initialData.summary.pendingCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Horas extra</p>
          <p className="mt-1 text-2xl font-semibold">{formatQuantity(initialData.summary.pendingOvertimeHours)} horas</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Destajos</p>
          <p className="mt-1 text-2xl font-semibold">{formatQuantity(initialData.summary.pendingPieceworkUnits)} destajos</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Comidas</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoneyAmount(initialData.summary.pendingMealsAmount)}</p>
        </Card>
      </div>

      <Card>
        {!isFormExpanded ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Registrar extra</h3>
              <p className="mt-1 text-sm text-slate-600">Agrega pendientes solo cuando lo necesites.</p>
            </div>
            <Button
              onClick={() => {
                resetForm({ collapse: false });
                setIsFormExpanded((current) => extrasFormVisibilityReducer(current, 'expand_new'));
              }}
            >
              + Nuevo extra
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{isEditing ? 'Editar extra' : 'Registrar extra'}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {isEditing ? 'Corrige fecha, tipo, cantidad o notas del pendiente.' : 'Las comidas son informativas y no mueven balances.'}
                </p>
              </div>
              <Button variant="outline" onClick={() => resetForm()} disabled={isPending}>{isEditing ? 'Cancelar edición' : 'Cancelar'}</Button>
            </div>
            <form
              className="mt-3 grid gap-3 md:grid-cols-4"
              onSubmit={(event) => {
                event.preventDefault();
                setErrorMessage(null);
                setSuccessMessage(null);
                startTransition(async () => {
                  try {
                    const payload = { workDate, type, quantity, notes };
                    const result = editingEntryId
                      ? await updateExtraWorkAction({ ...payload, entryId: editingEntryId })
                      : await createExtraWorkAction(payload);
                    setSuccessMessage(result.message);
                    resetForm();
                    setIsFormExpanded((current) => extrasFormVisibilityReducer(current, 'submit_success'));
                    router.refresh();
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : 'No se pudo guardar el extra.');
                  }
                });
              }}
            >
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span>Fecha</span>
                <input required type="date" className="rounded-xl border border-slate-300 p-2" value={workDate} onChange={(event) => setWorkDate(event.target.value)} />
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span>Tipo de trabajo</span>
                <select className="rounded-xl border border-slate-300 p-2" value={type} onChange={(event) => setType(event.target.value as ExtraWorkType)}>
                  <option value="overtime">Tiempo extra</option>
                  <option value="piecework">Destajo</option>
                  <option value="meals">Comidas</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span>{quantityInputLabel}</span>
                <input
                  required
                  min="0.01"
                  step="0.01"
                  type="number"
                  inputMode="decimal"
                  placeholder={quantityPlaceholder(type)}
                  className="rounded-xl border border-slate-300 p-2"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-slate-700 md:col-span-4">
                <span>Notas</span>
                <textarea
                  className="min-h-20 rounded-xl border border-slate-300 p-2"
                  placeholder="Opcional: describe el trabajo realizado."
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>

              <div className="md:col-span-4">
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Registrar extra'}
                </Button>
              </div>
            </form>
          </>
        )}

        {successMessage && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</p>}
        {errorMessage && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</p>}
      </Card>

      <Card>
        <h3 className="font-semibold">Extras pendientes de pago</h3>
        {!initialData.pendingEntries.length ? (
          <p className="mt-3 text-sm text-slate-600">No tienes extras pendientes de pago.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {initialData.pendingEntries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm text-slate-500">{formatWorkDate(entry.workDate)}</p>
                    <p className="font-semibold">
                      {entry.type === 'meals' ? quantityWithUnit(entry) : `${typeLabel(entry.type)} · ${quantityWithUnit(entry)}`}
                    </p>
                    {entry.notes && <p className="mt-1 text-sm text-slate-700">{entry.notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        setErrorMessage(null);
                        setSuccessMessage(null);
                        startTransition(async () => {
                          try {
                            const result = await markExtraWorkAsPaidAction({ entryId: entry.id });
                            setSuccessMessage(result.message);
                            if (editingEntryId === entry.id) resetForm();
                            router.refresh();
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : 'No se pudo marcar el extra como pagado.');
                          }
                        });
                      }}
                    >
                      Marcar como pagado
                    </Button>
                    <Button variant="outline" disabled={isPending} onClick={() => startEditing(entry)}>Editar</Button>
                    <Button
                      variant="outline"
                      disabled={isPending}
                      onClick={() => {
                        if (!window.confirm('¿Eliminar este extra? Esta acción quitará el registro de tu control de pendientes.')) return;

                        setErrorMessage(null);
                        setSuccessMessage(null);
                        startTransition(async () => {
                          try {
                            const result = await deleteExtraWorkAction({ entryId: entry.id });
                            setSuccessMessage(result.message);
                            if (editingEntryId === entry.id) resetForm();
                            router.refresh();
                          } catch (error) {
                            setErrorMessage(error instanceof Error ? error.message : 'No se pudo eliminar el extra.');
                          }
                        });
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
