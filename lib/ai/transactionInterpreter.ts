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
    const aliases = (account.aliases ?? []).map((alias) => normalize(alias)).filter(Boolean);

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
  return accounts.filter((account) => normalized.includes(account.normalized_name) || account.aliases.some((alias) => normalized.includes(alias)));
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
      const ranked = debtAccounts
        .map((account) => ({
          account,
          score: account.normalized_name.split(' ').filter((token) => token.length > 2 && normalizedText.includes(token)).length
        }))
        .sort((a, b) => b.score - a.score);
      if (!ranked.length) return null;
      if (ranked[0].score > 0 && (ranked[1]?.score ?? -1) < ranked[0].score) return ranked[0].account;
      if (debtAccounts.length === 1) return debtAccounts[0];
      return null;
    }
  }
  if (kind === 'operational' && /(efectivo|banco|debito)/.test(normalizedText)) {
    return accounts.find((account) => account.type === 'operational_cash') ?? null;
  }
  if (kind === 'savings' && /(ahorro|fondo|meta)/.test(normalizedText)) {
    return accounts.find((account) => account.type === 'savings_fund') ?? null;
  }
  return null;
}

function inferIntent(normalizedText: string, matched: EnrichedAccount[]): z.infer<typeof financialIntentSchema> {
  if (/(me pago|pago recibido|me deposito)/.test(normalizedText)) return 'receivable_payment';
  if (/(preste|prestamo a|le di prestado)/.test(normalizedText)) return 'receivable_created';
  if (/(transferi|traspase|transferencia|movi .* entre cuentas)/.test(normalizedText)) return 'transfer_between_own_accounts';
  if (/(ingreso|recibi|nomina|sueldo|depositaron|bono|tiempo extra)/.test(normalizedText)) return 'income';
  if (/(ahorro|fondo emergencia|meta)/.test(normalizedText) && /(meti|aporte|abone|deposite|movi)/.test(normalizedText)) return 'savings_contribution';
  if (/(retire|saque).*(ahorro|fondo|meta)/.test(normalizedText)) return 'savings_withdrawal';
  if (/(pague|abone|abono)/.test(normalizedText)) {
    const debtMentions = matched.filter((account) => account.is_debt);
    if (debtMentions.length >= 2) return 'debt_transfer';
    if (debtMentions.length >= 1 || /(tarjeta|tdc|prestamo|hipoteca)/.test(normalizedText)) return 'debt_payment';
    if (!/(que pagaste|pago recibido)/.test(normalizedText)) return 'manual_adjustment';
  }
  if (/(gaste|compre|pague en|consumi)/.test(normalizedText)) {
    if (/(tarjeta|tdc)/.test(normalizedText)) return 'expense_debt_account';
    const source = matched[0];
    return source?.type === 'credit_card' ? 'expense_debt_account' : 'expense_cash_like';
  }
  if (/(meti|movi|abone)/.test(normalizedText)) return 'manual_adjustment';
  return 'expense_cash_like';
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

function choosePrompt(missingKinds: z.infer<typeof missingFieldKindSchema>[]) {
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
  return { nextPrompt: '¿De qué cuenta salió el dinero?', nextPromptInputType: 'account_selector' as const, nextPromptAllowedAccountTypes: ['operational_cash', 'savings_fund', 'investment', 'credit_card', 'loan'] as const };
}

export async function interpretTransaction(text: string, accounts: InterpreterAccountContext[] = []): Promise<TransactionIntent> {
  const modelAccounts = enrichAccounts(accounts);
  const normalizedText = normalize(text);
  const amount = parseAmount(text);
  const matched = matchAccounts(text, modelAccounts);
  const intent = inferIntent(normalizedText, matched);

  const sourceFromHint = findAccountByHint(normalizedText, modelAccounts, 'operational');
  const debtFromHint = findAccountByHint(normalizedText, modelAccounts, 'debt');
  const savingsFromHint = findAccountByHint(normalizedText, modelAccounts, 'savings');

  let source = matched[0] ?? null;
  let destination = matched[1] ?? (intent === 'income' ? matched[0] ?? null : null);

  if (intent === 'expense_debt_account' && !source) source = debtFromHint;
  if (intent === 'debt_payment') {
    destination = destination ?? debtFromHint;
    source = source ?? sourceFromHint;
  }
  if (intent === 'savings_contribution') {
    destination = destination ?? savingsFromHint;
    source = source ?? sourceFromHint;
  }
  const category = inferCategory(intent, normalizedText);

  const missingKinds: z.infer<typeof missingFieldKindSchema>[] = [];
  if (intent === 'manual_adjustment') missingKinds.push('missingIntent');
  if (['expense_cash_like', 'expense_debt_account', 'debt_payment', 'debt_transfer', 'savings_contribution', 'savings_withdrawal', 'transfer_between_own_accounts', 'receivable_created'].includes(intent) && !source) {
    missingKinds.push('missingSourceAccount');
  }
  if (['income', 'transfer_between_own_accounts', 'debt_payment', 'debt_transfer', 'savings_contribution', 'savings_withdrawal', 'receivable_payment'].includes(intent) && !destination) {
    missingKinds.push(intent === 'debt_payment' || intent === 'debt_transfer' ? 'missingDebtTarget' : 'missingDestinationAccount');
  }
  if (/gaste\s+\d+\s+con\s+/.test(normalizedText) && !/(en\s+\w+)/.test(normalizedText)) {
    missingKinds.push('missingWhatWasPaid');
  }
  if (/pague\s+\d+\s*$/.test(normalizedText)) {
    missingKinds.push('missingIntent');
  }

  const prompt = choosePrompt(missingKinds);
  const confidence = missingKinds.length === 0 ? 0.94 : 0.62;
  const visibleType = visibleTypeMap[intent];
  const humanConfirmation = missingKinds.length
    ? null
    : `Registrar ${visibleType.toLowerCase()} de $${amount.toLocaleString('es-MX')}${source ? ` desde ${source.name}` : ''}${destination ? ` hacia ${destination.name}` : ''}.`;

  return transactionIntentSchema.parse({
    rawText: text,
    normalizedText,
    intent,
    visibleType,
    action: intentToLegacyAction(intent),
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
    missingFields: missingKinds.map((item) => item.replace('missing', '').replace('Target', 'Account').replace(/^./, (c) => c.toLowerCase())),
    missingFieldKinds: missingKinds,
    nextPrompt: prompt.nextPrompt,
    nextPromptInputType: prompt.nextPromptInputType,
    nextPromptAllowedAccountTypes: prompt.nextPromptAllowedAccountTypes,
    confidence,
    humanConfirmation
  });
}
