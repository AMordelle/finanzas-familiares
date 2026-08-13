import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  BackToTopControl,
  BACK_TO_TOP_THRESHOLD,
  changeMovementCategory,
  getSubcategoriesForCategory,
  MovementsHistoryList,
  scrollSmoothlyToTop,
  shouldShowBackToTop
} from '@/components/movimientos/movements-history-list';
import { ALL_SUBCATEGORIES, type MovementFilters } from '@/lib/movements/filters';
import type { FinancialCategoryCatalogItem } from '@/lib/db/queries';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/movimientos/actions', () => ({ deleteMovementAction: vi.fn(), updateMovementAction: vi.fn() }));

const filters: MovementFilters = {
  dateFilter: 'all', type: 'all', accountMode: 'any', account: '', category: 'all',
  subcategory: ALL_SUBCATEGORIES, amountFilter: 'all', search: ''
};

const catalog: FinancialCategoryCatalogItem[] = [
  {
    id: 'food', name: 'Alimentación', key: 'comida', type: 'expense', noProjectable: false,
    subcategories: [
      { id: 'coffee', name: 'Cafeterías', key: 'cafeterias' },
      { id: 'market', name: 'Supermercado', key: 'supermercado' }
    ]
  },
  {
    id: 'home', name: 'Hogar', key: 'hogar', type: 'expense', noProjectable: false,
    subcategories: [{ id: 'clean', name: 'Limpieza', key: 'limpieza' }]
  }
];

describe('interfaz de filtros dependientes de Movimientos', () => {
  it('deshabilita el selector con Todas las categorías e indica el paso requerido', () => {
    const html = renderToStaticMarkup(<MovementsHistoryList movements={[]} accounts={[]} categoryCatalog={catalog} />);
    expect(html).toContain('aria-label="Subcategoría"');
    expect(html).toMatch(/aria-label="Subcategoría"[^>]*disabled=""/);
    expect(html).toContain('Elige primero una categoría');
  });

  it('mantiene neutral la subcategoría con Todas y limita opciones a la categoría elegida', () => {
    expect(filters.category).toBe('all');
    expect(filters.subcategory).toBe(ALL_SUBCATEGORIES);
    expect(getSubcategoriesForCategory(catalog, 'all')).toEqual([]);
    expect(getSubcategoriesForCategory(catalog, 'comida').map((item) => item.key)).toEqual(['cafeterias', 'supermercado']);
  });

  it('reinicia la subcategoría al cambiar categoría y al limpiar filtros', () => {
    const selected = { ...filters, category: 'comida', subcategory: 'cafeterias' };
    expect(changeMovementCategory(selected, 'hogar')).toMatchObject({ category: 'hogar', subcategory: ALL_SUBCATEGORIES });
    expect(filters).toMatchObject({ category: 'all', subcategory: ALL_SUBCATEGORIES });
  });
});

describe('botón Volver al inicio', () => {
  it('se oculta cerca del inicio y aparece después del umbral', () => {
    expect(shouldShowBackToTop(0)).toBe(false);
    expect(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD)).toBe(false);
    expect(shouldShowBackToTop(BACK_TO_TOP_THRESHOLD + 1)).toBe(true);
    expect(renderToStaticMarkup(<BackToTopControl visible={false} onActivate={() => undefined} />)).toBe('');
  });

  it('es un botón accesible y activa desplazamiento suave', () => {
    const html = renderToStaticMarkup(<BackToTopControl visible onActivate={() => undefined} />);
    expect(html).toContain('aria-label="Volver al inicio"');
    expect(html).toContain('type="button"');
    expect(html).toContain('h-11 w-11');

    const scrollTo = vi.fn();
    scrollSmoothlyToTop({ scrollTo });
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
