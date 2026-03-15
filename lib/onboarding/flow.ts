import { z } from 'zod';
import {
  buildRecommendations,
  buildTopDiagnoses,
  calculateAnnualAverageIncome,
  calculateAvailableMoney,
  calculateExtendedMRF,
  calculateImmediateMRF,
  calculateMonthlyOFH,
  calculateRegularIncome,
  calculateWeeklyOFH
} from '@/lib/financial/engine';

const amountSchema = z.coerce.number().nonnegative('El monto debe ser mayor o igual a 0');
const optionalAmountSchema = z.union([z.literal(''), z.number(), z.string()]).transform((value) => {
  if (value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
});

export const periodicitySchema = z.enum(['semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'anual']);

export const onboardingItemSchema = z.object({
  nombre: z.string().min(2, 'Escribe un nombre válido'),
  monto: amountSchema,
  periodicidad: periodicitySchema.optional(),
  mesEsperado: z.number().int().min(1).max(12).optional(),
  saldoInicial: optionalAmountSchema.optional(),
  pagoPeriodico: optionalAmountSchema.optional(),
  diaPago: z.union([z.literal(''), z.number(), z.string()]).optional().transform((value) => {
    if (value === undefined || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return undefined;
    return parsed;
  }),
  contraparte: z.string().optional()
});

export const onboardingPayloadSchema = z.object({
  householdName: z.string().min(2, 'El nombre del hogar es obligatorio'),
  householdType: z.enum(['solo', 'pareja', 'familia']),
  regularIncomes: z.array(onboardingItemSchema.pick({ nombre: true, monto: true, periodicidad: true })).min(1, 'Agrega al menos un ingreso regular'),
  extraordinaryIncomes: z.array(onboardingItemSchema.pick({ nombre: true, monto: true, mesEsperado: true })).default([]),
  operationalAccounts: z.array(onboardingItemSchema.pick({ nombre: true, saldoInicial: true })).min(1, 'Agrega al menos una cuenta operativa'),
  fundAccounts: z.array(onboardingItemSchema.pick({ nombre: true, saldoInicial: true })).default([]),
  debtAccounts: z.array(onboardingItemSchema.pick({ nombre: true, saldoInicial: true, pagoPeriodico: true, diaPago: true })).default([]),
  receivables: z.array(onboardingItemSchema.pick({ nombre: true, monto: true, contraparte: true })).default([]),
  fixedExpenses: z.array(onboardingItemSchema.pick({ nombre: true, monto: true, periodicidad: true })).default([]),
  variableSpending: z.array(onboardingItemSchema.pick({ nombre: true, monto: true })).default([])
});

export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;

const periodicityFactor: Record<z.infer<typeof periodicitySchema>, number> = {
  semanal: 52 / 12,
  quincenal: 2,
  mensual: 1,
  bimestral: 0.5,
  trimestral: 1 / 3,
  anual: 1 / 12
};

const toMonthly = (amount: number, periodicity: z.infer<typeof periodicitySchema> = 'mensual') => amount * periodicityFactor[periodicity];

export function buildInitialIndicators(input: OnboardingPayload) {
  const regularIncomeMonthly = calculateRegularIncome(
    input.regularIncomes.reduce((acc, item) => acc + toMonthly(item.monto, item.periodicidad ?? 'mensual'), 0)
  );

  const annualExtraIncome = input.extraordinaryIncomes.reduce((acc, item) => acc + item.monto, 0);
  const fixedExpenses = input.fixedExpenses.reduce((acc, item) => acc + toMonthly(item.monto, item.periodicidad ?? 'mensual'), 0);
  const avgVariableExpenses = input.variableSpending.reduce((acc, item) => acc + item.monto, 0);
  const debtPayments = input.debtAccounts.reduce((acc, item) => acc + (item.pagoPeriodico ?? 0), 0);
  const periodicExpensesMonthlyEquivalent = 0;

  const operativeMoney = input.operationalAccounts.reduce((acc, item) => acc + (item.saldoInicial ?? 0), 0);
  const liquidFunds = input.fundAccounts.reduce((acc, item) => acc + (item.saldoInicial ?? 0), 0);
  const liquidInvestments = 0;
  const debtBalance = input.debtAccounts.reduce((acc, item) => acc + (item.saldoInicial ?? 0), 0);

  const financialInput = {
    fixedExpenses,
    avgVariableExpenses,
    debtPayments,
    periodicExpensesMonthlyEquivalent,
    safetyMarginPct: 10,
    regularIncomeMonthly,
    annualExtraIncome,
    operativeMoney,
    liquidFunds,
    liquidInvestments,
    debtBalance,
    totalFixedExpenses: fixedExpenses,
    variableSeries: input.variableSpending.map((item) => item.monto),
    reservesUsageLastMonth: 0
  };

  const monthlyOFH = calculateMonthlyOFH(financialInput);
  const weeklyOFH = calculateWeeklyOFH(monthlyOFH);
  const annualAverageMonthlyIncome = calculateAnnualAverageIncome(regularIncomeMonthly, annualExtraIncome);
  const immediateMRF = calculateImmediateMRF(monthlyOFH, operativeMoney, liquidFunds);
  const extendedMRF = calculateExtendedMRF(monthlyOFH, operativeMoney, liquidFunds, liquidInvestments);
  const availableMoney = calculateAvailableMoney(operativeMoney);
  const diagnoses = buildTopDiagnoses(financialInput);
  const recommendations = buildRecommendations(diagnoses);

  return {
    monthlyOFH,
    weeklyOFH,
    regularIncomeMonthly,
    annualAverageMonthlyIncome,
    immediateMRF,
    extendedMRF,
    availableMoney,
    diagnoses,
    recommendations,
    financialInput
  };
}
