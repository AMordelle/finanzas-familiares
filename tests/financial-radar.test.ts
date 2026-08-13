import { describe, expect, it } from 'vitest';
import { calculateFinancialRadar } from '@/lib/finance/financialRadar';

describe('financial radar calculation', () => {
  it('A) expone breakdown estructurado de carga próximos 7 días', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 7000 }],
      recentTransactions: [{ type: 'debit', amount: 1400 }],
      obligations: [
        { name: 'Pago TDC BBVA', amount: 2200, dueDay: 16 },
        { name: 'Renta', amount: 1600, dueDay: 17 }
      ]
    });

    expect(radar.upcomingLoad).toBe(4150);
    expect(radar.breakdowns.upcoming7dLoad.length).toBeGreaterThanOrEqual(3);
    expect(radar.breakdowns.upcoming7dLoad.some((item) => item.category === 'deuda')).toBe(true);
    expect(radar.breakdowns.upcoming7dLoad.some((item) => item.category === 'gasto_fijo')).toBe(true);
  });

  it('B) muestra fórmula explícita del faltante sin fricción', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 4700 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [
        { amount: 3500, dueDay: 16 },
        { amount: 1700, dueDay: 24 }
      ]
    });

    expect(radar.breakdowns.frictionGap.formula).toBe('(colchón recomendado + carga inmediata) - liquidez disponible');
    expect(radar.breakdowns.frictionGap.gap).toBeGreaterThan(0);
  });

  it('C) evita copy ambiguo con verbo avanzar sin objeto', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 9000 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ name: 'Servicio internet', amount: 1800, dueDay: 16 }]
    });

    const fullCopy = `${radar.whatToDoToday} ${radar.nextBestAction} ${radar.actionTodayDetail}`.toLowerCase();
    expect(fullCopy).not.toContain('avanzar un poco');
  });

  it('D) si no hay reservas explícitas, no usa frase "sin tocar reservas"', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 9000 }],
      recentTransactions: [{ type: 'debit', amount: 1200 }],
      obligations: [{ amount: 1800, dueDay: 16 }]
    });

    expect(`${radar.nextBestAction} ${radar.nextBestStep}`.toLowerCase()).not.toContain('sin tocar reservas');
  });

  it('E) cuando existe evento siguiente, Radar lo menciona explícitamente', () => {
    const radar = calculateFinancialRadar({
      now: new Date('2026-04-14T12:00:00Z'),
      accounts: [{ type: 'operativa', balance: 2900 }],
      recentTransactions: [{ type: 'debit', amount: 1000 }],
      obligations: [
        { name: 'Servicios', amount: 1200, dueDay: 16 },
        { name: 'Seguro auto', amount: 2500, dueDay: 24 }
      ]
    });

    expect(radar.whatIsComing).toMatch(/En\s+\d+\s+d[ií]as/);
  });
});
