import { describe, expect, it } from 'vitest';
import { semanticInstructionResponseSchema, semanticInstructionSystemPrompt } from '@/lib/ai/semanticInstruction';

describe('semantic instruction response schema', () => {
  it('includes every property key in required to satisfy Responses API validation', () => {
    const propertyKeys = Object.keys(semanticInstructionResponseSchema.properties).sort();
    const requiredKeys = [...semanticInstructionResponseSchema.required].sort();

    expect(requiredKeys).toEqual(propertyKeys);
    expect(requiredKeys).toContain('visibleType');
  });

  it('prioritizes debit markers as cash-like and credit markers as debt-account without bank hardcoding', () => {
    expect(semanticInstructionSystemPrompt).toContain('interpreta por tipo de instrumento financiero, no por marca del banco');
    expect(semanticInstructionSystemPrompt).toContain('tdc, tarjeta de crédito, credito o credit card');
    expect(semanticInstructionSystemPrompt).toContain('intent=expense_debt_account');
    expect(semanticInstructionSystemPrompt).toContain('tdd, tarjeta de débito, debito, debit card');
    expect(semanticInstructionSystemPrompt).toContain('intent=expense_cash_like');
    expect(semanticInstructionSystemPrompt).toContain('BBVA, Santander, HSBC, Scotiabank');
    expect(semanticInstructionSystemPrompt).toContain('si el dinero entra en una cuenta operativa de negocio/ingresos');
    expect(semanticInstructionSystemPrompt).toContain('prefiere intent=income y category=ingreso_extra');
  });
});
