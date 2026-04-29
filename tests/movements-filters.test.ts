import { describe, expect, it } from 'vitest';
import { applyQuickFilter, buildDynamicSummary, filterMovements, type MovementFilters } from '@/lib/movements/filters';
import type { MovementHistoryItem } from '@/lib/db/queries';

const base: MovementHistoryItem[] = [
  { id:'1', fecha:'2026-04-29T10:00:00Z', tipoMovimiento:'Ingreso', categoria:'salario', descripcion:'Pago nómina', monto:2000, cuentaOrigen:null, cuentaDestino:'Banco', puedeEditar:true, motivoNoEditable:null },
  { id:'2', fecha:'2026-04-28T10:00:00Z', tipoMovimiento:'Gasto', categoria:'comida', descripcion:'Café', monto:80, cuentaOrigen:'Banco', cuentaDestino:null, puedeEditar:true, motivoNoEditable:null },
  { id:'3', fecha:'2026-04-20T10:00:00Z', tipoMovimiento:'Pago de deuda', categoria:'deuda', descripcion:'Pago TDC', monto:300, cuentaOrigen:'Banco', cuentaDestino:'TDC', puedeEditar:true, motivoNoEditable:null },
  { id:'4', fecha:'2026-04-27T10:00:00Z', tipoMovimiento:'Transferencia', categoria:'sin_categoria', descripcion:'Mover a ahorro', monto:1200, cuentaOrigen:'Banco', cuentaDestino:'Ahorro', puedeEditar:true, motivoNoEditable:null },
  { id:'5', fecha:'2026-03-10T10:00:00Z', tipoMovimiento:'Gasto', categoria:'hogar', descripcion:'Limpieza', monto:540, cuentaOrigen:'PrimeIPTV', cuentaDestino:null, puedeEditar:true, motivoNoEditable:null }
];

const f: MovementFilters = { dateFilter:'all', type:'all', accountMode:'any', account:'', category:'all', amountFilter:'all', search:'' };

describe('movements filters', ()=>{
  it('filtra por fecha', ()=>{ expect(filterMovements(base, { ...f, dateFilter:'today' }, [], new Date('2026-04-29T12:00:00Z')).map(m=>m.id)).toEqual(['1']); });
  it('filtra por tipo', ()=>{ expect(filterMovements(base, { ...f, type:'pago_de_deuda' as any }, []).length).toBe(0); expect(filterMovements(base, { ...f, type:'pago_deuda' }, []).map(m=>m.id)).toEqual(['3']); });
  it('filtra por cuenta origen/destino/involucrada', ()=>{
    expect(filterMovements(base, { ...f, accountMode:'source', account:'Banco' }, []).length).toBe(3);
    expect(filterMovements(base, { ...f, accountMode:'destination', account:'TDC' }, []).map(m=>m.id)).toEqual(['3']);
    expect(filterMovements(base, { ...f, accountMode:'any', account:'Ahorro' }, []).map(m=>m.id)).toEqual(['4']);
  });
  it('filtra por monto y búsqueda texto', ()=>{
    expect(filterMovements(base, { ...f, amountFilter:'lt_100' }, []).map(m=>m.id)).toEqual(['2']);
    expect(filterMovements(base, { ...f, search:'nómina' }, []).map(m=>m.id)).toEqual(['1']);
  });

  it('filtro ingresos semana totaliza solo ingresos visibles', ()=>{
    const filtered = filterMovements(base, { ...f, dateFilter: 'this_week', type: 'ingreso' }, [], new Date('2026-04-29T12:00:00Z'));
    const summary = buildDynamicSummary(filtered);
    expect(summary.count).toBe(1);
    expect(summary.ingresos).toBe(2000);
    expect(summary.gastos).toBe(0);
  });

  it('filtro gastos mes totaliza solo gastos visibles', ()=>{
    const filtered = filterMovements(base, { ...f, dateFilter: 'this_month', type: 'gasto' }, [], new Date('2026-04-29T12:00:00Z'));
    const summary = buildDynamicSummary(filtered);
    expect(summary.gastos).toBe(80);
    expect(summary.ingresos).toBe(0);
    expect(summary.pagoDeuda).toBe(0);
  });

  it('filtro pago_deuda totaliza pagos separados', ()=>{
    const filtered = filterMovements(base, { ...f, type: 'pago_deuda' }, []);
    const summary = buildDynamicSummary(filtered);
    expect(summary.pagoDeuda).toBe(300);
    expect(summary.gastos).toBe(0);
  });

  it('transferencias internas no afectan balance neto', ()=>{
    const summary = buildDynamicSummary(base);
    expect(summary.transferenciasInternas).toBe(1200);
    expect(summary.balanceNeto).toBe(1080);
  });

  it('combinación de filtros fecha + cuenta + tipo totaliza correctamente', ()=>{
    const filtered = filterMovements(base, {
      ...f,
      dateFilter: 'this_month',
      accountMode: 'source',
      account: 'Banco',
      type: 'gasto'
    }, [], new Date('2026-04-29T12:00:00Z'));
    const summary = buildDynamicSummary(filtered);
    expect(filtered.map((m) => m.id)).toEqual(['2']);
    expect(summary.gastos).toBe(80);
  });

  it('no duplica movimientos por doble partida usando id canónico', ()=>{
    const duplicated = [...base, { ...base[3] }];
    const summary = buildDynamicSummary(duplicated);
    expect(summary.count).toBe(base.length);
    expect(summary.transferenciasInternas).toBe(1200);
  });

  it('aplica chips rápidos y resumen dinámico sin inflar transferencias internas', ()=>{
    const chip = applyQuickFilter('gastos_fuertes', f);
    expect(filterMovements(base, chip, []).map(m=>m.id)).toEqual(['1','4']);
  });
});
