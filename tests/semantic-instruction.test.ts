import { describe, expect, it } from 'vitest';
import { semanticInstructionResponseSchema } from '@/lib/ai/semanticInstruction';

describe('semantic instruction response schema', () => {
  it('includes every property key in required to satisfy Responses API validation', () => {
    const propertyKeys = Object.keys(semanticInstructionResponseSchema.properties).sort();
    const requiredKeys = [...semanticInstructionResponseSchema.required].sort();

    expect(requiredKeys).toEqual(propertyKeys);
    expect(requiredKeys).toContain('visibleType');
  });
});
