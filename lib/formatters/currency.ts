const currencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

export function formatCurrencyMXN(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}
