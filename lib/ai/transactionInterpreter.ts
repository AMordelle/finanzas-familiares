import { z } from 'zod';

export const transactionIntentSchema = z.object({
  action: z.enum(['ingreso', 'gasto', 'transferencia', 'deuda_pago', 'prestamo_otorgado', 'cobro_recibido']),
  amount: z.number().positive().optional(),
  category: z.string().optional(),
  sourceAccount: z.string().optional(),
  destinationAccount: z.string().optional(),
  counterparty: z.string().optional(),
  missingFields: z.array(z.string()).default([]),
  humanConfirmation: z.string()
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

export function buildLocalInterpretation(input: string): TransactionIntent {
  const amount = Number(input.match(/(\d+[\.,]?\d*)/)?.[1] ?? 0);
  const isExpense = /gast|pagué|pague|super|gasolina/i.test(input);
  const hasCash = /efectivo/i.test(input);

  return {
    action: isExpense ? 'gasto' : 'ingreso',
    amount: amount || undefined,
    category: isExpense ? 'gasto_variable' : 'ingreso_extra',
    sourceAccount: hasCash ? 'efectivo' : undefined,
    missingFields: hasCash ? [] : ['sourceAccount'],
    humanConfirmation: isExpense
      ? `Registré un gasto de $${amount || '---'}${hasCash ? ' pagado con efectivo' : ''}.`
      : `Registré un ingreso de $${amount || '---'}.`
  };
}
