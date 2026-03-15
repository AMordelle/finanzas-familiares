export function financialNarrator(summary: { ofh: number; availableMoney: number; diagnoses: string[] }) {
  return `Tu hogar necesita aproximadamente $${summary.ofh} al mes para operar. Hoy tienes $${summary.availableMoney} disponibles. Prioridades: ${summary.diagnoses.join(', ')}.`;
}
