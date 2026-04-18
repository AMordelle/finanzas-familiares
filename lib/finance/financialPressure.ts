import OpenAI from 'openai';
import { formatCurrencyMXN } from '@/lib/formatters/currency';

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';
const DEFAULT_WARNING_RATIO = 0.2;

export type FinancialPressureAccount = {
  type: string;
  balance: number;
};

export type FinancialPressureDebt = {
  periodicPayment?: number | null;
  upcomingPayment?: number | null;
};

export type FinancialPressureTransaction = {
  amount: number;
  type: string;
  category?: string | null;
  happenedAt?: string | Date | null;
  description?: string | null;
};

export type FinancialPressureRecurringPattern = {
  kind: 'fixed_expense' | 'debt_payment';
  amount: number;
};

export type FinancialPressureState = {
  accounts: FinancialPressureAccount[];
  debts: FinancialPressureDebt[];
  recentTransactions: FinancialPressureTransaction[];
  recurringPatterns?: FinancialPressureRecurringPattern[];
  fixedExpenses?: number;
};

export type FinancialPressureSnapshot = {
  requiredMoney: number;
  availableMoney: number;
  gap: number;
  status: 'healthy' | 'warning' | 'critical';
  breakdown: {
    debts: number;
    fixedExpenses: number;
    operationalEstimate: number;
  };
};

export type FinancialInsight = {
  explanation: string;
  topCauses: string[];
  suggestions: string[];
};

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function isLiquidType(type: string) {
  return ['operativa', 'operational_cash', 'debit', 'debito', 'cash', 'efectivo'].includes(type.toLowerCase());
}

function isExpenseTransaction(tx: FinancialPressureTransaction) {
  if (tx.type === 'debit') return true;
  const normalizedType = tx.type.toLowerCase();
  return ['gasto', 'expense', 'egreso'].includes(normalizedType);
}

export function calculateFinancialPressure(state: FinancialPressureState): FinancialPressureSnapshot {
  const debtFromDebts = state.debts.reduce(
    (acc, debt) => acc + Math.max(debt.upcomingPayment ?? debt.periodicPayment ?? 0, 0),
    0
  );

  const debtFromRecurring = (state.recurringPatterns ?? [])
    .filter((pattern) => pattern.kind === 'debt_payment')
    .reduce((acc, pattern) => acc + Math.max(pattern.amount, 0), 0);

  const debts = roundCurrency(debtFromDebts + debtFromRecurring);

  const fixedFromState = Math.max(state.fixedExpenses ?? 0, 0);
  const fixedFromRecurring = (state.recurringPatterns ?? [])
    .filter((pattern) => pattern.kind === 'fixed_expense')
    .reduce((acc, pattern) => acc + Math.max(pattern.amount, 0), 0);
  const fixedExpenses = roundCurrency(fixedFromState + fixedFromRecurring);

  const recentExpenseAmounts = state.recentTransactions
    .filter((tx) => isExpenseTransaction(tx))
    .map((tx) => Math.max(tx.amount, 0));

  const operationalEstimate = roundCurrency(average(recentExpenseAmounts) * 7);

  const requiredMoney = roundCurrency(debts + fixedExpenses + operationalEstimate);

  const availableMoney = roundCurrency(
    state.accounts
      .filter((account) => isLiquidType(account.type))
      .reduce((acc, account) => acc + Math.max(account.balance, 0), 0)
  );

  const gap = roundCurrency(requiredMoney - availableMoney);
  const warningThreshold = requiredMoney * DEFAULT_WARNING_RATIO;

  const status: FinancialPressureSnapshot['status'] =
    gap <= 0 ? 'healthy' : gap < warningThreshold ? 'warning' : 'critical';

  return {
    requiredMoney,
    availableMoney,
    gap,
    status,
    breakdown: {
      debts,
      fixedExpenses,
      operationalEstimate
    }
  };
}

function fallbackInsight(snapshot: FinancialPressureSnapshot): FinancialInsight {
  const causes = [
    { label: 'deudas', amount: snapshot.breakdown.debts },
    { label: 'gastos fijos', amount: snapshot.breakdown.fixedExpenses },
    { label: 'gasto operativo', amount: snapshot.breakdown.operationalEstimate }
  ]
    .sort((a, b) => b.amount - a.amount)
    .filter((item) => item.amount > 0)
    .slice(0, 2)
    .map((item) => `${item.label} (${formatCurrencyMXN(item.amount)})`);

  const explanation =
    snapshot.gap > 0
      ? `Te faltan ${formatCurrencyMXN(snapshot.gap)} para cubrir compromisos de corto plazo.`
      : `Tienes un margen positivo de ${formatCurrencyMXN(Math.abs(snapshot.gap))} para esta semana.`;

  const suggestions =
    snapshot.gap > 0
      ? [
          'Reduce gasto variable esta semana, sobre todo en categorías no esenciales.',
          'Negocia o difiere un pago no crítico para bajar la presión inmediata.',
          'Protege tu efectivo y evita compras a meses mientras estabilizas el flujo.'
        ]
      : ['Mantén el control de gastos diarios.', 'Aparta una parte del excedente para fondo de emergencia.'];

  return {
    explanation,
    topCauses: causes,
    suggestions: suggestions.slice(0, 3)
  };
}

export async function generateFinancialInsight(
  snapshot: FinancialPressureSnapshot,
  keyTransactions: FinancialPressureTransaction[] = []
): Promise<FinancialInsight> {
  const client = getOpenAIClient();
  if (!client) {
    return fallbackInsight(snapshot);
  }

  const payload = {
    requiredMoney: snapshot.requiredMoney,
    availableMoney: snapshot.availableMoney,
    gap: snapshot.gap,
    breakdown: snapshot.breakdown,
    keyTransactions: keyTransactions.slice(0, 5).map((tx) => ({
      amount: tx.amount,
      category: tx.category ?? 'sin_categoria',
      description: tx.description ?? '',
      happenedAt: tx.happenedAt ? new Date(tx.happenedAt).toISOString() : null
    }))
  };

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      explanation: { type: 'string' },
      topCauses: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
      suggestions: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 }
    },
    required: ['explanation', 'topCauses', 'suggestions']
  } as const;

  try {
    const response = await (client.responses.create as any)({
      model: DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: 'Eres un asistente financiero familiar. Explica de forma breve, clara, sin tecnicismos y sin inventar datos. Enfócate en acciones concretas usando montos reales.'
            }
          ]
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: JSON.stringify(payload) }]
        }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'financial_pressure_insight',
          schema,
          strict: true
        }
      }
    });

    if (!response.output_text) {
      return fallbackInsight(snapshot);
    }

    return JSON.parse(response.output_text) as FinancialInsight;
  } catch {
    return fallbackInsight(snapshot);
  }
}
