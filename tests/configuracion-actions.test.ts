import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePathMock = vi.fn();
const reclassifyCategoryAuditMovementMock = vi.fn();

describe('configuración actions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('next/cache', () => ({
      revalidatePath: revalidatePathMock
    }));

    vi.doMock('@/lib/db/queries', () => ({
      assignCategoryToProjectionColumn: vi.fn(),
      createFinancialCategory: vi.fn(),
      createFinancialSubcategory: vi.fn(),
      createProjectionColumn: vi.fn(),
      removeCategoryFromProjectionColumn: vi.fn(),
      reclassifyCategoryAuditMovement: reclassifyCategoryAuditMovementMock,
      toggleFinancialCategory: vi.fn(),
      toggleFinancialSubcategory: vi.fn(),
      toggleProjectionColumn: vi.fn(),
      updateFinancialCategory: vi.fn(),
      updateFinancialSubcategory: vi.fn(),
      updateProjectionColumn: vi.fn()
    }));
  });

  it('revalida configuración, movimientos y proyección al reclasificar desde auditoría', async () => {
    reclassifyCategoryAuditMovementMock.mockResolvedValue({ category: 'gastos_variables', subcategory: 'oxxo' });
    const { reclassifyCategoryAuditMovementAction } = await import('@/app/configuracion/actions');
    const payload = { movementId: 'group-1', category: 'gastos_variables', subcategory: 'oxxo' };

    const result = await reclassifyCategoryAuditMovementAction(payload);

    expect(reclassifyCategoryAuditMovementMock).toHaveBeenCalledWith(payload);
    expect(revalidatePathMock).toHaveBeenCalledWith('/configuracion');
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
    expect(revalidatePathMock).toHaveBeenCalledWith('/proyeccion');
    expect(result).toEqual({ success: true, message: 'Movimiento reclasificado correctamente.', data: { category: 'gastos_variables', subcategory: 'oxxo' } });
  });
});
