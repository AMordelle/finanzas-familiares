export function diagnosisGenerator(diagnoses: string[]) {
  return diagnoses.map((d) => `Diagnóstico: ${d}`).join(' ');
}
