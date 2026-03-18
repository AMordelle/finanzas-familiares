import { describe, expect, it } from 'vitest';
import { interpretTransaction } from '@/lib/ai/transactionInterpreter';

const accounts = [
  { name: 'Banco', type: 'operational_cash' },
  { name: 'TDC BBVA', type: 'credit_card' },
  { name: 'Préstamo auto', type: 'loan' }
];

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

  it('prefiere pago_deuda cuando detecta cuenta de deuda destino', async () => {
    const result = await interpretTransaction('Pagué 500 a la TDC BBVA desde Banco', accounts);

    expect(result.action).toBe('pago_deuda');
    expect(result.destinationAccount).toBe('tdc bbva');
    expect(result.sourceAccount).toBe('banco');
    expect(result.category).toBe('pago_deuda');
    expect(result.humanConfirmation).toContain('Registrar pago de deuda de $500');
  });
});
