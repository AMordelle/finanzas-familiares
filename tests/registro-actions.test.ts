import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseMock = vi.fn();
const saveMock = vi.fn();
const revalidatePathMock = vi.fn();

describe('registro actions revalidation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    parseMock.mockImplementation((payload) => payload);

    vi.doMock('next/cache', () => ({
      revalidatePath: revalidatePathMock
    }));

    vi.doMock('@/lib/ai/transactionInterpreter', () => ({
      interpretTransaction: vi.fn(),
      transactionIntentSchema: {
        parse: parseMock
      }
    }));

    vi.doMock('@/lib/db/queries', () => ({
      getAccountsForRegistration: vi.fn(),
      saveConversationalTransaction: saveMock
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
    expect(saveMock).toHaveBeenCalledWith(intent);
    expect(revalidatePathMock).toHaveBeenCalledWith('/dashboard');
    expect(revalidatePathMock).toHaveBeenCalledWith('/movimientos');
    expect(revalidatePathMock).toHaveBeenCalledWith('/cuentas');
    expect(revalidatePathMock).toHaveBeenCalledWith('/registro');
    expect(response).toEqual({ success: true, message: 'Movimiento registrado correctamente.' });
  });
});
