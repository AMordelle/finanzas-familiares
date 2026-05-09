'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function closureCreateFormVisibilityReducer(
  current: boolean,
  action: 'expand_new' | 'cancel' | 'submit_success'
) {
  switch (action) {
    case 'expand_new':
      return true;
    case 'cancel':
    case 'submit_success':
      return false;
    default:
      return current;
  }
}

export function ClosureCreateCard({
  createAction,
  initialOpen = false
}: {
  createAction: (formData: FormData) => Promise<void>;
  initialOpen?: boolean;
}) {
  const [isFormExpanded, setIsFormExpanded] = useState(initialOpen);
  const formRef = useRef<HTMLFormElement>(null);

  function cancelForm() {
    formRef.current?.reset();
    setIsFormExpanded((current) => closureCreateFormVisibilityReducer(current, 'cancel'));
  }

  return (
    <Card>
      {!isFormExpanded ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Crear cierre</h2>
            <p className="mt-1 text-sm text-slate-600">Guarda un snapshot solo cuando quieras cerrar un periodo.</p>
          </div>
          <Button type="button" onClick={() => setIsFormExpanded((current) => closureCreateFormVisibilityReducer(current, 'expand_new'))}>
            Nuevo cierre
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Crear cierre</h2>
              <p className="mt-1 text-sm text-slate-600">Selecciona el rango y guarda la foto del dinero operativo real.</p>
            </div>
            <Button type="button" variant="outline" onClick={cancelForm}>
              Cancelar
            </Button>
          </div>

          <form
            ref={formRef}
            action={async (formData) => {
              await createAction(formData);
              formRef.current?.reset();
              setIsFormExpanded((current) => closureCreateFormVisibilityReducer(current, 'submit_success'));
            }}
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <label className="space-y-1 text-sm font-medium text-slate-700">
              Tipo de cierre
              <select name="type" required className="w-full rounded-xl border border-slate-300 px-3 py-2">
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Fecha inicial
              <input name="periodStart" type="date" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700">
              Fecha final
              <input name="periodEnd" type="date" required className="w-full rounded-xl border border-slate-300 px-3 py-2" />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
              Notas opcionales
              <textarea name="notes" rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Ej. Semana con pago de renta, gastos escolares o ingreso extra." />
            </label>

            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button type="submit">Crear cierre</Button>
              <Button type="button" variant="outline" onClick={cancelForm}>Cancelar</Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}
