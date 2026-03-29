import { z } from 'zod';

const actionValues = [
  // new normalized actions
  'income',
  'expense_cash_like',
  'expense_debt_account',
  'debt_payment',
  'debt_transfer',
  'transfer_between_own_accounts',
  'savings_contribution',
  'savings_withdrawal',
  'receivable_created',
  'receivable_payment',
  'manual_adjustment',
  // legacy aliases kept for backward compatibility
  'gasto',
  'ingreso',
  'transferencia',
  'pago_deuda',
  'prestamo_otorgado',
  'pago_recibido',
  'objetivo_aporte'
] as const;

export const transactionIntentSchema = z.object({
  action: z.enum(actionValues),
  visibleType: z.string().min(1).default('Movimiento'),
  amount: z.number().positive(),
  description: z.string().min(1),
  category: z.string().min(1),
  sourceAccount: z.string().optional(),
  destinationAccount: z.string().nullable().optional(),
  sourceAccountId: z.string().optional(),
  sourceAccountName: z.string().optional(),
  sourceAccountType: z.string().optional(),
  destinationAccountId: z.string().nullable().optional(),
  destinationAccountName: z.string().nullable().optional(),
  destinationAccountType: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
  missingFields: z.array(z.string()).default([]),
  humanConfirmation: z.string().min(1)
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

export type InterpreterAccountContext = {
  id?: string;
  name: string;
  type: string;
};

type AccountMatch = {
  account: InterpreterAccountContext;
  score: number;
  reason: string;
};

const debtTypes = new Set(['deuda', 'credit_card', 'loan']);
const savingsTypes = new Set(['fondo', 'savings_fund', 'inversion', 'investment']);
const operationalTypes = new Set(['operativa', 'operational_cash']);
const receivableTypes = new Set(['por_cobrar', 'receivable']);

const synonymExpansions: Array<[RegExp, string]> = [
  [/\bbva\s*tdc\b/g, 'tdc bbva'],
  [/\btdc\b/g, 'tarjeta de credito'],
  [/\bnomina\b/g, 'nómina'],
  [/\bdepa\b/g, 'departamental'],
  [/\bdepartamental\b/g, 'departamental']
];

function normalizeText(input: string) {
  const original = input;
  const trimmed = original.trim();
  const withoutTrailingPunctuation = trimmed.replace(/[\s.,;:!?¡¿]+$/g, '');
  let lowered = withoutTrailingPunctuation.toLowerCase();

  for (const [pattern, replacement] of synonymExpansions) {
    lowered = lowered.replace(pattern, replacement);
  }

  const collapsed = lowered.replace(/\s+/g, ' ').trim();
  const ascii = collapsed.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  return {
    original,
    cleaned: withoutTrailingPunctuation,
    normalized: collapsed,
    normalizedAscii: ascii
  };
}

function normalizeForMatch(input: string) {
  return normalizeText(input).normalizedAscii;
}

function parseAmount(input: string) {
  const normalized = input.replace(/,/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  return Number(match?.[1] ?? 0);
}

function tokenize(input: string) {
  return normalizeForMatch(input).split(/\s+/).filter(Boolean);
}

function isDebtType(type?: string) {
  return Boolean(type && debtTypes.has(type));
}

function isSavingsType(type?: string) {
  return Boolean(type && savingsTypes.has(type));
}

function isOperationalType(type?: string) {
  return Boolean(type && operationalTypes.has(type));
}

function isReceivableType(type?: string) {
  return Boolean(type && receivableTypes.has(type));
}

function inferAliases(account: InterpreterAccountContext) {
  const normalizedName = normalizeForMatch(account.name);
  const tokens = normalizedName.split(/\s+/).filter(Boolean);
  const aliases = new Set<string>([normalizedName]);

  const filteredTokens = tokens.filter((token) => !['cuenta', 'tarjeta', 'banco', 'de', 'la', 'el'].includes(token));
  for (const token of filteredTokens) aliases.add(token);

  if (tokens.includes('tarjeta') || tokens.includes('credito') || tokens.includes('credito')) {
    for (const token of filteredTokens) aliases.add(`tdc ${token}`.trim());
  }

  return [...aliases].filter((alias) => alias.length > 1);
}

function scoreAccountMatch(text: string, account: InterpreterAccountContext): AccountMatch | null {
  const normalizedText = normalizeForMatch(text);
  const normalizedAccount = normalizeForMatch(account.name);

  if (normalizedText === normalizedAccount) {
    return { account, score: 1, reason: 'exact_name' };
  }

  if (normalizedText.includes(normalizedAccount)) {
    return { account, score: 0.95, reason: 'contains_name' };
  }

  const aliases = inferAliases(account);
  if (aliases.some((alias) => normalizedText.includes(alias))) {
    return { account, score: 0.88, reason: 'alias_match' };
  }

  const textTokens = new Set(tokenize(text));
  const accountTokens = tokenize(account.name).filter((token) => !['cuenta', 'de', 'la', 'el'].includes(token));
  const overlap = accountTokens.filter((token) => textTokens.has(token)).length;
  if (overlap > 0) {
    const score = Math.min(0.85, overlap / Math.max(1, accountTokens.length) + 0.35);
    return { account, score, reason: 'token_overlap' };
  }

  return null;
}

function resolveAccountsFromContext(text: string, accounts: InterpreterAccountContext[]) {
  const matches = accounts
    .map((account) => scoreAccountMatch(text, account))
    .filter((match): match is AccountMatch => Boolean(match))
    .sort((a, b) => b.score - a.score);

  const best = matches[0];
  const second = matches[1];
  const ambiguous = Boolean(best && second && Math.abs(best.score - second.score) < 0.08);

  return {
    matches,
    best: ambiguous ? undefined : best,
    ambiguous
  };
}

function resolveSourceAccount(text: string, accounts: InterpreterAccountContext[]) {
  const normalized = normalizeForMatch(text);

  const fromMatch = normalized.match(/(?:desde|de)\s+([a-z0-9\s]+)/)?.[1]?.trim();
  if (fromMatch) {
    const resolved = resolveAccountsFromContext(fromMatch, accounts);
    if (resolved.best) return { matched: resolved.best.account, ambiguous: resolved.ambiguous };
  }

  const withMatch = normalized.match(/con\s+([a-z0-9\s]+)/)?.[1]?.trim();
  if (withMatch) {
    if (/\b(tarjeta|tdc|prestamo|deuda)\b/.test(withMatch)) {
      const debtCandidates = accounts.filter((account) => isDebtType(account.type));
      const resolvedDebt = resolveAccountsFromContext(withMatch, debtCandidates);
      if (resolvedDebt.best) return { matched: resolvedDebt.best.account, ambiguous: resolvedDebt.ambiguous };
    }
    const resolved = resolveAccountsFromContext(withMatch, accounts);
    if (resolved.best) return { matched: resolved.best.account, ambiguous: resolved.ambiguous };
  }

  if (/\befectivo\b/.test(normalized)) {
    const cash = accounts.find((account) => normalizeForMatch(account.name).includes('efectivo'));
    return { matched: cash ?? { name: 'Efectivo', type: 'operational_cash' }, ambiguous: false };
  }

  if (/\bbanco\b|\bnomina\b/.test(normalized)) {
    const bank = accounts.find((account) => isOperationalType(account.type) && /banco|nomina/.test(normalizeForMatch(account.name)));
    if (bank) return { matched: bank, ambiguous: false };
  }

  return { matched: undefined, ambiguous: false };
}

function resolveDestinationAccount(text: string, accounts: InterpreterAccountContext[]) {
  const normalized = normalizeForMatch(text);

  const payWithPattern = normalized.match(/(?:pague|pago|abone|abono)\s+([a-z0-9\s]+?)\s+con\b/)?.[1]?.trim();
  if (payWithPattern) {
    const resolved = resolveAccountsFromContext(payWithPattern, accounts);
    if (resolved.best) return { matched: resolved.best.account, ambiguous: resolved.ambiguous };
  }

  const toMatch = normalized.match(/(?:a|al|hacia)\s+([a-z0-9\s]+?)(?=\s+(?:desde|con)\b|$)/)?.[1]?.trim();
  if (toMatch) {
    const resolved = resolveAccountsFromContext(toMatch, accounts);
    return { matched: resolved.best?.account, ambiguous: resolved.ambiguous };
  }

  if (/\bfondo\b|\bahorro\b/.test(normalized)) {
    const fund = accounts.find((account) => isSavingsType(account.type));
    if (fund) return { matched: fund, ambiguous: false };
  }

  return { matched: undefined, ambiguous: false };
}

function inferCategory(action: TransactionIntent['action'], normalizedText: string) {
  const has = (...terms: string[]) => terms.some((term) => normalizedText.includes(term));

  if (['expense_cash_like', 'expense_debt_account', 'gasto'].includes(action)) {
    if (has('cena', 'comida', 'restaurante', 'tacos', 'desayuno')) return 'comida';
    if (has('taxi', 'uber', 'gasolina', 'transporte')) return 'transporte';
    if (has('ropa', 'zapatos', 'playera', 'pantalon')) return 'ropa';
    if (has('internet', 'luz', 'agua', 'telefono', 'streaming')) return 'servicios';
    if (has('medico', 'medicina', 'farmacia')) return 'salud';
    if (has('escuela', 'colegiatura', 'utiles')) return 'educacion';
    if (has('cine', 'fiesta', 'paseo')) return 'entretenimiento';
    if (has('mueble', 'electrodomestico', 'casa')) return 'hogar';
    return 'otros_gastos';
  }

  if (['income', 'ingreso'].includes(action)) {
    if (has('tiempo extra', 'bono')) return 'ingreso_extra';
    if (has('sueldo', 'nomina')) return 'ingreso_fijo';
    if (has('reembolso')) return 'reembolso';
    if (has('devolucion')) return 'devolucion';
    return 'ingreso_general';
  }

  if (['debt_payment', 'pago_deuda'].includes(action)) return 'deuda';
  if (action === 'debt_transfer') return 'traslado_deuda';
  if (['savings_contribution', 'savings_withdrawal', 'objetivo_aporte'].includes(action)) return 'ahorro';
  if (['receivable_created', 'prestamo_otorgado'].includes(action)) return 'prestamo_otorgado';
  if (['receivable_payment', 'pago_recibido'].includes(action)) return 'pago_recibido';
  if (['transfer_between_own_accounts', 'transferencia'].includes(action)) return 'transferencia';

  return 'otros';
}

function inferVisibleType(action: TransactionIntent['action']) {
  switch (action) {
    case 'expense_cash_like':
    case 'gasto':
      return 'Gasto con efectivo/banco';
    case 'expense_debt_account':
      return 'Gasto con tarjeta de crédito';
    case 'income':
    case 'ingreso':
      return 'Ingreso';
    case 'debt_payment':
    case 'pago_deuda':
      return 'Pago de deuda';
    case 'debt_transfer':
      return 'Traslado de deuda';
    case 'transfer_between_own_accounts':
    case 'transferencia':
      return 'Transferencia entre cuentas';
    case 'savings_contribution':
      return 'Aporte a ahorro';
    case 'savings_withdrawal':
      return 'Retiro de ahorro';
    case 'receivable_created':
    case 'prestamo_otorgado':
      return 'Préstamo otorgado';
    case 'receivable_payment':
    case 'pago_recibido':
      return 'Pago recibido';
    default:
      return 'Movimiento';
  }
}

function inferAction(
  normalizedText: string,
  source?: InterpreterAccountContext,
  destination?: InterpreterAccountContext
): TransactionIntent['action'] {
  const has = (...terms: string[]) => terms.some((term) => normalizedText.includes(term));

  const purchaseWords = has('gaste', 'gasté', 'compre', 'compré');
  const receiveWords = has('recibi', 'recibí', 'ingreso', 'depositaron', 'me depositaron', 'me abonaron');
  const saveWords = has('aparte', 'aparté', 'guarde', 'guardé', 'reserve', 'reservé');
  const withdrawWords = has('saque', 'saqué', 'retire', 'retiré');
  const lendWords = has('preste', 'presté', 'me deben');
  const transferWords = has('transferi', 'transferí', 'pase', 'pasé', 'movi', 'moví');
  const payWords = has('pague', 'pagué', 'abone', 'aboné');
  const debtObjectWords = has('tarjeta', 'tdc', 'prestamo', 'préstamo', 'deuda');

  if (receiveWords) return 'income';
  if (lendWords && !payWords) return 'receivable_created';
  if (saveWords && (isSavingsType(destination?.type) || has('fondo', 'ahorro'))) return 'savings_contribution';
  if (withdrawWords && (isSavingsType(source?.type) || has('fondo', 'inversion', 'inversión'))) return 'savings_withdrawal';

  if (purchaseWords) {
    if (isDebtType(source?.type)) return 'expense_debt_account';
    return 'expense_cash_like';
  }

  if (payWords && purchaseWords) {
    if (isDebtType(source?.type)) return 'expense_debt_account';
    return 'expense_cash_like';
  }

  if (payWords) {
    if (isDebtType(source?.type) && isDebtType(destination?.type)) return 'debt_transfer';
    if (debtObjectWords || isDebtType(destination?.type)) return 'debt_payment';

    // "pagué X con tarjeta" without explicit debt payoff object
    if (isDebtType(source?.type)) return 'expense_debt_account';
    return 'debt_payment';
  }

  if (transferWords) {
    if (isDebtType(source?.type) && isDebtType(destination?.type)) return 'debt_transfer';
    if (isSavingsType(destination?.type)) return 'savings_contribution';
    if (isSavingsType(source?.type)) return 'savings_withdrawal';
    return 'transfer_between_own_accounts';
  }

  if (isDebtType(source?.type) && purchaseWords) return 'expense_debt_account';

  return 'expense_cash_like';
}

function buildMissingFields(
  action: TransactionIntent['action'],
  source?: InterpreterAccountContext,
  destination?: InterpreterAccountContext,
  ambiguity?: { source: boolean; destination: boolean }
) {
  const missing = new Set<string>();

  if (ambiguity?.source) missing.add('sourceAccount');
  if (ambiguity?.destination) missing.add('destinationAccount');

  if (['expense_cash_like', 'expense_debt_account', 'gasto', 'savings_contribution', 'savings_withdrawal', 'receivable_created', 'debt_payment', 'debt_transfer', 'pago_deuda'].includes(action) && !source) {
    missing.add('sourceAccount');
  }

  if (['income', 'ingreso', 'debt_payment', 'debt_transfer', 'transfer_between_own_accounts', 'transferencia', 'savings_contribution', 'savings_withdrawal', 'receivable_payment', 'pago_deuda'].includes(action) && !destination) {
    missing.add('destinationAccount');
  }

  if (action === 'debt_payment' && !destination) {
    missing.add('whatWasPaid');
  }

  return [...missing];
}

function buildHumanConfirmation(intent: Omit<TransactionIntent, 'humanConfirmation'>) {
  const amount = intent.amount.toLocaleString('es-MX');
  const source = intent.sourceAccountName ?? intent.sourceAccount;
  const destination = intent.destinationAccountName ?? intent.destinationAccount;

  if (intent.action === 'debt_payment') {
    return `Registrar pago de deuda de $${amount}${source ? ` desde ${source}` : ''}${destination ? ` hacia ${destination}` : ''}.`;
  }

  if (intent.action === 'debt_transfer') {
    return `Registrar traslado de deuda de $${amount}${source ? ` desde ${source}` : ''}${destination ? ` hacia ${destination}` : ''}.`;
  }

  if (intent.action === 'expense_debt_account') {
    return `Registrar gasto de $${amount} en ${intent.category}${source ? ` usando ${source}` : ''}.`;
  }

  if (intent.action === 'expense_cash_like' || intent.action === 'gasto') {
    return `Registrar gasto de $${amount} en ${intent.category}${source ? ` desde ${source}` : ''}.`;
  }

  return `Registrar ${intent.visibleType.toLowerCase()} de $${amount}.`;
}

function detectDescription(originalText: string, action: TransactionIntent['action']) {
  const clean = originalText.trim();
  if (clean.length > 0) return clean.charAt(0).toUpperCase() + clean.slice(1);
  return action;
}

export async function interpretTransaction(text: string, accounts: InterpreterAccountContext[] = []): Promise<TransactionIntent> {
  const normalized = normalizeText(text);
  const amount = parseAmount(normalized.cleaned) || 1;

  const sourceResolution = resolveSourceAccount(normalized.normalized, accounts);
  const destinationResolution = resolveDestinationAccount(normalized.normalized, accounts);

  const source = sourceResolution.matched;
  const destination = destinationResolution.matched;

  let action = inferAction(normalized.normalized, source, destination);

  // Prioridad para compras con método "con X"
  if ((normalized.normalized.includes('gaste') || normalized.normalized.includes('gasté') || normalized.normalized.includes('compre') || normalized.normalized.includes('compré')) && isDebtType(source?.type)) {
    action = 'expense_debt_account';
  }

  const category = inferCategory(action, normalized.normalizedAscii);
  const visibleType = inferVisibleType(action);
  const isExpenseAction = action === 'expense_cash_like' || action === 'expense_debt_account';

  const missingFields = buildMissingFields(action, source, destination, {
    source: sourceResolution.ambiguous,
    destination: destinationResolution.ambiguous
  });

  const confidenceBase = 0.62;
  const confidence = Math.min(
    0.99,
    confidenceBase +
      (source ? 0.12 : 0) +
      (destination ? 0.12 : 0) +
      (amount > 0 ? 0.08 : 0) +
      (missingFields.length === 0 ? 0.12 : -missingFields.length * 0.1)
  );

  const intent: Omit<TransactionIntent, 'humanConfirmation'> = {
    action,
    visibleType,
    amount,
    description: detectDescription(normalized.original, action),
    category,
    sourceAccount: source?.name.toLowerCase(),
    destinationAccount: isExpenseAction ? null : (destination?.name.toLowerCase() ?? null),
    sourceAccountId: source?.id,
    sourceAccountName: source?.name,
    sourceAccountType: source?.type,
    destinationAccountId: isExpenseAction ? null : (destination?.id ?? null),
    destinationAccountName: isExpenseAction ? null : (destination?.name ?? null),
    destinationAccountType: isExpenseAction ? null : (destination?.type ?? null),
    missingFields,
    confidence
  };

  return transactionIntentSchema.parse({
    ...intent,
    humanConfirmation: buildHumanConfirmation(intent)
  });
}
