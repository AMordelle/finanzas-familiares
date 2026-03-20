import { describe, expect, it } from 'vitest';
import { interpretTransaction } from '@/lib/ai/transactionInterpreter';

const accounts = [
  { id: 'a1', name: 'Banco', type: 'operational_cash' },
  { id: 'a2', name: 'Efectivo', type: 'operational_cash' },
  { id: 'a3', name: 'TDC BBVA', type: 'credit_card', aliases: ['tarjeta bbva', 'bbva tarjeta'] },
  { id: 'a4', name: 'Tarjeta Liverpool', type: 'credit_card', aliases: ['liverpool'] },
  { id: 'a5', name: 'Fondo de emergencia', type: 'savings_fund', aliases: ['fondo emergencia'] },
  { id: 'a6', name: 'Vacaciones', type: 'savings_fund' },
  { id: 'a7', name: 'Juan me debe', type: 'receivable', aliases: ['juan'] }
];

describe('transaction interpreter - modelo unificado', () => {
  it('A) interpreta income', async () => {
    const result = await interpretTransaction('Recibí 3000 en banco', accounts);
    expect(result.action).toBe('income');
    expect(result.amount).toBe(3000);
    expect(result.destinationAccount).toBe('Banco');
  });

  it('B) interpreta expense_cash_like', async () => {
    const result = await interpretTransaction('Gasté 300 en cena con efectivo', accounts);
    expect(result.action).toBe('expense_cash_like');
    expect(result.sourceAccount).toBe('Efectivo');
  });

  it('C) interpreta compra con tarjeta como expense_debt_account', async () => {
    const result = await interpretTransaction('Gasté 2000 en ropa con TDC BBVA', accounts);
    expect(result.action).toBe('expense_debt_account');
    expect(result.sourceAccount).toBe('TDC BBVA');
  });

  it('D) interpreta pago de deuda', async () => {
    const result = await interpretTransaction('Pagué 500 a la TDC BBVA desde banco', accounts);
    expect(result.action).toBe('debt_payment');
    expect(result.sourceAccount).toBe('Banco');
    expect(result.destinationAccount).toBe('TDC BBVA');
  });

  it('E) interpreta traslado de deuda entre tarjetas', async () => {
    const result = await interpretTransaction('Pagué Liverpool con la TDC BBVA', accounts);
    expect(result.action).toBe('debt_transfer');
    expect(result.sourceAccount).toBe('TDC BBVA');
    expect(result.destinationAccount).toBe('Tarjeta Liverpool');
  });

  it('F) interpreta aporte a ahorro', async () => {
    const result = await interpretTransaction('Aparté 500 para vacaciones desde banco', accounts);
    expect(result.action).toBe('savings_contribution');
  });

  it('G) interpreta receivable_created', async () => {
    const result = await interpretTransaction('Presté 800 a Juan', accounts);
    expect(result.action).toBe('receivable_created');
  });

  it('H) interpreta receivable_payment', async () => {
    const result = await interpretTransaction('Juan me pagó 300 en efectivo', accounts);
    expect(result.action).toBe('receivable_payment');
  });

  it('I) pagué 500 mantiene ambigüedad con missing fields', async () => {
    const result = await interpretTransaction('Pagué 500', accounts);
    expect(result.missingFields.length).toBeGreaterThan(0);
  });

  it('J) gasté 300 solicita cuenta origen', async () => {
    const result = await interpretTransaction('Gasté 300', accounts);
    expect(result.action).toBe('expense_cash_like');
    expect(result.missingFields).toContain('sourceAccount');
  });
});
