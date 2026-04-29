import type { AccountOption, MovementHistoryItem } from '@/lib/db/queries';

export type DateFilter = 'all'|'today'|'this_week'|'this_month'|'previous_month'|'custom';
export type AmountFilter = 'all'|'lt_100'|'100_500'|'500_1000'|'gt_1000'|'custom';
export type AccountMode = 'any'|'source'|'destination'|'involved';

export type MovementFilters = {
  dateFilter: DateFilter;
  customDateFrom?: string;
  customDateTo?: string;
  type: string;
  accountMode: AccountMode;
  account: string;
  category: string;
  amountFilter: AmountFilter;
  customAmountMin?: number;
  customAmountMax?: number;
  search: string;
};

export function normalizeType(value: string) {
  const n = value.toLowerCase().replace(/\s+/g, '_');
  if (n === 'pago_de_deuda') return 'pago_deuda';
  if (n === 'pago_recibido') return 'pago_recibido';
  if (n === 'prestamo_otorgado') return 'prestamo_otorgado';
  return n;
}

export function applyQuickFilter(kind: 'gastos_hormiga'|'gastos_fuertes'|'deuda'|'sin_clasificar'|'negocio_operacion', base: MovementFilters): MovementFilters {
  if (kind === 'gastos_hormiga') return { ...base, type: 'gasto', amountFilter: 'custom', customAmountMin: 0, customAmountMax: 150, dateFilter: 'this_month' };
  if (kind === 'gastos_fuertes') return { ...base, amountFilter: 'gt_1000' };
  if (kind === 'deuda') return { ...base, type: 'pago_deuda' };
  if (kind === 'sin_clasificar') return { ...base, category: '__UNCLASSIFIED__' };
  return { ...base, search: 'operativa negocio operación' };
}

export function filterMovements(movements: MovementHistoryItem[], filters: MovementFilters, _accounts: AccountOption[], now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  return movements.filter((m) => {
    const d = new Date(m.fecha);
    if (filters.dateFilter === 'today' && d < startOfToday) return false;
    if (filters.dateFilter === 'this_week' && d < startOfWeek) return false;
    if (filters.dateFilter === 'this_month' && d < startOfMonth) return false;
    if (filters.dateFilter === 'previous_month' && (d < startPrevMonth || d > endPrevMonth)) return false;
    if (filters.dateFilter === 'custom') {
      if (filters.customDateFrom && d < new Date(`${filters.customDateFrom}T00:00:00`)) return false;
      if (filters.customDateTo && d > new Date(`${filters.customDateTo}T23:59:59`)) return false;
    }

    if (filters.type !== 'all' && normalizeType(m.tipoMovimiento) !== filters.type) return false;

    if (filters.account) {
      const source = m.cuentaOrigen ?? '';
      const dest = m.cuentaDestino ?? '';
      if (filters.accountMode === 'source' && source !== filters.account) return false;
      if (filters.accountMode === 'destination' && dest !== filters.account) return false;
      if ((filters.accountMode === 'any' || filters.accountMode === 'involved') && source !== filters.account && dest !== filters.account) return false;
    }

    if (filters.category === '__UNCLASSIFIED__') {
      const c = (m.categoria || '').toLowerCase();
      if (c && !['sin_categoria', 'sin categoría', 'otros', 'n/a'].includes(c)) return false;
    } else if (filters.category !== 'all' && m.categoria !== filters.category) return false;

    if (filters.amountFilter === 'lt_100' && !(m.monto < 100)) return false;
    if (filters.amountFilter === '100_500' && !(m.monto >= 100 && m.monto <= 500)) return false;
    if (filters.amountFilter === '500_1000' && !(m.monto > 500 && m.monto <= 1000)) return false;
    if (filters.amountFilter === 'gt_1000' && !(m.monto > 1000)) return false;
    if (filters.amountFilter === 'custom') {
      if (typeof filters.customAmountMin === 'number' && m.monto < filters.customAmountMin) return false;
      if (typeof filters.customAmountMax === 'number' && m.monto > filters.customAmountMax) return false;
    }

    const q = filters.search.trim().toLowerCase();
    if (q) {
      const hay = [m.descripcion, m.cuentaOrigen, m.cuentaDestino, m.categoria, m.tipoMovimiento].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

export function buildDynamicSummary(movements: MovementHistoryItem[]) {
  let ingresos = 0; let gastos = 0; let pagoDeuda = 0;
  const accountCount = new Map<string, number>();
  const categoryCount = new Map<string, number>();
  for (const m of movements) {
    const t = normalizeType(m.tipoMovimiento);
    if (t === 'ingreso' || t === 'pago_recibido') ingresos += m.monto;
    else if (t === 'pago_deuda') pagoDeuda += m.monto;
    else if (t === 'gasto') gastos += m.monto;

    if (m.cuentaOrigen) accountCount.set(m.cuentaOrigen, (accountCount.get(m.cuentaOrigen) ?? 0) + 1);
    if (m.cuentaDestino) accountCount.set(m.cuentaDestino, (accountCount.get(m.cuentaDestino) ?? 0) + 1);
    categoryCount.set(m.categoria, (categoryCount.get(m.categoria) ?? 0) + 1);
  }
  const top = <T extends string>(map: Map<T, number>) => [...map.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? 'N/A';
  return { count: movements.length, ingresos, gastos, pagoDeuda, balanceNeto: ingresos - gastos - pagoDeuda, cuentaMasUsada: top(accountCount), categoriaPrincipal: top(categoryCount) };
}

export function inferCategories(movements: MovementHistoryItem[]) {
  return [...new Set(movements.map((m) => m.categoria).filter(Boolean))];
}
