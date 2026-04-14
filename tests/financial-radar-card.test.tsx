import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinancialRadarCard } from '@/components/dashboard/financial-radar-card';

const radar = {
  status: 'atencion' as const,
  actionToday: 'Hoy: evita gastos extra y cuida liquidez.',
  upcoming: 'Viene una semana más pesada de lo normal.',
  riskText: 'Riesgo medio: cualquier gasto no planeado te aprieta.',
  nextBestStep: 'Reordena pagos de los próximos 7 días y recorta variable.',
  availableNow: 5000,
  upcomingLoad: 4200,
  estimatedMargin: 800
};

describe('FinancialRadarCard', () => {
  it('renderiza modo colapsado sin detalle extendido', () => {
    const html = renderToStaticMarkup(<FinancialRadarCard radar={radar} />);
    expect(html).toContain('Radar Financiero');
    expect(html).toContain('Carga próxima');
    expect(html).not.toContain('Qué viene pronto');
  });

  it('renderiza detalle cuando inicia expandido', () => {
    const html = renderToStaticMarkup(<FinancialRadarCard radar={radar} initiallyExpanded />);
    expect(html).toContain('Qué hacer hoy');
    expect(html).toContain('Qué viene pronto');
    expect(html).toContain('Próximo paso ideal');
  });
});
