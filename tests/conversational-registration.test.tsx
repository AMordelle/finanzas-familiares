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


const categoryCatalog = [
  { id: 'cat-comida', name: 'Comida', key: 'comida', type: 'expense' as const, noProjectable: false, subcategories: [{ id: 'sub-oxxo', name: 'Oxxo', key: 'oxxo' }] },
  { id: 'cat-ingreso-extra', name: 'Ingreso extra', key: 'ingreso_extra', type: 'income' as const, noProjectable: false, subcategories: [{ id: 'sub-prime', name: 'PrimeIPTV', key: 'prime_iptv' }] },
  { id: 'cat-transporte', name: 'Transporte', key: 'transporte', type: 'expense' as const, noProjectable: false, subcategories: [] }
];

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
        categoryCatalog={categoryCatalog}
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
        categoryCatalog={categoryCatalog}
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
        categoryCatalog={categoryCatalog}
      />
    );

    expect(html).toContain('<option value="TDC BBVA">TDC BBVA</option>');
    expect(html).toContain('<option value="TDC SEARS">TDC SEARS</option>');
  });

  it('shows warning for a suggested category that is not in the catalog', () => {
    const batch = {
      mode: 'batch' as const,
      items: [
        buildIntent({ rawText: '300 escuela desde efectivo', amount: 300, category: 'gasto_escolar', sourceAccountName: 'Efectivo', sourceAccountType: 'operational_cash' })
      ],
      missingFields: [],
      needsConfirmation: true
    };

    const html = renderToStaticMarkup(
      <ConversationalRegistration
        hasHousehold
        accounts={[{ id: 'acc-ef', name: 'Efectivo', type: 'operational_cash' }]}
        initialInterpretation={batch}
        categoryCatalog={categoryCatalog}
      />
    );

    expect(html).toContain('La categoría sugerida no existe en tu catálogo.');
    expect(html).toContain('Selecciona una categoría');
  });

});


describe('ConversationalRegistration batch category preview', () => {
  it('renders editable category controls for each detected batch movement', () => {
    const batch = {
      mode: 'batch' as const,
      items: [
        buildIntent({ rawText: 'Gasté 300 en Oxxo con TDD BBVA', amount: 300, category: 'comida', sourceAccountName: 'TDD BBVA', sourceAccountType: 'operational_cash' }),
        buildIntent({ rawText: 'Recibí 200 de Juan en PrimeIPTV', intent: 'income', visibleType: 'Ingreso', action: 'ingreso', amount: 200, category: 'ingreso_extra', destinationAccountName: 'PrimeIPTV', destinationAccountType: 'operational_cash' })
      ],
      missingFields: [],
      needsConfirmation: true
    };

    const html = renderToStaticMarkup(
      <ConversationalRegistration
        hasHousehold
        accounts={[{ id: 'acc-tdd', name: 'TDD BBVA', type: 'operational_cash' }]}
        initialInterpretation={batch}
        categoryCatalog={categoryCatalog}
      />
    );

    expect(html).toContain('Detecté 2 movimientos');
    expect(html.match(/Categoría/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('<option value="comida" selected="">Comida</option>');
    expect(html).toContain('<option value="ingreso_extra" selected="">Ingreso extra</option>');
    expect(html).not.toContain('Nueva categoría...');
  });
});
