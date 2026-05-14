import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/movimientos/actions', () => ({
  updateMovementAction: vi.fn(),
  deleteMovementAction: vi.fn()
}));

import { EditMovementForm } from '@/components/movimientos/movements-history-list';

const movement = {
  id: 'movement-1',
  fecha: '2026-05-14T12:00:00.000Z',
  tipoMovimiento: 'Gasto',
  categoria: 'comida',
  descripcion: 'Comida corrida',
  monto: 120,
  cuentaOrigen: 'Banco',
  cuentaDestino: null,
  puedeEditar: true,
  motivoNoEditable: null
};

const accounts = [
  { id: 'account-bank', name: 'Banco', type: 'operational_cash' },
  { id: 'account-card', name: 'TDC', type: 'credit_card' }
];

describe('edición de categoría en movimientos', () => {
  it('muestra campo Categoría al editar un movimiento', () => {
    const html = renderToStaticMarkup(
      <EditMovementForm
        movement={movement}
        accounts={accounts}
        disabled={false}
        onCancel={() => undefined}
        onSubmit={() => undefined}
      />
    );

    expect(html).toContain('Editar movimiento');
    expect(html).toContain('Categoría');
    expect(html).toContain('value="comida"');
    expect(html).toContain('Ej. gasto_semanal, prime_iptv, pago_deuda');
  });
});
