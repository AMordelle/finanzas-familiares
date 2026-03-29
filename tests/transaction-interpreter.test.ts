import { describe, expect, it } from 'vitest';
import { interpretTransaction } from '@/lib/ai/transactionInterpreter';

const accounts = [
  { id: 'acc-efectivo', name: 'Efectivo', type: 'operational_cash' },
  { id: 'acc-banco', name: 'Banco BBVA', type: 'operational_cash' },
  { id: 'acc-fondo', name: 'Fondo de emergencia', type: 'savings_fund' },
  { id: 'acc-tdc-bbva', name: 'TDC BBVA', type: 'credit_card' },
  { id: 'acc-liverpool', name: 'Tarjeta Liverpool', type: 'credit_card' }
];

describe('transaction interpreter - context aware pipeline', () => {
  it('A) interpreta gasto con efectivo, categoría comida y sin follow-up', async () => {
    const result = await interpretTransaction('Gasté 300 en cena con efectivo', accounts);
    expect(result.action).toBe('expense_cash_like');
    expect(result.visibleType).toBe('Gasto con efectivo/banco');
    expect(result.category).toBe('comida');
    expect(result.destinationAccount).toBeNull();
    expect(result.destinationAccountId).toBeNull();
    expect(result.missingFields).toEqual([]);
  });

  it('B) ignora puntuación final en gasto equivalente', async () => {
    const result = await interpretTransaction('Gasté 300 en cena con efectivo.', accounts);
    expect(result.action).toBe('expense_cash_like');
    expect(result.visibleType).toBe('Gasto con efectivo/banco');
    expect(result.category).toBe('comida');
    expect(result.missingFields).toEqual([]);
  });

  it('C) detecta transporte para taxi con banco', async () => {
    const result = await interpretTransaction('Gasté 200 en taxi con banco', accounts);
    expect(result.action).toBe('expense_cash_like');
    expect(result.visibleType).toBe('Gasto con efectivo/banco');
    expect(result.category).toBe('transporte');
  });

  it('D) detecta ingreso extra por tiempo extra en banco', async () => {
    const result = await interpretTransaction('Recibí 2000 de tiempo extra en banco', accounts);
    expect(result.action).toBe('income');
    expect(result.visibleType).toBe('Ingreso');
    expect(result.category).toBe('ingreso_extra');
  });

  it('E) reconoce gasto con tarjeta de crédito', async () => {
    const result = await interpretTransaction('Gasté 2000 en ropa con TDC BBVA', accounts);
    expect(result.action).toBe('expense_debt_account');
    expect(result.visibleType).toBe('Gasto con tarjeta de crédito');
    expect(result.category).toBe('ropa');
    expect(result.destinationAccount).toBeNull();
    expect(result.destinationAccountName).toBeNull();
  });

  it('F) frase mixta sigue siendo gasto con tarjeta, no pago de deuda', async () => {
    const result = await interpretTransaction('Gaste 2000 en ropa y pagué con TDC BBVA', accounts);
    expect(result.action).toBe('expense_debt_account');
    expect(result.visibleType).toBe('Gasto con tarjeta de crédito');
    expect(result.category).toBe('ropa');
  });

  it('G) interpreta pago de deuda de banco a TDC', async () => {
    const result = await interpretTransaction('Pagué 500 a la TDC BBVA desde banco', accounts);
    expect(result.action).toBe('debt_payment');
    expect(result.visibleType).toBe('Pago de deuda');
    expect(result.category).toBe('deuda');
  });

  it('H) interpreta traslado de deuda tarjeta->tarjeta', async () => {
    const result = await interpretTransaction('Pagué Liverpool con la TDC BBVA', accounts);
    expect(result.action).toBe('debt_transfer');
    expect(result.visibleType).toBe('Traslado de deuda');
    expect(result.category).toBe('traslado_deuda');
  });

  it('I) Gasté 300 pide solo cuenta origen', async () => {
    const result = await interpretTransaction('Gasté 300', accounts);
    expect(result.missingFields).toEqual(['sourceAccount']);
  });

  it('J) Pagué 500 pide qué se pagó y cuenta origen cuando falta contexto', async () => {
    const result = await interpretTransaction('Pagué 500', accounts);
    expect(result.missingFields).toContain('whatWasPaid');
    expect(result.missingFields).toContain('sourceAccount');
  });

  it('K) Gasté 500 con Liverpool usa catálogo y resuelve tarjeta', async () => {
    const result = await interpretTransaction('Gasté 500 con Liverpool', accounts);
    expect(result.action).toBe('expense_debt_account');
    expect(result.visibleType).toBe('Gasto con tarjeta de crédito');
    expect(result.category).toBe('otros_gastos');
    expect(result.sourceAccountName).toBe('Tarjeta Liverpool');
  });

  it('D-regresión) pagos/transferencias de deuda y transferencias mantienen destino', async () => {
    const debtPayment = await interpretTransaction('Pagué 500 a la Tarjeta Liverpool desde efectivo', accounts);
    const debtTransfer = await interpretTransaction('Pagué Liverpool con la TDC BBVA', accounts);
    const ownTransfer = await interpretTransaction('Transferí 1000 de Banco BBVA al Fondo de emergencia', accounts);

    expect(debtPayment.destinationAccount).toBeTruthy();
    expect(debtTransfer.destinationAccount).toBeTruthy();
    expect(ownTransfer.destinationAccount).toBeTruthy();
  });

  it('L) Pagué 500 a la BBVA pide aclaración por ambigüedad banco/tarjeta', async () => {
    const result = await interpretTransaction('Pagué 500 a la BBVA', accounts);
    expect(result.missingFields).toContain('destinationAccount');
  });
});
