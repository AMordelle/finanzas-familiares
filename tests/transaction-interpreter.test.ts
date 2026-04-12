import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyFollowUpAnswer, enforceFinancialConsistency, interpretTransaction, transactionIntentSchema } from '@/lib/ai/transactionInterpreter';
import { inferSemanticCategoryWithOpenAI } from '@/lib/ai/openai';
import { semanticInstructionUnderstanding } from '@/lib/ai/semanticInstruction';

vi.mock('@/lib/ai/openai', () => ({
  inferSemanticCategoryWithOpenAI: vi.fn()
}));
vi.mock('@/lib/ai/semanticInstruction', () => ({
  semanticInstructionUnderstanding: vi.fn()
}));

const mockedInferSemanticCategoryWithOpenAI = vi.mocked(inferSemanticCategoryWithOpenAI);
const mockedSemanticInstructionUnderstanding = vi.mocked(semanticInstructionUnderstanding);

const accounts = [
  { id: 'acc-ef', name: 'Efectivo', type: 'operational_cash' },
  { id: 'acc-ban', name: 'Banco BBVA', type: 'operational_cash' },
  { id: 'acc-tdd', name: 'TDD BBVA', type: 'operational_cash', aliases: ['Débito BBVA'] },
  { id: 'acc-prime', name: 'PrimeIPTV', type: 'operational_cash' },
  { id: 'acc-tdc', name: 'TDC BBVA', type: 'credit_card' },
  { id: 'acc-liv', name: 'Tarjeta Liverpool', type: 'credit_card', aliases: ['TDC Liverpool'] },
  { id: 'acc-loan', name: 'Préstamo auto', type: 'loan' },
  { id: 'acc-ah1', name: 'Ahorro Emergencia', type: 'savings_fund' },
  { id: 'acc-ah2', name: 'Ahorro Viaje', type: 'savings_fund' },
  { id: 'acc-rec', name: 'Juan por cobrar', type: 'receivable' }
] as const;

beforeEach(() => {
  mockedInferSemanticCategoryWithOpenAI.mockReset();
  mockedInferSemanticCategoryWithOpenAI.mockResolvedValue(null);
  mockedSemanticInstructionUnderstanding.mockReset();
  mockedSemanticInstructionUnderstanding.mockResolvedValue(null);
});

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

  it('A-blocker: gasto incompleto no autoasigna Banco y pide cuenta origen', async () => {
    const result = await interpretTransaction('Gasté 100 en café', accounts as any);
    expect(result.intent).toBe('expense_cash_like');
    expect(result.sourceAccountName).toBeNull();
    expect(result.sourceAccountName).not.toBe('Banco BBVA');
    expect(result.missingFieldKinds).toContain('missingSourceAccount');
    expect(result.nextPrompt).toBe('¿De qué cuenta salió el dinero?');
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

  it('B-natural: resolves natural human aliases only when unique and asks when ambiguous', async () => {
    const withExtraCard = [
      ...accounts,
      { id: 'acc-sears', name: 'Tarjeta Sears', type: 'credit_card' }
    ];

    const liverpool = await interpretTransaction('Gasté 500 con la Liverpool', withExtraCard as any);
    expect(liverpool.sourceAccountName).toBe('Tarjeta Liverpool');
    expect(liverpool.intent).toBe('expense_debt_account');

    const myCard = await interpretTransaction('Gasté 800 con mi tarjeta BBVA', accounts as any);
    expect(myCard.sourceAccountName).toBe('TDC BBVA');
    expect(myCard.intent).toBe('expense_debt_account');

    const laDe = await interpretTransaction('Gasté 350 con la de BBVA', accounts as any);
    expect(laDe.sourceAccountName).toBeNull();
    expect(laDe.missingFieldKinds).toContain('missingSourceAccount');
    expect(laDe.nextPrompt).toContain('Banco BBVA');
    expect(laDe.nextPrompt).toContain('TDC BBVA');

    const incompleteCard = await interpretTransaction('Pagué 400 a la tarjeta de', accounts as any);
    expect(incompleteCard.destinationAccountName).toBeNull();
    expect(incompleteCard.missingFieldKinds).toContain('missingDebtTarget');
  });

  it('B-debit-natural: strong debit phrases resolve to TDD and avoid credit bias', async () => {
    const debitPhrase = await interpretTransaction('Gaste 250 en taxi con tarjeta de debito BBVA', accounts as any);
    expect(debitPhrase.sourceAccountName).toBe('TDD BBVA');
    expect(debitPhrase.missingFieldKinds).toEqual([]);
    expect(debitPhrase.nextPrompt).toBeNull();
    expect(debitPhrase.visibleType).toBe('Gasto con efectivo/banco');

    const shortDebitPhrase = await interpretTransaction('Gaste 250 en taxi con debito BBVA', accounts as any);
    expect(shortDebitPhrase.sourceAccountName).toBe('TDD BBVA');

    const creditRegression = await interpretTransaction('Gaste 250 con tarjeta de credito BBVA', accounts as any);
    expect(creditRegression.sourceAccountName).toBe('TDC BBVA');
    expect(creditRegression.intent).toBe('expense_debt_account');
  });

  it('B-ambiguity: la BBVA keeps full candidate list and does not restrict to credit only', async () => {
    const result = await interpretTransaction('Gaste 500 con la BBVA', accounts as any);
    expect(result.sourceAccountName).toBeNull();
    expect(result.missingFieldKinds).toContain('missingSourceAccount');
    expect(result.nextPrompt).toContain('TDD BBVA');
    expect(result.nextPrompt).toContain('TDC BBVA');
    expect(result.nextPromptAllowedAccountTypes).toContain('operational_cash');
    expect(result.nextPromptAllowedAccountTypes).toContain('credit_card');
  });

  it('B-blocker: resolución de efectivo es case-insensitive y consistente', async () => {
    const upper = await interpretTransaction('Pagué 300 a la TDC BBVA con Efectivo', accounts as any);
    const lower = await interpretTransaction('Pagué 300 a la TDC BBVA con efectivo', accounts as any);
    expect(upper.sourceAccountName).toBe('Efectivo');
    expect(lower.sourceAccountName).toBe('Efectivo');
    expect(upper.destinationAccountName).toBe('TDC BBVA');
    expect(lower.destinationAccountName).toBe('TDC BBVA');
    expect(upper.intent).toBe('debt_payment');
    expect(lower.intent).toBe('debt_payment');
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

  it('reclassifies false receivable payment into income for business destination account', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'receivable_payment',
      visibleType: 'Pago recibido',
      amount: 220,
      sourceAccountHint: 'PrimeIPTV',
      destinationAccountHint: 'PrimeIPTV',
      category: 'pago_recibido',
      missingFields: [],
      confidence: 'high',
      reason: 'Interpretación inicial ambigua'
    });

    const result = await interpretTransaction('Recibi 220 del usuario MCarrillo en PrimeIPTV', accounts as any);
    expect(result.intent).toBe('income');
    expect(result.category).toBe('ingreso_extra');
    expect(result.sourceAccountName).toBeNull();
    expect(result.sourceAccountId).toBeNull();
    expect(result.destinationAccountName).toBe('PrimeIPTV');
  });

  it('keeps business deposit phrasing as normal income (regression)', async () => {
    const result = await interpretTransaction('Me depositaron 220 del usuario MCarrillo en PrimeIPTV', accounts as any);
    expect(result.intent).toBe('income');
    expect(result.category).toBe('ingreso_extra');
    expect(result.destinationAccountName).toBe('PrimeIPTV');
  });

  it('preserves true receivable payment from person', async () => {
    const result = await interpretTransaction('Juan Perez me pago 300 en efectivo', accounts as any);
    expect(result.intent).toBe('receivable_payment');
    expect(result.category).toBe('pago_recibido');
    expect(result.destinationAccountName).toBe('Efectivo');
  });

  it('safety: prevents receivable source and destination from collapsing to the same account', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'receivable_payment',
      visibleType: 'Pago recibido',
      amount: 220,
      sourceAccountHint: 'PrimeIPTV',
      destinationAccountHint: 'PrimeIPTV',
      category: 'pago_recibido',
      missingFields: [],
      confidence: 'high',
      reason: 'Ambiguo'
    });
    const result = await interpretTransaction('Recibi 220 en PrimeIPTV', accounts as any);
    expect(result.sourceAccountId).not.toBe(result.destinationAccountId);
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

  it('C-blocker: source operacional + destination deuda finaliza como debt_payment', async () => {
    const result = await interpretTransaction('Pagué 500 a la TDC BBVA desde TDD BBVA', accounts as any);
    expect(result.sourceAccountName).toBe('TDD BBVA');
    expect(result.destinationAccountName).toBe('TDC BBVA');
    expect(result.intent).toBe('debt_payment');
    expect(result.visibleType).toBe('Pago de deuda');
    expect(result.category).toBe('pago_deuda');
  });

  it('C2-blocker: frase "de deuda con fuente operacional" conserva roles correctos', async () => {
    const result = await interpretTransaction('Pagué 500 de TDC BBVA con TDD BBVA', accounts as any);
    expect(result.intent).toBe('debt_payment');
    expect(result.visibleType).toBe('Pago de deuda');
    expect(result.sourceAccountName).toBe('TDD BBVA');
    expect(result.destinationAccountName).toBe('TDC BBVA');
    expect(result.sourceAccountName).not.toBe(result.destinationAccountName);
    expect(result.category).toBe('pago_deuda');
  });

  it('D-blocker: mantener source TDD y elegir deuda destino finaliza como debt_payment', async () => {
    const start = await interpretTransaction('Pagué 500 a la TDC SCTBNK desde TDD BBVA', accounts as any);
    const resolved = await applyFollowUpAnswer(start, 'TDC Liverpool', accounts as any);
    expect(resolved.sourceAccountName).toBe('TDD BBVA');
    expect(resolved.destinationAccountName).toBe('Tarjeta Liverpool');
    expect(resolved.intent).toBe('debt_payment');
    expect(resolved.category).toBe('pago_deuda');
  });

  it('A/B-blocker-final: deuda desconocida en "de ... con ..." mantiene source y pide destino deuda', async () => {
    const start = await interpretTransaction('Pagué 500 de TDC SCTBNK con TDD BBVA', accounts as any);
    expect(start.intent).toBe('debt_payment');
    expect(start.sourceAccountName).toBe('TDD BBVA');
    expect(start.destinationAccountName).toBeNull();
    expect(start.destinationAccountName).not.toBe('TDD BBVA');
    expect(start.missingFieldKinds).toContain('missingDebtTarget');
    expect(start.nextPrompt).toBe('¿A qué tarjeta o préstamo pagaste?');

    const resolved = await applyFollowUpAnswer(start, 'TDC Liverpool', accounts as any);
    expect(resolved.intent).toBe('debt_payment');
    expect(resolved.visibleType).toBe('Pago de deuda');
    expect(resolved.sourceAccountName).toBe('TDD BBVA');
    expect(resolved.destinationAccountName).toBe('Tarjeta Liverpool');
    expect(resolved.category).toBe('pago_deuda');
  });

  it('E/G-blocker: deuda entre tarjetas mantiene intent y categoría traslado_deuda', async () => {
    const complete = await interpretTransaction('Pagué 1000 de Liverpool con TDC BBVA', accounts as any);
    expect(complete.intent).toBe('debt_transfer');
    expect(complete.visibleType).toBe('Traslado de deuda');
    expect(complete.category).toBe('traslado_deuda');

    const incomplete = await interpretTransaction('Pagué 1000 de Liverpool con', accounts as any);
    const withCardSource = await applyFollowUpAnswer(incomplete, 'TDC BBVA', accounts as any);
    expect(withCardSource.intent).toBe('debt_transfer');
    expect(withCardSource.destinationAccountName).toBe('Tarjeta Liverpool');
    expect(withCardSource.category).toBe('traslado_deuda');
  });

  it('F-blocker: deuda incompleta + source efectivo finaliza como debt_payment', async () => {
    const incomplete = await interpretTransaction('Pagué 1000 de Liverpool con', accounts as any);
    const withCashSource = await applyFollowUpAnswer(incomplete, 'Efectivo', accounts as any);
    expect(withCashSource.intent).toBe('debt_payment');
    expect(withCashSource.destinationAccountName).toBe('Tarjeta Liverpool');
    expect(withCashSource.category).toBe('pago_deuda');
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

  it('D-followup-ambiguity: selecting TDD after "la BBVA" resolves source and moves to missing description', async () => {
    const start = await interpretTransaction('Gaste 500 con la BBVA', accounts as any);
    expect(start.missingFieldKinds).toContain('missingSourceAccount');

    const resolved = await applyFollowUpAnswer(start, 'TDD BBVA', accounts as any);
    expect(resolved.sourceAccountName).toBe('TDD BBVA');
    expect(resolved.missingFieldKinds).toContain('missingWhatWasPaid');
    expect(resolved.missingFieldKinds).not.toContain('missingSourceAccount');
    expect(resolved.nextPrompt).toBe('¿En qué gastaste ese dinero?');
  });

  it('E-followup-ambiguity: selecting TDC after "la BBVA" resolves source and does not re-ask source', async () => {
    const start = await interpretTransaction('Gaste 500 con la BBVA', accounts as any);
    const resolved = await applyFollowUpAnswer(start, 'TDC BBVA', accounts as any);
    expect(resolved.sourceAccountName).toBe('TDC BBVA');
    expect(resolved.missingFieldKinds).toContain('missingWhatWasPaid');
    expect(resolved.missingFieldKinds).not.toContain('missingSourceAccount');
    expect(resolved.nextPrompt).toBe('¿En qué gastaste ese dinero?');
  });

  it('D-followup: descripción libre no cierra gasto con tarjeta genérica si falta tarjeta', async () => {
    const start = await interpretTransaction('Gasté 1000 con tarjeta de crédito', accounts as any);
    expect(start.missingFieldKinds[0]).toBe('missingSourceAccount');
    expect(start.nextPrompt).toBe('¿Con qué tarjeta de crédito pagaste?');

    const afterDescription = await applyFollowUpAnswer(start, 'en restaurante', accounts as any);
    expect(afterDescription.intent).toBe('expense_debt_account');
    expect(afterDescription.sourceAccountName).toBeNull();
    expect(afterDescription.sourceAccountType).toBeNull();
    expect(afterDescription.missingFieldKinds[0]).toBe('missingSourceAccount');
    expect(afterDescription.nextPrompt).toBe('¿Con qué tarjeta de crédito pagaste?');
    expect(afterDescription.humanConfirmation).toBeNull();
  });

  it('D2-followup: gasto con tarjeta genérica solo confirma cuando se elige tarjeta específica', async () => {
    const start = await interpretTransaction('Gasté 1000 con tarjeta de credito', accounts as any);
    expect(start.sourceAccountName).toBeNull();
    expect(start.sourceAccountName).not.toBe('Banco BBVA');
    expect(start.missingFieldKinds).toContain('missingSourceAccount');

    const afterDescription = await applyFollowUpAnswer(start, 'en un viaje', accounts as any);
    expect(afterDescription.sourceAccountName).toBeNull();
    expect(afterDescription.sourceAccountName).not.toBe('Banco BBVA');
    expect(afterDescription.missingFieldKinds).toContain('missingSourceAccount');

    const afterCardSelection = await applyFollowUpAnswer(afterDescription, 'Tarjeta Liverpool', accounts as any);
    expect(afterCardSelection.intent).toBe('expense_debt_account');
    expect(afterCardSelection.sourceAccountName).toBe('Tarjeta Liverpool');
    expect(afterCardSelection.destinationAccountName).toBeNull();
    expect(afterCardSelection.missingFieldKinds).toEqual([]);
    expect(afterCardSelection.humanConfirmation).toContain('gasto con tarjeta de crédito');
  });

  it('D3-followup: texto libre largo mantiene tarjeta pendiente y nunca asigna Banco', async () => {
    const start = await interpretTransaction('Gasté 1000 con tarjeta de credito', accounts as any);
    const afterDescription = await applyFollowUpAnswer(start, 'la cooperacion de la escuela de mi hijo', accounts as any);
    expect(afterDescription.intent).toBe('expense_debt_account');
    expect(afterDescription.sourceAccountName).toBeNull();
    expect(afterDescription.sourceAccountType).toBeNull();
    expect(afterDescription.sourceAccountName).not.toBe('Banco BBVA');
    expect(afterDescription.missingFieldKinds).toContain('missingSourceAccount');
    expect(afterDescription.nextPrompt).toBe('¿Con qué tarjeta de crédito pagaste?');
    expect(afterDescription.humanConfirmation).toBeNull();
  });

  it('D4-followup: seleccionar cuenta no deuda no puede cerrar gasto con tarjeta', async () => {
    const start = await interpretTransaction('Gasté 1000 con tarjeta de credito', accounts as any);
    const resolved = await applyFollowUpAnswer(start, 'Banco BBVA', accounts as any);
    expect(resolved.intent).toBe('expense_debt_account');
    expect(resolved.sourceAccountName).toBeNull();
    expect(resolved.sourceAccountType).toBeNull();
    expect(resolved.missingFieldKinds).toContain('missingSourceAccount');
    expect(resolved.humanConfirmation).toBeNull();
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

  it('hotfix A: gasto con TDD explícita se mantiene como gasto efectivo/banco', async () => {
    const result = await interpretTransaction('Gaste 250 en taxi con TDD BBVA', accounts as any);
    expect(result.visibleType).toBe('Gasto con efectivo/banco');
    expect(result.intent).toBe('expense_cash_like');
    expect(result.sourceAccountName).toBe('TDD BBVA');
    expect(result.destinationAccountName).toBeNull();
    expect(result.category).toBe('transporte');
    expect(result.nextPrompt).not.toBe('¿Con qué tarjeta de crédito pagaste?');
  });

  it('hotfix A2: autolavado con TDD se clasifica como expense_cash_like (no deuda)', async () => {
    const result = await interpretTransaction('Gaste 200 en autolavado de la camioneta con TDD BBVA', accounts as any);
    expect(result.intent).toBe('expense_cash_like');
    expect(result.sourceAccountName).toBe('TDD BBVA');
    expect(result.category).toBe('transporte');
  });

  it('hotfix B: gasto con tarjeta de débito explícita se mantiene cash-like', async () => {
    const result = await interpretTransaction('Gaste 250 en taxi con tarjeta de débito BBVA', accounts as any);
    expect(result.visibleType).toBe('Gasto con efectivo/banco');
    expect(result.intent).toBe('expense_cash_like');
    expect(result.sourceAccountName).toBe('TDD BBVA');
    expect(result.destinationAccountName).toBeNull();
    expect(result.nextPrompt).not.toBe('¿Con qué tarjeta de crédito pagaste?');
  });

  it('hotfix B1: gasto con tarjeta de débito genérica se mantiene cash-like', async () => {
    const result = await interpretTransaction('Gaste 250 en taxi con tarjeta de débito', accounts as any);
    expect(result.intent).toBe('expense_cash_like');
    expect(result.sourceAccountType).toBe('operational_cash');
  });

  it('hotfix B2: gasto con débito BBVA resuelve cuenta operacional existente', async () => {
    const result = await interpretTransaction('Gaste 250 en taxi con debito BBVA', accounts as any);
    expect(result.visibleType).toBe('Gasto con efectivo/banco');
    expect(result.intent).toBe('expense_cash_like');
    expect(result.sourceAccountName).toBe('TDD BBVA');
    expect(result.destinationAccountName).toBeNull();
    expect(result.nextPrompt).not.toBe('¿Con qué tarjeta de crédito pagaste?');
  });

  it('hotfix B/C/D: transferencias preservan roles explícitos de X a Y', async () => {
    const toCash = await interpretTransaction('Transferi 1000 de TDD BBVA a Efectivo', accounts as any);
    expect(toCash.visibleType).toBe('Transferencia entre cuentas');
    expect(toCash.sourceAccountName).toBe('TDD BBVA');
    expect(toCash.destinationAccountName).toBe('Efectivo');

    const toFund = await interpretTransaction('Transferi 500 de TDD BBVA a Fondo de emergencia', accounts as any);
    expect(toFund.sourceAccountName).toBe('TDD BBVA');
    expect(toFund.destinationAccountName).toBe('Ahorro Emergencia');

    const fromFund = await interpretTransaction('Transferi 300 de Fondo de emergencia a TDD BBVA', accounts as any);
    expect(fromFund.sourceAccountName).toBe('Ahorro Emergencia');
    expect(fromFund.destinationAccountName).toBe('TDD BBVA');
  });

  it('hotfix E: pago recibido mantiene destino operacional y categoría', async () => {
    const result = await interpretTransaction('Juan Perez me pago 300 en Efectivo', accounts as any);
    expect(result.visibleType).toBe('Pago recibido');
    expect(result.intent).toBe('receivable_payment');
    expect(result.destinationAccountName).toBe('Efectivo');
    expect(result.category).toBe('pago_recibido');
  });

  it('hotfix F/G regressions: conserva deuda e identifica TDC en gasto', async () => {
    const debtPayment = await interpretTransaction('Pague 500 a la TDC BBVA desde TDD BBVA', accounts as any);
    expect(debtPayment.visibleType).toBe('Pago de deuda');
    expect(debtPayment.sourceAccountName).toBe('TDD BBVA');
    expect(debtPayment.destinationAccountName).toBe('TDC BBVA');

    const creditCardExpense = await interpretTransaction('Gaste 1800 en ropa con TDC BBVA', accounts as any);
    expect(creditCardExpense.visibleType).toBe('Gasto con tarjeta de crédito');
    expect(creditCardExpense.sourceAccountName).toBe('TDC BBVA');
    expect(creditCardExpense.destinationAccountName).toBeNull();

    const creditCardTaxi = await interpretTransaction('Gaste 250 en taxi con TDC BBVA', accounts as any);
    expect(creditCardTaxi.intent).toBe('expense_debt_account');
    expect(creditCardTaxi.visibleType).toBe('Gasto con tarjeta de crédito');
  });

  it('category mapping: refina categorías para frases comunes de gasto e ingreso', async () => {
    const ropa = await interpretTransaction('Gaste 2000 en calzado con TDC BBVA', accounts as any);
    expect(ropa.category).toBe('ropa');

    const comida = await interpretTransaction('Gaste 700 en supermercado con Liverpool', accounts as any);
    expect(comida.category).toBe('comida');

    const entretenimiento = await interpretTransaction('Gaste 250 en Netflix con TDC BBVA', accounts as any);
    expect(entretenimiento.category).toBe('entretenimiento');

    const educacion = await interpretTransaction('Gaste 300 en cooperacion escolar con Efectivo', accounts as any);
    expect(educacion.category).toBe('educación');

    const hogar = await interpretTransaction('Gaste 1000 en una barra de sonido con Sears', accounts as any);
    expect(hogar.category).toBe('hogar');

    const ingresoExtra = await interpretTransaction('Recibi 2000 de la venta de un tv box en TDD BBVA', accounts as any);
    expect(ingresoExtra.category).toBe('ingreso_extra');

    const ingresoFijo = await interpretTransaction('Recibi 3000 de nomina semanal en TDD BBVA', accounts as any);
    expect(ingresoFijo.category).toBe('ingreso_fijo');
  });
});

describe('financial consistency layer (safe mode)', () => {
  function buildIntent(overrides: Record<string, unknown>) {
    return transactionIntentSchema.parse({
      rawText: 'test',
      normalizedText: 'test',
      intent: 'expense_cash_like',
      visibleType: 'Gasto con efectivo/banco',
      action: 'gasto',
      amount: 100,
      description: 'test',
      category: 'otros_gastos',
      sourceAccountId: 'acc-ban',
      sourceAccountName: 'Banco BBVA',
      sourceAccountType: 'operational_cash',
      destinationAccountId: null,
      destinationAccountName: null,
      destinationAccountType: null,
      missingFields: [],
      missingFieldKinds: [],
      nextPrompt: null,
      nextPromptInputType: null,
      nextPromptAllowedAccountTypes: null,
      confidence: 0.9,
      humanConfirmation: 'ok',
      ...overrides
    });
  }

  it('forces destination to null when expense contains destination account', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = buildIntent({
      intent: 'expense_cash_like',
      destinationAccountId: 'acc-tdc',
      destinationAccountName: 'TDC BBVA',
      destinationAccountType: 'credit_card'
    });

    const output = enforceFinancialConsistency(result);
    expect(output).not.toBe(result);
    expect(output.destinationAccountId).toBeNull();
    expect(output.destinationAccountName).toBeNull();
    expect(output.destinationAccountType).toBeNull();
    expect(infoSpy).toHaveBeenCalledWith('[ConsistencyLayer][APPLIED]');
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('intent: expense_cash_like'));
    expect(infoSpy).toHaveBeenCalledWith('fix: destination → null');
    infoSpy.mockRestore();
  });

  it('forces source to null when income contains source account', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = buildIntent({
      intent: 'income',
      action: 'ingreso',
      visibleType: 'Ingreso',
      sourceAccountId: 'acc-ban',
      sourceAccountName: 'Banco BBVA',
      sourceAccountType: 'operational_cash',
      destinationAccountId: 'acc-ah1',
      destinationAccountName: 'Ahorro Emergencia',
      destinationAccountType: 'savings_fund'
    });

    const output = enforceFinancialConsistency(result);
    expect(output).not.toBe(result);
    expect(output.sourceAccountId).toBeNull();
    expect(output.sourceAccountName).toBeNull();
    expect(output.sourceAccountType).toBeNull();
    expect(infoSpy).toHaveBeenCalledWith('[ConsistencyLayer][APPLIED]');
    expect(infoSpy).toHaveBeenCalledWith('intent: income');
    expect(infoSpy).toHaveBeenCalledWith('fix: source → null');
    infoSpy.mockRestore();
  });

  it('preserves source and destination roles for transfer_between_own_accounts', () => {
    const result = buildIntent({
      intent: 'transfer_between_own_accounts',
      action: 'transferencia',
      visibleType: 'Transferencia entre cuentas',
      sourceAccountId: 'acc-ban',
      sourceAccountName: 'Banco BBVA',
      sourceAccountType: 'operational_cash',
      destinationAccountId: 'acc-ah1',
      destinationAccountName: 'Ahorro Emergencia',
      destinationAccountType: 'savings_fund'
    });

    const output = enforceFinancialConsistency(result);
    expect(output.sourceAccountId).toBe('acc-ban');
    expect(output.destinationAccountId).toBe('acc-ah1');
  });

  it('keeps source and destination unchanged for debt_transfer (safe mode)', () => {
    const result = buildIntent({
      intent: 'debt_transfer',
      action: 'pago_deuda',
      visibleType: 'Traslado de deuda',
      sourceAccountId: 'acc-tdc-1',
      sourceAccountName: 'TDC BBVA',
      sourceAccountType: 'credit_card',
      destinationAccountId: 'acc-tdc-2',
      destinationAccountName: 'TDC Liverpool',
      destinationAccountType: 'credit_card'
    });

    const output = enforceFinancialConsistency(result);
    expect(output.sourceAccountId).toBe('acc-tdc-1');
    expect(output.destinationAccountId).toBe('acc-tdc-2');
  });

  it('logs warning when debt payment destination is not debt-type', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = buildIntent({
      intent: 'debt_payment',
      action: 'pago_deuda',
      visibleType: 'Pago de deuda',
      destinationAccountId: 'acc-ban',
      destinationAccountName: 'Banco BBVA',
      destinationAccountType: 'operational_cash'
    });

    enforceFinancialConsistency(result);
    expect(warnSpy).toHaveBeenCalledWith(
      '[ConsistencyLayer] debt_payment destination should be debt-type account',
      expect.objectContaining({ destinationAccountType: 'operational_cash' })
    );
    warnSpy.mockRestore();
  });

  it('logs warning when receivable payment destination is not operational', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = buildIntent({
      intent: 'receivable_payment',
      action: 'pago_recibido',
      visibleType: 'Pago recibido',
      sourceAccountId: 'acc-rec',
      sourceAccountName: 'Juan por cobrar',
      sourceAccountType: 'receivable',
      destinationAccountId: 'acc-tdc',
      destinationAccountName: 'TDC BBVA',
      destinationAccountType: 'credit_card'
    });

    enforceFinancialConsistency(result);
    expect(warnSpy).toHaveBeenCalledWith(
      '[ConsistencyLayer] receivable_payment destination should be operational account',
      expect.objectContaining({ destinationAccountType: 'credit_card' })
    );
    warnSpy.mockRestore();
  });
});

describe('ai-first instruction understanding', () => {
  it('resolves source card from AI hint and asks only what was paid', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      amount: 150,
      sourceAccountHint: 'TDC BBVA',
      destinationAccountHint: null,
      category: 'otros_gastos',
      missingFields: ['missingWhatWasPaid'],
      confidence: 'high',
      reason: 'Falta concepto de compra'
    });

    const result = await interpretTransaction('Gasté 150 con TDC BBVA', accounts as any);
    expect(result.sourceAccountName).toBe('TDC BBVA');
    expect(result.missingFieldKinds).not.toContain('missingSourceAccount');
    expect(result.nextPrompt).toBe('¿En qué gastaste ese dinero?');
    expect(result.nextPromptInputType).toBe('text_input');
  });

  it('uses AI proposal for explicit TDC purchase without follow-up', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      amount: 150,
      sourceAccountHint: 'TDC BBVA',
      destinationAccountHint: null,
      category: 'entretenimiento',
      missingFields: ['missingSourceAccount'],
      confidence: 'high',
      reason: 'Compra en servicio digital'
    });

    const result = await interpretTransaction('Gaste 150 en Canva con TDC BBVA', accounts as any);
    expect(result.interpretationSource).toBe('ai');
    expect(result.intent).toBe('expense_debt_account');
    expect(result.sourceAccountName).toBe('TDC BBVA');
    expect(result.missingFieldKinds).toEqual([]);
  });

  it('classifies "Pague ... en Canva con TDC" as purchase expense and not debt transfer', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      amount: 150,
      sourceAccountHint: 'TDC BBVA',
      destinationAccountHint: null,
      category: 'entretenimiento',
      missingFields: [],
      confidence: 'high',
      reason: 'Pago de servicio'
    });

    const result = await interpretTransaction('Pague 150 en Canva con TDC BBVA', accounts as any);
    expect(result.intent).toBe('expense_debt_account');
    expect(result.intent).not.toBe('debt_transfer');
  });

  it('keeps ambiguity path for "Gaste 500 con la BBVA"', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'expense_cash_like',
      visibleType: 'Gasto con efectivo/banco',
      amount: 500,
      sourceAccountHint: 'BBVA',
      destinationAccountHint: null,
      category: 'otros_gastos',
      missingFields: ['missingSourceAccount'],
      confidence: 'medium',
      reason: 'Referencia ambigua'
    });

    const result = await interpretTransaction('Gaste 500 con la BBVA', accounts as any);
    expect(result.missingFieldKinds).toContain('missingSourceAccount');
    expect(result.sourceAccountName).toBeNull();
  });

  it('keeps valid debt payment after deterministic validation', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'debt_payment',
      visibleType: 'Pago de deuda',
      amount: 500,
      sourceAccountHint: 'TDD BBVA',
      destinationAccountHint: 'TDC BBVA',
      category: 'pago_deuda',
      missingFields: [],
      confidence: 'high',
      reason: 'Pago de tarjeta'
    });

    const result = await interpretTransaction('Pague 500 a la TDC BBVA desde TDD BBVA', accounts as any);
    expect(result.intent).toBe('debt_payment');
    expect(result.sourceAccountType).toBe('operational_cash');
    expect(result.destinationAccountType).toBe('credit_card');
  });

  it('falls back to deterministic interpreter when AI fails', async () => {
    mockedSemanticInstructionUnderstanding.mockRejectedValueOnce(new Error('timeout'));
    const result = await interpretTransaction('Gasté 600 en gasolina con efectivo.', accounts as any);
    expect(result.interpretationSource).toBe('fallback');
    expect(result.intent).toBe('expense_cash_like');
    expect(result.sourceAccountName).toBe('Efectivo');
  });

  it('falls back safely when AI confidence is low', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'debt_transfer',
      visibleType: 'Traslado de deuda',
      amount: 300,
      sourceAccountHint: 'TDD BBVA',
      destinationAccountHint: 'TDC BBVA',
      category: 'traslado_deuda',
      missingFields: [],
      confidence: 'low',
      reason: 'poca confianza'
    });

    const result = await interpretTransaction('Pagué 300 de Liverpool con TDC BBVA', accounts as any);
    expect(result.interpretationSource).toBe('fallback');
    expect(result.intent).toBe('debt_transfer');
    expect(result.sourceAccountType).toBe('credit_card');
  });

  it('reuses accepted AI category and skips second category AI call', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      amount: 150,
      sourceAccountHint: 'TDC BBVA',
      destinationAccountHint: null,
      category: 'entretenimiento',
      missingFields: [],
      confidence: 'high',
      reason: 'Servicio digital'
    });

    const result = await interpretTransaction('Gasté 150 en Canva con TDC BBVA', accounts as any);
    expect(result.category).toBe('entretenimiento');
    expect(mockedInferSemanticCategoryWithOpenAI).not.toHaveBeenCalled();
  });

  it('keeps card follow-up when hint is generic and offers credit-card selector types', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      amount: 150,
      sourceAccountHint: 'tarjeta de crédito',
      destinationAccountHint: null,
      category: 'otros_gastos',
      missingFields: ['missingSourceAccount'],
      confidence: 'high',
      reason: 'Tarjeta no especificada'
    });

    const result = await interpretTransaction('Gasté 150 con tarjeta de crédito', accounts as any);
    expect(result.missingFieldKinds).toContain('missingSourceAccount');
    expect(result.nextPromptInputType).toBe('account_selector');
    expect(result.nextPromptAllowedAccountTypes).toEqual(['credit_card']);
  });

  it('rebuilds full instruction after concept follow-up and keeps semantic category quality', async () => {
    mockedSemanticInstructionUnderstanding
      .mockResolvedValueOnce({
        intent: 'expense_debt_account',
        visibleType: 'Gasto con tarjeta de crédito',
        amount: 150,
        sourceAccountHint: 'TDC BBVA',
        destinationAccountHint: null,
        category: 'otros_gastos',
        missingFields: ['missingWhatWasPaid'],
        confidence: 'high',
        reason: 'Falta concepto'
      })
      .mockResolvedValueOnce({
        intent: 'expense_debt_account',
        visibleType: 'Gasto con tarjeta de crédito',
        amount: 150,
        sourceAccountHint: 'TDC BBVA',
        destinationAccountHint: null,
        category: 'servicios',
        missingFields: [],
        confidence: 'high',
        reason: 'Servicio digital'
      });

    const initial = await interpretTransaction('Gasté 150 con TDC BBVA', accounts as any);
    expect(initial.missingFieldKinds).toEqual(['missingWhatWasPaid']);

    const completed = await applyFollowUpAnswer(initial, 'en Canva', accounts as any);
    expect(completed.description).toContain('Gasté 150 en Canva con TDC BBVA');
    expect(completed.category).toBe('servicios');
    expect(completed.missingFieldKinds).toEqual([]);
    expect(mockedSemanticInstructionUnderstanding).toHaveBeenCalledTimes(2);
  });

  it('keeps category consistency between complete instruction and follow-up completed path', async () => {
    mockedSemanticInstructionUnderstanding.mockResolvedValue({
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      amount: 150,
      sourceAccountHint: 'TDC BBVA',
      destinationAccountHint: null,
      category: 'servicios',
      missingFields: [],
      confidence: 'high',
      reason: 'Servicio digital'
    });

    const complete = await interpretTransaction('Gasté 150 en Canva con TDC BBVA', accounts as any);

    mockedSemanticInstructionUnderstanding
      .mockResolvedValueOnce({
        intent: 'expense_debt_account',
        visibleType: 'Gasto con tarjeta de crédito',
        amount: 150,
        sourceAccountHint: 'TDC BBVA',
        destinationAccountHint: null,
        category: 'otros_gastos',
        missingFields: ['missingWhatWasPaid'],
        confidence: 'high',
        reason: 'Falta concepto'
      })
      .mockResolvedValueOnce({
        intent: 'expense_debt_account',
        visibleType: 'Gasto con tarjeta de crédito',
        amount: 150,
        sourceAccountHint: 'TDC BBVA',
        destinationAccountHint: null,
        category: 'servicios',
        missingFields: [],
        confidence: 'high',
        reason: 'Servicio digital'
      });
    const incomplete = await interpretTransaction('Gasté 150 con TDC BBVA', accounts as any);
    const completed = await applyFollowUpAnswer(incomplete, 'en Canva', accounts as any);
    expect(completed.category).toBe(complete.category);
  });

  it('rebuilds after concept + card selection flow for generic tarjeta', async () => {
    mockedSemanticInstructionUnderstanding
      .mockResolvedValueOnce({
        intent: 'expense_debt_account',
        visibleType: 'Gasto con tarjeta de crédito',
        amount: 150,
        sourceAccountHint: 'tarjeta de crédito',
        destinationAccountHint: null,
        category: 'otros_gastos',
        missingFields: ['missingSourceAccount', 'missingWhatWasPaid'],
        confidence: 'high',
        reason: 'Falta tarjeta y concepto'
      })
      .mockResolvedValueOnce({
        intent: 'expense_debt_account',
        visibleType: 'Gasto con tarjeta de crédito',
        amount: 150,
        sourceAccountHint: 'tarjeta de crédito',
        destinationAccountHint: null,
        category: 'otros_gastos',
        missingFields: ['missingSourceAccount'],
        confidence: 'high',
        reason: 'Falta tarjeta'
      })
      .mockResolvedValueOnce({
        intent: 'expense_debt_account',
        visibleType: 'Gasto con tarjeta de crédito',
        amount: 150,
        sourceAccountHint: 'TDC BBVA',
        destinationAccountHint: null,
        category: 'servicios',
        missingFields: [],
        confidence: 'high',
        reason: 'Servicio digital con tarjeta'
      });

    const start = await interpretTransaction('Gasté 150 con tarjeta de crédito', accounts as any);
    const withConcept = await applyFollowUpAnswer(start, 'en Canva', accounts as any);
    expect(withConcept.missingFieldKinds).toContain('missingSourceAccount');
    const withCard = await applyFollowUpAnswer(withConcept, 'TDC BBVA', accounts as any);
    expect(withCard.category).toBe('servicios');
    expect(withCard.description).toContain('Gasté 150 en Canva con TDC BBVA');
    expect(mockedSemanticInstructionUnderstanding).toHaveBeenCalledTimes(3);
  });
});

it('resolves debt-typed credit cards (deuda + subtype credit_card) without empty selector loop', async () => {
  const debtTypedAccounts = [
    { id: 'acc-ef', name: 'Efectivo', type: 'operational_cash' },
    { id: 'acc-tdc', name: 'TDC BBVA', type: 'deuda', subtype: 'credit_card' }
  ];
  mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
    intent: 'expense_debt_account',
    visibleType: 'Gasto con tarjeta de crédito',
    amount: 150,
    sourceAccountHint: 'TDC BBVA',
    destinationAccountHint: null,
    category: 'otros_gastos',
    missingFields: ['missingWhatWasPaid'],
    confidence: 'high',
    reason: 'Compra con tarjeta'
  });

  const result = await interpretTransaction('Gasté 150 con TDC BBVA', debtTypedAccounts as any);
  expect(result.sourceAccountName).toBe('TDC BBVA');
  expect(result.sourceAccountType).toBe('credit_card');
  expect(result.missingFieldKinds).not.toContain('missingSourceAccount');
});

it('exact account name match wins before alias/fallback matching', async () => {
  const exactPriorityAccounts = [
    { id: 'acc-tdc-bbva', name: 'TDC BBVA', type: 'credit_card', aliases: ['BBVA'] },
    { id: 'acc-tdc-banamex', name: 'TDC Banamex', type: 'credit_card', aliases: ['TDC BBVA alias'] }
  ];
  mockedSemanticInstructionUnderstanding.mockResolvedValueOnce({
    intent: 'expense_debt_account',
    visibleType: 'Gasto con tarjeta de crédito',
    amount: 150,
    sourceAccountHint: 'TDC BBVA',
    destinationAccountHint: null,
    category: 'entretenimiento',
    missingFields: [],
    confidence: 'high',
    reason: 'Compra explícita'
  });

  const result = await interpretTransaction('Gasté 150 en Canva con TDC BBVA', exactPriorityAccounts as any);
  expect(result.sourceAccountName).toBe('TDC BBVA');
  expect(result.missingFieldKinds).not.toContain('missingSourceAccount');
});

it('semantic categories A-I: classifies representative phrases correctly', async () => {
    const camioneta = await interpretTransaction('Gaste 6100 de la mensualidad de mi camioneta con TDD BBVA', accounts as any);
    expect(camioneta.category).toBe('transporte');

    const pizza = await interpretTransaction('Gaste 280 en pizza con TDD BBVA', accounts as any);
    expect(pizza.category).toBe('comida');

    const oxxo = await interpretTransaction('Gaste 180 en Oxxo en botana y cerveza con efectivo', accounts as any);
    expect(oxxo.category).toBe('comida');

    const primeVideo = await interpretTransaction('Gaste 240 en Prime Video con TDC BBVA', accounts as any);
    expect(primeVideo.category).toBe('entretenimiento');

    const escolar = await interpretTransaction('Gaste 300 en cooperacion escolar con Efectivo', accounts as any);
    expect(escolar.category).toBe('educación');

    const barraSonido = await interpretTransaction('Gaste 1000 en una barra de sonido con Sears', accounts as any);
    expect(barraSonido.category).toBe('hogar');

    const imprevisto = await interpretTransaction('Gaste 180 en un imprevisto con efectivo', accounts as any);
    expect(imprevisto.category).toBe('otros_gastos');

    const venta = await interpretTransaction('Recibi 2000 de la venta de un tv box en TDD BBVA', accounts as any);
    expect(venta.category).toBe('ingreso_extra');

    const nomina = await interpretTransaction('Recibi 3000 de nomina semanal en TDD BBVA', accounts as any);
    expect(nomina.category).toBe('ingreso_fijo');
  });

  it('semantic category fallback J: invalid or low-confidence AI output keeps deterministic local category', async () => {
    mockedInferSemanticCategoryWithOpenAI.mockResolvedValueOnce({
      category: 'categoria_invalida',
      confidence: 'high',
      reason: 'invalid'
    } as any);
    const invalidCategory = await interpretTransaction('Gaste 280 en pizza con TDD BBVA', accounts as any);
    expect(invalidCategory.category).toBe('comida');

    mockedInferSemanticCategoryWithOpenAI.mockResolvedValueOnce({
      category: 'comida',
      confidence: 'low',
      reason: 'uncertain'
    });
    const lowConfidence = await interpretTransaction('Gaste 240 en Prime Video con TDC BBVA', accounts as any);
    expect(lowConfidence.category).toBe('entretenimiento');

    mockedInferSemanticCategoryWithOpenAI.mockRejectedValueOnce(new Error('timeout'));
    const openAIFailure = await interpretTransaction('Gaste 180 en un imprevisto con efectivo', accounts as any);
    expect(openAIFailure.category).toBe('otros_gastos');
  });
