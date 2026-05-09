'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

export function ClosureActions({
  closureId,
  recalculateAction,
  deleteAction
}: {
  closureId: string;
  recalculateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <form
        action={recalculateAction}
        onSubmit={(event) => {
          if (!window.confirm('Esto actualizará el snapshot del cierre usando la lógica actual.')) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="closureId" value={closureId} />
        <Button type="submit" variant="outline" className="text-xs">
          Recalcular cierre
        </Button>
      </form>
      <form
        action={deleteAction}
        onSubmit={(event) => {
          if (!window.confirm('¿Eliminar este cierre?')) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="closureId" value={closureId} />
        <Button type="submit" variant="outline" className="border-rose-200 text-xs text-rose-700 hover:bg-rose-50">
          Eliminar cierre
        </Button>
      </form>
    </div>
  );
}
