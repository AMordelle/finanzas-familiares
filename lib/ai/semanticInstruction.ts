import { z } from 'zod';
import OpenAI from 'openai';
import { APPROVED_CATEGORY_CATALOG } from '@/lib/ai/semanticCategory';

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 4500;

const approvedIntentSchema = z.enum([
  'income',
  'expense_cash_like',
  'expense_debt_account',
  'debt_payment',
  'debt_transfer',
  'transfer_between_own_accounts',
  'receivable_created',
  'receivable_payment'
]);

const missingFieldSchema = z.enum([
  'missingAmount',
  'missingSourceAccount',
  'missingDestinationAccount',
  'missingDescription',
  'missingIntent',
  'missingWhatWasPaid'
]);

const approvedCategorySchema = z.enum(APPROVED_CATEGORY_CATALOG);

export const semanticInstructionProposalSchema = z.object({
  intent: approvedIntentSchema,
  visibleType: z.string().min(1).nullable().optional().default(null),
  amount: z.number().positive().nullable(),
  sourceAccountHint: z.string().min(1).nullable(),
  destinationAccountHint: z.string().min(1).nullable(),
  category: approvedCategorySchema.nullable(),
  missingFields: z.array(missingFieldSchema),
  confidence: z.enum(['high', 'medium', 'low']),
  reason: z.string().min(1).nullable()
});

export type SemanticInstructionProposal = z.infer<typeof semanticInstructionProposalSchema>;

export const semanticInstructionSystemPrompt = [
  'Eres un analizador semántico financiero.',
  'Tu salida es SOLO una propuesta; no ejecutas ni validas movimientos.',
  'Usa únicamente intents y categorías permitidos.',
  'Si hay ambigüedad, marca missingFields y baja confidence.',
  'Regla crítica para gastos: interpreta por tipo de instrumento financiero, no por marca del banco.',
  'No asumas crédito solo por nombres como BBVA, Santander, HSBC, Scotiabank u otras marcas.',
  'Si el texto indica tdc, tarjeta de crédito, credito o credit card, prefiere intent=expense_debt_account.',
  'Si el texto indica tdd, tarjeta de débito, debito, debit card, cuenta bancaria, cuenta de débito o bank account, prefiere intent=expense_cash_like.',
  'Si solo dice tarjeta o con mi tarjeta sin marcador de crédito/débito, conserva la ambigüedad o fallback existente.',
  'Cuando detectes cuenta origen/destino, conserva sourceAccountHint/destinationAccountHint exactamente como aparece en el texto.',
  'Ejemplo input: "Gaste 200 en autolavado con TDD BBVA" output: intent=expense_cash_like, sourceAccountHint="TDD BBVA", category=transporte.',
  'Ejemplo input: "Gaste 150 en Canva con TDC BBVA" output: intent=expense_debt_account, sourceAccountHint="TDC BBVA", category=servicios.',
  'Ejemplo input: "Pague 300 de gasolina con tarjeta de débito Santander" output: intent=expense_cash_like, sourceAccountHint="tarjeta de débito Santander", category=transporte.',
  'Ejemplo input: "Gaste 500 con tarjeta de crédito" output: intent=expense_debt_account, sourceAccountHint="tarjeta de crédito".',
  'No rompas flujos de pago de deuda, traslado de deuda, ingresos, transferencias y reconstrucción por follow-up.'
].join(' ');

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export const semanticInstructionResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: approvedIntentSchema.options },
    visibleType: { type: ['string', 'null'] },
    amount: { type: ['number', 'null'] },
    sourceAccountHint: { type: ['string', 'null'] },
    destinationAccountHint: { type: ['string', 'null'] },
    category: { type: ['string', 'null'], enum: [...APPROVED_CATEGORY_CATALOG, null] },
    missingFields: { type: 'array', items: { type: 'string', enum: missingFieldSchema.options } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: ['string', 'null'] }
  },
  required: [
    'intent',
    'visibleType',
    'amount',
    'sourceAccountHint',
    'destinationAccountHint',
    'category',
    'missingFields',
    'confidence',
    'reason'
  ]
} as const;

export async function semanticInstructionUnderstanding(input: { text: string }, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<SemanticInstructionProposal | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (client.responses.create as any)(
      {
        model: DEFAULT_OPENAI_MODEL,
        temperature: 0,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: semanticInstructionSystemPrompt
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  instruction: input.text,
                  allowedIntents: approvedIntentSchema.options,
                  allowedCategories: APPROVED_CATEGORY_CATALOG,
                  allowedMissingFields: missingFieldSchema.options
                })
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'semantic_instruction_understanding',
            schema: semanticInstructionResponseSchema,
            strict: true
          }
        }
      },
      { signal: controller.signal }
    );

    const output = response.output_text;
    if (!output) return null;
    const parsed = semanticInstructionProposalSchema.safeParse(JSON.parse(output));
    if (!parsed.success) return null;
    return parsed.data;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[semantic-instruction-ai] openai error', error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
