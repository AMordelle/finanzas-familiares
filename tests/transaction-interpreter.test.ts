import { describe, expect, it } from 'vitest';
import { interpretTransaction } from '@/lib/ai/transactionInterpreter';

const accounts = [
  { id: 'acc-ef', name: 'Efectivo', type: 'operational_cash' },
  { id: 'acc-ban', name: 'Banco BBVA', type: 'operational_cash' },
  { id: 'acc-tdc', name: 'TDC BBVA', type: 'credit_card' },
  { id: 'acc-liv', name: 'Liverpool', type: 'credit_card' },
  { id: 'acc-loan', name: 'Préstamo auto', type: 'loan' },
  { id: 'acc-ah1', name: 'Ahorro Emergencia', type: 'savings_fund' },
  { id: 'acc-ah2', name: 'Ahorro Viaje', type: 'savings_fund' },
  { id: 'acc-rec', name: 'Juan por cobrar', type: 'receivable' }
] as const;

describe('transaction interpreter semantic pipeline', () => {
  it('A: income keeps source empty and confirms only destination', async () => {
    const result = await interpretTransaction('Recibí 2000 de tiempo extra en banco', accounts as any);
    expect(result.intent).toBe('income');
    expect(result.sourceAccountName).toBeNull();
    expect(result.sourceAccountId).toBeNull();
    expect(result.destinationAccountName).toBe('Banco BBVA');
    expect(result.humanConfirmation).toBe('Registrar ingreso de $2,000 hacia Banco BBVA.');
  });

  it('A/B: clear expense with source account and punctuation has no follow-up', async () => {
    const result = await interpretTransaction('Gasté 600 en gasolina con efectivo.', accounts as any);
    expect(result.intent).toBe('expense_cash_like');
    expect(result.missingFieldKinds).toEqual([]);
    expect(result.nextPromptInputType).toBeNull();
  });

  it('C: ambiguous expense asks source account', async () => {
    const result = await interpretTransaction('Gasté 500 en cena', accounts as any);
    expect(result.missingFieldKinds).toContain('missingSourceAccount');
    expect(result.nextPromptInputType).toBe('account_selector');
  });

  it('D/E: income explicit destination no follow-up, missing destination asks', async () => {
    const explicit = await interpretTransaction('Recibí 1200 en Banco BBVA', accounts as any);
    expect(explicit.intent).toBe('income');
    expect(explicit.missingFieldKinds).toEqual([]);

    const missing = await interpretTransaction('Recibí 1200', accounts as any);
    expect(missing.missingFieldKinds).toContain('missingDestinationAccount');
  });

  it('F/G/H: credit-card purchase, debt payment, debt transfer', async () => {
    const ccExpense = await interpretTransaction('Gasté 500 con Liverpool', accounts as any);
    expect(ccExpense.intent).toBe('expense_debt_account');

    const payment = await interpretTransaction('Pagué 500 a la TDC BBVA desde Banco BBVA', accounts as any);
    expect(payment.intent).toBe('debt_payment');

    const transfer = await interpretTransaction('Pagué Liverpool con la TDC BBVA', accounts as any);
    expect(transfer.intent).toBe('debt_transfer');
  });

  it('I/J/K: account-aware and ambiguity/multi-turn requirements', async () => {
    const liverpool = await interpretTransaction('Gasté 500 con Liverpool', accounts as any);
    expect(liverpool.intent).toBe('expense_debt_account');

    const ambiguous = await interpretTransaction('Pagué 500 a la BBVA', accounts as any);
    expect(ambiguous.missingFieldKinds.some((kind) => ['missingDebtTarget', 'missingIntent'].includes(kind))).toBe(true);

    const partial = await interpretTransaction('Pagué 300 a la tarjeta', accounts as any);
    expect(partial.missingFieldKinds).toContain('missingSourceAccount');
    expect(partial.missingFieldKinds).toContain('missingDebtTarget');
  });

  it('L/M/N/O/P: receivable payment, savings ambiguity, guided intent, reclassification trigger, free text prompt', async () => {
    const paidMe = await interpretTransaction('Juan me pagó 300', accounts as any);
    expect(paidMe.intent).toBe('receivable_payment');

    const moveSavings = await interpretTransaction('Moví 500 a ahorro', accounts as any);
    expect(moveSavings.missingFieldKinds.length).toBeGreaterThan(0);

    const meti = await interpretTransaction('Metí 1000', accounts as any);
    expect(meti.missingFieldKinds).toContain('missingIntent');
    expect(meti.nextPromptInputType).toBe('guided_choice');

    const ambiguousExpense = await interpretTransaction('Gasté 300 en Oxxo', accounts as any);
    expect(ambiguousExpense.intent).toBe('expense_cash_like');

    const missingDesc = await interpretTransaction('Gasté 300 con efectivo', accounts as any);
    expect(missingDesc.missingFieldKinds).toContain('missingWhatWasPaid');
    expect(missingDesc.nextPromptInputType).toBe('text_input');
  });

  it('D: unknown explicit credit card never auto-maps and asks clarification', async () => {
    const result = await interpretTransaction('Gasté 2000 en ropa con TDC SCTBNK', accounts as any);
    expect(result.sourceAccountName).toBeNull();
    expect(result.missingFieldKinds).toContain('missingSourceAccount');
    expect(result.nextPrompt).toContain('No encontré una cuenta llamada');
  });

  it('E: generic credit card phrase resolves only when unique', async () => {
    const uniqueCardAccounts = [
      { id: 'acc-ef', name: 'Efectivo', type: 'operational_cash' },
      { id: 'acc-tdc', name: 'TDC Única', type: 'credit_card' }
    ];
    const uniqueResult = await interpretTransaction('Gasté 1000 con tarjeta de crédito', uniqueCardAccounts as any);
    expect(uniqueResult.sourceAccountName).toBe('TDC Única');

    const ambiguousResult = await interpretTransaction('Gasté 1000 con tarjeta de crédito', accounts as any);
    expect(ambiguousResult.sourceAccountName).toBeNull();
    expect(ambiguousResult.missingFieldKinds).toContain('missingSourceAccount');
  });
});
