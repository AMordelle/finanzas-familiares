export function simulationExplainer(result: {
  strategy: string;
  mrfBefore: number;
  mrfAfter: number;
  debtPressureBefore: number;
  debtPressureAfter: number;
}) {
  return `Con la estrategia ${result.strategy}, tu MRF pasaría de ${result.mrfBefore} a ${result.mrfAfter} meses y la presión por deuda de ${Math.round(result.debtPressureBefore * 100)}% a ${Math.round(result.debtPressureAfter * 100)}%.`;
}
