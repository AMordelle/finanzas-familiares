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

export async function semanticCategoryInferenceWithAI(input: {
  text: string;
  normalizedText: string;
  intent: FinancialIntent;
}) {
  if (input.intent === 'debt_payment') return 'pago_deuda';
  if (input.intent === 'debt_transfer') return 'traslado_deuda';
  if (input.intent === 'receivable_created') return 'prestamo_otorgado';
  if (input.intent === 'receivable_payment') return 'pago_recibido';
  if (input.intent === 'transfer_between_own_accounts') return 'transferencia';
  if (input.intent === 'savings_contribution' || input.intent === 'savings_withdrawal') return 'ahorro';

  const localCategory = localCategoryInference(input.intent, input.normalizedText);
  let aiResult: Awaited<ReturnType<typeof inferSemanticCategoryWithOpenAI>> = null;
  try {
    aiResult = await inferSemanticCategoryWithOpenAI({
      text: input.text,
      normalizedText: input.normalizedText,
      intent: input.intent,
      allowedCategories: allowedCategoriesForIntent(input.intent)
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[semantic-category-ai] fallback to local classifier', error);
    }
  }

  if (aiResult && isApprovedCategory(aiResult.category) && HIGH_CONFIDENCE.has(aiResult.confidence)) {
    return aiResult.category;
  }

  if (isApprovedCategory(localCategory)) return localCategory;
  return 'otros_gastos';
}
