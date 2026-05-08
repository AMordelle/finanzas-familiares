import type { ExtraWorkEntry, ExtraWorkType } from '@/lib/db/queries';

type ExtrasFormVisibilityAction = 'collapse' | 'expand_new' | 'start_edit' | 'submit_success';

export function extrasFormVisibilityReducer(current: boolean, action: ExtrasFormVisibilityAction) {
  switch (action) {
    case 'expand_new':
    case 'start_edit':
      return true;
    case 'collapse':
    case 'submit_success':
      return false;
    default:
      return current;
  }
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

export function formatMoneyAmount(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

export function typeLabel(type: ExtraWorkType) {
  if (type === 'overtime') return 'Tiempo extra';
  if (type === 'piecework') return 'Destajo';
  return 'Comidas';
}

export function quantityLabel(type: ExtraWorkType) {
  if (type === 'overtime') return 'Horas';
  if (type === 'piecework') return 'Destajos';
  return 'Importe';
}

export function quantityPlaceholder(type: ExtraWorkType) {
  if (type === 'meals') return '250';
  if (type === 'piecework') return '2';
  return '8';
}

export function quantityWithUnit(entry: ExtraWorkEntry) {
  if (entry.type === 'meals') return `Comidas · ${formatMoneyAmount(entry.quantity)}`;

  const quantity = formatQuantity(entry.quantity);
  if (entry.type === 'overtime') return `${quantity} ${entry.quantity === 1 ? 'hora' : 'horas'}`;
  return `${quantity} ${entry.quantity === 1 ? 'destajo' : 'destajos'}`;
}
