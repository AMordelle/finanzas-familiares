import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConversationalRegistration } from '@/components/registro/conversational-registration';
import { transactionIntentSchema, type TransactionIntent } from '@/lib/ai/transactionInterpreter';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() })
}));

vi.mock('@/app/registro/actions', () => ({
  interpretTransactionAction: vi.fn(),
  applyFollowUpAnswerAction: vi.fn(),
  saveInterpretedTransactionAction: vi.fn(),
  saveInterpretedTransactionBatchAction: vi.fn()
}));

function buildIntent(partial: Partial<TransactionIntent>): TransactionIntent {
  return transactionIntentSchema.parse({
    rawText: 'movimiento',
    normalizedText: 'movimiento',
    intent: 'expense_cash_like',
    visibleType: 'Gasto con efectivo/banco',
    action: 'gasto',
    amount: 99,
    description: 'Oxxo',
    category: 'comida',
    sourceAccountId: null,
    sourceAccountName: null,
    sourceAccountType: null,
    destinationAccountId: null,
    destinationAccountName: null,
    destinationAccountType: null,
    missingFields: [],
    missingFieldKinds: [],
    nextPrompt: null,
    nextPromptInputType: null,
    nextPromptAllowedAccountTypes: null,
    confidence: 0.9,
    humanConfirmation: 'confirm',
    ...partial
  });
}

describe('ConversationalRegistration follow-up sync', () => {
  it('does not render follow-up when source is resolved and missing fields are empty', () => {
    const resolvedIntent = buildIntent({
      rawText: 'Gasté 99 en el Oxxo con TDC BBVA',
      normalizedText: 'gaste 99 en el oxxo con tdc bbva',
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      sourceAccountId: 'acc-tdc',
      sourceAccountName: 'TDC BBVA',
      sourceAccountType: 'loan',
      missingFieldKinds: [],
      humanConfirmation: 'Registrar gasto con tarjeta de crédito de $99.00 desde TDC BBVA.'
    });

    const html = renderToStaticMarkup(
      <ConversationalRegistration
        hasHousehold
        accounts={[{ id: 'acc-tdc', name: 'TDC BBVA', type: 'loan' }]}
        initialIntent={resolvedIntent}
      />
    );

    expect(html).toContain('Confirmación');
    expect(html).not.toContain('Faltan datos para completar el movimiento');
    expect(html).not.toContain('¿Con qué tarjeta de crédito pagaste?');
  });

  it('keeps follow-up for unresolved generic credit-card expense', () => {
    const unresolvedIntent = buildIntent({
      rawText: 'Gasté 99 con tarjeta de crédito',
      normalizedText: 'gaste 99 con tarjeta de credito',
      intent: 'expense_debt_account',
      visibleType: 'Gasto con tarjeta de crédito',
      missingFieldKinds: ['missingSourceAccount'],
      nextPrompt: '¿Con qué tarjeta de crédito pagaste?',
      nextPromptInputType: 'account_selector',
      nextPromptAllowedAccountTypes: ['credit_card', 'loan']
    });

    const html = renderToStaticMarkup(
      <ConversationalRegistration
        hasHousehold
        accounts={[{ id: 'acc-tdc', name: 'TDC BBVA', type: 'credit_card' }]}
        initialIntent={unresolvedIntent}
      />
    );

    expect(html).toContain('Faltan datos para completar el movimiento');
    expect(html).toContain('¿Con qué tarjeta de crédito pagaste?');
    expect(html).not.toContain('Confirmación');
  });

  it('includes loan-typed TDC accounts in selector when follow-up is truly needed', () => {
    const unresolvedIntent = buildIntent({
      intent: 'expense_debt_account',
      missingFieldKinds: ['missingSourceAccount'],
      nextPrompt: '¿Con qué tarjeta de crédito pagaste?',
      nextPromptInputType: 'account_selector',
      nextPromptAllowedAccountTypes: ['credit_card', 'loan']
    });

    const html = renderToStaticMarkup(
      <ConversationalRegistration
        hasHousehold
        accounts={[
          { id: 'acc-loan-tdc', name: 'TDC BBVA', type: 'loan' },
          { id: 'acc-card', name: 'TDC SEARS', type: 'credit_card' }
        ]}
        initialIntent={unresolvedIntent}
      />
    );

    expect(html).toContain('<option value="TDC BBVA">TDC BBVA</option>');
    expect(html).toContain('<option value="TDC SEARS">TDC SEARS</option>');
  });
});
