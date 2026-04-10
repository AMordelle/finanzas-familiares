import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inferSemanticCategoryWithOpenAI } from '@/lib/ai/openai';
import { semanticCategoryInferenceWithAIDetails } from '@/lib/ai/semanticCategory';

vi.mock('@/lib/ai/openai', () => ({
  inferSemanticCategoryWithOpenAI: vi.fn()
}));

const mockedInferSemanticCategoryWithOpenAI = vi.mocked(inferSemanticCategoryWithOpenAI);

describe('semantic category observability', () => {
  beforeEach(() => {
    mockedInferSemanticCategoryWithOpenAI.mockReset();
  });

  it('uses AI result when category is valid with medium/high confidence', async () => {
    mockedInferSemanticCategoryWithOpenAI.mockResolvedValue({
      category: 'trabajo',
      confidence: 'medium',
      reason: 'merchant indicates business expense'
    });

    const result = await semanticCategoryInferenceWithAIDetails({
      text: 'Gaste 150 en Canva con TDC BBVA',
      normalizedText: 'gaste 150 en canva con tdc bbva',
      intent: 'expense_debt_account'
    });

    expect(result.category).toBe('trabajo');
    expect(result.categorySource).toBe('ai');
    expect(result.categoryConfidence).toBe('medium');
    expect(result.categoryReason).toContain('business expense');
    expect(result.categoryDebugError).toBeNull();
  });

  it('falls back when AI category is outside approved catalog', async () => {
    mockedInferSemanticCategoryWithOpenAI.mockResolvedValue({
      category: 'categoria_invalida',
      confidence: 'high',
      reason: 'invalid output'
    } as any);

    const result = await semanticCategoryInferenceWithAIDetails({
      text: 'Gaste 320 en algo con TDD BBVA',
      normalizedText: 'gaste 320 en algo con tdd bbva',
      intent: 'expense_cash_like'
    });

    expect(result.categorySource).toBe('fallback');
    expect(result.category).toBe('otros_gastos');
    expect(result.categoryReason).toContain('not approved catalog');
  });

  it('falls back when AI confidence is low', async () => {
    mockedInferSemanticCategoryWithOpenAI.mockResolvedValue({
      category: 'trabajo',
      confidence: 'low',
      reason: 'weak signal'
    });

    const result = await semanticCategoryInferenceWithAIDetails({
      text: 'Gaste 150 en Canva con TDC BBVA',
      normalizedText: 'gaste 150 en canva con tdc bbva',
      intent: 'expense_debt_account'
    });

    expect(result.categorySource).toBe('fallback');
    expect(result.category).toBe('otros_gastos');
    expect(result.categoryConfidence).toBe('low');
    expect(result.categoryReason).toContain('confidence too low');
  });

  it('falls back with debug error when AI throws', async () => {
    mockedInferSemanticCategoryWithOpenAI.mockRejectedValue(new Error('timeout'));

    const result = await semanticCategoryInferenceWithAIDetails({
      text: 'Gaste 150 en Canva con TDC BBVA',
      normalizedText: 'gaste 150 en canva con tdc bbva',
      intent: 'expense_debt_account'
    });

    expect(result.categorySource).toBe('fallback');
    expect(result.category).toBe('otros_gastos');
    expect(result.categoryDebugError).toBe('timeout');
  });

  it('uses system override categories for debt movement intents', async () => {
    const debtPayment = await semanticCategoryInferenceWithAIDetails({
      text: 'Pague 500 a la TDC BBVA desde TDD BBVA',
      normalizedText: 'pague 500 a la tdc bbva desde tdd bbva',
      intent: 'debt_payment'
    });

    const debtTransfer = await semanticCategoryInferenceWithAIDetails({
      text: 'Pague Liverpool con TDC BBVA',
      normalizedText: 'pague liverpool con tdc bbva',
      intent: 'debt_transfer'
    });

    expect(debtPayment.category).toBe('pago_deuda');
    expect(debtPayment.categorySource).toBe('system');
    expect(debtTransfer.category).toBe('traslado_deuda');
    expect(debtTransfer.categorySource).toBe('system');
    expect(mockedInferSemanticCategoryWithOpenAI).not.toHaveBeenCalled();
  });
});
