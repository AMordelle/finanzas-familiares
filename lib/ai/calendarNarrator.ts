export function calendarNarrator(events: Array<{ label: string; amount: number }>) {
  const total = events.reduce((acc, e) => acc + e.amount, 0);
  return `En el periodo próximo tienes ${events.length} eventos por un total de $${total}. Te conviene revisar la semana con mayor concentración de pagos.`;
}
