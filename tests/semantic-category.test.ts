import { describe, expect, it } from 'vitest';
import { formatCategoryLabel, resolveCategoryInput } from '@/lib/ai/semanticCategory';

describe('category input helpers', () => {
  it('formats internal category names for UI labels', () => {
    expect(formatCategoryLabel('otros_gastos')).toBe('Otros gastos');
    expect(formatCategoryLabel('ingreso_extra')).toBe('Ingreso extra');
  });

  it('normalizes new category names consistently', () => {
    const resolved = resolveCategoryInput('Gasto escolar');
    expect(resolved).toMatchObject({ value: 'gasto_escolar', error: null, isNew: true, label: 'Gasto escolar' });
  });

  it('rejects empty or unsafe category names after normalization', () => {
    expect(resolveCategoryInput('   ').error).toBe('La categoría no puede estar vacía.');
    expect(resolveCategoryInput('!!!').error).toBe('La categoría debe incluir letras o números.');
  });
});
