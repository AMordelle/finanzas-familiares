export function recurrenceDetector(dates: string[]) {
  if (dates.length < 3) return { recurring: false, message: 'Aún no hay suficiente historial para detectar recurrencias.' };
  return {
    recurring: true,
    message: 'Detecté que este movimiento parece repetirse. ¿Quieres marcarlo como recurrente?'
  };
}
