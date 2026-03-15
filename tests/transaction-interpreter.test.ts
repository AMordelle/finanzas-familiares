import { describe, expect, it } from 'vitest';
import { interpretTransaction } from '@/lib/ai/transactionInterpreter';

describe('transaction interpreter', () => {
  it('interpreta gasto con efectivo', async () => {
    const result = await interpretTransaction('Gasté 600 en gasolina con efectivo');
    expect(result.action).toBe('gasto');
    expect(result.amount).toBe(600);
    expect(result.sourceAccount).toBe('efectivo');
    expect(result.missingFields).toEqual([]);
  });

  it('interpreta ingreso por tiempo extra', async () => {
    const result = await interpretTransaction('Recibí 3000 de tiempo extra');
    expect(result.action).toBe('ingreso');
    expect(result.amount).toBe(3000);
  });
});
