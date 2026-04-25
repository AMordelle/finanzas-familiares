import { describe, expect, it } from 'vitest';
import { calculateFinancialRadar } from '@/lib/finance/financialRadar';

describe('financial radar calculation', () => {
  it('separa carga obligatoria de próximos 7 días y presión cercana', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 7000 }],
      recentTransactions: [{ type: 'debit', amount: 1400 }],
      obligations: [
        { name: 'Pago TDC BBVA', amount: 2200, dueDay: 16 },
        { name: 'Colegiatura', amount: 1600, dueDay: 23 }
      ]
    });

    expect(radar.upcomingLoad).toBe(2550); // 350 base + 2200 obligatorio
    expect(radar.nearFutureLoad).toBe(1600); // no infla carga principal
    expect(radar.upcoming).toContain('Colegiatura');
  });

  it('A) si hay margen táctico pero no colchón de fricción, pasa a atención', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 4700 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [
        { amount: 3500, dueDay: 16 },
        { amount: 1700, dueDay: 24 }
      ]
    });

    expect(radar.estimatedMargin).toBeGreaterThan(0);
    expect(radar.marginAfterFrictionBuffer).toBeLessThan(0);
    expect(radar.status).toBe('atencion');
    expect(radar.actionToday.toLowerCase()).not.toContain('separar una parte para colchón');
  });

  it('B) si cubre carga + buffer, estado estable y tono optimista', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 9000 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ amount: 1800, dueDay: 16 }]
    });

    expect(radar.status).toBe('estable');
    expect(radar.marginAfterFrictionBuffer).toBeGreaterThanOrEqual(0);
    expect(radar.actionToday).toContain('separar una parte para colchón');
  });

  it('C) si availableNow < upcoming7dLoad, cae en presión real', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 1200 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ amount: 1800, dueDay: 16 }]
    });

    expect(radar.status).toBe('presion');
    expect(radar.estimatedMargin).toBeLessThan(0);
    expect(radar.tacticalPressureLevel).toBe('high');
  });

  it('D) anticipa carga 8-14d sin contradecir margen actual', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 2900 }],
      recentTransactions: [{ type: 'debit', amount: 1000 }],
      obligations: [
        { name: 'Servicios', amount: 1200, dueDay: 16 },
        { name: 'Seguro auto', amount: 2500, dueDay: 24 }
      ]
    });

    expect(radar.estimatedMargin).toBeGreaterThan(0);
    expect(radar.nearFutureLoad).toBeGreaterThan(0);
    expect(radar.status).toBe('atencion');
    expect(radar.riskText).toContain('colchón de fricción');
  });
});
