import { z } from 'zod';

export const onboardingSchema = z.object({
  householdName: z.string().min(2),
  regularIncome: z.number().nonnegative(),
  extraIncomeAnnual: z.number().nonnegative(),
  fixedExpenses: z.number().nonnegative(),
  variableExpenses: z.number().nonnegative()
});

export const simulationSchema = z.object({
  strategy: z.enum(['pagar_deuda', 'fortalecer_fondo', 'guardar_efectivo', 'mixta', 'apartar_meta']),
  amount: z.number().positive()
});

export const conversationalPayloadSchema = z.object({
  rawText: z.string().min(1),
  confirmed: z.boolean().default(false)
});
