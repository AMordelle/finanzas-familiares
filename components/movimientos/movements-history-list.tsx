'use client';

import React from 'react';
import { ArrowUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { AccountOption, FinancialCategoryCatalogItem, MovementHistoryItem } from '@/lib/db/queries';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import { deleteMovementAction, updateMovementAction } from '@/app/movimientos/actions';
import { ALL_SUBCATEGORIES, applyQuickFilter, buildDynamicSummary, filterMovements, inferCategories, WITHOUT_SUBCATEGORY, type MovementFilters, type QuickFilter } from '@/lib/movements/filters';

type Props = {
  movements: MovementHistoryItem[];
  accounts: AccountOption[];
  categoryCatalog: FinancialCategoryCatalogItem[];
};

type MovementVisual = {
  shortType: 'Ingreso' | 'Gasto efectivo' | 'Gasto TDC' | 'Pago deuda' | 'Transferencia' | 'Traslado deuda';
  impact: 'inflow' | 'outflow' | 'neutral';
};

export function changeMovementCategory(filters: MovementFilters, category: string): MovementFilters {
  return { ...filters, category, subcategory: ALL_SUBCATEGORIES };
}

export type MovementSubcategoryOption = {
  key: string;
  name: string;
  historical: boolean;
};

function formatHistoricalSubcategory(key: string) {
  const words = key.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : key;
}

export function getSubcategoriesForCategory(
  categoryCatalog: FinancialCategoryCatalogItem[],
  movements: MovementHistoryItem[],
  category: string
): MovementSubcategoryOption[] {
  const active = categoryCatalog.find((item) => item.key === category)?.subcategories ?? [];
  const options = new Map<string, MovementSubcategoryOption>(
    active.map((item) => [item.key, { key: item.key, name: item.name, historical: false }])
  );

  for (const movement of movements) {
    const key = movement.categoria === category ? movement.subcategoria?.trim() : '';
    if (key && !options.has(key)) {
      options.set(key, { key, name: formatHistoricalSubcategory(key), historical: true });
    }
  }

  return [...options.values()];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isDebtAccount(name: string | null) {
  if (!name) return false;
  const normalized = name.toLowerCase();
  return ['tdc', 'tarjeta', 'crédito', 'credito', 'deuda', 'loan'].some((keyword) => normalized.includes(keyword));
}

function getMovementVisual(movement: MovementHistoryItem): MovementVisual {
  if (movement.tipoMovimiento === 'Ingreso' || movement.tipoMovimiento === 'Pago recibido') {
    return { shortType: 'Ingreso', impact: 'inflow' };
  }

  if (movement.tipoMovimiento === 'Pago de deuda') {
    return { shortType: 'Pago deuda', impact: 'outflow' };
  }

  if (movement.tipoMovimiento === 'Gasto') {
    return {
      shortType: isDebtAccount(movement.cuentaOrigen) ? 'Gasto TDC' : 'Gasto efectivo',
      impact: 'outflow'
    };
  }

  if (movement.tipoMovimiento === 'Transferencia') {
    const isDebtTransfer = isDebtAccount(movement.cuentaOrigen) || isDebtAccount(movement.cuentaDestino);
    return {
      shortType: isDebtTransfer ? 'Traslado deuda' : 'Transferencia',
      impact: 'neutral'
    };
  }

  return { shortType: 'Transferencia', impact: 'neutral' };
}

function getAmountClass(impact: MovementVisual['impact']) {
  if (impact === 'inflow') return 'text-emerald-600';
  if (impact === 'outflow') return 'text-red-700';
  return 'text-slate-800';
}

function getAmountText(amount: number, impact: MovementVisual['impact']) {
  if (impact === 'inflow') return `+${formatCurrencyMXN(amount)}`;
  if (impact === 'outflow') return `-${formatCurrencyMXN(amount)}`;
  return `${formatCurrencyMXN(amount)} ⇄`;
}

export function MovementsHistoryList({ movements, accounts, categoryCatalog }: Props) {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const router = useRouter();
  const defaultFilters: MovementFilters = { dateFilter: 'all', type: 'all', accountMode: 'any', account: '', category: 'all', subcategory: ALL_SUBCATEGORIES, amountFilter: 'all', search: '' };
  const [filters, setFilters] = React.useState<MovementFilters>(defaultFilters);
  const categories = React.useMemo(() => inferCategories(movements), [movements]);
  const availableSubcategories = React.useMemo(
    () => getSubcategoriesForCategory(categoryCatalog, movements, filters.category),
    [categoryCatalog, movements, filters.category]
  );
  const hasSelectableCategory = filters.category !== 'all' && filters.category !== '__UNCLASSIFIED__' && categories.includes(filters.category);
  const filteredMovements = React.useMemo(() => filterMovements(movements, filters, accounts), [movements, filters, accounts]);
  const summary = React.useMemo(() => buildDynamicSummary(filteredMovements), [filteredMovements]);
  const hasActiveFilters = React.useMemo(() => {
    return (
      filters.dateFilter !== 'all' ||
      filters.type !== 'all' ||
      filters.account !== '' ||
      filters.category !== 'all' ||
      filters.subcategory !== ALL_SUBCATEGORIES ||
      filters.amountFilter !== 'all' ||
      filters.search.trim() !== ''
    );
  }, [filters]);

  const totalLabelByType: Record<string, string> = {
    ingreso: 'Total ingresos filtrados',
    gasto: 'Total gastos filtrados',
    pago_deuda: 'Total pagos de deuda filtrados'
  };

  const typeTotalLabel = totalLabelByType[filters.type];
  const typeTotalValue = filters.type === 'ingreso'
    ? summary.ingresos
    : filters.type === 'gasto'
      ? summary.gastos
      : filters.type === 'pago_deuda'
        ? summary.pagoDeuda
        : null;

  return (
    <>
      {successMessage && <Card><p className="text-sm text-emerald-700">{successMessage}</p></Card>}
      {errorMessage && <Card><p className="text-sm text-red-600">{errorMessage}</p></Card>}


      <Card>
        <div className="grid gap-2 md:grid-cols-3"> 
          <input className="rounded border p-2 text-sm" placeholder="Buscar" value={filters.search} onChange={(e)=>setFilters((p)=>({...p,search:e.target.value}))} />
          <select className="rounded border p-2 text-sm" value={filters.dateFilter} onChange={(e)=>setFilters((p)=>{
            const dateFilter = e.target.value as MovementFilters['dateFilter'];
            if (dateFilter !== 'custom') {
              return { ...p, dateFilter, customDateFrom: undefined, customDateTo: undefined };
            }
            return { ...p, dateFilter };
          })}>
            <option value="all">Todas las fechas</option><option value="today">Hoy</option><option value="this_week">Esta semana</option><option value="this_month">Este mes</option><option value="previous_month">Mes anterior</option><option value="custom">Rango personalizado</option>
          </select>
          <select className="rounded border p-2 text-sm" value={filters.type} onChange={(e)=>setFilters((p)=>({...p,type:e.target.value}))}>
            <option value="all">Todos los tipos</option><option value="ingreso">ingreso</option><option value="gasto">gasto</option><option value="transferencia">transferencia interna</option><option value="pago_deuda">pago_deuda</option><option value="prestamo_otorgado">prestamo_otorgado</option><option value="pago_recibido">pago_recibido</option><option value="objetivo_aporte">objetivo_aporte</option><option value="movimiento_terceros">movimiento_terceros</option><option value="compra_por_encargo">compra_por_encargo</option>
          </select>
          <select className="rounded border p-2 text-sm" value={filters.accountMode} onChange={(e)=>setFilters((p)=>({...p,accountMode:e.target.value as MovementFilters['accountMode']}))}><option value="any">Cualquier cuenta involucrada</option><option value="source">Cuenta origen</option><option value="destination">Cuenta destino</option><option value="involved">Cualquier involucrada</option></select>
          <select className="rounded border p-2 text-sm" value={filters.account} onChange={(e)=>setFilters((p)=>({...p,account:e.target.value}))}><option value="">Todas las cuentas</option>{accounts.map((a)=><option key={a.id} value={a.name}>{a.name}</option>)}</select>
          <select aria-label="Categoría" className="rounded border p-2 text-sm" value={filters.category} onChange={(e)=>setFilters((p)=>changeMovementCategory(p, e.target.value))}>
            <option value="all">Todas las categorías</option><option value="__UNCLASSIFIED__">Sin clasificar</option>
            {categories.map((categoryKey) => {
              const catalogItem = categoryCatalog.find((item) => item.key === categoryKey);
              return <option key={categoryKey} value={categoryKey}>{catalogItem?.name ?? categoryKey}</option>;
            })}
          </select>
          <select
            aria-label="Subcategoría"
            className="rounded border p-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            value={filters.subcategory}
            disabled={!hasSelectableCategory}
            onChange={(e)=>setFilters((p)=>({...p,subcategory:e.target.value}))}
          >
            <option value={ALL_SUBCATEGORIES}>
              {filters.category === 'all' ? 'Elige primero una categoría' : hasSelectableCategory ? 'Todas las subcategorías' : 'Sin subcategorías disponibles'}
            </option>
            {hasSelectableCategory && <option value={WITHOUT_SUBCATEGORY}>Sin subcategoría</option>}
            {availableSubcategories.map((subcategory)=><option key={subcategory.key} value={subcategory.key}>{subcategory.name}{subcategory.historical ? ' (histórica)' : ''}</option>)}
          </select>
          <select className="rounded border p-2 text-sm" value={filters.amountFilter} onChange={(e)=>setFilters((p)=>({...p,amountFilter:e.target.value as MovementFilters['amountFilter']}))}><option value="all">Todos los montos</option><option value="lt_100">menor a 100</option><option value="100_500">100 a 500</option><option value="500_1000">500 a 1000</option><option value="gt_1000">mayor a 1000</option><option value="custom">rango personalizado</option></select>
        </div>
        {filters.dateFilter === 'custom' && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>Desde</span>
              <input
                type="date"
                className="rounded border p-2 text-sm"
                value={filters.customDateFrom ?? ''}
                onChange={(e) => setFilters((p) => ({ ...p, customDateFrom: e.target.value || undefined }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>Hasta</span>
              <input
                type="date"
                className="rounded border p-2 text-sm"
                value={filters.customDateTo ?? ''}
                onChange={(e) => setFilters((p) => ({ ...p, customDateTo: e.target.value || undefined }))}
              />
            </label>
            {(!filters.customDateFrom || !filters.customDateTo) && (
              <p className="sm:col-span-2 text-xs text-slate-500">Selecciona fecha inicial y final</p>
            )}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">{(['gastos_hormiga','gastos_fuertes','deuda','sin_clasificar','negocio_operacion'] as QuickFilter[]).map((q)=><Button key={q} variant="outline" onClick={()=>setFilters((p)=>applyQuickFilter(q,p))}>{q}</Button>)}<Button variant="outline" onClick={()=>setFilters(defaultFilters)}>Limpiar filtros</Button></div>
        <div className="mt-2 space-y-1 text-xs text-slate-700">
          <p className="font-medium">{hasActiveFilters ? 'Resumen del filtro aplicado' : 'Resumen del historial visible'}</p>
          <p>Total de movimientos: {summary.count}</p>
          {typeTotalLabel && typeTotalValue !== null ? (
            <p>{typeTotalLabel}: {formatCurrencyMXN(typeTotalValue)}</p>
          ) : (
            <>
              <p>Ingresos: {formatCurrencyMXN(summary.ingresos)}</p>
              <p>Gastos: {formatCurrencyMXN(summary.gastos)}</p>
              <p>Pagos de deuda: {formatCurrencyMXN(summary.pagoDeuda)}</p>
              <p>Transferencias internas: {formatCurrencyMXN(summary.transferenciasInternas)}</p>
              <p>Balance neto: {formatCurrencyMXN(summary.balanceNeto)}</p>
            </>
          )}
          <p className="text-slate-600">Cuenta más usada: {summary.cuentaMasUsada} · Categoría principal: {summary.categoriaPrincipal}</p>
        </div>
      </Card>

      <div className="mt-4 space-y-2">
        {filteredMovements.map((movement) => {
          const isExpanded = expandedId === movement.id;
          const isEditing = editingId === movement.id;
          const visual = getMovementVisual(movement);

          return (
            <Card key={movement.id} className="overflow-hidden p-0">
              <button
                type="button"
                className="w-full p-3 text-left transition-colors hover:bg-slate-50"
                onClick={() => {
                  setErrorMessage(null);
                  setSuccessMessage(null);
                  setEditingId(null);
                  setExpandedId((prev) => (prev === movement.id ? null : movement.id));
                }}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-slate-500">{formatDate(movement.fecha)}</p>
                    <p className={`truncate font-medium ${getAmountClass(visual.impact)}`}>{visual.shortType}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold ${getAmountClass(visual.impact)}`}>{getAmountText(movement.monto, visual.impact)}</p>
                    <span className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>⌄</span>
                  </div>
                </div>
              </button>

              <div className={`grid transition-all duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="border-t border-slate-100 px-3 pb-3 pt-2 text-sm text-slate-700">
                    <div className="space-y-1.5">
                      <p><span className="font-semibold">Descripción:</span> {movement.descripcion}</p>
                      <p><span className="font-semibold">Cuenta origen:</span> {movement.cuentaOrigen ?? 'N/A'}</p>
                      <p><span className="font-semibold">Cuenta destino:</span> {movement.cuentaDestino ?? 'N/A'}</p>
                      <p>
                        <span className="font-semibold">Categoría:</span>{' '}
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{movement.categoria}</span>
                      </p>
                      <p>
                        <span className="font-semibold">Subcategoría:</span>{' '}
                        <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">{movement.subcategoria ?? 'Sin subcategoría'}</span>
                      </p>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={isPending || !movement.puedeEditar}
                        onClick={() => {
                          setErrorMessage(null);
                          setSuccessMessage(null);
                          setEditingId((prev) => (prev === movement.id ? null : movement.id));
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        disabled={isPending}
                        onClick={() => {
                          setErrorMessage(null);
                          setSuccessMessage(null);
                          startTransition(async () => {
                            try {
                              const result = await deleteMovementAction({ movementId: movement.id });
                              setSuccessMessage(result.message);
                              router.refresh();
                            } catch (error) {
                              setErrorMessage(error instanceof Error ? error.message : 'No se pudo eliminar el movimiento.');
                            }
                          });
                        }}
                      >
                        {isPending ? 'Procesando...' : 'Eliminar'}
                      </Button>
                    </div>

                    {!movement.puedeEditar && movement.motivoNoEditable && (
                      <p className="mt-2 text-xs text-amber-700">{movement.motivoNoEditable}</p>
                    )}

                    {isEditing && movement.puedeEditar && (
                      <EditMovementForm
                        movement={movement}
                        accounts={accounts}
                        categoryCatalog={categoryCatalog}
                        disabled={isPending}
                        onCancel={() => setEditingId(null)}
                        onSubmit={(payload) => {
                          setErrorMessage(null);
                          setSuccessMessage(null);
                          startTransition(async () => {
                            try {
                              const result = await updateMovementAction(payload);
                              setSuccessMessage(result.message);
                              setEditingId(null);
                              router.refresh();
                            } catch (error) {
                              setErrorMessage(error instanceof Error ? error.message : 'No se pudo actualizar el movimiento.');
                            }
                          });
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <BackToTopButton />
    </>
  );
}

export const BACK_TO_TOP_THRESHOLD = 480;

export function shouldShowBackToTop(scrollY: number) {
  return scrollY > BACK_TO_TOP_THRESHOLD;
}

export function scrollSmoothlyToTop(target: Pick<Window, 'scrollTo'>) {
  target.scrollTo({ top: 0, behavior: 'smooth' });
}

export function BackToTopControl({ visible, onActivate }: { visible: boolean; onActivate: () => void }) {
  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Volver al inicio"
      title="Volver al inicio"
      className="fixed bottom-20 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:bottom-6 sm:right-6"
      onClick={onActivate}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

export function BackToTopButton() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const updateVisibility = () => setVisible(shouldShowBackToTop(window.scrollY));
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  return <BackToTopControl visible={visible} onActivate={() => scrollSmoothlyToTop(window)} />;
}

function EditMovementForm({
  movement,
  accounts,
  categoryCatalog,
  disabled,
  onCancel,
  onSubmit
}: {
  movement: MovementHistoryItem;
  accounts: AccountOption[];
  categoryCatalog: FinancialCategoryCatalogItem[];
  disabled: boolean;
  onCancel: () => void;
  onSubmit: (payload: { movementId: string; description: string; amount: number; sourceAccountId: string | null; destinationAccountId: string | null; category: string; subcategory: string | null }) => void;
}) {
  const [description, setDescription] = React.useState(movement.descripcion);
  const [amount, setAmount] = React.useState(String(movement.monto));
  const initialCategory = categoryCatalog.some((item) => item.key === movement.categoria) ? movement.categoria : '';
  const [category, setCategory] = React.useState(initialCategory);
  const selectedCategory = categoryCatalog.find((item) => item.key === category);
  const selectedSubcategories = selectedCategory?.subcategories ?? [];
  const initialSubcategory = selectedSubcategories.some((item) => item.key === movement.subcategoria) ? movement.subcategoria ?? '' : '';
  const [subcategory, setSubcategory] = React.useState(initialSubcategory);

  const sourceAccountId = accounts.find((account) => account.name === movement.cuentaOrigen)?.id ?? '';
  const destinationAccountId = accounts.find((account) => account.name === movement.cuentaDestino)?.id ?? '';

  const [source, setSource] = React.useState(sourceAccountId);
  const [destination, setDestination] = React.useState(destinationAccountId);

  return (
    <form
      className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          movementId: movement.id,
          description,
          amount: Number(amount),
          sourceAccountId: source || null,
          destinationAccountId: destination || null,
          category,
          subcategory: subcategory || null
        });
      }}
    >
      <p className="text-sm font-semibold text-slate-900">Editar movimiento</p>
      <label className="block text-sm text-slate-700">
        Descripción
        <input className="mt-1 w-full rounded-md border border-slate-300 p-2" value={description} onChange={(event) => setDescription(event.target.value)} disabled={disabled} />
      </label>
      <label className="block text-sm text-slate-700">
        Monto
        <input className="mt-1 w-full rounded-md border border-slate-300 p-2" type="number" step="0.01" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={disabled} />
      </label>
      <label className="block text-sm text-slate-700">
        Categoría principal
        <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory(''); }} disabled={disabled || categoryCatalog.length === 0} required>
          <option value="">Selecciona una categoría</option>
          {categoryCatalog.map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}
        </select>
      </label>
      {!initialCategory && movement.categoria && <p className="text-xs text-amber-700">La categoría actual no existe en tu catálogo activo. Selecciona una categoría válida para guardar.</p>}
      <label className="block text-sm text-slate-700">
        Subcategoría opcional
        <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={subcategory} onChange={(event) => setSubcategory(event.target.value)} disabled={disabled || !category}>
          <option value="">Sin subcategoría</option>
          {selectedSubcategories.map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-700">
        Cuenta origen
        <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={source} onChange={(event) => setSource(event.target.value)} disabled={disabled}>
          <option value="">No aplica</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>
      <label className="block text-sm text-slate-700">
        Cuenta destino
        <select className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2" value={destination} onChange={(event) => setDestination(event.target.value)} disabled={disabled}>
          <option value="">No aplica</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={disabled || !category}>{disabled ? 'Guardando...' : 'Guardar cambios'}</Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>Cancelar</Button>
      </div>
    </form>
  );
}
