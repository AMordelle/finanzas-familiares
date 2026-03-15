import { describe, expect, it } from 'vitest';
import { buildInitialIndicators, onboardingPayloadSchema } from '@/lib/onboarding/flow';

describe('onboarding flow', () => {
  it('valida y transforma payload con pasos opcionales vacíos', () => {
    const parsed = onboardingPayloadSchema.parse({
      householdName: 'Hogar prueba',
      householdType: 'familia',
      regularIncomes: [{ nombre: 'Sueldo', monto: 24000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [],
      operationalAccounts: [{ nombre: 'Efectivo', saldoInicial: 3500 }],
      fundAccounts: [],
      debtAccounts: [],
      receivables: [],
      fixedExpenses: [{ nombre: 'Renta', monto: 9000, periodicidad: 'mensual' }],
      variableSpending: [{ nombre: 'Comida', monto: 4500 }]
    });

    expect(parsed.regularIncomes[0].nombre).toBe('Sueldo');
    expect(parsed.extraordinaryIncomes).toHaveLength(0);
  });

  it('calcula indicadores iniciales desde onboarding', () => {
    const indicators = buildInitialIndicators({
      householdName: 'Hogar prueba',
      householdType: 'solo',
      regularIncomes: [{ nombre: 'Sueldo', monto: 30000, periodicidad: 'mensual' }],
      extraordinaryIncomes: [{ nombre: 'Bono', monto: 24000, mesEsperado: 12 }],
      operationalAccounts: [{ nombre: 'Banco', saldoInicial: 12000 }],
      fundAccounts: [{ nombre: 'Fondo emergencia', saldoInicial: 8000 }],
      debtAccounts: [{ nombre: 'Tarjeta', saldoInicial: 15000, pagoPeriodico: 1500, diaPago: 15 }],
      receivables: [],
      fixedExpenses: [{ nombre: 'Renta', monto: 10000, periodicidad: 'mensual' }],
      variableSpending: [{ nombre: 'Comida', monto: 5000 }]
    });

    expect(indicators.monthlyOFH).toBeGreaterThan(0);
    expect(indicators.weeklyOFH).toBeGreaterThan(0);
    expect(indicators.regularIncomeMonthly).toBe(30000);
    expect(indicators.annualAverageMonthlyIncome).toBe(32000);
    expect(indicators.diagnoses.length).toBeGreaterThan(0);
    expect(indicators.recommendations.length).toBeGreaterThan(0);
  });
});
