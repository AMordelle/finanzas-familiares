import { inferSemanticCategoryWithOpenAI } from '@/lib/ai/openai';

export const APPROVED_CATEGORY_CATALOG = [
  'comida',
  'transporte',
  'vivienda',
  'servicios',
  'salud',
  'educación',
  'entretenimiento',
  'ropa',
  'hogar',
  'regalos',
  'cuidado_personal',
  'mascotas',
  'trabajo',
  'impuestos_tramites',
  'otros_gastos',
  'ingreso_fijo',
  'ingreso_extra',
  'reembolso',
  'pago_deuda',
  'traslado_deuda',
  'ahorro',
  'prestamo_otorgado',
  'pago_recibido',
  'transferencia'
] as const;

const APPROVED_CATEGORY_SET = new Set<string>(APPROVED_CATEGORY_CATALOG);
const HIGH_CONFIDENCE = new Set(['high', 'medium']);
const SYSTEM_FORCED_INTENTS = new Set([
  'debt_payment',
  'debt_transfer',
  'receivable_created',
  'receivable_payment',
  'transfer_between_own_accounts',
  'savings_contribution',
  'savings_withdrawal'
]);

type FinancialIntent =
  | 'income'
  | 'expense_cash_like'
  | 'expense_debt_account'
  | 'debt_payment'
  | 'debt_transfer'
  | 'transfer_between_own_accounts'
  | 'savings_contribution'
  | 'savings_withdrawal'
  | 'receivable_created'
  | 'receivable_payment'
  | 'manual_adjustment';

export type CategorySource = 'ai' | 'fallback' | 'system';
export type CategoryConfidence = 'high' | 'medium' | 'low' | null;

export type SemanticCategoryInferenceResult = {
  category: string;
  categorySource: CategorySource;
  categoryConfidence: CategoryConfidence;
  categoryReason: string | null;
  categoryDebugError: string | null;
};

export function isApprovedCategory(category: string | null | undefined): category is string {
  return Boolean(category && APPROVED_CATEGORY_SET.has(category));
}

export function localCategoryInference(intent: FinancialIntent, normalizedText: string) {
  if (intent === 'income') {
    if (/(reembolso|devolucion)/.test(normalizedText)) return 'reembolso';
    if (/(nomina|sueldo|quincena|semanal|salario)/.test(normalizedText)) return 'ingreso_fijo';
    if (/(tiempo extra|bono|venta de|vendi|me pagaron por vender)/.test(normalizedText)) return 'ingreso_extra';
    return 'ingreso_extra';
  }

  if (intent === 'debt_payment') return 'pago_deuda';
  if (intent === 'debt_transfer') return 'traslado_deuda';
  if (intent === 'transfer_between_own_accounts') return 'transferencia';
  if (intent === 'savings_contribution' || intent === 'savings_withdrawal') return 'ahorro';
  if (intent === 'receivable_created') return 'prestamo_otorgado';
  if (intent === 'receivable_payment') return 'pago_recibido';

  if (/(cena|comida|restaurante|tacos|desayuno|supermercado|despensa|abarrotes|almuerzo|cafe|pizza|hamburguesa|oxxo|botana|cerveza)/.test(normalizedText)) return 'comida';
  if (/(taxi|uber|gasolina|camioneta|mensualidad.*camioneta)/.test(normalizedText)) return 'transporte';
  if (/(renta|hipoteca|predial|mantenimiento edificio|mantenimiento casa)/.test(normalizedText)) return 'vivienda';
  if (/\b(internet|wifi|telefono|recarga|luz|agua|gas)\b/.test(normalizedText)) return 'servicios';
  if (/(medico|medicina|farmacia|doctor|consulta)/.test(normalizedText)) return 'salud';
  if (/(utiles|colegiatura|escuela|cooperacion escolar|uniforme|inscripcion)/.test(normalizedText)) return 'educación';
  if (/(cine|fiesta|netflix|spotify|disney|xbox|playstation|youtube premium|prime video)/.test(normalizedText)) return 'entretenimiento';
  if (/(ropa|zapatos|calzado|tenis|playera|pantalon|camisa|blusa)/.test(normalizedText)) return 'ropa';
  if (/(barra de sonido|bocina|electrodomestico|licuadora|television|colchon)/.test(normalizedText)) return 'hogar';
  if (/(regalo|cumpleanos|aniversario)/.test(normalizedText)) return 'regalos';

  return 'otros_gastos';
}

function allowedCategoriesForIntent(intent: FinancialIntent) {
  if (intent === 'income') return ['ingreso_fijo', 'ingreso_extra', 'reembolso', 'otros_gastos'];
  return [
    'comida', 'transporte', 'vivienda', 'servicios', 'salud', 'educación', 'entretenimiento', 'ropa', 'hogar',
    'regalos', 'cuidado_personal', 'mascotas', 'trabajo', 'impuestos_tramites', 'otros_gastos'
  ];
}

function toDebugError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'unknown_error';
}

function logSemanticCategoryTrace(payload: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'development') return;
  console.debug('[SemanticCategoryAI]', payload);
}

export async function semanticCategoryInferenceWithAIDetails(input: {
  text: string;
  normalizedText: string;
  intent: FinancialIntent;
}): Promise<SemanticCategoryInferenceResult> {
  if (input.intent === 'debt_payment') {
    return {
      category: 'pago_deuda',
      categorySource: 'system',
      categoryConfidence: null,
      categoryReason: 'system override: debt_payment',
      categoryDebugError: null
    };
  }
  if (input.intent === 'debt_transfer') {
    return {
      category: 'traslado_deuda',
      categorySource: 'system',
      categoryConfidence: null,
      categoryReason: 'system override: debt_transfer',
      categoryDebugError: null
    };
  }
  if (input.intent === 'receivable_created') {
    return {
      category: 'prestamo_otorgado',
      categorySource: 'system',
      categoryConfidence: null,
      categoryReason: 'system override: receivable_created',
      categoryDebugError: null
    };
  }
  if (input.intent === 'receivable_payment') {
    return {
      category: 'pago_recibido',
      categorySource: 'system',
      categoryConfidence: null,
      categoryReason: 'system override: receivable_payment',
      categoryDebugError: null
    };
  }
  if (input.intent === 'transfer_between_own_accounts') {
    return {
      category: 'transferencia',
      categorySource: 'system',
      categoryConfidence: null,
      categoryReason: 'system override: transfer_between_own_accounts',
      categoryDebugError: null
    };
  }
  if (input.intent === 'savings_contribution' || input.intent === 'savings_withdrawal') {
    return {
      category: 'ahorro',
      categorySource: 'system',
      categoryConfidence: null,
      categoryReason: `system override: ${input.intent}`,
      categoryDebugError: null
    };
  }

  const localCategory = localCategoryInference(input.intent, input.normalizedText);
  let aiResult: Awaited<ReturnType<typeof inferSemanticCategoryWithOpenAI>> = null;
  let categoryDebugError: string | null = null;
  try {
    aiResult = await inferSemanticCategoryWithOpenAI({
      text: input.text,
      normalizedText: input.normalizedText,
      intent: input.intent,
      allowedCategories: allowedCategoriesForIntent(input.intent)
    });
  } catch (error) {
    categoryDebugError = toDebugError(error);
    logSemanticCategoryTrace({
      text: input.text,
      intent: input.intent,
      error: categoryDebugError,
      fallbackCategory: localCategory,
      categorySource: 'fallback'
    });
  }

  const aiCategoryAllowedByIntent = Boolean(aiResult?.category && allowedCategoriesForIntent(input.intent).includes(aiResult.category));
  const aiAccepted = Boolean(
    aiResult
    && isApprovedCategory(aiResult.category)
    && aiCategoryAllowedByIntent
    && HIGH_CONFIDENCE.has(aiResult.confidence)
  );

  if (aiAccepted && aiResult) {
    const result: SemanticCategoryInferenceResult = {
      category: aiResult.category,
      categorySource: 'ai',
      categoryConfidence: aiResult.confidence,
      categoryReason: aiResult.reason ?? null,
      categoryDebugError
    };
    logSemanticCategoryTrace({
      text: input.text,
      intent: input.intent,
      aiCategory: aiResult.category,
      confidence: aiResult.confidence,
      accepted: true,
      categorySource: 'ai'
    });
    return result;
  }

  const fallbackCategory = isApprovedCategory(localCategory) ? localCategory : 'otros_gastos';
  const aiReason = aiResult
    ? [
      !isApprovedCategory(aiResult.category) ? 'ai category not approved catalog' : null,
      !aiCategoryAllowedByIntent ? 'ai category not allowed for intent' : null,
      !HIGH_CONFIDENCE.has(aiResult.confidence) ? `ai confidence too low: ${aiResult.confidence}` : null
    ].filter(Boolean).join('; ')
    : null;

  const result: SemanticCategoryInferenceResult = {
    category: fallbackCategory,
    categorySource: 'fallback',
    categoryConfidence: aiResult?.confidence ?? null,
    categoryReason: aiReason,
    categoryDebugError
  };
  logSemanticCategoryTrace({
    text: input.text,
    intent: input.intent,
    aiCategory: aiResult?.category ?? null,
    confidence: aiResult?.confidence ?? null,
    accepted: false,
    fallbackCategory,
    categorySource: 'fallback',
    ...(categoryDebugError ? { error: categoryDebugError } : {})
  });
  return result;
}

export async function semanticCategoryInferenceWithAI(input: {
  text: string;
  normalizedText: string;
  intent: FinancialIntent;
}) {
  const result = await semanticCategoryInferenceWithAIDetails(input);
  if (SYSTEM_FORCED_INTENTS.has(input.intent)) {
    logSemanticCategoryTrace({
      text: input.text,
      intent: input.intent,
      forcedCategory: result.category,
      categorySource: result.categorySource
    });
  }
  return result.category;
}
