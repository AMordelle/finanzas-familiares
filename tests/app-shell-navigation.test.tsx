import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from '@/components/app-shell';

describe('AppShell navigation', () => {
  it('solo muestra los módulos activos en la navegación principal', () => {
    const html = renderToStaticMarkup(<AppShell title="Prueba"><main>Contenido</main></AppShell>);

    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('Dashboard');
    expect(html).toContain('href="/registro"');
    expect(html).toContain('Registro');
    expect(html).toContain('href="/cuentas"');
    expect(html).toContain('Cuentas');
    expect(html).toContain('href="/movimientos"');
    expect(html).toContain('Movimientos');
    expect(html).toContain('href="/msi"');
    expect(html).toContain('MSI');
    expect(html).toContain('href="/extras"');
    expect(html).toContain('Extras');
    expect(html).toContain('href="/cierre"');
    expect(html).toContain('Cierre');

    expect(html).not.toContain('href="/analisis"');
    expect(html).not.toContain('Análisis');
    expect(html).not.toContain('href="/simulacion"');
    expect(html).not.toContain('Simulación');
    expect(html).not.toContain('href="/calendario"');
    expect(html).not.toContain('Calendario');
    expect(html).not.toContain('href="/objetivos"');
    expect(html).not.toContain('Objetivos');
  });
});
