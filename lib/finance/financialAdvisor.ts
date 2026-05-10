import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/db/supabase';
import { formatCategoryLabel } from '@/lib/ai/semanticCategory';
import { getFinancialClosureAccountScope } from '@/lib/db/queries';

export type FinancialAdvisorClosure = {
  periodStart: string;
  periodEnd: string;
  openingTotal: number;
  closingTotal: number;
  netChange: number;
  incomeTotal: number;
  expenseTotal: number;
  netFlow: number;
};

export type FinancialAdvisorContext = {
  generatedAt: string;
  operationalMoney: {
    currentAmount: number;
    source: 'accounts';
    includedAccounts: string[];
    excludedAccounts: string[];
  };
  recentClosures: {
    latestWeekly: FinancialAdvisorClosure | null;
    previousWeekly: FinancialAdvisorClosure | null;
    latestMonthly: FinancialAdvisorClosure | null;
  };
  recentMovements: {
    last7DaysIncome: number;
    last7DaysExpenses: number;
    last30DaysIncome: number;
    last30DaysExpenses: number;
    topExpenseCategoriesLast30Days: Array<{ category: string; amount: number }>;
  };
  creditCards: Array<{ name: string; balance: number; type: string }>;
  pendingExtras: {
    overtimeHours: number;
    pieceworkUnits: number;
    mealsAmount: number;
  };
  notes: string[];
};

export type FinancialAdvisorAnalysis = {
  status: 'healthy' | 'stable' | 'tight' | 'risk';
  headline: string;
  summary: string;
  mainConcern: string;
  positiveSignal: string;
  topRisks: string[];
  opportunities: string[];
  recommendedAction: string;
  nextBestAction: string;
  confidence: 'low' | 'medium' | 'high';
  dataLimitations: string[];
};

type SupabaseClientLike = typeof supabaseAdmin;

type AccountRow = {
  id: string;
  household_id: string;
  name: string;
  type: string;
  balance: string | number;
  is_active?: boolean | null;
};

type ClosureRow = {
  type: string;
  period_start: string;
  period_end: string;
  opening_total: string | number;
  closing_total: string | number;
  net_change: string | number;
  income_total: string | number;
  expense_total: string | number;
  net_flow: string | number;
  created_at?: string | null;
};

type TransactionGroupRow = { id: string; household_id: string };
type TransactionRow = { group_id: string; type: string; category: string; amount: string | number; happened_at: string };
type ExtraWorkRow = { type: string; quantity: string | number; status: string };

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const DEFAULT_AI_TIMEOUT_MS = 6000;

type OpenAIResponsesClient = {
  responses: {
    create: (payload: unknown, options?: { signal?: AbortSignal }) => Promise<{ output_text?: string }>;
  };
};

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAIResponsesClient | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient as unknown as OpenAIResponsesClient;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mapClosure(row: ClosureRow): FinancialAdvisorClosure {
  return {
    periodStart: row.period_start,
    periodEnd: row.period_end,
    openingTotal: Number(row.opening_total),
    closingTotal: Number(row.closing_total),
    netChange: Number(row.net_change),
    incomeTotal: Number(row.income_total),
    expenseTotal: Number(row.expense_total),
    netFlow: Number(row.net_flow)
  };
}

function inferMovementAction(lines: Array<{ type: string; category: string }>) {
  const has = (type: string, category: string) => lines.some((line) => line.type === type && line.category === category);
  if (has('debit', 'entrada_cuenta')) return 'income';
  if (has('credit', 'salida_cuenta')) return 'expense';
  return null;
}

function userFacingCategory(lines: Array<{ category: string }>) {
  const raw = lines.find((line) => line.category && line.category !== 'entrada_cuenta' && line.category !== 'salida_cuenta' && !line.category.startsWith('sistema_'))?.category;
  return formatCategoryLabel(raw ?? 'general');
}

async function getDefaultHouseholdId(client: SupabaseClientLike) {
  const { data, error } = await client
    .from('household_members')
    .select('household_id')
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`No fue posible resolver el hogar: ${error.message}`);
  return (data?.household_id as string | undefined) ?? null;
}

export async function buildFinancialAdvisorContext(
  householdId?: string | null,
  client: SupabaseClientLike = supabaseAdmin,
  generatedAt: Date = new Date()
): Promise<FinancialAdvisorContext> {
  const resolvedHouseholdId = householdId ?? await getDefaultHouseholdId(client);
  if (!resolvedHouseholdId) {
    return {
      generatedAt: generatedAt.toISOString(),
      operationalMoney: { currentAmount: 0, source: 'accounts', includedAccounts: [], excludedAccounts: [] },
      recentClosures: { latestWeekly: null, previousWeekly: null, latestMonthly: null },
      recentMovements: { last7DaysIncome: 0, last7DaysExpenses: 0, last30DaysIncome: 0, last30DaysExpenses: 0, topExpenseCategoriesLast30Days: [] },
      creditCards: [],
      pendingExtras: { overtimeHours: 0, pieceworkUnits: 0, mealsAmount: 0 },
      notes: ['No hay un hogar configurado para analizar.']
    };
  }

  const notes: string[] = [];
  const { data: accountData, error: accountsError } = await client
    .from('accounts')
    .select('id,household_id,name,type,balance,is_active')
    .eq('household_id', resolvedHouseholdId);
  if (accountsError) throw new Error(`No fue posible leer cuentas para el asesor financiero: ${accountsError.message}`);

  const accounts = ((accountData ?? []) as AccountRow[]).filter((account) => account.is_active !== false);
  const operationalAccounts = accounts.filter((account) => getFinancialClosureAccountScope(account.type) === 'operational');
  const complementaryAccounts = accounts.filter((account) => getFinancialClosureAccountScope(account.type) !== 'operational');
  const creditCards = accounts
    .filter((account) => ['credit_card', 'deuda'].includes(account.type.toLowerCase().trim()))
    .map((account) => ({ name: account.name, balance: Number(account.balance), type: account.type }));

  if (!operationalAccounts.length) notes.push('No se encontraron cuentas operativas activas; el dinero operativo puede estar incompleto.');

  const { data: closureData, error: closuresError } = await client
    .from('financial_closures')
    .select('type,period_start,period_end,opening_total,closing_total,net_change,income_total,expense_total,net_flow,created_at')
    .eq('household_id', resolvedHouseholdId)
    .order('period_end', { ascending: false })
    .order('created_at', { ascending: false });
  if (closuresError) throw new Error(`No fue posible leer cierres para el asesor financiero: ${closuresError.message}`);

  const closures = (closureData ?? []) as ClosureRow[];
  const weeklyClosures = closures.filter((closure) => closure.type === 'weekly');
  const monthlyClosures = closures.filter((closure) => closure.type === 'monthly');
  if (!weeklyClosures.length && !monthlyClosures.length) notes.push('No hay cierres financieros guardados todavía; el análisis usa cuentas y movimientos recientes.');

  const { data: groupsData, error: groupsError } = await client
    .from('transaction_groups')
    .select('id,household_id')
    .eq('household_id', resolvedHouseholdId);
  if (groupsError) throw new Error(`No fue posible leer grupos de movimientos para el asesor financiero: ${groupsError.message}`);

  const groupIds = ((groupsData ?? []) as TransactionGroupRow[]).map((group) => group.id);
  const last30Start = `${toDateOnly(addDays(generatedAt, -30))}T00:00:00.000Z`;
  const last7Start = `${toDateOnly(addDays(generatedAt, -7))}T00:00:00.000Z`;
  const nowIso = generatedAt.toISOString();
  const { data: transactionData, error: transactionsError } = groupIds.length
    ? await client
      .from('transactions')
      .select('group_id,type,category,amount,happened_at')
      .in('group_id', groupIds)
      .gte('happened_at', last30Start)
    : { data: [] as TransactionRow[], error: null };
  if (transactionsError) throw new Error(`No fue posible leer movimientos para el asesor financiero: ${transactionsError.message}`);

  const transactions = ((transactionData ?? []) as TransactionRow[]).filter((line) => line.happened_at <= nowIso);
  const linesByGroup = transactions.reduce<Record<string, TransactionRow[]>>((acc, line) => {
    acc[line.group_id] = acc[line.group_id] ?? [];
    acc[line.group_id].push(line);
    return acc;
  }, {});

  let last7DaysIncome = 0;
  let last7DaysExpenses = 0;
  let last30DaysIncome = 0;
  let last30DaysExpenses = 0;
  const expenseByCategory = new Map<string, number>();

  for (const lines of Object.values(linesByGroup)) {
    const action = inferMovementAction(lines);
    if (!action) continue;
    const amount = Number(lines.find((line) => line.type === 'debit')?.amount ?? lines.find((line) => line.type === 'credit')?.amount ?? 0);
    const happenedAt = lines.reduce((latest, line) => line.happened_at > latest ? line.happened_at : latest, lines[0]?.happened_at ?? '');

    if (action === 'income') last30DaysIncome += amount;
    if (action === 'expense') {
      last30DaysExpenses += amount;
      const category = userFacingCategory(lines);
      expenseByCategory.set(category, (expenseByCategory.get(category) ?? 0) + amount);
    }
    if (happenedAt >= last7Start) {
      if (action === 'income') last7DaysIncome += amount;
      if (action === 'expense') last7DaysExpenses += amount;
    }
  }

  const { data: extrasData, error: extrasError } = await client
    .from('extra_work_entries')
    .select('type,quantity,status')
    .eq('household_id', resolvedHouseholdId);
  if (extrasError) throw new Error(`No fue posible leer extras para el asesor financiero: ${extrasError.message}`);

  const pendingExtras = ((extrasData ?? []) as ExtraWorkRow[])
    .filter((entry) => entry.status === 'pending')
    .reduce((acc, entry) => {
      if (entry.type === 'overtime') acc.overtimeHours += Number(entry.quantity);
      if (entry.type === 'piecework') acc.pieceworkUnits += Number(entry.quantity);
      if (entry.type === 'meals') acc.mealsAmount += Number(entry.quantity);
      return acc;
    }, { overtimeHours: 0, pieceworkUnits: 0, mealsAmount: 0 });

  return {
    generatedAt: generatedAt.toISOString(),
    operationalMoney: {
      currentAmount: roundMoney(operationalAccounts.reduce((acc, account) => acc + Number(account.balance), 0)),
      source: 'accounts',
      includedAccounts: operationalAccounts.map((account) => account.name),
      excludedAccounts: complementaryAccounts.map((account) => account.name)
    },
    recentClosures: {
      latestWeekly: weeklyClosures[0] ? mapClosure(weeklyClosures[0]) : null,
      previousWeekly: weeklyClosures[1] ? mapClosure(weeklyClosures[1]) : null,
      latestMonthly: monthlyClosures[0] ? mapClosure(monthlyClosures[0]) : null
    },
    recentMovements: {
      last7DaysIncome: roundMoney(last7DaysIncome),
      last7DaysExpenses: roundMoney(last7DaysExpenses),
      last30DaysIncome: roundMoney(last30DaysIncome),
      last30DaysExpenses: roundMoney(last30DaysExpenses),
      topExpenseCategoriesLast30Days: [...expenseByCategory.entries()]
        .map(([category, amount]) => ({ category, amount: roundMoney(amount) }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
    },
    creditCards,
    pendingExtras: {
      overtimeHours: roundMoney(pendingExtras.overtimeHours),
      pieceworkUnits: roundMoney(pendingExtras.pieceworkUnits),
      mealsAmount: roundMoney(pendingExtras.mealsAmount)
    },
    notes
  };
}

const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['healthy', 'stable', 'tight', 'risk'] },
    headline: { type: 'string' },
    summary: { type: 'string' },
    mainConcern: { type: 'string' },
    positiveSignal: { type: 'string' },
    topRisks: { type: 'array', items: { type: 'string' } },
    opportunities: { type: 'array', items: { type: 'string' } },
    recommendedAction: { type: 'string' },
    nextBestAction: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    dataLimitations: { type: 'array', items: { type: 'string' } }
  },
  required: ['status', 'headline', 'summary', 'mainConcern', 'positiveSignal', 'topRisks', 'opportunities', 'recommendedAction', 'nextBestAction', 'confidence', 'dataLimitations']
} as const;

function isAdvisorStatus(value: unknown): value is FinancialAdvisorAnalysis['status'] {
  return value === 'healthy' || value === 'stable' || value === 'tight' || value === 'risk';
}

function isAdvisorConfidence(value: unknown): value is FinancialAdvisorAnalysis['confidence'] {
  return value === 'low' || value === 'medium' || value === 'high';
}

function normalizeAnalysis(value: Partial<FinancialAdvisorAnalysis>): FinancialAdvisorAnalysis {
  return {
    status: isAdvisorStatus(value.status) ? value.status : 'stable',
    headline: value.headline || 'Análisis financiero disponible',
    summary: value.summary || 'Se revisaron cuentas, movimientos, cierres y extras disponibles.',
    mainConcern: value.mainConcern || 'No se detectó una preocupación principal con los datos actuales.',
    positiveSignal: value.positiveSignal || 'Tener los datos organizados permite tomar mejores decisiones.',
    topRisks: Array.isArray(value.topRisks) ? value.topRisks : [],
    opportunities: Array.isArray(value.opportunities) ? value.opportunities : [],
    recommendedAction: value.recommendedAction || 'Revisa los datos y define una acción concreta para esta semana.',
    nextBestAction: value.nextBestAction || 'Actualiza movimientos y cierres antes del siguiente análisis.',
    confidence: isAdvisorConfidence(value.confidence) ? value.confidence : 'medium',
    dataLimitations: Array.isArray(value.dataLimitations) ? value.dataLimitations : []
  };
}

export function generateFinancialAdvisorFallbackAnalysis(context: FinancialAdvisorContext): FinancialAdvisorAnalysis {
  let status: FinancialAdvisorAnalysis['status'] = 'stable';
  const topRisks: string[] = [];
  const opportunities: string[] = [];
  const dataLimitations = [...context.notes];
  const latestWeekly = context.recentClosures.latestWeekly;
  const weeklyNetChange = latestWeekly?.netChange ?? null;
  const cardPressure = context.creditCards.reduce((acc, card) => acc + Math.max(0, card.balance), 0);
  const hasPendingExtras = context.pendingExtras.overtimeHours > 0 || context.pendingExtras.pieceworkUnits > 0 || context.pendingExtras.mealsAmount > 0;

  if (context.operationalMoney.currentAmount <= 0) {
    status = 'risk';
    topRisks.push('El dinero operativo está en cero o negativo.');
  }

  if (weeklyNetChange !== null && weeklyNetChange < 0) {
    const magnitude = Math.abs(weeklyNetChange);
    if (magnitude > Math.max(context.operationalMoney.currentAmount * 0.25, 1)) status = 'risk';
    else if (status !== 'risk') status = 'tight';
    topRisks.push(`El último cierre semanal bajó ${roundMoney(magnitude)} respecto al inicio.`);
  }

  if (context.recentMovements.last7DaysExpenses > context.recentMovements.last7DaysIncome) {
    if (status !== 'risk') status = 'tight';
    topRisks.push('En los últimos 7 días los gastos superaron a los ingresos registrados.');
  }

  if (cardPressure > 0) topRisks.push('Las tarjetas aparecen como presión/deuda a vigilar, separadas del dinero operativo.');
  if (!latestWeekly && !context.recentClosures.latestMonthly) dataLimitations.push('No hay cierres recientes para comparar tendencia semanal o mensual.');
  if (hasPendingExtras) opportunities.push('Dar seguimiento a extras pendientes por cobrar o confirmar: horas extra, destajos o comidas.');
  if (context.recentMovements.topExpenseCategoriesLast30Days.length) {
    opportunities.push(`Revisar la categoría con mayor gasto reciente: ${context.recentMovements.topExpenseCategoriesLast30Days[0].category}.`);
  }
  if (context.recentMovements.last30DaysIncome >= context.recentMovements.last30DaysExpenses && context.recentMovements.last30DaysIncome > 0) {
    opportunities.push('Los ingresos de 30 días cubren los gastos registrados; conviene proteger esa diferencia.');
  }

  const confidence: FinancialAdvisorAnalysis['confidence'] = !latestWeekly && !context.recentClosures.latestMonthly ? 'low' : context.recentMovements.last30DaysIncome || context.recentMovements.last30DaysExpenses ? 'high' : 'medium';
  const headline = status === 'risk'
    ? 'Hay señales de riesgo que requieren atención inmediata'
    : status === 'tight'
      ? 'La semana se ve ajustada y conviene priorizar liquidez'
      : 'Tu situación se ve estable con los datos disponibles';

  return normalizeAnalysis({
    status,
    headline,
    summary: `Dinero operativo actual: ${roundMoney(context.operationalMoney.currentAmount)}. Ingresos últimos 30 días: ${context.recentMovements.last30DaysIncome}; gastos últimos 30 días: ${context.recentMovements.last30DaysExpenses}.`,
    mainConcern: topRisks[0] ?? 'No hay una alerta crítica evidente con los datos disponibles.',
    positiveSignal: context.operationalMoney.currentAmount > 0 ? 'Existe dinero operativo identificado en cuentas líquidas.' : 'El sistema ya separa tarjetas, fondos y por cobrar del dinero operativo.',
    topRisks: topRisks.slice(0, 4),
    opportunities: opportunities.slice(0, 4),
    recommendedAction: status === 'risk' ? 'Prioriza pagos indispensables y evita comprometer más efectivo hasta actualizar movimientos y cierres.' : 'Revisa los gastos principales de los últimos 30 días y define un límite semanal realista.',
    nextBestAction: hasPendingExtras ? 'Confirma y cobra los extras pendientes antes de planear nuevos gastos.' : 'Registra movimientos recientes y genera el próximo cierre para mejorar la lectura.',
    confidence,
    dataLimitations: [...new Set(dataLimitations)]
  });
}

export async function generateFinancialAdvisorAnalysis(context: FinancialAdvisorContext): Promise<FinancialAdvisorAnalysis> {
  const client = getOpenAIClient();
  if (!client) return generateFinancialAdvisorFallbackAnalysis(context);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_AI_TIMEOUT_MS);

  try {
    const response = await client.responses.create({
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: 'Eres un asesor financiero familiar. Tu trabajo es interpretar datos financieros ya calculados. No inventes montos. No inventes cuentas. No prometas rendimientos. No des asesoría de inversión avanzada. No recomiendes endeudamiento como solución fácil. No diagnostiques si faltan datos; menciona incertidumbre. Debes responder en español claro, directo y humano. Analiza liquidez operativa, cambio semanal, gastos recientes, presión por tarjetas, dependencia de extras, categorías que más pesan y señales de mejora o deterioro. Devuelve únicamente JSON válido con el esquema solicitado.' }]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(context) }]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'financial_advisor_analysis',
          schema: analysisSchema,
          strict: true
        }
      }
    }, { signal: controller.signal });

    const output = response.output_text;
    if (!output) return generateFinancialAdvisorFallbackAnalysis(context);
    return normalizeAnalysis(JSON.parse(output));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.warn('[financial-advisor-ai] fallback', error);
    return generateFinancialAdvisorFallbackAnalysis(context);
  } finally {
    clearTimeout(timer);
  }
}

export async function runFinancialAdvisorAnalysis(householdId?: string | null, client: SupabaseClientLike = supabaseAdmin) {
  const context = await buildFinancialAdvisorContext(householdId, client);
  const analysis = await generateFinancialAdvisorAnalysis(context);
  return { context, analysis };
}
