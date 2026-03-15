import { z } from 'zod';

export const transactionIntentSchema = z.object({
  action: z.enum([
    'gasto',
    'ingreso',
    'transferencia',
    'pago_deuda',
    'prestamo_otorgado',
    'pago_recibido',
    'objetivo_aporte'
  ]),
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.string().min(1),
  sourceAccount: z.string().optional(),
  destinationAccount: z.string().optional(),
  missingFields: z.array(z.string()).default([]),
  humanConfirmation: z.string().min(1)
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

function parseAmount(input: string) {
  const normalized = input.replace(/,/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return Number(match?.[1] ?? 0);
}

function detectAction(input: string): TransactionIntent['action'] {
  if (/apart[eé]|meta|boda|objetivo/i.test(input)) return 'objetivo_aporte';
  if (/me pag[oó]|pago recibido|me deposit[oó]/i.test(input)) return 'pago_recibido';
  if (/prest[eé]|prestamo|pr[eé]stamo/i.test(input)) return 'prestamo_otorgado';
  if (/pagu[eé].*(tarjeta|deuda|pr[eé]stamo)|ab[oó]n[ée]/i.test(input)) return 'pago_deuda';
  if (/transfer[ií]|traspas[eé]|mov[ií].*entre cuentas/i.test(input)) return 'transferencia';
  if (/recib[ií]|ingres[oó]|depositaron|tiempo extra|n[oó]mina/i.test(input)) return 'ingreso';
  return 'gasto';
}

function detectCategory(action: TransactionIntent['action'], input: string) {
  if (action === 'gasto' && /gasolina/i.test(input)) return 'transporte';
  if (action === 'gasto' && /super|s[uú]per|mercado/i.test(input)) return 'alimentos';
  if (action === 'ingreso' && /tiempo extra/i.test(input)) return 'ingreso_extra';
  if (action === 'pago_deuda') return 'pago_deuda';
  if (action === 'prestamo_otorgado') return 'prestamo_otorgado';
  if (action === 'pago_recibido') return 'cobro_prestamo';
  if (action === 'objetivo_aporte') return 'ahorro_meta';
  if (action === 'transferencia') return 'transferencia';
  return action === 'ingreso' ? 'ingreso_general' : 'gasto_variable';
}

function detectDescription(input: string, action: TransactionIntent['action']) {
  const clean = input.trim();
  if (clean.length > 0) return clean.charAt(0).toUpperCase() + clean.slice(1);
  return action;
}

function extractAccount(input: string) {
  if (/efectivo/i.test(input)) return 'efectivo';
  const tarjeta = input.match(/tarjeta\s+([\wáéíóúñ]+)/i);
  if (tarjeta?.[1]) return `tarjeta ${tarjeta[1]}`.toLowerCase();
  return undefined;
}

function buildMissingFields(action: TransactionIntent['action'], sourceAccount?: string, destinationAccount?: string) {
  const missingFields: string[] = [];

  if (['gasto', 'pago_deuda', 'prestamo_otorgado', 'objetivo_aporte', 'transferencia'].includes(action) && !sourceAccount) {
    missingFields.push('sourceAccount');
  }

  if (['transferencia', 'ingreso', 'pago_recibido', 'objetivo_aporte'].includes(action) && !destinationAccount) {
    missingFields.push('destinationAccount');
  }

  return missingFields;
}

function buildHumanConfirmation(intent: Omit<TransactionIntent, 'humanConfirmation'>) {
  const amount = intent.amount.toLocaleString('es-MX');
  const origen = intent.sourceAccount ? ` desde ${intent.sourceAccount}` : '';
  const destino = intent.destinationAccount ? ` hacia ${intent.destinationAccount}` : '';
  return `Registrar ${intent.action.replace('_', ' ')} de $${amount} en ${intent.category}${origen}${destino}.`;
}

export async function interpretTransaction(text: string): Promise<TransactionIntent> {
  const action = detectAction(text);
  const amount = parseAmount(text);
  const sourceAccount = extractAccount(text);
  const destinationAccount = action === 'ingreso' ? 'efectivo' : action === 'objetivo_aporte' ? 'meta' : undefined;
  const description = detectDescription(text, action);
  const category = detectCategory(action, text);
  const missingFields = buildMissingFields(action, sourceAccount, destinationAccount);

  return transactionIntentSchema.parse({
    action,
    amount: amount || 1,
    description,
    category,
    sourceAccount,
    destinationAccount,
    missingFields,
    humanConfirmation: buildHumanConfirmation({
      action,
      amount: amount || 1,
      description,
      category,
      sourceAccount,
      destinationAccount,
      missingFields
    })
  });
}
