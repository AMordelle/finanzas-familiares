import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.fn();
const updateMock = vi.fn();
const deactivateMock = vi.fn();
const reorderMock = vi.fn();
const revalidatePathMock = vi.fn();

const upsertSchemaParse = vi.fn((payload) => payload);
const deactivateSchemaParse = vi.fn((payload) => payload);

describe('cuentas actions revalidation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
    vi.doMock('@/lib/db/queries', () => ({
      accountUpsertSchema: { safeParse: (payload: unknown) => ({ success: true, data: upsertSchemaParse(payload) }) },
      accountUpdateSchema: { safeParse: (payload: unknown) => ({ success: true, data: upsertSchemaParse(payload) }) },
      accountDeactivateSchema: { safeParse: (payload: unknown) => ({ success: true, data: deactivateSchemaParse(payload) }), shape: { accountId: {} } },
      accountReorderSchema: { safeParse: (payload: unknown) => ({ success: true, data: payload }) },
      createAccount: createMock,
      updateAccount: updateMock,
      deactivateAccount: deactivateMock,
      saveAccountDisplayOrder: reorderMock
    }));
  });

  it('revalida rutas tras crear', async () => {
    const { createAccountAction } = await import('@/app/cuentas/actions');
    await createAccountAction({ name: 'Caja', type: 'operational_cash', balance: 200 });

    expect(createMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/registro');
  });

  it('revalida rutas tras editar', async () => {
    const { updateAccountAction } = await import('@/app/cuentas/actions');
    await updateAccountAction({ accountId: '00000000-0000-4000-8000-000000000001', name: 'Caja', type: 'operational_cash', balance: 250 });

    expect(updateMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/registro');
  });

  it('revalida rutas tras reordenar cuentas', async () => {
    const { reorderAccountsAction } = await import('@/app/cuentas/actions');
    await reorderAccountsAction({ accountIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'] });

    expect(reorderMock).toHaveBeenCalledWith({ accountIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'] });
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
  });

  it('revalida rutas tras desactivar', async () => {
    const { deactivateAccountAction } = await import('@/app/cuentas/actions');
    await deactivateAccountAction({ accountId: '00000000-0000-4000-8000-000000000002' });

    expect(deactivateMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/registro');
  });
});
