import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MovementsHistoryList } from '@/components/movimientos/movements-history-list';
import type { AccountOption, MovementHistoryItem } from '@/lib/db/queries';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/movimientos/actions', () => ({
  updateMovementAction: vi.fn(),
  deleteMovementAction: vi.fn(),
  updateMovementProjectionTypeAction: vi.fn()
}));

const movements: MovementHistoryItem[] = [{
  id: 'movement-1',
  fecha: '2026-05-10T12:00:00.000Z',
  tipoMovimiento: 'Ingreso',
  categoria: 'ingreso_fijo',
  descripcion: 'Pago semanal',
  monto: 6400,
  cuentaOrigen: null,
  cuentaDestino: 'Banco',
  puedeEditar: true,
  motivoNoEditable: null,
  projectionType: 'recurrent'
}];

const accounts: AccountOption[] = [{ id: 'account-1', name: 'Banco', type: 'operational_cash' }];

describe('MovementsHistoryList projection classification', () => {
  it('muestra control compacto para clasificar movimientos en proyección', () => {
    const html = renderToStaticMarkup(<MovementsHistoryList movements={movements} accounts={accounts} />);

    expect(html).toContain('Clasificar para proyección');
    expect(html).toContain('Recurrente');
    expect(html).toContain('Extraordinario');
    expect(html).toContain('Interno');
    expect(html).toContain('Ignorar');
    expect(html).toContain('Pago de deuda');
  });
});
