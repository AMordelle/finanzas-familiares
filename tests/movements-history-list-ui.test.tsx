import React, { type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackToTopButton, MovementsHistoryList, getSubcategoriesForCategory } from '@/components/movimientos/movements-history-list';
import type { FinancialCategoryCatalogItem, MovementHistoryItem } from '@/lib/db/queries';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/movimientos/actions', () => ({ deleteMovementAction: vi.fn(), updateMovementAction: vi.fn() }));

const catalog: FinancialCategoryCatalogItem[] = [
  {
    id: 'food', name: 'Alimentación', key: 'comida', type: 'expense', noProjectable: false,
    subcategories: [{ id: 'coffee', name: 'Cafeterías', key: 'cafeterias' }]
  },
  {
    id: 'home', name: 'Hogar', key: 'hogar', type: 'expense', noProjectable: false,
    subcategories: [{ id: 'clean', name: 'Limpieza', key: 'limpieza' }]
  }
];

const movements: MovementHistoryItem[] = [
  { id: 'active', fecha: '2026-08-12T10:00:00Z', tipoMovimiento: 'Gasto', categoria: 'comida', subcategoria: 'cafeterias', descripcion: 'Café', monto: 80, cuentaOrigen: 'Banco', cuentaDestino: null, puedeEditar: true, motivoNoEditable: null },
  { id: 'historical', fecha: '2026-08-11T10:00:00Z', tipoMovimiento: 'Gasto', categoria: 'comida', subcategoria: 'comida_callejera', descripcion: 'Tacos históricos', monto: 120, cuentaOrigen: 'Banco', cuentaDestino: null, puedeEditar: true, motivoNoEditable: null },
  { id: 'home', fecha: '2026-08-10T10:00:00Z', tipoMovimiento: 'Gasto', categoria: 'hogar', subcategoria: 'limpieza', descripcion: 'Jabón', monto: 50, cuentaOrigen: 'Banco', cuentaDestino: null, puedeEditar: true, motivoNoEditable: null }
];

type ElementNode = ReactElement<Record<string, unknown>>;

function elements(node: ReactNode): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node as ElementNode, ...elements((node.props as { children?: ReactNode }).children)];
}

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (!React.isValidElement(node)) return '';
  return text((node.props as { children?: ReactNode }).children);
}

function byLabel(tree: ReactNode, label: string) {
  return elements(tree).find((node) => node.props['aria-label'] === label);
}

function buttonByText(tree: ReactNode, label: string) {
  return elements(tree).find((node) => (node.type === 'button' || typeof node.type === 'function') && text(node) === label);
}

function createMountedHistory() {
  const states: unknown[] = [];
  const effects: Array<() => void | (() => void)> = [];
  let cursor = 0;

  vi.spyOn(React, 'useState').mockImplementation(((initial: unknown) => {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
    return [states[index], (next: unknown) => {
      states[index] = typeof next === 'function' ? (next as (previous: unknown) => unknown)(states[index]) : next;
    }];
  }) as typeof React.useState);
  vi.spyOn(React, 'useMemo').mockImplementation(((factory: () => unknown) => factory()) as typeof React.useMemo);
  vi.spyOn(React, 'useTransition').mockReturnValue([false, (callback) => callback()]);
  vi.spyOn(React, 'useEffect').mockImplementation(((effect: () => void | (() => void)) => { effects.push(effect); }) as typeof React.useEffect);

  const render = () => {
    cursor = 0;
    const history = MovementsHistoryList({ movements, accounts: [], categoryCatalog: catalog });
    const backToTop = BackToTopButton();
    const control = React.isValidElement(backToTop) && typeof backToTop.type === 'function'
      ? (backToTop.type as (props: typeof backToTop.props) => ReactNode)(backToTop.props)
      : backToTop;
    return <>{history}{control}</>;
  };
  let tree = render();
  const cleanups = effects.splice(0).map((effect) => effect()).filter((cleanup): cleanup is () => void => typeof cleanup === 'function');

  return {
    get tree() { return tree; },
    rerender() { tree = render(); },
    unmount() { cleanups.forEach((cleanup) => cleanup()); }
  };
}

describe('interfaz montada de Movimientos', () => {
  const scrollTarget = new EventTarget() as EventTarget & { scrollY: number; scrollTo: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    scrollTarget.scrollY = 0;
    scrollTarget.scrollTo = vi.fn();
    vi.stubGlobal('window', scrollTarget);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('combina opciones activas e históricas sin duplicarlas y con etiqueta legible', () => {
    expect(getSubcategoriesForCategory(catalog, movements, 'comida')).toEqual([
      { key: 'cafeterias', name: 'Cafeterías', historical: false },
      { key: 'comida_callejera', name: 'Comida callejera', historical: true }
    ]);
  });

  it('selecciona categoría, filtra una histórica, reinicia al cambiar y limpia ambos filtros', () => {
    const mounted = createMountedHistory();
    let category = byLabel(mounted.tree, 'Categoría')!;
    let subcategory = byLabel(mounted.tree, 'Subcategoría')!;
    expect(subcategory.props.disabled).toBe(true);

    (category.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'comida' } });
    mounted.rerender();
    subcategory = byLabel(mounted.tree, 'Subcategoría')!;
    expect(subcategory.props.disabled).toBe(false);
    expect(text(subcategory)).toContain('Cafeterías');
    expect(text(subcategory)).toContain('Comida callejera (histórica)');
    expect(text(subcategory)).not.toContain('Limpieza');

    (subcategory.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'comida_callejera' } });
    mounted.rerender();
    expect(text(mounted.tree)).toContain('Tacos históricos');
    expect(text(mounted.tree)).not.toContain('Café');

    category = byLabel(mounted.tree, 'Categoría')!;
    (category.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'hogar' } });
    mounted.rerender();
    expect(byLabel(mounted.tree, 'Subcategoría')!.props.value).toBe('all');

    (buttonByText(mounted.tree, 'Limpiar filtros')!.props.onClick as () => void)();
    mounted.rerender();
    expect(byLabel(mounted.tree, 'Categoría')!.props.value).toBe('all');
    expect(byLabel(mounted.tree, 'Subcategoría')!.props).toMatchObject({ value: 'all', disabled: true });
    mounted.unmount();
  });

  it('reacciona al scroll, vuelve suavemente al inicio y elimina el listener al desmontar', () => {
    const removeEventListener = vi.spyOn(scrollTarget, 'removeEventListener');
    const mounted = createMountedHistory();
    expect(byLabel(mounted.tree, 'Volver al inicio')).toBeUndefined();

    scrollTarget.scrollY = 600;
    scrollTarget.dispatchEvent(new Event('scroll'));
    mounted.rerender();
    const backToTop = byLabel(mounted.tree, 'Volver al inicio')!;
    expect(backToTop.props.type).toBe('button');
    (backToTop.props.onClick as () => void)();
    expect(scrollTarget.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });

    scrollTarget.scrollY = 0;
    scrollTarget.dispatchEvent(new Event('scroll'));
    mounted.rerender();
    expect(byLabel(mounted.tree, 'Volver al inicio')).toBeUndefined();
    mounted.unmount();
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
