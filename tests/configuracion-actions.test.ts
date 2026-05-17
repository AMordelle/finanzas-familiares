import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePathMock = vi.fn();
const reclassifyCategoryAuditMovementMock = vi.fn();
const deleteFinancialCategoryMock = vi.fn();
const deleteFinancialSubcategoryMock = vi.fn();
const deleteProjectionColumnMock = vi.fn();

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
      deleteFinancialCategory: deleteFinancialCategoryMock,
      deleteFinancialSubcategory: deleteFinancialSubcategoryMock,
      deleteProjectionColumn: deleteProjectionColumnMock,
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

  it('revalida configuración y proyección al eliminar catálogo y columnas', async () => {
    const { deleteFinancialCategoryAction, deleteFinancialSubcategoryAction, deleteProjectionColumnAction } = await import('@/app/configuracion/actions');

    await deleteFinancialCategoryAction({ categoryId: 'cat-1' });
    await deleteFinancialSubcategoryAction({ subcategoryId: 'sub-1' });
    await deleteProjectionColumnAction({ columnId: 'col-1' });

    expect(deleteFinancialCategoryMock).toHaveBeenCalledWith({ categoryId: 'cat-1' });
    expect(deleteFinancialSubcategoryMock).toHaveBeenCalledWith({ subcategoryId: 'sub-1' });
    expect(deleteProjectionColumnMock).toHaveBeenCalledWith({ columnId: 'col-1' });
    expect(revalidatePathMock).toHaveBeenCalledWith('/configuracion');
    expect(revalidatePathMock).toHaveBeenCalledWith('/proyeccion');
  });

});
