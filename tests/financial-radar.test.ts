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

  it('clasifica estado en cómodo, ajustado y faltante', () => {
    const confortable = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 5000 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ amount: 1000, dueDay: 16 }]
    });

    const ajustado = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 1800 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ amount: 1400, dueDay: 16 }]
    });

    const faltante = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 1200 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ amount: 1800, dueDay: 16 }]
    });

    expect(confortable.status).toBe('estable');
    expect(ajustado.status).toBe('atencion');
    expect(faltante.status).toBe('presion');
  });

  it('usa redacción humana y calmada', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 1700 }],
      recentTransactions: [{ type: 'debit', amount: 1000 }],
      obligations: [{ name: 'Pago TDC BBVA', amount: 1200, dueDay: 16 }]
    });

    expect(radar.riskText).toBe('Cubres lo inmediato, pero con poco margen.');
    expect(radar.actionToday).toContain('Hoy:');
    expect(radar.statusReason).toBe('Cubres el periodo, pero con poco margen.');
  });

  it('incluye nombres de obligaciones en recomendaciones contextuales', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 1500 }],
      recentTransactions: [{ type: 'debit', amount: 800 }],
      obligations: [{ name: 'Pago TDC BBVA', amount: 1500, dueDay: 17 }]
    });

    expect(radar.upcoming).toContain('BBVA');
    expect(radar.upcoming).toContain('días');
  });

  it('mantiene consistencia narrativa: si hay margen pequeño no comunica colapso', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 1800 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ amount: 1400, dueDay: 16 }]
    });

    expect(radar.status).toBe('atencion');
    expect(radar.estimatedMargin).toBeGreaterThan(0);
    expect(radar.riskText.toLowerCase()).not.toContain('supera');
  });
});
