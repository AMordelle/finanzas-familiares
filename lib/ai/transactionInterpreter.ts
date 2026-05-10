import { z } from 'zod';
import { isApprovedCategory, localCategoryInference, semanticCategoryInferenceWithAI } from '@/lib/ai/semanticCategory';
import { semanticInstructionUnderstanding } from '@/lib/ai/semanticInstruction';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

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
  action: z.enum(['gasto', 'ingreso', 'transferencia', 'pago_deuda', 'prestamo_otorgado', 'pago_recibido', 'objetivo_aporte', 'msi_purchase']),
  amount: z.number().positive(),
  totalAmount: z.number().positive().nullable().optional().default(null),
  months: z.number().int().positive().nullable().optional().default(null),
  monthlyAmount: z.number().positive().nullable().optional().default(null),
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
  humanConfirmation: z.string().nullable().optional().default(null),
  interpretationSource: z.enum(['ai', 'fallback']).optional().default('fallback'),
  aiIntent: z.string().nullable().optional().default(null),
  aiCategory: z.string().nullable().optional().default(null),
  aiConfidence: z.enum(['high', 'medium', 'low']).nullable().optional().default(null),
  validationCorrections: z.array(z.string()).optional().default([])
});

export type TransactionIntent = z.infer<typeof transactionIntentSchema>;

export const batchTransactionInterpretationSchema = z.object({
  mode: z.enum(['single', 'batch']),
  items: z.array(transactionIntentSchema).min(1),
  missingFields: z.array(z.string()).default([]),
  needsConfirmation: z.boolean().default(true)
});

export type BatchTransactionInterpretation = z.infer<typeof batchTransactionInterpretationSchema>;

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

type AIConfidence = 'high' | 'medium' | 'low';

type AiInterpretationMetadata = {
  interpretationSource: 'ai' | 'fallback';
  aiIntent: string | null;
  aiCategory: string | null;
  aiConfidence: AIConfidence | null;
  validationCorrections: string[];
};

function isCategoryCompatibleWithIntent(
  intent: z.infer<typeof financialIntentSchema>,
  category: string | null | undefined
) {
  if (!category) return false;
  if (intent === 'income') return ['ingreso_fijo', 'ingreso_extra', 'reembolso', 'ahorro', 'otros_gastos'].includes(category);
  if (intent === 'receivable_payment') return category === 'pago_recibido';
  return true;
}

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

function normalizeAccountReference(input: string) {
  return normalize(input)
    .replace(/\b(mi|mis|la|el|las|los|de|del|al|a|en|para|por)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAccountLabel(input: string) {
  return normalize(input).replace(/\b(tarjeta|cuenta|banco|tdc)\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripReferenceNoise(input: string) {
  return normalizeAccountReference(input);
}

function hasStrongDebitMarker(input: string) {
  const normalizedInput = normalize(input);
  return /\b(tarjeta de debito|tarjeta debito|debito|tdd)\b/.test(normalizedInput);
}

function normalizeStrongDebitReference(input: string) {
  const normalizedInput = normalize(input);
  if (!hasStrongDebitMarker(normalizedInput)) return normalizedInput;
  return normalizedInput
    .replace(/\btarjeta de debito\b/g, 'debito')
    .replace(/\btarjeta debito\b/g, 'debito')
    .replace(/\s+/g, ' ')
    .trim();
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

function hintImpliesSavings(normalizedHint: string) {
  return /(ahorro|fondo|meta)/.test(normalizedHint);
}

function isExpectedKindCompatible(account: EnrichedAccount, expectedKind: ExplicitAccountReference['expectedKind']) {
  if (!expectedKind) return true;
  if (expectedKind === 'debt') return account.is_debt;
  if (expectedKind === 'operational') return account.type === 'operational_cash';
  return account.type === 'savings_fund';
}

function isAccountTypeCompatibleWithIntent(
  account: EnrichedAccount,
  role: 'source' | 'destination',
  intent: z.infer<typeof financialIntentSchema>
) {
  const type = account.type;
  if (intent === 'transfer_between_own_accounts') return ['operational_cash', 'savings_fund', 'investment'].includes(type);
  if (intent === 'income' && role === 'destination') return ['operational_cash', 'savings_fund', 'investment', 'receivable'].includes(type);
  if (intent === 'expense_debt_account' && role === 'source') return isCreditCardCompatibleDebtInstrument(account);
  if (intent === 'expense_cash_like' && role === 'source') return ['operational_cash', 'savings_fund', 'investment'].includes(type);
  if (intent === 'debt_payment' && role === 'destination') return ['credit_card', 'loan'].includes(type);
  if (intent === 'debt_transfer') return ['credit_card', 'loan'].includes(type);
  if ((intent === 'savings_contribution' || intent === 'savings_withdrawal') && role === 'destination') return type === 'savings_fund';
  if ((intent === 'savings_contribution' || intent === 'savings_withdrawal') && role === 'source') return ['operational_cash', 'savings_fund', 'investment'].includes(type);
  if (intent === 'receivable_payment' && role === 'destination') return ['operational_cash', 'savings_fund'].includes(type);
  return true;
}

function isCreditCardCompatibleDebtInstrument(account: Pick<EnrichedAccount, 'type' | 'subtype' | 'name'> | null | undefined) {
  if (!account) return false;
  if (account.type === 'credit_card') return true;
  if (account.type !== 'loan') return false;
  const normalizedSubtype = normalize(account.subtype ?? '');
  const normalizedName = normalize(account.name ?? '');
  return normalizedSubtype.includes('credit')
    || normalizedSubtype.includes('tarjeta')
    || /\b(tdc|tarjeta)\b/.test(normalizedName);
}

function parseAmount(input: string) {
  const match = input.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return Number(match?.[1] ?? 0) || 1;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function extractMsiMonths(normalizedText: string) {
  const patterns = [
    /\ba\s+(\d{2}|[2-9])\s+msi\b/,
    /\ba\s+(\d{2}|[2-9])\s+mes(?:es)?(?:\s+sin\s+intereses)?\b/,
    /\b(\d{2}|[2-9])\s+mes(?:es)?\s+sin\s+intereses\b/,
    /\b(\d{2}|[2-9])\s+msi\b/,
    /\bdiferido\s+a\s+(\d{2}|[2-9])\s+mes(?:es)?\b/,
    /\bcompra\s+a\s+(\d{2}|[2-9])\s+mes(?:es)?\b/
  ];
  for (const pattern of patterns) {
    const value = Number(normalizedText.match(pattern)?.[1] ?? 0);
    if (Number.isInteger(value) && value > 1) return value;
  }
  return null;
}

function isMsiPurchaseText(normalizedText: string) {
  return /\b(msi|meses\s+sin\s+intereses|diferido\s+a\s+meses|compra\s+a\s+meses)\b/.test(normalizedText)
    || /\ba\s+(?:\d{2}|[2-9])\s+mes(?:es)?(?:\s+sin\s+intereses)?\b/.test(normalizedText);
}

function toCanonicalType(type: string, subtype?: string | null, name?: string): z.infer<typeof accountTypeSchema> {
  const normalizedSubtype = (subtype ?? '').toLowerCase().trim();
  const normalizedName = normalize(name ?? '');
  if (type === 'credit_card' || type === 'loan' || type === 'receivable' || type === 'investment' || type === 'savings_fund' || type === 'operational_cash') return type;
  if (type === 'deuda') {
    const looksLikeCreditCard = normalizedSubtype.includes('credit')
      || normalizedSubtype.includes('tarjeta')
      || /\b(tdc|tarjeta)\b/.test(normalizedName);
    return looksLikeCreditCard ? 'credit_card' : 'loan';
  }
  if (type === 'fondo') return 'savings_fund';
  if (type === 'inversion') return 'investment';
  if (type === 'por_cobrar') return 'receivable';
  return 'operational_cash';
}

function enrichAccounts(accounts: InterpreterAccountContext[]): EnrichedAccount[] {
  return accounts.map((account, index) => {
    const type = toCanonicalType(account.type, account.subtype, account.name);
    const normalizedName = normalize(account.name);
    const normalizedCompactName = normalizeAccountLabel(account.name);
    const normalizedCompactNoisy = stripReferenceNoise(account.name);
    const institution = normalize(account.institution ?? '');
    const debitAliases = type === 'operational_cash' ? buildOperationalDebitAliases(normalizedName) : [];
    const naturalAliases = [
      normalizedCompactNoisy,
      institution,
      institution ? `la ${institution}` : '',
      institution ? `de ${institution}` : '',
      institution ? `la de ${institution}` : '',
      institution ? `cuenta ${institution}` : '',
      institution ? `mi cuenta ${institution}` : '',
      institution && type === 'credit_card' ? `tarjeta ${institution}` : '',
      institution && type === 'credit_card' ? `mi tarjeta ${institution}` : '',
      institution && type === 'credit_card' ? `la tarjeta ${institution}` : '',
      institution && type === 'credit_card' ? `la ${institution}` : ''
    ].map((alias) => normalize(alias)).filter(Boolean);
    const aliases = Array.from(new Set([
      ...(account.aliases ?? []).map((alias) => normalize(alias)),
      normalizedName,
      normalizeAccountReference(account.name),
      normalizedCompactName,
      normalizeAccountReference(normalizedCompactName),
      ...naturalAliases,
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
    : normalizedText.match(/(con|desde|a la|al|hacia)\s+([a-z0-9\s]+?)(?=\s+(?:desde|con|en|a la|al|hacia)\b|$)/);
  const preposition = withMatch?.[1]?.trim() ?? '';
  const raw = withMatch?.[2]?.trim();
  if (!raw) return null;

  const cleaned = raw.replace(/\b(en|de|del|la|el)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedCleaned = normalizeStrongDebitReference(cleaned);
  const expectedKind =
    hasStrongDebitMarker(cleaned) ? 'operational'
      : /(tarjeta|tdc|prestamo|hipoteca)/.test(cleaned) ? 'debt'
        : /(banco|efectivo|debito|tdd)/.test(cleaned) ? 'operational'
        : /(ahorro|fondo|meta)/.test(cleaned) ? 'savings'
          : null;
  const isGeneric = /^(tarjeta|tarjeta de credito|tarjeta credito|tdc|banco|efectivo|debito|tdd|ahorro|fondo|meta)$/.test(cleaned);

  return {
    raw: cleaned,
    normalized: normalizedCleaned,
    expectedKind,
    isGeneric,
    role: ['a la', 'al', 'en', 'hacia'].includes(preposition) ? 'destination' : 'source'
  };
}

function resolveExplicitReference(
  reference: ExplicitAccountReference | null,
  accounts: EnrichedAccount[]
): { account: EnrichedAccount | null; confidence: number; unresolvedMessage: string | null } {
  if (!reference) return { account: null, confidence: 0, unresolvedMessage: null };
  const normalizedReference = normalizeStrongDebitReference(stripReferenceNoise(reference.normalized));

  const expectedKind = hasStrongDebitMarker(reference.normalized) ? 'operational' : reference.expectedKind;
  if (!accounts.length) return { account: null, confidence: 0, unresolvedMessage: null };
  if (reference.isGeneric) {
    if (reference.expectedKind) {
      const genericPool = expectedKind
        ? accounts.filter((account) => isExpectedKindCompatible(account, expectedKind))
        : accounts;
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

  const ranked = accounts
    .map((account) => {
      if (reference.normalized === account.normalized_name) return { account, score: 1 };
      if (normalizedReference === account.normalized_name) return { account, score: 0.99 };
      if (reference.normalized === normalizeAccountLabel(account.name) || normalizedReference === normalizeAccountLabel(account.name)) return { account, score: 0.97 };
      if (account.aliases.includes(reference.normalized) || account.aliases.includes(normalizedReference)) return { account, score: 0.96 };
      const tokens = normalizedReference.split(' ').filter((token) => token.length > 2);
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
      if (isExpectedKindCompatible(account, expectedKind)) {
        score += 0.03;
      }
      return { account, score: Math.min(score, 1) };
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

function hasIncomeReceiveLanguage(normalizedText: string) {
  return /\b(recibi|recibo|me depositaron|depositaron|deposito recibido)\b/.test(normalizedText);
}

function isBusinessIncomeAccount(account: EnrichedAccount | null | undefined) {
  if (!account || account.type !== 'operational_cash') return false;
  return /\b(primeiptv|iptv|negocio|business|empresa|ventas|caja)\b/.test(account.normalized_name);
}

function mapAiMissingFieldKindsToDeterministic(input: string[]) {
  const allowed = new Set<z.infer<typeof missingFieldKindSchema>>([
    'missingSourceAccount',
    'missingDestinationAccount',
    'missingDescription',
    'missingIntent',
    'missingWhatWasPaid'
  ]);
  return input.filter((item): item is z.infer<typeof missingFieldKindSchema> => allowed.has(item as z.infer<typeof missingFieldKindSchema>));
}

function pruneResolvedMissingKinds(
  draft: TransactionIntent,
  aiMissingKinds: z.infer<typeof missingFieldKindSchema>[]
) {
  return aiMissingKinds.filter((kind) => {
    if (kind === 'missingSourceAccount') return !draft.sourceAccountId;
    if (kind === 'missingDestinationAccount' || kind === 'missingDebtTarget') return !draft.destinationAccountId;
    return true;
  });
}

function resolveAccountFromAiHint(
  hint: string | null | undefined,
  role: 'source' | 'destination',
  intent: z.infer<typeof financialIntentSchema>,
  accounts: EnrichedAccount[]
) {
  if (!hint) return null;
  const normalizedHint = normalize(hint);
  const normalizedHintReference = normalizeAccountReference(hint);
  const genericHintRegex = /^(tarjeta|tarjeta de credito|tarjeta credito|tdc|banco|efectivo|debito|tdd|ahorro|fondo|meta)$/
  if (intent === 'expense_debt_account' && role === 'source') {
    const creditCards = accounts.filter((account) => account.type === 'credit_card');
    const exactByName = creditCards.filter((account) => account.name.trim().toLowerCase() === hint.trim().toLowerCase());
    const exactByNormalized = creditCards.filter((account) => account.normalized_name === normalizedHint);
    const exactByAlias = creditCards.filter((account) => account.aliases.includes(normalizedHint));
    const exact = exactByName.length ? exactByName : exactByNormalized.length ? exactByNormalized : exactByAlias;
    if (process.env.NODE_ENV === 'development') {
      console.info('[AIHintResolver]', {
        sourceAccountHint: hint,
        candidateNames: creditCards.map((account) => account.name),
        matchedAccountName: exact.length === 1 ? exact[0].name : null,
        matchedAccountType: exact.length === 1 ? exact[0].type : null
      });
    }
    if (exact.length === 1) {
      return { account: exact[0], confidence: 0.98, unresolvedMessage: null };
    }
  }
  const expectedKindByHint: ExplicitAccountReference['expectedKind'] = hasStrongDebitMarker(normalizedHintReference)
    ? 'operational'
    : hintImpliesSavings(normalizedHintReference)
      ? 'savings'
      : /(tarjeta|tdc|prestamo|hipoteca|credito)/.test(normalizedHintReference)
        ? 'debt'
        : /(banco|efectivo|debito|tdd)/.test(normalizedHintReference)
          ? 'operational'
          : null;
  const expectedKind: ExplicitAccountReference['expectedKind'] =
    intent === 'debt_payment' && role === 'destination' ? 'debt'
      : intent === 'expense_debt_account' && role === 'source' ? 'debt'
        : intent === 'expense_cash_like' && role === 'source' ? 'operational'
          : intent === 'income' && role === 'destination'
            ? (expectedKindByHint === 'savings' ? 'savings' : 'operational')
            : intent === 'transfer_between_own_accounts' || intent === 'savings_contribution' || intent === 'savings_withdrawal'
              ? expectedKindByHint
              : expectedKindByHint;

  let usedHeuristicFallback = false;
  const resolved = resolveExplicitReference({
    raw: hint,
    normalized: normalizedHintReference,
    expectedKind,
    isGeneric: genericHintRegex.test(normalizedHintReference),
    role
  }, accounts);
  let finalResolution = resolved;
  if (!resolved.account && expectedKindByHint) {
    const fallbackByKind = findAccountByHint(normalizedHintReference, accounts, expectedKindByHint === 'debt' ? 'debt' : expectedKindByHint === 'operational' ? 'operational' : 'savings');
    if (fallbackByKind) {
      finalResolution = { account: fallbackByKind, confidence: Math.max(resolved.confidence, 0.72), unresolvedMessage: null };
      usedHeuristicFallback = true;
    }
  }
  const typeValidationPassed = finalResolution.account
    ? isAccountTypeCompatibleWithIntent(finalResolution.account, role, intent)
    : null;
  if (process.env.NODE_ENV === 'development') {
    const filteredCandidates = accounts;
    console.info('[AIHintResolver]', {
      intent,
      role,
      sourceHint: hint,
      normalizedHint,
      normalizedHintReference,
      expectedKind,
      candidateNames: filteredCandidates.map((account) => account.name),
      matchedAccountName: finalResolution.account?.name ?? null,
      matchedAccountStoredType: finalResolution.account?.type ?? null,
      typeValidationPassed,
      usedHeuristicFallback,
      unresolvedReason: finalResolution.unresolvedMessage ?? (finalResolution.account ? null : 'no_catalog_match')
    });
  }
  if (finalResolution.account && typeValidationPassed === false) {
    return {
      account: null,
      confidence: finalResolution.confidence,
      unresolvedMessage: `Encontré la cuenta "${finalResolution.account.name}", pero no es compatible para este movimiento. ¿Quieres elegir otra cuenta?`
    };
  }
  return finalResolution;
}

function inferIntent(normalizedText: string, matched: EnrichedAccount[]): z.infer<typeof financialIntentSchema> {
  if (/(me pago|pago recibido|me deposito)/.test(normalizedText)) return 'receivable_payment';
  if (/(preste|prestamo a|le di prestado)/.test(normalizedText)) return 'receivable_created';
  if (/(transferi|traspase|transferencia|movi .* entre cuentas)/.test(normalizedText)) return 'transfer_between_own_accounts';
  if (/(ingreso|recibi|recibida|nomina|sueldo|depositaron|bono|tiempo extra)/.test(normalizedText)) return 'income';
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
    return isCreditCardCompatibleDebtInstrument(source) ? 'expense_debt_account' : 'expense_cash_like';
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
  if (
    draft.intent === 'expense_debt_account'
    && !isCreditCardCompatibleDebtInstrument({
      type: draft.sourceAccountType ?? 'operational_cash',
      subtype: null,
      name: draft.sourceAccountName ?? ''
    })
  ) {
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
  if (
    draft.intent === 'expense_debt_account'
    && (
      !isCreditCardCompatibleDebtInstrument({
        type: draft.sourceAccountType ?? 'operational_cash',
        subtype: null,
        name: draft.sourceAccountName ?? ''
      })
      || !draft.sourceAccountId
    )
    && !missingKinds.includes('missingSourceAccount')
  ) {
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
    if (intent === 'transfer_between_own_accounts') {
      return { nextPrompt: '¿A qué cuenta moviste el dinero?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['operational_cash', 'savings_fund', 'investment'] as const };
    }
    if (intent === 'savings_contribution' || intent === 'savings_withdrawal') {
      return { nextPrompt: '¿A qué cuenta de ahorro entró el dinero?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['savings_fund'] as const };
    }
    return { nextPrompt: '¿A qué cuenta entró el dinero?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['operational_cash', 'savings_fund', 'investment', 'receivable'] as const };
  }
  if (first === 'missingSourceAccount' && intent === 'expense_debt_account' && /(tarjeta|tdc|credito|prestamo|hipoteca)/.test(normalizedText ?? '')) {
    return { nextPrompt: '¿Con qué tarjeta de crédito pagaste?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['credit_card', 'loan'] as const };
  }
  if (first === 'missingSourceAccount' && intent === 'debt_transfer' && normalizedText?.includes('de ')) {
    return { nextPrompt: '¿Con qué cuenta pagaste esa deuda?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['credit_card', 'loan', 'operational_cash'] as const };
  }
  if (first === 'missingSourceAccount' && intent === 'transfer_between_own_accounts') {
    return { nextPrompt: '¿De qué cuenta propia salió el dinero?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['operational_cash', 'savings_fund', 'investment'] as const };
  }
  if (first === 'missingSourceAccount' && (intent === 'savings_contribution' || intent === 'savings_withdrawal')) {
    return { nextPrompt: '¿Desde qué cuenta salió el dinero para el ahorro?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['operational_cash', 'savings_fund', 'investment'] as const };
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


type BatchCandidate = {
  rawText: string;
  textForInterpretation: string;
  context: string | null;
};

function stripListMarker(input: string) {
  return input
    .replace(/^\s*(?:[-*•]+|\d+[.)-])\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAmount(input: string) {
  return /\d+(?:[,.]\d+)?/.test(input);
}

function looksLikeContextHeader(input: string) {
  const trimmed = input.trim();
  return trimmed.endsWith(':') && !hasAmount(trimmed);
}

function prependPreviousActionWhenNeeded(segment: string, previousAction: string | null) {
  if (!previousAction) return segment;
  const normalizedSegment = normalize(segment);
  if (/\b(gaste|compre|pague|recibi|ingreso|transferi|traspase|preste|le di)\b/.test(normalizedSegment)) return segment;
  return `${previousAction} ${segment}`;
}

function detectLeadingAction(input: string) {
  const normalizedInput = normalize(input);
  if (/\b(recibi|recibida|ingreso|depositaron)\b/.test(normalizedInput)) return 'Recibí';
  if (/\b(transferi|traspase|movi)\b/.test(normalizedInput)) return 'Transferí';
  if (/\b(preste|le di prestado)\b/.test(normalizedInput)) return 'Presté';
  if (/\b(pague)\b/.test(normalizedInput)) return 'Pagué';
  if (/\b(gaste|compre|consumi)\b/.test(normalizedInput)) return 'Gasté';
  return null;
}

function splitInlineMovements(input: string) {
  const normalizedInput = input.trim();
  if (!normalizedInput) return [] as string[];
  const sentenceParts = normalizedInput
    .split(/(?<=[.!?])\s+(?=(?:[-*•]+|\d+[.)-]\s*)?(?:hoy\s+|ayer\s+)?(?:gaste|gasté|compre|compré|pague|pagué|recibi|recibí|transferi|transferí|preste|presté|le\s+di|\d))/i)
    .map(stripListMarker)
    .filter(Boolean);

  const parts = sentenceParts.flatMap((part) => {
    const commaParts = part
      .split(/\s*(?:,|;|\sy\s+)\s*(?=(?:hoy\s+|ayer\s+)?(?:gaste|gasté|compre|compré|pague|pagué|recibi|recibí|transferi|transferí|preste|presté|le\s+di|\d))/i)
      .map(stripListMarker)
      .filter(Boolean);
    if (commaParts.length <= 1) return [part];

    let previousAction = detectLeadingAction(commaParts[0]);
    return commaParts.map((segment, index) => {
      if (index > 0) {
        const action = detectLeadingAction(segment);
        if (action) previousAction = action;
        return prependPreviousActionWhenNeeded(segment, previousAction);
      }
      return segment;
    });
  });

  return parts.filter((part) => hasAmount(part));
}

export function splitBatchTransactionText(text: string): BatchCandidate[] {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();
  if (!normalizedText) return [];

  const candidates: BatchCandidate[] = [];
  let context: string | null = null;
  const lines = normalizedText.split('\n').map((line) => line.trim()).filter(Boolean);
  const sourceLines = lines.length > 1 ? lines : [normalizedText];

  for (const sourceLine of sourceLines) {
    const cleanLine = stripListMarker(sourceLine);
    if (!cleanLine) continue;
    if (looksLikeContextHeader(cleanLine)) {
      context = cleanLine.replace(/:$/, '').trim();
      continue;
    }

    for (const rawPart of splitInlineMovements(cleanLine)) {
      const rawText = stripListMarker(rawPart);
      if (!rawText) continue;
      candidates.push({
        rawText,
        textForInterpretation: context ? `${context}: ${rawText}` : rawText,
        context
      });
    }
  }

  return candidates;
}

export async function interpretTransactions(text: string, accounts: InterpreterAccountContext[] = []): Promise<BatchTransactionInterpretation> {
  const candidates = splitBatchTransactionText(text);
  const fallbackCandidates = candidates.length ? candidates : [{ rawText: text.trim(), textForInterpretation: text.trim(), context: null }];
  const items = await Promise.all(fallbackCandidates.map(async (candidate) => {
    const interpreted = await interpretTransaction(candidate.textForInterpretation, accounts);
    return transactionIntentSchema.parse({
      ...interpreted,
      rawText: candidate.rawText,
      normalizedText: normalize(candidate.rawText),
      description: candidate.context && interpreted.description
        ? `${candidate.context} - ${candidate.rawText}`
        : interpreted.description
    });
  }));
  const missingFields = items.flatMap((item, index) => item.missingFieldKinds.map((field) => `${index + 1}:${field}`));

  return batchTransactionInterpretationSchema.parse({
    mode: items.length > 1 ? 'batch' : 'single',
    items,
    missingFields,
    needsConfirmation: true
  });
}

export async function interpretTransaction(text: string, accounts: InterpreterAccountContext[] = []): Promise<TransactionIntent> {
  const modelAccounts = enrichAccounts(accounts);
  const normalizedText = normalize(text);
  const fallbackAmount = parseAmount(text);
  const msiMonths = extractMsiMonths(normalizedText);
  const isMsiPurchase = Boolean(msiMonths && isMsiPurchaseText(normalizedText));
  const matched = matchAccounts(text, modelAccounts);

  let aiProposal: Awaited<ReturnType<typeof semanticInstructionUnderstanding>> = null;
  try {
    aiProposal = await semanticInstructionUnderstanding({ text });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[semantic-instruction-ai] fallback to deterministic parser', error);
    }
    aiProposal = null;
  }
  const shouldFallbackToDeterministic = !aiProposal || aiProposal.confidence === 'low';
  let intent = shouldFallbackToDeterministic
    ? inferIntent(normalizedText, matched)
    : aiProposal!.intent;
  if (isMsiPurchase) intent = 'expense_debt_account';
  const totalAmount = (!shouldFallbackToDeterministic && aiProposal?.amount && Number.isFinite(aiProposal.amount))
    ? aiProposal.amount
    : fallbackAmount;
  const monthlyAmount = isMsiPurchase && msiMonths ? roundMoney(totalAmount / msiMonths) : null;
  const amount = monthlyAmount ?? totalAmount;

  const aiMetadata: AiInterpretationMetadata = {
    interpretationSource: shouldFallbackToDeterministic ? 'fallback' : 'ai',
    aiIntent: aiProposal?.intent ?? null,
    aiCategory: aiProposal?.category ?? null,
    aiConfidence: aiProposal?.confidence ?? null,
    validationCorrections: []
  };
  if (process.env.NODE_ENV === 'development') {
    console.info('[InstructionUnderstanding]', {
      interpretationSource: aiMetadata.interpretationSource,
      aiIntent: aiMetadata.aiIntent,
      aiCategory: aiMetadata.aiCategory,
      aiConfidence: aiMetadata.aiConfidence
    });
  }

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

  const aiSourceResolution = shouldFallbackToDeterministic ? null : resolveAccountFromAiHint(aiProposal?.sourceAccountHint, 'source', intent, modelAccounts);
  const aiDestinationResolution = shouldFallbackToDeterministic ? null : resolveAccountFromAiHint(aiProposal?.destinationAccountHint, 'destination', intent, modelAccounts);

  let source: EnrichedAccount | null = aiSourceResolution?.account ?? matched[0] ?? null;
  let destination: EnrichedAccount | null = aiDestinationResolution?.account ?? matched[1] ?? (intent === 'income' ? matched[0] ?? null : null);

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
  const shouldReclassifyReceivableAsIncome =
    intent === 'receivable_payment'
    && !receivableRoles.receivableSource
    && hasIncomeReceiveLanguage(normalizedText)
    && isBusinessIncomeAccount(destination);
  if (shouldReclassifyReceivableAsIncome) {
    if (process.env.NODE_ENV === 'development') {
      console.info('[ReceivableReclassify]', {
        reason: 'no receivable source + income language + business destination',
        originalIntent: 'receivable_payment',
        destinationAccountName: destination?.name ?? null
      });
    }
    intent = 'income';
    source = null;
  }
  if (intent === 'receivable_payment' && source?.id && destination?.id && source.id === destination.id) {
    if (isBusinessIncomeAccount(destination) && hasIncomeReceiveLanguage(normalizedText)) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[ReceivableReclassify]', {
          reason: 'source/destination collapsed to same account with income-like language',
          originalIntent: 'receivable_payment',
          destinationAccountName: destination.name
        });
      }
      intent = 'income';
      source = null;
    } else {
      source = null;
    }
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
  let compatibilityUnresolvedMessage: string | null = null;
  if (source && !isAccountTypeCompatibleWithIntent(source, 'source', intent)) {
    compatibilityUnresolvedMessage = `Encontré la cuenta "${source.name}", pero no es compatible para este movimiento. ¿Quieres elegir otra cuenta?`;
    source = null;
  }
  if (destination && !isAccountTypeCompatibleWithIntent(destination, 'destination', intent)) {
    compatibilityUnresolvedMessage = `Encontré la cuenta "${destination.name}", pero no es compatible para este movimiento. ¿Quieres elegir otra cuenta?`;
    destination = null;
  }
  const finalIntent = inferFinalIntent(intent, source?.type, destination?.type, normalizedText);
  const hasAcceptedAiCategory = !shouldFallbackToDeterministic
    && aiProposal?.confidence !== 'low'
    && isApprovedCategory(aiProposal?.category)
    && isCategoryCompatibleWithIntent(finalIntent, aiProposal?.category);
  const category = hasAcceptedAiCategory
    ? aiProposal!.category
    : await semanticCategoryInferenceWithAI({ text, normalizedText, intent: finalIntent });
  if (process.env.NODE_ENV === 'development') {
    console.info('[CategoryValidation]', {
      intent: finalIntent,
      aiCategory: aiProposal?.category ?? null,
      finalCategory: category,
      acceptedAiCategory: hasAcceptedAiCategory,
      fallbackTriggered: !hasAcceptedAiCategory
    });
  }

  const draftForConstraints: TransactionIntent = transactionIntentSchema.parse({
    rawText: text,
    normalizedText,
    intent: finalIntent,
    visibleType: visibleTypeMap[finalIntent],
    action: isMsiPurchase ? 'msi_purchase' : intentToLegacyAction(finalIntent),
    amount,
    totalAmount: isMsiPurchase ? totalAmount : null,
    months: isMsiPurchase ? msiMonths : null,
    monthlyAmount: isMsiPurchase ? amount : null,
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
    missingFieldKinds: [],
    ...aiMetadata
  });
  applyIntentAccountConstraints(draftForConstraints);
  const unresolvedMessage = explicitResolution.unresolvedMessage ?? compatibilityUnresolvedMessage;
  const deterministicMissingKinds = recomputeMissingKinds(draftForConstraints, unresolvedMessage);
  const aiMissingKinds = shouldFallbackToDeterministic
    ? []
    : pruneResolvedMissingKinds(draftForConstraints, mapAiMissingFieldKindsToDeterministic(aiProposal?.missingFields ?? []));
  const missingKinds = Array.from(new Set([...aiMissingKinds, ...deterministicMissingKinds]));
  if (process.env.NODE_ENV === 'development') {
    console.info('[AIAccountDebug]', {
      text,
      aiIntent: aiProposal?.intent ?? null,
      sourceAccountHint: aiProposal?.sourceAccountHint ?? null,
      destinationAccountHint: aiProposal?.destinationAccountHint ?? null,
      resolvedSourceAccount: draftForConstraints.sourceAccountName ?? null,
      finalMissingFields: missingKinds
    });
  }

  const prompt = choosePrompt(missingKinds, finalIntent, normalizedText);
  const confidence = Math.max(0.4, missingKinds.length === 0 ? 0.94 : 0.62, explicitResolution.confidence);
  const visibleType = visibleTypeMap[finalIntent];
  const humanConfirmation = missingKinds.length
    ? null
    : isMsiPurchase
      ? `Registrar compra MSI de ${formatCurrencyMXN(totalAmount)} en ${msiMonths} pagos de ${formatCurrencyMXN(amount)} con ${draftForConstraints.sourceAccountName ?? 'N/A'}.`
      : finalIntent === 'income'
      ? `Registrar ingreso de ${formatCurrencyMXN(amount)} hacia ${draftForConstraints.destinationAccountName ?? 'N/A'}.`
      : `Registrar ${visibleType.toLowerCase()} de ${formatCurrencyMXN(amount)}${draftForConstraints.sourceAccountName ? ` desde ${draftForConstraints.sourceAccountName}` : ''}${draftForConstraints.destinationAccountName ? ` hacia ${draftForConstraints.destinationAccountName}` : ''}.`;

  const parsedResult = transactionIntentSchema.parse({
    rawText: text,
    normalizedText,
    intent: finalIntent,
    visibleType,
    action: isMsiPurchase ? 'msi_purchase' : intentToLegacyAction(finalIntent),
    amount,
    totalAmount: isMsiPurchase ? totalAmount : null,
    months: isMsiPurchase ? msiMonths : null,
    monthlyAmount: isMsiPurchase ? amount : null,
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
    nextPrompt: unresolvedMessage ?? prompt.nextPrompt,
    nextPromptInputType: prompt.nextPromptInputType,
    nextPromptAllowedAccountTypes: prompt.nextPromptAllowedAccountTypes,
    confidence,
    humanConfirmation,
    ...aiMetadata
  });
  const consistencyInput = { ...parsedResult };
  const consistentResult = enforceFinancialConsistency(consistencyInput);
  if (consistentResult.sourceAccountId !== parsedResult.sourceAccountId) aiMetadata.validationCorrections.push('sourceAccountAdjusted');
  if (consistentResult.destinationAccountId !== parsedResult.destinationAccountId) aiMetadata.validationCorrections.push('destinationAccountAdjusted');
  if (consistentResult.intent !== parsedResult.intent) aiMetadata.validationCorrections.push('intentAdjusted');
  return {
    ...consistentResult,
    validationCorrections: aiMetadata.validationCorrections
  };
}

function findAccountByName(accounts: EnrichedAccount[], value: string) {
  const normalized = normalize(value);
  return accounts.find((account) => account.normalized_name === normalized || account.aliases.includes(normalized));
}

export async function applyFollowUpAnswer(
  current: TransactionIntent,
  answer: string,
  accounts: InterpreterAccountContext[] = []
): Promise<TransactionIntent> {
  const updated = { ...current };
  const modelAccounts = enrichAccounts(accounts);
  const matchedAccount = findAccountByName(modelAccounts, answer);
  const kind = matchedAccount
    && ['expense_cash_like', 'expense_debt_account'].includes(updated.intent)
    && updated.missingFieldKinds.includes('missingSourceAccount')
    ? 'missingSourceAccount'
    : updated.missingFieldKinds[0];
  const isAmbiguityClarification = (current.nextPrompt ?? '').startsWith('¿Te refieres a ');
  let resolvedSourceBySelection = false;

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
      resolvedSourceBySelection = true;
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

  if (updated.intent === 'expense_cash_like' && isCreditCardCompatibleDebtInstrument({
    type: updated.sourceAccountType ?? 'operational_cash',
    subtype: matchedAccount?.subtype ?? null,
    name: updated.sourceAccountName ?? ''
  })) {
    updated.intent = 'expense_debt_account';
    updated.visibleType = visibleTypeMap.expense_debt_account;
    updated.action = intentToLegacyAction(updated.intent);
  }
  if (
    resolvedSourceBySelection
    && isAmbiguityClarification
    && updated.intent === 'expense_debt_account'
    && !isCreditCardCompatibleDebtInstrument({
      type: updated.sourceAccountType ?? 'operational_cash',
      subtype: matchedAccount?.subtype ?? null,
      name: updated.sourceAccountName ?? ''
    })
  ) {
    updated.intent = 'expense_cash_like';
    updated.visibleType = visibleTypeMap.expense_cash_like;
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
  updated.category = localCategoryInference(updated.intent, updated.normalizedText);

  if ((kind === 'missingDescription' || kind === 'missingWhatWasPaid') && answer.trim()) {
    updated.description = answer.trim();
    updated.category = localCategoryInference(updated.intent, normalize(answer));
  }

  if (kind === 'missingSourceAccount' && !matchedAccount && answer.trim()) {
    updated.description = answer.trim();
    updated.category = localCategoryInference(updated.intent, normalize(answer));
  }

  const shouldReinterpretExpense =
    ['expense_cash_like', 'expense_debt_account'].includes(updated.intent)
    && (
      ((kind === 'missingDescription' || kind === 'missingWhatWasPaid') && answer.trim().length > 0)
      || (kind === 'missingSourceAccount'
        && !matchedAccount
        && /^(en|de|del|para)\b/i.test(answer.trim()))
      || (kind === 'missingSourceAccount'
        && matchedAccount?.type === 'credit_card'
        && (
          Boolean(updated.description?.trim() && updated.description !== updated.rawText)
          || /\bcon\s+(?:tarjeta(?:\s+de\s+(?:credito|crédito))?|tdc|credito|crédito)\b/i.test(updated.rawText)
          || /\ben\s+[a-z0-9]/i.test(updated.rawText)
        )
      )
    );

  if (shouldReinterpretExpense) {
    const sourceName = updated.sourceAccountName ?? matchedAccount?.name ?? null;
    const hasMeaningfulDescription = Boolean(updated.description?.trim() && updated.description !== updated.rawText);
    const rebuiltText = (() => {
      if (kind === 'missingSourceAccount' && sourceName && hasMeaningfulDescription) {
        const normalizedConcept = /^(en|de|del|para)\b/i.test(updated.description!.trim()) ? updated.description!.trim() : `en ${updated.description!.trim()}`;
        return `Gasté ${updated.amount} ${normalizedConcept} con ${sourceName}`.replace(/\s+/g, ' ').trim();
      }
      if (kind === 'missingSourceAccount' && sourceName) {
        return updated.rawText.replace(/\bcon\s+(?:tarjeta(?:\s+de\s+(?:credito|crédito))?|tdc|credito|crédito)\b(?:\s+\w+)?/i, `con ${sourceName}`);
      }
      const concept = (kind === 'missingDescription' || kind === 'missingWhatWasPaid')
        ? answer.trim()
        : (updated.description?.trim() || answer.trim());
      const normalizedConcept = /^(en|de|del|para)\b/i.test(concept) ? concept : `en ${concept}`;
      const genericSourceFragment = /\bcon\s+(?:tarjeta(?:\s+de\s+(?:credito|crédito))?|tdc|credito|crédito)\b/i.test(updated.rawText)
        ? ' con tarjeta de crédito'
        : '';
      return `Gasté ${updated.amount} ${normalizedConcept}${sourceName ? ` con ${sourceName}` : genericSourceFragment}`.replace(/\s+/g, ' ').trim();
    })();
    const reinterpreted = await interpretTransaction(rebuiltText, accounts);
    if (process.env.NODE_ENV === 'development') {
      console.info('[FollowUpSecondPassDebug]', {
        originalText: current.rawText,
        followUpAnswer: answer,
        rebuiltText,
        secondPassStarted: true,
        secondPassInterpretationSource: reinterpreted.interpretationSource ?? null,
        secondPassAiIntent: reinterpreted.aiIntent ?? null,
        secondPassAiCategory: reinterpreted.aiCategory ?? null,
        secondPassAiConfidence: reinterpreted.aiConfidence ?? null,
        finalCategoryUsed: reinterpreted.category ?? null,
        finalDescriptionUsed: reinterpreted.description ?? null,
        finalSourceAccount: reinterpreted.sourceAccountName ?? null,
        finalMissingFields: reinterpreted.missingFieldKinds ?? []
      });
    }
    return reinterpreted;
  }

  const final = { ...updated };
  applyIntentAccountConstraints(final);
  final.missingFieldKinds = recomputeMissingKinds(final);
  final.missingFields = final.missingFieldKinds.map((item) => item.replace('missing', '').replace('Target', 'Account').replace(/^./, (c) => c.toLowerCase()));
  const prompt = choosePrompt(final.missingFieldKinds, final.intent, final.normalizedText);
  final.nextPrompt = prompt.nextPrompt;
  final.nextPromptInputType = prompt.nextPromptInputType;
  final.nextPromptAllowedAccountTypes = prompt.nextPromptAllowedAccountTypes ? [...prompt.nextPromptAllowedAccountTypes] : null;
  final.humanConfirmation = final.missingFieldKinds.length
    ? null
    : final.intent === 'income'
      ? `Registrar ingreso de ${formatCurrencyMXN(final.amount)} hacia ${final.destinationAccountName ?? 'N/A'}.`
      : `Registrar ${final.visibleType.toLowerCase()} de ${formatCurrencyMXN(final.amount)}${final.sourceAccountName ? ` desde ${final.sourceAccountName}` : ''}${final.destinationAccountName ? ` hacia ${final.destinationAccountName}` : ''}.`;

  const parsedResult = transactionIntentSchema.parse(final);
  return enforceFinancialConsistency(parsedResult);
}
