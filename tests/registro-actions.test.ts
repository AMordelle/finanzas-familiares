import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseMock = vi.fn();
const enforceFinancialConsistencyMock = vi.fn();
const applyFollowUpAnswerMock = vi.fn();
const saveMock = vi.fn();
const saveBatchMock = vi.fn();
const interpretTransactionsMock = vi.fn();
const revalidatePathMock = vi.fn();

describe('registro actions revalidation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    parseMock.mockImplementation((payload) => payload);
    enforceFinancialConsistencyMock.mockImplementation((payload) => payload);

    vi.doMock('next/cache', () => ({
      revalidatePath: revalidatePathMock
    }));

    vi.doMock('@/lib/ai/semanticCategory', () => ({
      isApprovedCategory: (category: string) => ['comida', 'transporte', 'servicios', 'otros_gastos'].includes(category)
    }));

    vi.doMock('@/lib/ai/transactionInterpreter', () => ({
      interpretTransactions: interpretTransactionsMock,
      interpretTransaction: vi.fn(),
      applyFollowUpAnswer: applyFollowUpAnswerMock,
      enforceFinancialConsistency: enforceFinancialConsistencyMock,
      transactionIntentSchema: {
        parse: parseMock
      },
      batchTransactionInterpretationSchema: {
        parse: (payload: unknown) => payload
      }
    }));

    vi.doMock('@/lib/db/queries', () => ({
      getAccountsForRegistration: vi.fn(),
      saveConversationalTransaction: saveMock,
      saveConversationalTransactionBatch: saveBatchMock
    }));
  });

  it('revalida dashboard, movimientos, cuentas y registro tras guardar', async () => {
    const { saveInterpretedTransactionAction } = await import('@/app/registro/actions');

    const intent = {
      action: 'gasto',
      amount: 100,
      category: 'comida',
      description: 'Cena',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok'
    };

    const response = await saveInterpretedTransactionAction(intent);

    expect(parseMock).toHaveBeenCalledWith(intent);
    expect(enforceFinancialConsistencyMock).toHaveBeenCalledWith(intent);
    expect(saveMock).toHaveBeenCalledWith(intent, expect.objectContaining({ happenedAt: expect.any(String) }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(revalidatePathMock).toHaveBeenCalledWith('/registro');
    expect(response).toEqual({ success: true, message: 'Movimiento registrado correctamente.' });
  });

  it('aplica follow-up en servidor usando cuentas del hogar', async () => {
    const getAccountsForRegistrationMock = vi.fn().mockResolvedValue([{ name: 'TDC BBVA', type: 'credit_card' }]);
    vi.doMock('@/lib/db/queries', () => ({
      getAccountsForRegistration: getAccountsForRegistrationMock,
      saveConversationalTransaction: saveMock,
      saveConversationalTransactionBatch: saveBatchMock
    }));

    applyFollowUpAnswerMock.mockResolvedValue({ ok: true });
    const { applyFollowUpAnswerAction } = await import('@/app/registro/actions');
    const current = { rawText: 'Gasté 150 con TDC BBVA', missingFieldKinds: ['missingWhatWasPaid'] };

    const response = await applyFollowUpAnswerAction(current, 'en Canva');
    expect(parseMock).toHaveBeenCalledWith(current);
    expect(getAccountsForRegistrationMock).toHaveBeenCalled();
    expect(applyFollowUpAnswerMock).toHaveBeenCalledWith(current, 'en Canva', [{ name: 'TDC BBVA', type: 'credit_card' }]);
    expect(response).toEqual({ ok: true });
  });

  it('usa la fecha de movimiento elegida para happened_at sin alterar interpretación', async () => {
    const { saveInterpretedTransactionAction } = await import('@/app/registro/actions');

    const intent = {
      action: 'gasto',
      amount: 200,
      category: 'comida',
      description: 'Comida atrasada',
      sourceAccount: 'efectivo',
      destinationAccount: undefined,
      missingFields: [],
      humanConfirmation: 'ok',
      movementDate: '2026-04-10'
    };

    await saveInterpretedTransactionAction(intent);

    expect(enforceFinancialConsistencyMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'gasto',
      category: 'comida',
      sourceAccount: 'efectivo'
    }));
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'gasto',
      category: 'comida',
      sourceAccount: 'efectivo'
    }), expect.objectContaining({ happenedAt: '2026-04-10T12:00:00.000Z' }));
  });

  it('guarda categoría interpretada cuando no hay categoryOverride', async () => {
    const { saveInterpretedTransactionAction } = await import('@/app/registro/actions');

    await saveInterpretedTransactionAction({
      action: 'gasto',
      amount: 100,
      category: 'servicios',
      sourceAccount: 'banco',
      destinationAccount: null
    });

    expect(enforceFinancialConsistencyMock).toHaveBeenCalledWith(expect.objectContaining({ category: 'servicios' }));
  });

  it('usa categoryOverride manual y conserva monto/cuentas/acción sin cambios', async () => {
    const { saveInterpretedTransactionAction } = await import('@/app/registro/actions');

    await saveInterpretedTransactionAction({
      action: 'gasto',
      amount: 455,
      category: 'servicios',
      categoryOverride: 'transporte',
      sourceAccount: 'cuenta banco',
      destinationAccount: null,
      movementDate: '2026-04-09'
    });

    expect(enforceFinancialConsistencyMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'gasto',
      amount: 455,
      sourceAccount: 'cuenta banco',
      destinationAccount: null,
      category: 'transporte'
    }));
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'gasto',
      amount: 455,
      sourceAccount: 'cuenta banco',
      destinationAccount: null,
      category: 'transporte'
    }), expect.objectContaining({ happenedAt: '2026-04-09T12:00:00.000Z' }));
  });

  it('interpreta movimientos como lote usando cuentas del hogar', async () => {
    const getAccountsForRegistrationMock = vi.fn().mockResolvedValue([{ name: 'Efectivo', type: 'operational_cash' }]);
    vi.doMock('@/lib/db/queries', () => ({
      getAccountsForRegistration: getAccountsForRegistrationMock,
      saveConversationalTransaction: saveMock,
      saveConversationalTransactionBatch: saveBatchMock
    }));
    interpretTransactionsMock.mockResolvedValue({ mode: 'batch', items: [] });

    const { interpretTransactionAction } = await import('@/app/registro/actions');
    const response = await interpretTransactionAction('Gasté 100 en café con efectivo');

    expect(getAccountsForRegistrationMock).toHaveBeenCalled();
    expect(interpretTransactionsMock).toHaveBeenCalledWith('Gasté 100 en café con efectivo', [{ name: 'Efectivo', type: 'operational_cash' }]);
    expect(response).toEqual({ mode: 'batch', items: [] });
  });

  it('bloquea guardado de lote si algún movimiento está incompleto', async () => {
    const { saveInterpretedTransactionBatchAction } = await import('@/app/registro/actions');

    await expect(saveInterpretedTransactionBatchAction({
      mode: 'batch',
      items: [
        { action: 'gasto', amount: 100, category: 'comida', description: 'ok', sourceAccount: 'efectivo', missingFieldKinds: [] },
        { action: 'gasto', amount: 50, category: 'comida', description: 'falta', sourceAccount: null, missingFieldKinds: ['missingSourceAccount'] }
      ],
      missingFields: ['2:missingSourceAccount'],
      needsConfirmation: true
    })).rejects.toThrow('necesita aclaración');
    expect(saveBatchMock).not.toHaveBeenCalled();
  });

  it('guarda lote completo y revalida rutas necesarias', async () => {
    const { saveInterpretedTransactionBatchAction } = await import('@/app/registro/actions');
    const batch = {
      mode: 'batch',
      movementDate: '2026-04-11',
      items: [
        { action: 'gasto', amount: 100, category: 'comida', description: 'Cena', sourceAccount: 'efectivo', missingFieldKinds: [] },
        { action: 'ingreso', amount: 200, category: 'ingreso_extra', description: 'Pago', destinationAccount: 'banco', missingFieldKinds: [] }
      ],
      missingFields: [],
      needsConfirmation: true
    };

    const response = await saveInterpretedTransactionBatchAction(batch);

    expect(enforceFinancialConsistencyMock).toHaveBeenCalledTimes(2);
    expect(saveBatchMock).toHaveBeenCalledWith(batch.items, expect.objectContaining({ happenedAt: '2026-04-11T12:00:00.000Z' }));
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(revalidatePathMock).toHaveBeenCalledWith('/registro');
    expect(response).toEqual({ success: true, message: '2 movimientos registrados correctamente.' });
  });

});
