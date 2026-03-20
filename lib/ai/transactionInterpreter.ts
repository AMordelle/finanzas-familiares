import { z } from 'zod';

const normalizedActions = [
  'income',
  'expense_cash_like',
  'expense_debt_account',
  'debt_payment',
  'transfer_between_own_accounts',
  'debt_transfer',
  'savings_contribution',
  'savings_withdrawal',
  'receivable_created',
  'receivable_payment',
  'manual_adjustment'
] as const;

const legacyActions = ['gasto', 'ingreso', 'transferencia', 'pago_deuda', 'prestamo_otorgado', 'pago_recibido', 'objetivo_aporte'] as const;

const actionSchema = z.enum([...normalizedActions, ...legacyActions]);

export const transactionIntentSchema = z.object({
  action: actionSchema,
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.string().min(1),
  sourceAccount: z.string().optional(),
  destinationAccount: z.string().optional(),
  sourceAccountId: z.string().nullable().optional(),
  sourceAccountName: z.string().nullable().optional(),
  sourceAccountType: z.string().nullable().optional(),
  destinationAccountId: z.string().nullable().optional(),
  destinationAccountName: z.string().nullable().optional(),
  destinationAccountType: z.string().nullable().optional(),
  missingFields: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.6),
  humanConfirmation: z.string().min(1)
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

export type InterpreterAccountContext = {
  id?: string;
  name: string;
  type: string;
  aliases?: string[];
};

type IntentAction = (typeof normalizedActions)[number];

type InterpreterResult = {
  action: IntentAction;
  amount: number | null;
  description: string | null;
  category: string | null;
  source?: InterpreterAccountContext;
  destination?: InterpreterAccountContext;
  missingFields: string[];
  confidence: number;
};

function normalize(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseAmount(input: string) {
  const normalized = input.replace(/,/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return Number(match?.[1] ?? 0) || null;
}

function tokenize(input: string) {
  return normalize(input).split(/\s+/).filter(Boolean);
}

function isDebtType(type?: string) {
  return ['deuda', 'credit_card', 'loan'].includes(type ?? '');
}

function isOperationalType(type?: string) {
  return ['operativa', 'operational_cash'].includes(type ?? '');
}

function isSavingsType(type?: string) {
  return ['fondo', 'savings_fund'].includes(type ?? '');
}

function isInvestmentType(type?: string) {
  return ['inversion', 'investment'].includes(type ?? '');
}

function isReceivableType(type?: string) {
  return ['por_cobrar', 'receivable'].includes(type ?? '');
}

function accountTokens(account: InterpreterAccountContext) {
  const aliasTokens = (account.aliases ?? []).flatMap((alias) => tokenize(alias));
  return Array.from(new Set([...tokenize(account.name), ...aliasTokens]));
}

function rankAccountMatches(input: string, accounts: InterpreterAccountContext[]) {
  const text = normalize(input);
  const textTokens = tokenize(input);

  return accounts
    .map((account) => {
      const name = normalize(account.name);
      const aliases = (account.aliases ?? []).map((alias) => normalize(alias));
      const tokens = accountTokens(account);
      const tokenOverlap = textTokens.filter((token) => tokens.includes(token)).length;
      const exactName = text.includes(name) ? 2 : 0;
      const aliasMatch = aliases.some((alias) => alias && text.includes(alias)) ? 2 : 0;
      return {
        account,
        score: tokenOverlap + exactName + aliasMatch
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function pickUnambiguousMatch(input: string, accounts: InterpreterAccountContext[]) {
  const ranked = rankAccountMatches(input, accounts);
  if (!ranked.length) return { match: undefined, ambiguous: false };
  if (ranked.length === 1) return { match: ranked[0].account, ambiguous: false };
  if (ranked[0].score === ranked[1].score) return { match: undefined, ambiguous: true };
  return { match: ranked[0].account, ambiguous: false };
}

function extractAccountAfter(input: string, marker: string, accounts: InterpreterAccountContext[]) {
  const text = normalize(input);
  const expression = new RegExp(`(?:^|\\s)${marker}\\s+([\\w\\s]+?)(?:\\s+(?:desde|con|hacia)\\s+|$)`, 'i');
  const match = text.match(expression)?.[1]?.trim();
  if (!match) return { match: undefined as InterpreterAccountContext | undefined, ambiguous: false };
  const fragment = match.replace(/^(la|el|al)\\s+/, '').trim();
  return pickUnambiguousMatch(fragment, accounts);
}

function extractAccountBefore(input: string, marker: string, accounts: InterpreterAccountContext[]) {
  const text = normalize(input);
  const expression = new RegExp(`^([\\w\\s]+?)\\s+${marker}\\s+`, 'i');
  const match = text.match(expression)?.[1]?.trim();
  if (!match) return { match: undefined as InterpreterAccountContext | undefined, ambiguous: false };
  return pickUnambiguousMatch(match, accounts);
}

function detectIntentByWords(input: string): IntentAction | 'ambiguous' {
  const text = normalize(input);

  if (/ajusta|corrige saldo|corregir saldo/.test(text)) return 'manual_adjustment';
  if (/prest(e|é)|me deben|gasto compartido/.test(text)) return 'receivable_created';
  if (/me pago|me pago|me abono|me abon(o|ó)|recupere|recuper(e|é)/.test(text)) return 'receivable_payment';
  if (/apart(e|é)|guarde|guard(e|é)|fondo|ahorro|objetivo/.test(text)) return 'savings_contribution';
  if (/retire|retir(e|é)|saque|saqu(e|é)/.test(text) && /fondo|ahorro|inversion/.test(text)) return 'savings_withdrawal';
  if (/transferi|transfer(e|í)|pase|pas(e|é)|movi|mov(i|í)/.test(text)) return 'transfer_between_own_accounts';
  if (/recibi|recib(i|í)|me pagaron|ingrese|ingres(e|é)|depositaron/.test(text)) return 'income';
  if (/gaste|gast(e|é)|compre|compr(e|é)/.test(text)) return 'expense_cash_like';
  if (/pague|pague|abone|abon(e|é)/.test(text)) return 'ambiguous';

  return 'expense_cash_like';
}

function detectDescription(input: string) {
  const trimmed = input.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : null;
}

function buildHumanConfirmation(result: InterpreterResult) {
  const amount = (result.amount ?? 0).toLocaleString('es-MX');
  const sourceName = result.source?.name;
  const destinationName = result.destination?.name;
  const description = result.description ? ` en ${result.description.toLowerCase()}` : '';

  switch (result.action) {
    case 'income':
      return `Registrar ingreso de $${amount} hacia ${destinationName ?? 'cuenta destino'}.`;
    case 'expense_cash_like':
      return `Registrar gasto de $${amount}${description} desde ${sourceName ?? 'cuenta origen'}.`;
    case 'expense_debt_account':
      return `Registrar gasto de $${amount}${description} usando ${sourceName ?? 'cuenta de deuda'}.`;
    case 'debt_payment':
      return `Registrar pago de deuda de $${amount} desde ${sourceName ?? 'cuenta origen'} hacia ${destinationName ?? 'cuenta de deuda'}.`;
    case 'debt_transfer':
      return `Registrar traslado de deuda de $${amount} desde ${sourceName ?? 'deuda origen'} hacia ${destinationName ?? 'deuda destino'}.`;
    case 'transfer_between_own_accounts':
      return `Registrar transferencia de $${amount} desde ${sourceName ?? 'cuenta origen'} hacia ${destinationName ?? 'cuenta destino'}.`;
    case 'savings_contribution':
      return `Registrar aporte de ahorro de $${amount} desde ${sourceName ?? 'cuenta origen'} hacia ${destinationName ?? 'fondo de ahorro'}.`;
    case 'savings_withdrawal':
      return `Registrar retiro de ahorro de $${amount} desde ${sourceName ?? 'fondo'} hacia ${destinationName ?? 'cuenta operativa'}.`;
    case 'receivable_created':
      return `Registrar préstamo por cobrar de $${amount} desde ${sourceName ?? 'cuenta origen'} hacia ${destinationName ?? 'por cobrar'}.`;
    case 'receivable_payment':
      return `Registrar pago recibido de $${amount} hacia ${destinationName ?? 'cuenta destino'} por una deuda por cobrar.`;
    case 'manual_adjustment':
      return `Confirmar ajuste manual por $${amount} en ${destinationName ?? sourceName ?? 'la cuenta seleccionada'}.`;
    default:
      return `Registrar movimiento de $${amount}.`;
  }
}

function resolveAction(input: string, amount: number | null, accounts: InterpreterAccountContext[]): InterpreterResult {
  const byWords = detectIntentByWords(input);
  const text = normalize(input);
  const from = extractAccountAfter(input, 'desde', accounts);
  const to = extractAccountAfter(input, 'a', accounts);
  const withRef = extractAccountAfter(input, 'con', accounts);
  const beforeWith = extractAccountBefore(input, 'con', accounts);
  const directMention = pickUnambiguousMatch(input, accounts);

  let source = from.match;
  let destination = to.match;
  let action: IntentAction = byWords === 'ambiguous' ? 'expense_cash_like' : byWords;
  const missingFields: string[] = [];
  let confidence = 0.78;

  if (action === 'income' && !destination) {
    destination = directMention.match;
  }

  if (action === 'expense_cash_like' && withRef.match && isDebtType(withRef.match.type)) {
    source = withRef.match;
    action = 'expense_debt_account';
  }

  if (byWords === 'ambiguous') {
    if (/tarjeta|tdc|prestamo|hipoteca|deuda/.test(text) || (destination && isDebtType(destination.type))) {
      action = 'debt_payment';
      source = source ?? withRef.match ?? (directMention.match && !isDebtType(directMention.match.type) ? directMention.match : undefined);
      destination = destination ?? (directMention.match && isDebtType(directMention.match.type) ? directMention.match : undefined);
    } else {
      action = 'expense_cash_like';
      source = source ?? withRef.match ?? directMention.match;
      missingFields.push('movementTarget');
    }
  }

  if (withRef.match && beforeWith.match && isDebtType(withRef.match.type) && isDebtType(beforeWith.match.type)) {
    action = 'debt_transfer';
    source = withRef.match;
    destination = beforeWith.match;
  }

  if (/con/.test(text) && withRef.match) {
    source = source ?? withRef.match;
  }

  if (action === 'transfer_between_own_accounts') {
    source = source ?? directMention.match;
    if (!destination && from.match && directMention.match && from.match.name !== directMention.match.name) {
      destination = directMention.match;
    }
  }

  if (source && destination && isDebtType(source.type) && isDebtType(destination.type)) {
    action = 'debt_transfer';
  }

  if (action === 'savings_contribution' && destination && !isSavingsType(destination.type)) {
    if (directMention.match && isSavingsType(directMention.match.type)) {
      destination = directMention.match;
    }
  }

  if (action === 'savings_withdrawal' && source && !isSavingsType(source.type) && !isInvestmentType(source.type)) {
    const savingMention = rankAccountMatches(input, accounts).find((item) => isSavingsType(item.account.type) || isInvestmentType(item.account.type));
    source = savingMention?.account;
  }

  if (action === 'receivable_created' && !destination) {
    destination = accounts.find((account) => isReceivableType(account.type));
  }

  if (action === 'receivable_payment' && !destination) {
    destination = accounts.find((account) => isOperationalType(account.type));
  }

  if (!amount) {
    missingFields.push('amount');
    confidence -= 0.2;
  }

  if (action === 'income' && !destination) missingFields.push('destinationAccount');
  if (['expense_cash_like', 'expense_debt_account', 'savings_contribution', 'receivable_created'].includes(action) && !source) {
    missingFields.push('sourceAccount');
  }
  if (['debt_payment', 'transfer_between_own_accounts', 'debt_transfer', 'savings_contribution', 'savings_withdrawal'].includes(action) && !destination) {
    missingFields.push('destinationAccount');
  }
  if (['debt_payment', 'transfer_between_own_accounts', 'debt_transfer', 'savings_withdrawal'].includes(action) && !source) {
    missingFields.push('sourceAccount');
  }

  if (from.ambiguous || to.ambiguous || withRef.ambiguous || directMention.ambiguous) {
    confidence -= 0.25;
    missingFields.push('accountConfirmation');
  }

  return {
    action,
    amount,
    description: detectDescription(input),
    category: action,
    source,
    destination,
    missingFields: Array.from(new Set(missingFields)),
    confidence: Math.max(0.2, Math.min(0.98, confidence))
  };
}

export async function interpretTransaction(text: string, accounts: InterpreterAccountContext[] = []): Promise<TransactionIntent> {
  const result = resolveAction(text, parseAmount(text), accounts);

  return transactionIntentSchema.parse({
    action: result.action,
    amount: result.amount ?? 1,
    description: result.description ?? text,
    category: result.category ?? result.action,
    sourceAccount: result.source?.name,
    destinationAccount: result.destination?.name,
    sourceAccountId: result.source?.id ?? null,
    sourceAccountName: result.source?.name ?? null,
    sourceAccountType: result.source?.type ?? null,
    destinationAccountId: result.destination?.id ?? null,
    destinationAccountName: result.destination?.name ?? null,
    destinationAccountType: result.destination?.type ?? null,
    missingFields: result.missingFields,
    confidence: result.confidence,
    humanConfirmation: buildHumanConfirmation(result)
  });
}
