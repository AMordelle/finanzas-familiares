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

export type InterpreterAccountContext = {
  name: string;
  type: string;
};

function parseAmount(input: string) {
  const normalized = input.replace(/,/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return Number(match?.[1] ?? 0);
}

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isDebtType(type: string) {
  return ['deuda', 'credit_card', 'loan'].includes(type);
}

function isPaymentExpression(input: string) {
  return /(pague|pago|abone|abono)/i.test(normalize(input));
}

function extractMentionedAccounts(input: string, accounts: InterpreterAccountContext[]) {
  const normalizedInput = normalize(input);
  return accounts.filter((account) => normalizedInput.includes(normalize(account.name)));
}

function findBestAccountMatch(fragment: string, accounts: InterpreterAccountContext[]) {
  const normalizedFragment = normalize(fragment);
  const direct = accounts.find((account) => normalizedFragment.includes(normalize(account.name)) || normalize(account.name).includes(normalizedFragment));
  if (direct) return direct;

  const fragmentTokens = normalizedFragment.split(/\s+/).filter(Boolean);
  if (!fragmentTokens.length) return undefined;

  const ranked = accounts
    .map((account) => {
      const accountTokens = normalize(account.name).split(/\s+/).filter(Boolean);
      const overlap = fragmentTokens.filter((token) => accountTokens.includes(token)).length;
      return { account, overlap };
    });
  const best = ranked.sort((a, b) => b.overlap - a.overlap)[0];

  return best && best.overlap > 0 ? best.account : undefined;
}

function findAccountByHint(input: string, accounts: InterpreterAccountContext[], hints: string[]) {
  const normalizedInput = normalize(input);
  const matchedHint = hints.find((hint) => normalizedInput.includes(hint));
  if (!matchedHint) return undefined;

  const sortedByNameLength = [...accounts].sort((a, b) => b.name.length - a.name.length);
  return sortedByNameLength.find((account) => normalizedInput.includes(normalize(account.name)));
}

function extractDebtAccount(input: string, accounts: InterpreterAccountContext[]) {
  const mentions = extractMentionedAccounts(input, accounts);
  const debtMention = mentions.find((account) => isDebtType(account.type));
  if (debtMention) return debtMention;

  const debtPhrase = normalize(input).match(/(?:a|hacia|de)\s+(?:la\s+|el\s+)?(tarjeta|tdc|prestamo)\s*([\w\s]*)/i);
  if (debtPhrase) {
    const hintFragment = `${debtPhrase[1]} ${debtPhrase[2]}`.trim();
    const matched = findBestAccountMatch(hintFragment, accounts);
    return {
      name: matched?.name ?? findAccountByHint(input, accounts, ['tarjeta', 'tdc', 'prestamo'])?.name ?? 'tarjeta',
      type: 'credit_card'
    };
  }

  return undefined;
}

function extractSourceAccount(input: string, accounts: InterpreterAccountContext[]) {
  const normalizedInput = normalize(input);

  const fromRegex = /(?:desde|de)\s+([\w\sáéíóúñ]+)/i;
  const fromMatch = normalizedInput.match(fromRegex)?.[1]?.trim();
  if (fromMatch) {
    const accountFromPhrase = findBestAccountMatch(fromMatch, accounts);
    if (accountFromPhrase) return accountFromPhrase;
  }

  const withRegex = /con\s+([\w\sáéíóúñ]+)/i;
  const withMatch = normalizedInput.match(withRegex)?.[1]?.trim();
  if (withMatch) {
    const accountWith = findBestAccountMatch(withMatch, accounts);
    if (accountWith) return accountWith;
  }

  if (/efectivo/i.test(normalizedInput)) {
    const cash = accounts.find((account) => normalize(account.name).includes('efectivo'));
    return cash ?? { name: 'efectivo', type: 'operational_cash' };
  }

  const firstMentioned = extractMentionedAccounts(input, accounts)[0];
  return firstMentioned;
}

function detectAction(input: string, destinationAccount?: InterpreterAccountContext): TransactionIntent['action'] {
  if (/apart[eé]|meta|boda|objetivo/i.test(input)) return 'objetivo_aporte';
  if (/me pag[oó]|pago recibido|me deposit[oó]/i.test(input)) return 'pago_recibido';
  if (/prest[eé]|prestamo|pr[eé]stamo/i.test(input)) return 'prestamo_otorgado';

  if (isPaymentExpression(input) || destinationAccount?.type) {
    if (destinationAccount && isDebtType(destinationAccount.type)) return 'pago_deuda';
    if (/pagu[eé].*(tarjeta|deuda|pr[eé]stamo)|ab[oó]n[ée]/i.test(input)) return 'pago_deuda';
  }

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

function buildMissingFields(action: TransactionIntent['action'], sourceAccount?: string, destinationAccount?: string) {
  const missingFields: string[] = [];

  if (['gasto', 'pago_deuda', 'prestamo_otorgado', 'objetivo_aporte', 'transferencia'].includes(action) && !sourceAccount) {
    missingFields.push('sourceAccount');
  }

  if (['transferencia', 'ingreso', 'pago_recibido', 'objetivo_aporte', 'pago_deuda'].includes(action) && !destinationAccount) {
    missingFields.push('destinationAccount');
  }

  return missingFields;
}

function buildHumanConfirmation(intent: Omit<TransactionIntent, 'humanConfirmation'>) {
  const amount = intent.amount.toLocaleString('es-MX');
  const origen = intent.sourceAccount ? ` desde ${intent.sourceAccount}` : '';
  const destino = intent.destinationAccount ? ` hacia ${intent.destinationAccount}` : '';

  if (intent.action === 'pago_deuda') {
    return `Registrar pago de deuda de $${amount}${origen}${destino}.`;
  }

  return `Registrar ${intent.action.replace('_', ' ')} de $${amount} en ${intent.category}${origen}${destino}.`;
}

export async function interpretTransaction(text: string, accounts: InterpreterAccountContext[] = []): Promise<TransactionIntent> {
  const debtAccount = extractDebtAccount(text, accounts);
  const sourceAccountRef = extractSourceAccount(text, accounts);
  const action = detectAction(text, debtAccount);
  const amount = parseAmount(text);

  const sourceAccount = sourceAccountRef?.name?.toLowerCase();
  const destinationAccount =
    action === 'ingreso'
      ? 'efectivo'
      : action === 'objetivo_aporte'
        ? 'meta'
        : action === 'pago_deuda'
          ? debtAccount?.name?.toLowerCase()
          : undefined;

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
