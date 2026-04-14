import { describe, expect, it } from 'vitest';
import { calculateFinancialRadar } from '@/lib/finance/financialRadar';

describe('financial radar calculation', () => {
  it('combina balances, gasto base y obligaciones próximas', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [
        { type: 'operational_cash', name: 'Cuenta TDD', balance: 4000 },
        { type: 'savings_fund', name: 'Caja de ahorro', balance: 2000 },
        { type: 'credit_card', name: 'Tarjeta', balance: 15000 }
      ],
      recentTransactions: [
        { type: 'debit', amount: 1200, happenedAt: '2026-04-12T00:00:00Z' },
        { type: 'debit', amount: 800, happenedAt: '2026-04-10T00:00:00Z' },
        { type: 'debit', amount: 1000, happenedAt: '2026-04-05T00:00:00Z' },
        { type: 'debit', amount: 1000, happenedAt: '2026-03-30T00:00:00Z' }
      ],
      obligations: [
        { amount: 1800, dueDay: 18 },
        { amount: 900, dueDay: null }
      ]
    });

    expect(radar.availableNow).toBe(6000);
    expect(radar.upcomingLoad).toBeGreaterThan(2700);
    expect(radar.upcomingLoad).toBeLessThan(4300);
  });

  it('clasifica estado estable, atención y presión', () => {
    const estable = calculateFinancialRadar({
      accounts: [{ type: 'operativa', balance: 5000 }],
      recentTransactions: [{ type: 'debit', amount: 500 }],
      obligations: [{ amount: 200, dueDay: 25 }],
      now: new Date('2026-04-14T12:00:00Z')
    });

    const atencion = calculateFinancialRadar({
      accounts: [{ type: 'operativa', balance: 1800 }],
      recentTransactions: [{ type: 'debit', amount: 900 }],
      obligations: [{ amount: 1200, dueDay: 18 }],
      now: new Date('2026-04-14T12:00:00Z')
    });

    const presion = calculateFinancialRadar({
      accounts: [{ type: 'operativa', balance: 900 }],
      recentTransactions: [{ type: 'debit', amount: 1000 }],
      obligations: [{ amount: 1200, dueDay: 17 }],
      now: new Date('2026-04-14T12:00:00Z')
    });

    expect(estable.status).toBe('estable');
    expect(atencion.status).toBe('atencion');
    expect(presion.status).toBe('presion');
  });

  it('retorna recomendaciones humanas en español por estado', () => {
    const presion = calculateFinancialRadar({
      accounts: [{ type: 'operativa', balance: 700 }],
      recentTransactions: [{ type: 'debit', amount: 1300 }],
      obligations: [{ amount: 1200, dueDay: 15 }],
      now: new Date('2026-04-14T12:00:00Z')
    });

    expect(presion.actionToday).toContain('Hoy');
    expect(presion.riskText).toContain('Riesgo');
    expect(presion.nextBestStep.length).toBeGreaterThan(20);
  });
});
