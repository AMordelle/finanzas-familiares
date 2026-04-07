import OpenAI from 'openai';

export type SemanticCategoryAIInput = {
  text: string;
  normalizedText?: string;
  intent: string;
  allowedCategories: string[];
};

export type SemanticCategoryAIResult = {
  category: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 4500;

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

const semanticCategorySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: { type: 'string' }
  },
  required: ['category', 'confidence', 'reason']
} as const;

export async function inferSemanticCategoryWithOpenAI(
  input: SemanticCategoryAIInput,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<SemanticCategoryAIResult | null> {
  const client = getOpenAIClient();
  if (!client) return null;

  const payload = {
    text: input.text,
    normalizedText: input.normalizedText ?? null,
    intent: input.intent,
    allowedCategories: input.allowedCategories,
    rule: 'Selecciona SOLO una categoría del catálogo. Usa otros_gastos únicamente cuando no exista señal semántica suficiente.'
  };

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
                text: 'Eres un clasificador semántico de categorías financieras familiares. No inventes categorías y responde en JSON válido según el esquema.'
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(payload)
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'semantic_category_classifier',
            schema: semanticCategorySchema,
            strict: true
          }
        }
      },
      {
        signal: controller.signal
      }
    );

    const rawOutput = response.output_text;
    if (!rawOutput) return null;
    return JSON.parse(rawOutput) as SemanticCategoryAIResult;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[semantic-category-ai] openai error', error);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
