import { beforeEach, describe, expect, it, vi } from 'vitest';

const { responsesCreateMock, openAIConstructorMock } = vi.hoisted(() => {
  const responsesCreate = vi.fn();
  const openAIConstructor = vi.fn(() => ({
    responses: {
      create: responsesCreate
    }
  }));
  return { responsesCreateMock: responsesCreate, openAIConstructorMock: openAIConstructor };
});

vi.mock('openai', () => ({
  default: openAIConstructorMock
}));

import { calculateFinancialPressure, generateFinancialInsight } from '@/lib/finance/financialPressure';

describe('financial pressure indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  it('calcula requiredMoney con deudas, gastos fijos y estimación operativa', () => {
    const result = calculateFinancialPressure({
      accounts: [
        { type: 'operativa', balance: 5000 },
        { type: 'deuda', balance: 12000 }
      ],
      debts: [{ periodicPayment: 2000 }],
      fixedExpenses: 1500,
      recentTransactions: [
        { type: 'debit', amount: 100, category: 'comida' },
        { type: 'debit', amount: 200, category: 'transporte' }
      ]
    });

    expect(result.breakdown.debts).toBe(2000);
    expect(result.breakdown.fixedExpenses).toBe(1500);
    expect(result.breakdown.operationalEstimate).toBe(1050);
    expect(result.requiredMoney).toBe(4550);
  });

  it('calcula gap como requiredMoney - availableMoney', () => {
    const result = calculateFinancialPressure({
      accounts: [{ type: 'operativa', balance: 5000 }],
      debts: [{ periodicPayment: 1000 }],
      fixedExpenses: 500,
      recentTransactions: [{ type: 'debit', amount: 100, category: 'misc' }]
    });

    expect(result.requiredMoney).toBe(2200);
    expect(result.availableMoney).toBe(5000);
    expect(result.gap).toBe(-2800);
  });

  it('asigna status healthy, warning y critical según el gap', () => {
    const healthy = calculateFinancialPressure({
      accounts: [{ type: 'operativa', balance: 3000 }],
      debts: [{ periodicPayment: 200 }],
      fixedExpenses: 300,
      recentTransactions: [{ type: 'debit', amount: 100, category: 'misc' }]
    });

    const warning = calculateFinancialPressure({
      accounts: [{ type: 'operativa', balance: 1500 }],
      debts: [{ periodicPayment: 500 }],
      fixedExpenses: 900,
      recentTransactions: [{ type: 'debit', amount: 20, category: 'misc' }]
    });

    const critical = calculateFinancialPressure({
      accounts: [{ type: 'operativa', balance: 500 }],
      debts: [{ periodicPayment: 2000 }],
      fixedExpenses: 1000,
      recentTransactions: [{ type: 'debit', amount: 300, category: 'misc' }]
    });

    expect(healthy.status).toBe('healthy');
    expect(warning.status).toBe('warning');
    expect(critical.status).toBe('critical');
  });

  it('no depende de OpenAI para el cálculo', () => {
    calculateFinancialPressure({
      accounts: [{ type: 'operativa', balance: 1000 }],
      debts: [{ periodicPayment: 200 }],
      fixedExpenses: 100,
      recentTransactions: [{ type: 'debit', amount: 30, category: 'misc' }]
    });

    expect(openAIConstructorMock).not.toHaveBeenCalled();
    expect(responsesCreateMock).not.toHaveBeenCalled();
  });

  it('usa OpenAI solo para la explicación', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    responsesCreateMock.mockResolvedValueOnce({
      output_text: JSON.stringify({
        explanation: 'Te faltan $300.',
        topCauses: ['Pago tarjeta $200'],
        suggestions: ['Reduce comida fuera', 'Paga mínimo de tarjeta']
      })
    });

    const snapshot = calculateFinancialPressure({
      accounts: [{ type: 'operativa', balance: 1000 }],
      debts: [{ periodicPayment: 1000 }],
      fixedExpenses: 600,
      recentTransactions: [{ type: 'debit', amount: 100, category: 'misc' }]
    });

    const insight = await generateFinancialInsight(snapshot, [{ type: 'debit', amount: 200, category: 'tarjeta' }]);

    expect(openAIConstructorMock).toHaveBeenCalledTimes(1);
    expect(responsesCreateMock).toHaveBeenCalledTimes(1);
    expect(insight.explanation).toContain('Te faltan');
  });
});
