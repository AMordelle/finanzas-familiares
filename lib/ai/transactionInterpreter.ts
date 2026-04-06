import { z } from 'zod';

export const accountTypeSchema = z.enum([
  'operational_cash',
  'savings_fund',
  'investment',
  'credit_card',
  'loan',
  'receivable'
]);

export const financialIntentSchema = z.enum([
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
  'manual_adjustment'
]);

export const missingFieldKindSchema = z.enum([
  'missingSourceAccount',
  'missingDestinationAccount',
  'missingDebtTarget',
  'missingReceivableTarget',
  'missingDescription',
  'missingIntent',
  'missingWhatWasPaid',
  'missingCategoryContext'
]);

export const nextPromptInputTypeSchema = z.enum(['account_selector', 'text_input', 'guided_choice']);

export const transactionIntentSchema = z.object({
  rawText: z.string().min(1).default('movimiento'),
  normalizedText: z.string().min(1).default('movimiento'),
  intent: financialIntentSchema.default('expense_cash_like'),
  visibleType: z.string().min(1).default('Gasto con efectivo/banco'),
  action: z.enum(['gasto', 'ingreso', 'transferencia', 'pago_deuda', 'prestamo_otorgado', 'pago_recibido', 'objetivo_aporte']),
  amount: z.number().positive(),
  description: z.string().min(1).nullable().optional().default(null),
  category: z.string().min(1).nullable().optional().default('otros_gastos'),
  sourceAccountId: z.string().nullable().optional().default(null),
  sourceAccountName: z.string().nullable().optional().default(null),
  sourceAccountType: accountTypeSchema.nullable().optional().default(null),
  destinationAccountId: z.string().nullable().optional().default(null),
  destinationAccountName: z.string().nullable().optional().default(null),
  destinationAccountType: accountTypeSchema.nullable().optional().default(null),
  sourceAccount: z.string().optional(),
  destinationAccount: z.string().optional(),
  missingFields: z.array(z.string()).default([]),
  missingFieldKinds: z.array(missingFieldKindSchema).default([]),
  nextPrompt: z.string().nullable().optional().default(null),
  nextPromptInputType: nextPromptInputTypeSchema.nullable().optional().default(null),
  nextPromptAllowedAccountTypes: z.array(accountTypeSchema).nullable().optional().default(null),
  confidence: z.number().min(0).max(1).default(0.5),
  humanConfirmation: z.string().nullable().optional().default(null)
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

export type InterpreterAccountContext = {
  id?: string;
  name: string;
  type: z.infer<typeof accountTypeSchema> | string;
  subtype?: string | null;
  institution?: string | null;
  aliases?: string[];
  is_liquid?: boolean;
  is_operational?: boolean;
  is_debt?: boolean;
  is_asset?: boolean;
  is_receivable?: boolean;
  is_active?: boolean;
};

type EnrichedAccount = {
  id: string;
  name: string;
  normalized_name: string;
  type: z.infer<typeof accountTypeSchema>;
  subtype: string | null;
  institution: string | null;
  aliases: string[];
  is_liquid: boolean;
  is_operational: boolean;
  is_debt: boolean;
  is_asset: boolean;
  is_receivable: boolean;
  is_active: boolean;
};

type ExplicitAccountReference = {
  raw: string;
  normalized: string;
  expectedKind: 'debt' | 'operational' | 'savings' | null;
  isGeneric: boolean;
  role: 'source' | 'destination';
};

type PaymentRoleResolution = {
  source: EnrichedAccount | null;
  destination: EnrichedAccount | null;
  hasSourceFragment: boolean;
  hasDestinationFragment: boolean;
};

type TransferRoleResolution = {
  source: EnrichedAccount | null;
  destination: EnrichedAccount | null;
  hasSourceFragment: boolean;
  hasDestinationFragment: boolean;
};

type ReceivablePaymentResolution = {
  receivableSource: EnrichedAccount | null;
  destination: EnrichedAccount | null;
  hasDestinationFragment: boolean;
};

type FinancialConsistencySuggestion = Partial<Pick<TransactionIntent,
  'sourceAccountId' | 'sourceAccountName' | 'sourceAccountType' | 'sourceAccount'
  | 'destinationAccountId' | 'destinationAccountName' | 'destinationAccountType' | 'destinationAccount'>>;

const visibleTypeMap: Record<z.infer<typeof financialIntentSchema>, string> = {
  income: 'Ingreso',
  expense_cash_like: 'Gasto con efectivo/banco',
  expense_debt_account: 'Gasto con tarjeta de crédito',
  debt_payment: 'Pago de deuda',
  debt_transfer: 'Traslado de deuda',
  transfer_between_own_accounts: 'Transferencia entre cuentas',
  savings_contribution: 'Aporte a ahorro',
  savings_withdrawal: 'Retiro de ahorro',
  receivable_created: 'Préstamo otorgado',
  receivable_payment: 'Pago recibido',
  manual_adjustment: 'Ajuste manual'
};

function normalize(input: string) {
  return input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeAccountLabel(input: string) {
  return normalize(input).replace(/\b(tarjeta|cuenta|banco|tdc)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildOperationalDebitAliases(normalizedName: string) {
  if (!/\b(tdd|debito)\b/.test(normalizedName)) return [] as string[];
  const institutionPart = normalizedName
    .replace(/\b(tarjeta|cuenta|de|del|al|a|tdd|debito)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!institutionPart) return [];

  return [
    `tdd ${institutionPart}`,
    `debito ${institutionPart}`,
    `tarjeta de debito ${institutionPart}`,
    `tarjeta debito ${institutionPart}`
  ].map((alias) => normalize(alias));
}

function parseAmount(input: string) {
  const match = input.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return Number(match?.[1] ?? 0) || 1;
}

function toCanonicalType(type: string): z.infer<typeof accountTypeSchema> {
  if (type === 'credit_card' || type === 'loan' || type === 'receivable' || type === 'investment' || type === 'savings_fund' || type === 'operational_cash') return type;
  if (type === 'deuda') return 'loan';
  if (type === 'fondo') return 'savings_fund';
  if (type === 'inversion') return 'investment';
  if (type === 'por_cobrar') return 'receivable';
  return 'operational_cash';
}

function enrichAccounts(accounts: InterpreterAccountContext[]): EnrichedAccount[] {
  return accounts.map((account, index) => {
    const type = toCanonicalType(account.type);
    const normalizedName = normalize(account.name);
    const normalizedCompactName = normalizeAccountLabel(account.name);
    const debitAliases = type === 'operational_cash' ? buildOperationalDebitAliases(normalizedName) : [];
    const aliases = Array.from(new Set([
      ...(account.aliases ?? []).map((alias) => normalize(alias)),
      normalizedName,
      normalizedCompactName,
      ...debitAliases
    ])).filter(Boolean);

    return {
      id: account.id ?? `${normalizedName}-${index}`,
      name: account.name,
      normalized_name: normalizedName,
      type,
      subtype: account.subtype ?? null,
      institution: account.institution ?? null,
      aliases,
      is_liquid: account.is_liquid ?? ['operational_cash', 'savings_fund'].includes(type),
      is_operational: account.is_operational ?? ['operational_cash'].includes(type),
      is_debt: account.is_debt ?? ['credit_card', 'loan'].includes(type),
      is_asset: account.is_asset ?? ['operational_cash', 'savings_fund', 'investment', 'receivable'].includes(type),
      is_receivable: account.is_receivable ?? type === 'receivable',
      is_active: account.is_active ?? true
    };
  }).filter((account) => account.is_active);
}

function matchAccounts(text: string, accounts: EnrichedAccount[]) {
  const normalized = normalize(text);
  const compact = normalizeAccountLabel(text);
  const aliasFrequency = accounts.reduce((map, account) => {
    account.aliases.forEach((alias) => map.set(alias, (map.get(alias) ?? 0) + 1));
    return map;
  }, new Map<string, number>());
  return accounts.filter((account) =>
    normalized.includes(account.normalized_name)
    || account.aliases.some((alias) => {
      const aliasTokenCount = alias.split(' ').filter(Boolean).length;
      const isUnambiguousAlias = aliasTokenCount > 1 || (aliasFrequency.get(alias) ?? 0) === 1;
      if (!isUnambiguousAlias) return false;
      return normalized.includes(alias) || compact.includes(alias);
    })
  );
}

function extractExplicitAccountReference(
  normalizedText: string,
  intent: z.infer<typeof financialIntentSchema>
): ExplicitAccountReference | null {
  const withMatch = intent === 'income'
    ? normalizedText.match(/(en)\s+([a-z0-9\s]+)$/)
    : normalizedText.match(/(con|desde|a la|al)\s+([a-z0-9\s]+?)(?=\s+(?:desde|con|en|a la|al)\b|$)/);
  const preposition = withMatch?.[1]?.trim() ?? '';
  const raw = withMatch?.[2]?.trim();
  if (!raw) return null;

  const cleaned = raw.replace(/\b(en|de|del|la|el)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const expectedKind =
    /(tarjeta|tdc|prestamo|hipoteca)/.test(cleaned) ? 'debt'
      : /(banco|efectivo|debito|tdd)/.test(cleaned) ? 'operational'
        : /(ahorro|fondo|meta)/.test(cleaned) ? 'savings'
          : null;
  const isGeneric = /^(tarjeta|tarjeta de credito|tarjeta credito|tdc|banco|efectivo|debito|tdd|ahorro|fondo|meta)$/.test(cleaned);

  return {
    raw: cleaned,
    normalized: normalize(cleaned),
    expectedKind,
    isGeneric,
    role: ['a la', 'al', 'en'].includes(preposition) ? 'destination' : 'source'
  };
}

function resolveExplicitReference(
  reference: ExplicitAccountReference | null,
  accounts: EnrichedAccount[]
): { account: EnrichedAccount | null; confidence: number; unresolvedMessage: string | null } {
  if (!reference) return { account: null, confidence: 0, unresolvedMessage: null };

  const pool = reference.expectedKind
    ? accounts.filter((account) => reference.expectedKind === 'debt' ? account.is_debt : reference.expectedKind === 'operational' ? account.type === 'operational_cash' : account.type === 'savings_fund')
    : accounts;

  if (!pool.length) return { account: null, confidence: 0, unresolvedMessage: null };
  if (reference.isGeneric) {
    if (reference.expectedKind) {
      const genericPool = pool;
      const keywordPool = genericPool.filter((account) => {
        if (reference.normalized.includes('banco')) return account.normalized_name.includes('banco');
        if (reference.normalized.includes('efectivo')) return account.normalized_name.includes('efectivo');
        if (reference.normalized.includes('tarjeta') || reference.normalized.includes('tdc')) return account.is_debt;
        return true;
      });
      if (keywordPool.length === 1) return { account: keywordPool[0], confidence: 0.9, unresolvedMessage: null };
      if (genericPool.length === 1) return { account: genericPool[0], confidence: 0.92, unresolvedMessage: null };
      return { account: null, confidence: 0.4, unresolvedMessage: null };
    }
    return { account: null, confidence: 0.4, unresolvedMessage: null };
  }

  const ranked = pool
    .map((account) => {
      if (reference.normalized === account.normalized_name) return { account, score: 1 };
      if (reference.normalized === normalizeAccountLabel(account.name)) return { account, score: 0.97 };
      if (account.aliases.includes(reference.normalized)) return { account, score: 0.96 };
      const tokens = reference.normalized.split(' ').filter((token) => token.length > 2);
      const overlap = tokens.filter((token) => account.normalized_name.includes(token)).length;
      let score = tokens.length ? overlap / tokens.length : 0;
      if (reference.expectedKind === 'debt' && /(tarjeta|tdc)/.test(reference.normalized)) {
        const institutionToken = tokens.find((token) => !['tarjeta', 'tdc', 'credito'].includes(token));
        if (institutionToken && account.normalized_name.includes(institutionToken) && account.is_debt) {
          score = Math.max(score, 0.9);
        }
      }
      if (reference.expectedKind === 'operational' && /(debito|tdd)/.test(reference.normalized)) {
        const institutionToken = tokens.find((token) => !['tarjeta', 'debito', 'tdd'].includes(token));
        const accountLooksDebit = /(debito|tdd)/.test(account.normalized_name) || account.aliases.some((alias) => /(debito|tdd)/.test(alias));
        if (institutionToken && account.normalized_name.includes(institutionToken) && accountLooksDebit) {
          score = Math.max(score, 0.9);
        }
      }
      return { account, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  const strongThreshold = 0.85;
  const ambiguousDelta = 0.2;

  const ambiguous = (second?.score ?? 0) > 0 && best && best.score - (second?.score ?? 0) < ambiguousDelta;
  if (!best || best.score < strongThreshold || ambiguous) {
    const options = ranked.filter((item) => item.score > 0.45).slice(0, 3).map((item) => item.account.name);
    const clarification = options.length > 1
      ? `¿Te refieres a ${options.join(' o ')}?`
      : `No encontré una cuenta llamada "${reference.raw.toUpperCase()}". ¿Quieres elegir una cuenta existente?`;
    return {
      account: null,
      confidence: best?.score ?? 0,
      unresolvedMessage: clarification
    };
  }

  return { account: best.account, confidence: best.score, unresolvedMessage: null };
}

function cleanReferenceFragment(fragment: string) {
  return fragment.replace(/\b(en|de|del|la|el)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickByTokenOverlap(fragment: string, pool: EnrichedAccount[]) {
  const tokens = normalize(fragment).split(' ').filter((token) => token.length > 2);
  if (!tokens.length || !pool.length) return null;
  const ranked = pool
    .map((account) => ({
      account,
      score: tokens.filter((token) => account.normalized_name.includes(token) || account.aliases.some((alias) => alias.includes(token))).length
    }))
    .sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score === 0) return null;
  if ((ranked[1]?.score ?? -1) >= ranked[0].score) return null;
  return ranked[0].account;
}

function resolvePaymentRoles(normalizedText: string, accounts: EnrichedAccount[]): PaymentRoleResolution {
  const destinationFragment = normalizedText.match(/(?:a la|al|de)\s+([a-z0-9\s]+?)(?=\s+(?:desde|con)\b|$)/)?.[1]?.trim();
  const sourceFragment = normalizedText.match(/(?:desde|con)\s+([a-z0-9\s]+)$/)?.[1]?.trim();
  const isGenericReference = (value: string) => /^(tarjeta|tarjeta de credito|tarjeta credito|tdc|banco|efectivo|debito|tdd|ahorro|fondo|meta)$/.test(value);

  const cleanedDestination = destinationFragment ? cleanReferenceFragment(destinationFragment) : '';
  const destinationRef = destinationFragment
    ? resolveExplicitReference({
      raw: cleanedDestination,
      normalized: normalize(cleanedDestination),
      expectedKind: 'debt',
      isGeneric: isGenericReference(cleanedDestination),
      role: 'destination'
    }, accounts).account
    : null;

  const sourceExpectedKind: ExplicitAccountReference['expectedKind'] = sourceFragment
    ? /(efectivo|banco|debito|tdd)/.test(sourceFragment) ? 'operational'
      : /(tarjeta|tdc|prestamo|hipoteca)/.test(sourceFragment) ? 'debt'
        : null
    : null;

  const cleanedSource = sourceFragment ? cleanReferenceFragment(sourceFragment) : '';
  const sourceRef = sourceFragment
    ? resolveExplicitReference({
      raw: cleanedSource,
      normalized: normalize(cleanedSource),
      expectedKind: sourceExpectedKind,
      isGeneric: isGenericReference(cleanedSource),
      role: 'source'
    }, accounts).account
    : null;

  return {
    source: sourceRef,
    destination: destinationRef,
    hasSourceFragment: Boolean(sourceFragment),
    hasDestinationFragment: Boolean(destinationFragment)
  };
}

function resolveTransferRoles(normalizedText: string, accounts: EnrichedAccount[]): TransferRoleResolution {
  const transferMatch = normalizedText.match(/de\s+([a-z0-9\s]+?)\s+a\s+([a-z0-9\s]+)$/);
  const sourceFragment = transferMatch?.[1]?.trim() ?? null;
  const destinationFragment = transferMatch?.[2]?.trim() ?? null;
  const isGenericReference = (value: string) => /^(tarjeta|tarjeta de credito|tarjeta credito|tdc|banco|efectivo|debito|tdd|ahorro|fondo|meta)$/.test(value);

  const cleanedSource = sourceFragment ? cleanReferenceFragment(sourceFragment) : '';
  const sourceExpectedKind: ExplicitAccountReference['expectedKind'] =
    /(efectivo|banco|debito|tdd)/.test(cleanedSource) ? 'operational'
      : /(ahorro|fondo|meta)/.test(cleanedSource) ? 'savings'
        : /(tarjeta|tdc|prestamo|hipoteca)/.test(cleanedSource) ? 'debt'
          : null;
  const source = sourceFragment
    ? resolveExplicitReference({
      raw: cleanedSource,
      normalized: normalize(cleanedSource),
      expectedKind: sourceExpectedKind,
      isGeneric: isGenericReference(cleanedSource),
      role: 'source'
    }, accounts).account
    : null;

  const cleanedDestination = destinationFragment ? cleanReferenceFragment(destinationFragment) : '';
  const destinationExpectedKind: ExplicitAccountReference['expectedKind'] =
    /(efectivo|banco|debito|tdd)/.test(cleanedDestination) ? 'operational'
      : /(ahorro|fondo|meta)/.test(cleanedDestination) ? 'savings'
        : /(tarjeta|tdc|prestamo|hipoteca)/.test(cleanedDestination) ? 'debt'
          : null;
  const destination = destinationFragment
    ? resolveExplicitReference({
      raw: cleanedDestination,
      normalized: normalize(cleanedDestination),
      expectedKind: destinationExpectedKind,
      isGeneric: isGenericReference(cleanedDestination),
      role: 'destination'
    }, accounts).account
    : null;

  return {
    source: source ?? (sourceExpectedKind ? pickByTokenOverlap(cleanedSource, accounts.filter((account) => sourceExpectedKind === 'operational' ? account.type === 'operational_cash' : sourceExpectedKind === 'savings' ? account.type === 'savings_fund' : account.is_debt)) : null),
    destination: destination ?? (destinationExpectedKind ? pickByTokenOverlap(cleanedDestination, accounts.filter((account) => destinationExpectedKind === 'operational' ? account.type === 'operational_cash' : destinationExpectedKind === 'savings' ? account.type === 'savings_fund' : account.is_debt)) : null),
    hasSourceFragment: Boolean(sourceFragment),
    hasDestinationFragment: Boolean(destinationFragment)
  };
}

function resolveReceivablePaymentRoles(normalizedText: string, accounts: EnrichedAccount[]): ReceivablePaymentResolution {
  const destinationFragment = normalizedText.match(/\ben\s+([a-z0-9\s]+)$/)?.[1]?.trim() ?? null;
  const cleanedDestination = destinationFragment ? cleanReferenceFragment(destinationFragment) : '';
  const destination = destinationFragment
    ? resolveExplicitReference({
      raw: cleanedDestination,
      normalized: normalize(cleanedDestination),
      expectedKind: /(ahorro|fondo|meta)/.test(cleanedDestination) ? 'savings' : 'operational',
      isGeneric: /^(banco|efectivo|debito|tdd|ahorro|fondo|meta)$/.test(cleanedDestination),
      role: 'destination'
    }, accounts).account
    : null;

  const debtorFragment = normalizedText.match(/^([a-z0-9\s]+?)\s+me\s+(?:pago|abono|deposito)\b/)?.[1]?.trim() ?? null;
  const debtorTokens = debtorFragment
    ? debtorFragment.split(' ').map((token) => token.trim()).filter((token) => token.length > 2)
    : [];
  const receivableSource = debtorTokens.length
    ? accounts.find((account) => account.type === 'receivable' && debtorTokens.every((token) => account.normalized_name.includes(token))) ?? null
    : null;

  return {
    receivableSource,
    destination,
    hasDestinationFragment: Boolean(destinationFragment)
  };
}

function findAccountByHint(normalizedText: string, accounts: EnrichedAccount[], kind: 'debt' | 'operational' | 'savings') {
  if (kind === 'debt') {
    const debtByKeyword = accounts.find((account) => {
      const institution = account.institution?.toLowerCase().trim();
      return account.is_debt && (normalizedText.includes(account.normalized_name) || (!!institution && normalizedText.includes(institution)));
    });
    if (debtByKeyword) return debtByKeyword;
    if (/(tarjeta|tdc|prestamo|hipoteca)/.test(normalizedText)) {
      const debtAccounts = accounts.filter((account) => account.is_debt);
      const creditCards = debtAccounts.filter((account) => account.type === 'credit_card');
      const hintTokens = normalizedText.split(' ').filter((token) => token.length > 2 && !['tarjeta', 'tdc', 'prestamo', 'hipoteca', 'deuda', 'credito'].includes(token));
      if (!hintTokens.length) {
        if (normalizedText.includes('tarjeta') && creditCards.length === 1) return creditCards[0];
        if (normalizedText.includes('prestamo') && debtAccounts.filter((account) => account.type === 'loan').length === 1) {
          return debtAccounts.find((account) => account.type === 'loan') ?? null;
        }
        return null;
      }
      const ranked = debtAccounts
        .map((account) => ({
          account,
          score: account.normalized_name.split(' ').filter((token) => token.length > 2 && hintTokens.includes(token)).length
        }))
        .sort((a, b) => b.score - a.score);
      if (!ranked.length) return null;
      if (ranked[0].score > 0 && (ranked[1]?.score ?? -1) < ranked[0].score) return ranked[0].account;
      if (debtAccounts.length === 1) return debtAccounts[0];
      return null;
    }
  }
  if (kind === 'operational' && /(efectivo|banco|debito|tdd)/.test(normalizedText)) {
    if (normalizedText.includes('banco')) {
      return accounts.find((account) => account.type === 'operational_cash' && account.normalized_name.includes('banco'))
        ?? accounts.find((account) => account.type === 'operational_cash')
        ?? null;
    }
    if (normalizedText.includes('efectivo')) {
      return accounts.find((account) => account.type === 'operational_cash' && account.normalized_name.includes('efectivo'))
        ?? accounts.find((account) => account.type === 'operational_cash')
        ?? null;
    }
    if (normalizedText.includes('tdd') || normalizedText.includes('debito')) {
      return accounts.find((account) => account.type === 'operational_cash' && (account.normalized_name.includes('tdd') || account.normalized_name.includes('debito')))
        ?? accounts.find((account) => account.type === 'operational_cash' && account.normalized_name.includes('bbva'))
        ?? null;
    }
    return accounts.find((account) => account.type === 'operational_cash') ?? null;
  }
  if (kind === 'savings' && /(ahorro|fondo|meta)/.test(normalizedText)) {
    return accounts.find((account) => account.type === 'savings_fund') ?? null;
  }
  return null;
}

function hasExplicitDebitExpenseMarker(normalizedText: string) {
  return /(con)\s+([a-z0-9\s]*\b(?:tdd|debito|tarjeta de debito)\b[a-z0-9\s]*)$/.test(normalizedText);
}

function inferIntent(normalizedText: string, matched: EnrichedAccount[]): z.infer<typeof financialIntentSchema> {
  if (/(me pago|pago recibido|me deposito)/.test(normalizedText)) return 'receivable_payment';
  if (/(preste|prestamo a|le di prestado)/.test(normalizedText)) return 'receivable_created';
  if (/(transferi|traspase|transferencia|movi .* entre cuentas)/.test(normalizedText)) return 'transfer_between_own_accounts';
  if (/(ingreso|recibi|nomina|sueldo|depositaron|bono|tiempo extra)/.test(normalizedText)) return 'income';
  if (/(ahorro|fondo emergencia|meta)/.test(normalizedText) && /(meti|aporte|abone|deposite|movi)/.test(normalizedText)) return 'savings_contribution';
  if (/(retire|saque).*(ahorro|fondo|meta)/.test(normalizedText)) return 'savings_withdrawal';
  if (/(pague|abone|abono)/.test(normalizedText)) {
    if (/de\s+\w+\s+con\s*$/.test(normalizedText)) return 'debt_transfer';
    const debtMentions = matched.filter((account) => account.is_debt);
    if (debtMentions.length >= 2) return 'debt_transfer';
    if (debtMentions.length >= 1 || /(tarjeta|tdc|prestamo|hipoteca)/.test(normalizedText)) return 'debt_payment';
    if (!/(que pagaste|pago recibido)/.test(normalizedText)) return 'manual_adjustment';
  }
  if (/(gaste|compre|pague en|consumi)/.test(normalizedText)) {
    if (hasExplicitDebitExpenseMarker(normalizedText)) return 'expense_cash_like';
    if (/(tarjeta|tdc)/.test(normalizedText)) return 'expense_debt_account';
    const source = matched[0];
    return source?.type === 'credit_card' ? 'expense_debt_account' : 'expense_cash_like';
  }
  if (/(meti|movi|abone)/.test(normalizedText)) return 'manual_adjustment';
  return 'expense_cash_like';
}

function inferFinalIntent(
  currentIntent: z.infer<typeof financialIntentSchema>,
  sourceType: z.infer<typeof accountTypeSchema> | null | undefined,
  destinationType: z.infer<typeof accountTypeSchema> | null | undefined,
  normalizedText: string
): z.infer<typeof financialIntentSchema> {
  if ((currentIntent === 'expense_cash_like' || currentIntent === 'expense_debt_account') && sourceType === 'credit_card') {
    return 'expense_debt_account';
  }
  if (currentIntent === 'debt_payment' || currentIntent === 'debt_transfer' || /pague/.test(normalizedText)) {
    const sourceIsDebt = ['credit_card', 'loan'].includes(sourceType ?? '');
    const destinationIsDebt = ['credit_card', 'loan'].includes(destinationType ?? '');
    if (sourceIsDebt && destinationIsDebt) return 'debt_transfer';
    if (!sourceIsDebt && destinationIsDebt) return 'debt_payment';
  }
  return currentIntent;
}

function findDebtDestinationFromText(normalizedText: string, accounts: EnrichedAccount[]) {
  const match = normalizedText.match(/de\s+([a-z0-9\s]+?)\s+con\b/);
  const fragment = match?.[1]?.trim();
  if (!fragment) return null;
  const normalizedFragment = normalize(fragment);
  return accounts.find((account) => account.is_debt && (account.normalized_name.includes(normalizedFragment) || normalizedFragment.includes(account.normalized_name))) ?? null;
}

function inferCategory(intent: z.infer<typeof financialIntentSchema>, normalizedText: string) {
  if (intent === 'income') {
    if (/(nomina|sueldo)/.test(normalizedText)) return 'ingreso_fijo';
    if (/(tiempo extra|bono)/.test(normalizedText)) return 'ingreso_extra';
    if (/reembolso/.test(normalizedText)) return 'reembolso';
    return 'ingreso_extra';
  }
  if (intent === 'debt_payment') return 'pago_deuda';
  if (intent === 'debt_transfer') return 'traslado_deuda';
  if (intent === 'savings_contribution' || intent === 'savings_withdrawal') return 'ahorro';
  if (intent === 'receivable_created') return 'préstamo_otorgado';
  if (intent === 'receivable_payment') return 'pago_recibido';

  if (/(cena|comida|restaurante|tacos|desayuno)/.test(normalizedText)) return 'comida';
  if (/(taxi|uber|gasolina)/.test(normalizedText)) return 'transporte';
  if (/(ropa|zapatos)/.test(normalizedText)) return 'ropa';
  if (/(internet|luz|agua)/.test(normalizedText)) return 'servicios';
  if (/(medico|medicina)/.test(normalizedText)) return 'salud';
  if (/(utiles|colegiatura)/.test(normalizedText)) return 'educación';
  if (/(cine|fiesta)/.test(normalizedText)) return 'entretenimiento';
  return 'otros_gastos';
}

function intentToLegacyAction(intent: z.infer<typeof financialIntentSchema>): TransactionIntent['action'] {
  if (intent === 'income') return 'ingreso';
  if (intent === 'debt_payment' || intent === 'debt_transfer') return 'pago_deuda';
  if (intent === 'transfer_between_own_accounts' || intent === 'savings_contribution' || intent === 'savings_withdrawal') return 'transferencia';
  if (intent === 'receivable_created') return 'prestamo_otorgado';
  if (intent === 'receivable_payment') return 'pago_recibido';
  return 'gasto';
}



function shouldAskWhatWasPaid(normalizedText: string, rawText: string, description: string | null | undefined) {
  const requiresDetail = /gaste\s+\d+\s+con\s+/.test(normalizedText) && !/(en\s+\w+)/.test(normalizedText);
  if (!requiresDetail) return false;
  if (!description?.trim()) return true;
  const normalizedDescription = normalize(description);
  return normalizedDescription.length === 0 || normalizedDescription === normalize(rawText);
}

function applyIntentAccountConstraints(draft: TransactionIntent) {
  if (draft.intent === 'expense_cash_like' || draft.intent === 'expense_debt_account') {
    draft.destinationAccountId = null;
    draft.destinationAccountName = null;
    draft.destinationAccountType = null;
    draft.destinationAccount = undefined;
  }
  if (draft.intent === 'expense_debt_account' && draft.sourceAccountType !== 'credit_card') {
    draft.sourceAccountId = null;
    draft.sourceAccountName = null;
    draft.sourceAccountType = null;
    draft.sourceAccount = undefined;
  }
}

function recomputeMissingKinds(draft: TransactionIntent, unresolvedMessage: string | null = null) {
  const missingKinds: z.infer<typeof missingFieldKindSchema>[] = [];
  if (draft.intent === 'manual_adjustment') missingKinds.push('missingIntent');
  if (['income', 'transfer_between_own_accounts', 'debt_payment', 'debt_transfer', 'savings_contribution', 'savings_withdrawal', 'receivable_payment'].includes(draft.intent) && !draft.destinationAccountId) {
    missingKinds.push(draft.intent === 'debt_payment' || draft.intent === 'debt_transfer' ? 'missingDebtTarget' : 'missingDestinationAccount');
  }
  if (['expense_cash_like', 'expense_debt_account', 'debt_payment', 'debt_transfer', 'savings_contribution', 'savings_withdrawal', 'transfer_between_own_accounts', 'receivable_created'].includes(draft.intent) && !draft.sourceAccountId) {
    missingKinds.push('missingSourceAccount');
  }
  if (shouldAskWhatWasPaid(draft.normalizedText, draft.rawText, draft.description)) {
    missingKinds.push('missingWhatWasPaid');
  }
  if (/pague\s+\d+\s*$/.test(draft.normalizedText)) {
    missingKinds.push('missingIntent');
  }
  if (draft.intent === 'expense_debt_account' && (draft.sourceAccountType !== 'credit_card' || !draft.sourceAccountId) && !missingKinds.includes('missingSourceAccount')) {
    missingKinds.push('missingSourceAccount');
  }
  if (unresolvedMessage && !missingKinds.includes('missingSourceAccount')) {
    missingKinds.push('missingSourceAccount');
  }
  return Array.from(new Set(missingKinds));
}

function choosePrompt(
  missingKinds: z.infer<typeof missingFieldKindSchema>[],
  intent?: z.infer<typeof financialIntentSchema>,
  normalizedText?: string
) {
  const first = missingKinds[0];
  if (!first) return { nextPrompt: null, nextPromptInputType: null, nextPromptAllowedAccountTypes: null };
  if (first === 'missingIntent') {
    return { nextPrompt: '¿Qué pagaste?', nextPromptInputType: 'guided_choice' as const, nextPromptAllowedAccountTypes: null };
  }
  if (first === 'missingDescription' || first === 'missingWhatWasPaid') {
    return { nextPrompt: '¿En qué gastaste ese dinero?', nextPromptInputType: 'text_input' as const, nextPromptAllowedAccountTypes: null };
  }
  if (first === 'missingDebtTarget') {
    return { nextPrompt: '¿A qué tarjeta o préstamo pagaste?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['credit_card', 'loan'] as const };
  }
  if (first === 'missingDestinationAccount') {
    return { nextPrompt: '¿A qué cuenta entró el dinero?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['operational_cash', 'savings_fund', 'investment', 'receivable'] as const };
  }
  if (first === 'missingSourceAccount' && intent === 'expense_debt_account') {
    return { nextPrompt: '¿Con qué tarjeta de crédito pagaste?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['credit_card'] as const };
  }
  if (first === 'missingSourceAccount' && intent === 'debt_transfer' && normalizedText?.includes('de ')) {
    return { nextPrompt: '¿Con qué cuenta pagaste esa deuda?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['credit_card', 'loan', 'operational_cash'] as const };
  }
  return { nextPrompt: '¿De qué cuenta salió el dinero?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['operational_cash', 'savings_fund', 'investment', 'credit_card', 'loan'] as const };
}

export function enforceFinancialConsistency(result: TransactionIntent): TransactionIntent {
  const suggestedCorrections: FinancialConsistencySuggestion = {};
  let hasAppliedFix = false;

  if ((result.intent === 'expense_cash_like' || result.intent === 'expense_debt_account') && result.destinationAccountId) {
    suggestedCorrections.destinationAccountId = null;
    suggestedCorrections.destinationAccountName = null;
    suggestedCorrections.destinationAccountType = null;
    suggestedCorrections.destinationAccount = undefined;
    console.info('[ConsistencyLayer][APPLIED]');
    console.info(`intent: ${result.intent}`);
    console.info('fix: destination → null');
    hasAppliedFix = true;
  }

  if (result.intent === 'income' && result.sourceAccountId) {
    suggestedCorrections.sourceAccountId = null;
    suggestedCorrections.sourceAccountName = null;
    suggestedCorrections.sourceAccountType = null;
    suggestedCorrections.sourceAccount = undefined;
    console.info('[ConsistencyLayer][APPLIED]');
    console.info('intent: income');
    console.info('fix: source → null');
    hasAppliedFix = true;
  }

  if (result.intent === 'debt_payment' && result.destinationAccountId && !['credit_card', 'loan'].includes(result.destinationAccountType ?? '')) {
    console.warn('[ConsistencyLayer] debt_payment destination should be debt-type account', {
      destinationAccountName: result.destinationAccountName,
      destinationAccountType: result.destinationAccountType
    });
  }

  if (result.intent === 'debt_transfer') {
    const hasInconsistentSource = Boolean(result.sourceAccountId) && !['credit_card', 'loan'].includes(result.sourceAccountType ?? '');
    const hasInconsistentDestination = Boolean(result.destinationAccountId) && !['credit_card', 'loan'].includes(result.destinationAccountType ?? '');
    if (hasInconsistentSource || hasInconsistentDestination) {
      console.warn('[ConsistencyLayer] debt_transfer source/destination should be debt-type accounts', {
        sourceAccountName: result.sourceAccountName,
        sourceAccountType: result.sourceAccountType,
        destinationAccountName: result.destinationAccountName,
        destinationAccountType: result.destinationAccountType
      });
    }
  }

  if (result.intent === 'receivable_payment' && result.destinationAccountId && !['operational_cash', 'savings_fund'].includes(result.destinationAccountType ?? '')) {
    console.warn('[ConsistencyLayer] receivable_payment destination should be operational account', {
      destinationAccountName: result.destinationAccountName,
      destinationAccountType: result.destinationAccountType
    });
  }

  if (hasAppliedFix) {
    return { ...result, ...suggestedCorrections };
  }

  return result;
}

export async function interpretTransaction(text: string, accounts: InterpreterAccountContext[] = []): Promise<TransactionIntent> {
  const modelAccounts = enrichAccounts(accounts);
  const normalizedText = normalize(text);
  const amount = parseAmount(text);
  const matched = matchAccounts(text, modelAccounts);
  const intent = inferIntent(normalizedText, matched);
  const explicitReference = extractExplicitAccountReference(normalizedText, intent);
  const explicitResolution = resolveExplicitReference(explicitReference, modelAccounts);

  const sourceFromHint = findAccountByHint(normalizedText, modelAccounts, 'operational');
  const debtFromHint = findAccountByHint(normalizedText, modelAccounts, 'debt');
  const savingsFromHint = findAccountByHint(normalizedText, modelAccounts, 'savings');
  const debtDestinationFromText = findDebtDestinationFromText(normalizedText, modelAccounts);
  const paymentRoles = resolvePaymentRoles(normalizedText, modelAccounts);
  const transferRoles = resolveTransferRoles(normalizedText, modelAccounts);
  const receivableRoles = resolveReceivablePaymentRoles(normalizedText, modelAccounts);
  const hasExplicitDebitExpenseSource = hasExplicitDebitExpenseMarker(normalizedText);

  let source = matched[0] ?? null;
  let destination = matched[1] ?? (intent === 'income' ? matched[0] ?? null : null);

  if (intent === 'expense_debt_account' && !source) source = debtFromHint;
  if (intent === 'debt_payment') {
    destination = paymentRoles.hasDestinationFragment
      ? paymentRoles.destination
      : (destination ?? debtFromHint);
    source = paymentRoles.hasSourceFragment
      ? (paymentRoles.source ?? source)
      : (source ?? sourceFromHint);
  }
  if (intent === 'debt_transfer') {
    destination = paymentRoles.hasDestinationFragment ? paymentRoles.destination : (destination ?? debtDestinationFromText);
    source = paymentRoles.hasSourceFragment ? paymentRoles.source : source;
  }
  if (intent === 'debt_transfer' && debtDestinationFromText) {
    destination = debtDestinationFromText;
    if (source?.id === destination.id) {
      source = null;
    }
  }
  if (intent === 'savings_contribution') {
    destination = destination ?? savingsFromHint;
    source = source ?? sourceFromHint;
  }
  if (intent === 'income') {
    source = null;
  }
  if (intent === 'transfer_between_own_accounts') {
    source = transferRoles.hasSourceFragment ? transferRoles.source : source;
    destination = transferRoles.hasDestinationFragment ? transferRoles.destination : destination;
  }
  if (intent === 'receivable_payment') {
    source = receivableRoles.receivableSource ?? source;
    destination = receivableRoles.hasDestinationFragment
      ? receivableRoles.destination
      : (destination ?? sourceFromHint);
  }
  if (explicitResolution.account && explicitResolution.confidence >= 0.85) {
    if (intent === 'income' || explicitReference?.role === 'destination') destination = explicitResolution.account;
    else source = explicitResolution.account;
  }
  if (explicitResolution.unresolvedMessage) {
    if (intent === 'income' || explicitReference?.role === 'destination') destination = null;
    else source = null;
  }
  if (intent === 'expense_cash_like' && hasExplicitDebitExpenseSource) {
    const explicitDebitSource = resolveExplicitReference({
      raw: normalizedText.match(/con\s+([a-z0-9\s]+)$/)?.[1]?.trim() ?? '',
      normalized: normalize(normalizedText.match(/con\s+([a-z0-9\s]+)$/)?.[1]?.trim() ?? ''),
      expectedKind: 'operational',
      isGeneric: false,
      role: 'source'
    }, modelAccounts).account;
    source = explicitDebitSource ?? sourceFromHint ?? (source?.type === 'credit_card' ? null : source);
  }
  if (intent === 'transfer_between_own_accounts') {
    if (transferRoles.hasSourceFragment) source = transferRoles.source ?? source;
    if (transferRoles.hasDestinationFragment) destination = transferRoles.destination ?? destination;
  }
  if (intent === 'receivable_payment' && receivableRoles.hasDestinationFragment) {
    destination = receivableRoles.destination ?? destination;
  }
  const finalIntent = inferFinalIntent(intent, source?.type, destination?.type, normalizedText);
  const category = inferCategory(finalIntent, normalizedText);

  const draftForConstraints: TransactionIntent = transactionIntentSchema.parse({
    rawText: text,
    normalizedText,
    intent: finalIntent,
    visibleType: visibleTypeMap[finalIntent],
    action: intentToLegacyAction(finalIntent),
    amount,
    description: text.trim() || null,
    category,
    sourceAccountId: source?.id ?? null,
    sourceAccountName: source?.name ?? null,
    sourceAccountType: source?.type ?? null,
    destinationAccountId: destination?.id ?? null,
    destinationAccountName: destination?.name ?? null,
    destinationAccountType: destination?.type ?? null,
    sourceAccount: source?.name.toLowerCase(),
    destinationAccount: destination?.name.toLowerCase(),
    missingFields: [],
    missingFieldKinds: []
  });
  applyIntentAccountConstraints(draftForConstraints);
  const missingKinds = recomputeMissingKinds(draftForConstraints, explicitResolution.unresolvedMessage);

  const prompt = choosePrompt(missingKinds, finalIntent, normalizedText);
  const confidence = Math.max(0.4, missingKinds.length === 0 ? 0.94 : 0.62, explicitResolution.confidence);
  const visibleType = visibleTypeMap[finalIntent];
  const humanConfirmation = missingKinds.length
    ? null
    : finalIntent === 'income'
      ? `Registrar ingreso de $${amount.toLocaleString('es-MX')} hacia ${draftForConstraints.destinationAccountName ?? 'N/A'}.`
      : `Registrar ${visibleType.toLowerCase()} de $${amount.toLocaleString('es-MX')}${draftForConstraints.sourceAccountName ? ` desde ${draftForConstraints.sourceAccountName}` : ''}${draftForConstraints.destinationAccountName ? ` hacia ${draftForConstraints.destinationAccountName}` : ''}.`;

  const parsedResult = transactionIntentSchema.parse({
    rawText: text,
    normalizedText,
    intent: finalIntent,
    visibleType,
    action: intentToLegacyAction(finalIntent),
    amount,
    description: draftForConstraints.description,
    category: draftForConstraints.category,
    sourceAccountId: draftForConstraints.sourceAccountId,
    sourceAccountName: draftForConstraints.sourceAccountName,
    sourceAccountType: draftForConstraints.sourceAccountType,
    destinationAccountId: draftForConstraints.destinationAccountId,
    destinationAccountName: draftForConstraints.destinationAccountName,
    destinationAccountType: draftForConstraints.destinationAccountType,
    sourceAccount: draftForConstraints.sourceAccount,
    destinationAccount: draftForConstraints.destinationAccount,
    missingFields: missingKinds.map((item) => item.replace('missing', '').replace('Target', 'Account').replace(/^./, (c) => c.toLowerCase())),
    missingFieldKinds: missingKinds,
    nextPrompt: explicitResolution.unresolvedMessage ?? prompt.nextPrompt,
    nextPromptInputType: prompt.nextPromptInputType,
    nextPromptAllowedAccountTypes: prompt.nextPromptAllowedAccountTypes,
    confidence,
    humanConfirmation
  });
  return enforceFinancialConsistency(parsedResult);
}

function findAccountByName(accounts: EnrichedAccount[], value: string) {
  const normalized = normalize(value);
  return accounts.find((account) => account.normalized_name === normalized || account.aliases.includes(normalized));
}

export async function applyFollowUpAnswer(
  current: TransactionIntent,
  answer: string,
  accounts: InterpreterAccountContext[] = []
): TransactionIntent {
  const updated = { ...current };
  const kind = updated.missingFieldKinds[0];
  const modelAccounts = enrichAccounts(accounts);
  const matchedAccount = findAccountByName(modelAccounts, answer);

  if (kind === 'missingDebtTarget' || kind === 'missingDestinationAccount') {
    if (matchedAccount) {
      updated.destinationAccountId = matchedAccount.id;
      updated.destinationAccountName = matchedAccount.name;
      updated.destinationAccountType = matchedAccount.type;
      updated.destinationAccount = matchedAccount.name.toLowerCase();
    }
  }

  if (kind === 'missingSourceAccount') {
    if (matchedAccount) {
      updated.sourceAccountId = matchedAccount.id;
      updated.sourceAccountName = matchedAccount.name;
      updated.sourceAccountType = matchedAccount.type;
      updated.sourceAccount = matchedAccount.name.toLowerCase();
    }
  }

  if (kind === 'missingIntent') {
    const normalizedAnswer = normalize(answer);
    if (normalizedAnswer.includes('gasto')) updated.intent = 'expense_cash_like';
    if (normalizedAnswer.includes('tarjeta') || normalizedAnswer.includes('prestamo')) updated.intent = 'debt_payment';
    if (normalizedAnswer.includes('transferencia')) updated.intent = 'transfer_between_own_accounts';
    updated.visibleType = visibleTypeMap[updated.intent];
    updated.action = intentToLegacyAction(updated.intent);
  }

  if (updated.intent === 'expense_cash_like' && updated.sourceAccountType === 'credit_card') {
    updated.intent = 'expense_debt_account';
    updated.visibleType = visibleTypeMap.expense_debt_account;
    updated.action = intentToLegacyAction(updated.intent);
  }

  if (updated.intent === 'debt_payment' && ['credit_card', 'loan'].includes(updated.sourceAccountType ?? '') && ['credit_card', 'loan'].includes(updated.destinationAccountType ?? '')) {
    updated.intent = 'debt_transfer';
    updated.visibleType = visibleTypeMap.debt_transfer;
    updated.action = intentToLegacyAction(updated.intent);
  }

  updated.intent = inferFinalIntent(
    updated.intent,
    updated.sourceAccountType,
    updated.destinationAccountType,
    updated.normalizedText
  );
  updated.visibleType = visibleTypeMap[updated.intent];
  updated.action = intentToLegacyAction(updated.intent);
  updated.category = inferCategory(updated.intent, updated.normalizedText);

  if ((kind === 'missingDescription' || kind === 'missingWhatWasPaid') && answer.trim()) {
    updated.description = answer.trim();
    updated.category = inferCategory(updated.intent, normalize(answer));
  }

  if (kind === 'missingSourceAccount' && !matchedAccount && answer.trim()) {
    updated.description = answer.trim();
    updated.category = inferCategory(updated.intent, normalize(answer));
  }

  const final = { ...updated };
  applyIntentAccountConstraints(final);
  final.missingFieldKinds = recomputeMissingKinds(final);
  final.missingFields = final.missingFieldKinds.map((item) => item.replace('missing', '').replace('Target', 'Account').replace(/^./, (c) => c.toLowerCase()));
  const prompt = choosePrompt(final.missingFieldKinds, final.intent, final.normalizedText);
  final.nextPrompt = prompt.nextPrompt;
  final.nextPromptInputType = prompt.nextPromptInputType;
  final.nextPromptAllowedAccountTypes = prompt.nextPromptAllowedAccountTypes;
  final.humanConfirmation = final.missingFieldKinds.length
    ? null
    : final.intent === 'income'
      ? `Registrar ingreso de $${final.amount.toLocaleString('es-MX')} hacia ${final.destinationAccountName ?? 'N/A'}.`
      : `Registrar ${final.visibleType.toLowerCase()} de $${final.amount.toLocaleString('es-MX')}${final.sourceAccountName ? ` desde ${final.sourceAccountName}` : ''}${final.destinationAccountName ? ` hacia ${final.destinationAccountName}` : ''}.`;

  const parsedResult = transactionIntentSchema.parse(final);
  return enforceFinancialConsistency(parsedResult);
}
