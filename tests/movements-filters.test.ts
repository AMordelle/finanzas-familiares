import { describe, expect, it } from 'vitest';
import { applyQuickFilter, buildDynamicSummary, filterMovements, type MovementFilters } from '@/lib/movements/filters';
import type { MovementHistoryItem } from '@/lib/db/queries';

const base: MovementHistoryItem[] = [
  { id:'1', fecha:'2026-04-29T10:00:00Z', tipoMovimiento:'Ingreso', categoria:'salario', descripcion:'Pago nómina', monto:2000, cuentaOrigen:null, cuentaDestino:'Banco', puedeEditar:true, motivoNoEditable:null },
  { id:'2', fecha:'2026-04-28T10:00:00Z', tipoMovimiento:'Gasto', categoria:'comida', descripcion:'Café', monto:80, cuentaOrigen:'Banco', cuentaDestino:null, puedeEditar:true, motivoNoEditable:null },
  { id:'3', fecha:'2026-03-10T10:00:00Z', tipoMovimiento:'Pago de deuda', categoria:'deuda', descripcion:'Pago TDC', monto:300, cuentaOrigen:'Banco', cuentaDestino:'TDC', puedeEditar:true, motivoNoEditable:null },
  { id:'4', fecha:'2026-04-27T10:00:00Z', tipoMovimiento:'Transferencia', categoria:'sin_categoria', descripcion:'Mover a ahorro', monto:1200, cuentaOrigen:'Banco', cuentaDestino:'Ahorro', puedeEditar:true, motivoNoEditable:null }
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
  it('aplica chips rápidos y resumen dinámico sin inflar transferencias internas', ()=>{
    const chip = applyQuickFilter('gastos_fuertes', f);
    expect(filterMovements(base, chip, []).map(m=>m.id)).toEqual(['1','4']);
    const summary = buildDynamicSummary(base);
    expect(summary.ingresos).toBe(2000);
    expect(summary.gastos).toBe(80);
    expect(summary.pagoDeuda).toBe(300);
    expect(summary.balanceNeto).toBe(1620);
  });
});
