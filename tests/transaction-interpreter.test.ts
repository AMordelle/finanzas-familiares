import { describe, expect, it } from 'vitest';
import { applyFollowUpAnswer, interpretTransaction } from '@/lib/ai/transactionInterpreter';

const accounts = [
  { id: 'acc-ef', name: 'Efectivo', type: 'operational_cash' },
  { id: 'acc-ban', name: 'Banco BBVA', type: 'operational_cash' },
  { id: 'acc-tdc', name: 'TDC BBVA', type: 'credit_card' },
  { id: 'acc-liv', name: 'Tarjeta Liverpool', type: 'credit_card' },
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
    expect(ccExpense.visibleType).toBe('Gasto con tarjeta de crédito');
    expect(ccExpense.sourceAccountName).toBe('Tarjeta Liverpool');

    const payment = await interpretTransaction('Pagué 500 a la TDC BBVA desde Banco BBVA', accounts as any);
    expect(payment.intent).toBe('debt_payment');

    const transfer = await interpretTransaction('Pagué Liverpool con la TDC BBVA', accounts as any);
    expect(transfer.intent).toBe('debt_transfer');
  });

  it('B: generic tarjeta with multiple cards asks which one', async () => {
    const result = await interpretTransaction('Gasté 1000 con tarjeta de credito', accounts as any);
    expect(result.missingFieldKinds[0]).toBe('missingSourceAccount');
    expect(result.nextPrompt).toContain('tarjeta');
  });

  it('B-extra: BBVA ambiguous reference asks clarification and does not auto-select', async () => {
    const result = await interpretTransaction('Gasté 500 con BBVA', accounts as any);
    expect(result.sourceAccountName).toBeNull();
    expect(result.nextPrompt).toContain('Banco BBVA');
    expect(result.nextPrompt).toContain('TDC BBVA');
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

  it('C/D: preserves source when unknown debt target is corrected', async () => {
    const first = await interpretTransaction('Pagué 500 a la TDC SCTBNK desde banco', accounts as any);
    const resolved = await applyFollowUpAnswer(first, 'TDC BBVA', accounts as any);
    expect(resolved.sourceAccountName).toBe('Banco BBVA');
    expect(resolved.destinationAccountName).toBe('TDC BBVA');

    const second = await interpretTransaction('Pagué 300 a la TDC SCTBNK con efectivo', accounts as any);
    const resolvedSecond = await applyFollowUpAnswer(second, 'TDC BBVA', accounts as any);
    expect(resolvedSecond.sourceAccountName).toBe('Efectivo');
    expect(resolvedSecond.destinationAccountName).toBe('TDC BBVA');
  });

  it('E/F: ambiguous payment continues flow and binds by asked role', async () => {
    const base = await interpretTransaction('Pagué 300', accounts as any);
    const afterIntent = await applyFollowUpAnswer(base, 'Un gasto normal', accounts as any);
    expect(afterIntent.missingFieldKinds).toContain('missingSourceAccount');

    const cardPayment = await interpretTransaction('Pagué 300 a la tarjeta', accounts as any);
    expect(cardPayment.missingFieldKinds[0]).toBe('missingDebtTarget');
    const afterCard = await applyFollowUpAnswer(cardPayment, 'TDC BBVA', accounts as any);
    expect(afterCard.destinationAccountName).toBe('TDC BBVA');
    expect(afterCard.missingFieldKinds).toContain('missingSourceAccount');
  });

  it('G/H: debt-transfer context survives complete and incomplete forms', async () => {
    const complete = await interpretTransaction('Pagué 1000 de Liverpool con TDC BBVA', accounts as any);
    expect(complete.intent).toBe('debt_transfer');
    expect(complete.visibleType).toBe('Traslado de deuda');
    expect(complete.sourceAccountName).toBe('TDC BBVA');
    expect(complete.destinationAccountName).toBe('Tarjeta Liverpool');

    const incomplete = await interpretTransaction('Pagué 1000 de Liverpool con', accounts as any);
    expect(['debt_transfer', 'debt_payment']).toContain(incomplete.intent);
    expect(incomplete.nextPrompt).not.toContain('¿Qué pagaste?');

    const withSource = await applyFollowUpAnswer(incomplete, 'Banco BBVA', accounts as any);
    expect(withSource.intent).toBe('debt_payment');
    expect(withSource.visibleType).toBe('Pago de deuda');
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

  it('A-followup: gasto con Liverpool conserva destination null al finalizar', async () => {
    const result = await interpretTransaction('Gasté 500 con Liverpool', accounts as any);
    expect(result.intent).toBe('expense_debt_account');
    expect(result.sourceAccountName).toBe('Tarjeta Liverpool');
    expect(result.destinationAccountName).toBeNull();
    expect(result.destinationAccountId).toBeNull();
    expect(result.destinationAccountType).toBeNull();
  });

  it('B-followup: gasto con BBVA + Banco BBVA mantiene destination null', async () => {
    const start = await interpretTransaction('Gasté 500 con BBVA', accounts as any);
    const resolved = await applyFollowUpAnswer(start, 'Banco BBVA', accounts as any);
    expect(resolved.intent).toBe('expense_cash_like');
    expect(resolved.sourceAccountName).toBe('Banco BBVA');
    expect(resolved.destinationAccountName).toBeNull();
    expect(resolved.destinationAccountId).toBeNull();
    expect(resolved.destinationAccountType).toBeNull();
  });

  it('C-followup: gasto con BBVA + TDC BBVA mantiene destination null', async () => {
    const start = await interpretTransaction('Gasté 500 con BBVA', accounts as any);
    const resolved = await applyFollowUpAnswer(start, 'TDC BBVA', accounts as any);
    expect(resolved.intent).toBe('expense_debt_account');
    expect(resolved.sourceAccountName).toBe('TDC BBVA');
    expect(resolved.destinationAccountName).toBeNull();
    expect(resolved.destinationAccountId).toBeNull();
    expect(resolved.destinationAccountType).toBeNull();
  });

  it('D-followup: descripción libre no cierra gasto con tarjeta genérica si falta tarjeta', async () => {
    const start = await interpretTransaction('Gasté 1000 con tarjeta de crédito', accounts as any);
    const afterDescription = await applyFollowUpAnswer(start, 'en restaurante', accounts as any);
    expect(afterDescription.intent).toBe('expense_debt_account');
    expect(afterDescription.sourceAccountName).toBeNull();
    expect(afterDescription.missingFieldKinds[0]).toBe('missingSourceAccount');
    expect(afterDescription.nextPrompt).toContain('tarjeta');
  });

  it('E-followup: texto libre de descripción no muta cuentas', async () => {
    const start = await interpretTransaction('Gasté 300 con efectivo', accounts as any);
    expect(start.sourceAccountName).toBe('Efectivo');
    expect(start.destinationAccountName).toBeNull();

    const afterDescription = await applyFollowUpAnswer(start, 'servicio de internet', accounts as any);
    expect(afterDescription.sourceAccountName).toBe('Efectivo');
    expect(afterDescription.destinationAccountName).toBeNull();
    expect(afterDescription.category).toBe('servicios');
  });
});
