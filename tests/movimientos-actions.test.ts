import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSchemaParse = vi.fn();
const deleteSchemaParse = vi.fn();
const updateMovementMock = vi.fn();
const deleteMovementMock = vi.fn();
const revalidatePathMock = vi.fn();

describe('movimientos actions revalidation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    updateSchemaParse.mockImplementation((payload) => payload);
    deleteSchemaParse.mockImplementation((payload) => payload);

    vi.doMock('next/cache', () => ({
      revalidatePath: revalidatePathMock
    }));

    vi.doMock('@/lib/db/queries', () => ({
      movementEditSchema: { safeParse: (payload: unknown) => ({ success: true, data: updateSchemaParse(payload) }) },
      movementDeleteSchema: { safeParse: (payload: unknown) => ({ success: true, data: deleteSchemaParse(payload) }) },
      updateMovement: updateMovementMock,
      deleteMovement: deleteMovementMock
    }));
  });

  it('revalida dashboard, movimientos y cuentas tras editar', async () => {
    const { updateMovementAction } = await import('@/app/movimientos/actions');

    const payload = {
      movementId: '00000000-0000-4000-8000-000000000010',
      description: 'Movimiento actualizado',
      amount: 300,
      sourceAccountId: '00000000-0000-4000-8000-000000000011',
      destinationAccountId: null
    };

    const result = await updateMovementAction(payload);

    expect(updateSchemaParse).toHaveBeenCalledWith(payload);
    expect(updateMovementMock).toHaveBeenCalledWith(payload);
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(revalidatePathMock).toHaveBeenCalledWith('/proyeccion');
    expect(result).toEqual({ success: true, message: 'Movimiento actualizado correctamente.' });
  });

  it('revalida dashboard, movimientos y cuentas tras eliminar', async () => {
    const { deleteMovementAction } = await import('@/app/movimientos/actions');

    const payload = { movementId: '00000000-0000-4000-8000-000000000020' };
    const result = await deleteMovementAction(payload);

    expect(deleteSchemaParse).toHaveBeenCalledWith(payload);
    expect(deleteMovementMock).toHaveBeenCalledWith(payload);
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(result).toEqual({ success: true, message: 'Movimiento eliminado correctamente.' });
  });
});
