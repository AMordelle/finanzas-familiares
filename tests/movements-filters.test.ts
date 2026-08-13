import { describe, expect, it } from 'vitest';
import { ALL_SUBCATEGORIES, applyQuickFilter, buildDynamicSummary, filterMovements, WITHOUT_SUBCATEGORY, type MovementFilters } from '@/lib/movements/filters';
import type { MovementHistoryItem } from '@/lib/db/queries';

const base: MovementHistoryItem[] = [
  { id:'1', fecha:'2026-04-29T10:00:00Z', tipoMovimiento:'Ingreso', categoria:'salario', subcategoria:'nomina', descripcion:'Pago nómina', monto:2000, cuentaOrigen:null, cuentaDestino:'Banco', puedeEditar:true, motivoNoEditable:null },
  { id:'2', fecha:'2026-04-28T10:00:00Z', tipoMovimiento:'Gasto', categoria:'comida', subcategoria:'cafeterias', descripcion:'Café', monto:80, cuentaOrigen:'Banco', cuentaDestino:null, puedeEditar:true, motivoNoEditable:null },
  { id:'3', fecha:'2026-04-20T10:00:00Z', tipoMovimiento:'Pago de deuda', categoria:'deuda', descripcion:'Pago TDC', monto:300, cuentaOrigen:'Banco', cuentaDestino:'TDC', puedeEditar:true, motivoNoEditable:null },
  { id:'4', fecha:'2026-04-27T10:00:00Z', tipoMovimiento:'Transferencia', categoria:'sin_categoria', descripcion:'Mover a ahorro', monto:1200, cuentaOrigen:'Banco', cuentaDestino:'Ahorro', puedeEditar:true, motivoNoEditable:null },
  { id:'5', fecha:'2026-03-10T10:00:00Z', tipoMovimiento:'Gasto', categoria:'hogar', subcategoria:'limpieza', descripcion:'Limpieza', monto:540, cuentaOrigen:'PrimeIPTV', cuentaDestino:null, puedeEditar:true, motivoNoEditable:null },
  { id:'6', fecha:'2026-04-18T10:00:00Z', tipoMovimiento:'Gasto', categoria:'comida', subcategoria:'cafeterias', descripcion:'Desayuno', monto:120, cuentaOrigen:'Efectivo', cuentaDestino:null, puedeEditar:true, motivoNoEditable:null },
  { id:'7', fecha:'2026-04-17T10:00:00Z', tipoMovimiento:'Gasto', categoria:'comida', subcategoria:null, descripcion:'Mercado', monto:250, cuentaOrigen:'Banco', cuentaDestino:null, puedeEditar:true, motivoNoEditable:null }
];

const f: MovementFilters = { dateFilter:'all', type:'all', accountMode:'any', account:'', category:'all', subcategory:ALL_SUBCATEGORIES, amountFilter:'all', search:'' };

describe('movements filters', ()=>{
  it('filtra por fecha', ()=>{ expect(filterMovements(base, { ...f, dateFilter:'today' }, [], new Date('2026-04-29T12:00:00Z')).map(m=>m.id)).toEqual(['1']); });

  it('rango personalizado filtra dentro del periodo y admite fecha faltante', ()=>{
    const onlyFrom = filterMovements(base, { ...f, dateFilter: 'custom', customDateFrom: '2026-04-28' }, []);
    expect(onlyFrom.map((m) => m.id)).toEqual(['1','2']);

    const bounded = filterMovements(base, { ...f, dateFilter: 'custom', customDateFrom: '2026-04-20', customDateTo: '2026-04-28' }, []);
    expect(bounded.map((m) => m.id)).toEqual(['2','3','4']);
  });

  it('rango personalizado incluye todo el día final', ()=>{
    const withEdgeDay: MovementHistoryItem[] = [
      ...base,
      { ...base[0], id: '9', fecha: '2026-04-28T23:59:59.500' }
    ];

    const filtered = filterMovements(withEdgeDay, { ...f, dateFilter: 'custom', customDateFrom: '2026-04-28', customDateTo: '2026-04-28' }, []);
    expect(filtered.map((m) => m.id)).toEqual(['2','9']);
  });
  it('filtra por tipo', ()=>{ expect(filterMovements(base, { ...f, type:'pago_de_deuda' as any }, []).length).toBe(0); expect(filterMovements(base, { ...f, type:'pago_deuda' }, []).map(m=>m.id)).toEqual(['3']); });
  it('filtra por cuenta origen/destino/involucrada', ()=>{
    expect(filterMovements(base, { ...f, accountMode:'source', account:'Banco' }, []).length).toBe(4);
    expect(filterMovements(base, { ...f, accountMode:'destination', account:'TDC' }, []).map(m=>m.id)).toEqual(['3']);
    expect(filterMovements(base, { ...f, accountMode:'any', account:'Ahorro' }, []).map(m=>m.id)).toEqual(['4']);
  });
  it('filtra por monto y búsqueda texto', ()=>{
    expect(filterMovements(base, { ...f, amountFilter:'lt_100' }, []).map(m=>m.id)).toEqual(['2']);
    expect(filterMovements(base, { ...f, search:'nómina' }, []).map(m=>m.id)).toEqual(['1']);
  });

  it('filtra exactamente por subcategoría y la combina con categoría', () => {
    expect(filterMovements(base, { ...f, category: 'comida', subcategory: 'cafeterias' }, []).map((m) => m.id)).toEqual(['2', '6']);
    expect(filterMovements(base, { ...f, category: 'hogar', subcategory: 'cafeterias' }, [])).toEqual([]);
  });

  it('localiza movimientos con subcategoría nula o vacía', () => {
    const withEmpty = [...base, { ...base[6], id: '8', subcategoria: '' }];
    expect(filterMovements(withEmpty, { ...f, category: 'comida', subcategory: WITHOUT_SUBCATEGORY }, []).map((m) => m.id)).toEqual(['7', '8']);
  });

  it('combina periodo, categoría y subcategoría', () => {
    const filtered = filterMovements(base, { ...f, dateFilter: 'this_week', category: 'comida', subcategory: 'cafeterias' }, [], new Date('2026-04-29T12:00:00Z'));
    expect(filtered.map((m) => m.id)).toEqual(['2']);
  });

  it('combina subcategoría con cuenta, monto, tipo y búsqueda', () => {
    const filtered = filterMovements(base, { ...f, category: 'comida', subcategory: 'cafeterias', account: 'Banco', type: 'gasto', amountFilter: 'lt_100', search: 'café' }, []);
    expect(filtered.map((m) => m.id)).toEqual(['2']);
  });

  it('totaliza gastos solo sobre la subcategoría filtrada sin duplicar doble partida', () => {
    const filtered = filterMovements([...base, { ...base[1] }], { ...f, category: 'comida', subcategory: 'cafeterias' }, []);
    const summary = buildDynamicSummary(filtered);
    expect(summary.count).toBe(2);
    expect(summary.gastos).toBe(200);
  });

  it('mantiene neutral la transferencia al filtrar por subcategoría', () => {
    const transfer = { ...base[3], subcategoria: 'ahorro' };
    const summary = buildDynamicSummary(filterMovements([transfer], { ...f, category: 'sin_categoria', subcategory: 'ahorro' }, []));
    expect(summary).toMatchObject({ ingresos: 0, gastos: 0, transferenciasInternas: 1200, balanceNeto: 0 });
  });

  it('el estado neutral de subcategoría conserva el filtrado existente', () => {
    expect(filterMovements(base, f, [])).toEqual(base);
    expect(applyQuickFilter('sin_clasificar', { ...f, subcategory: 'historica' }).subcategory).toBe(ALL_SUBCATEGORIES);
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
    expect(summary.gastos).toBe(450);
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
    expect(summary.balanceNeto).toBe(710);
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
    expect(filtered.map((m) => m.id)).toEqual(['2','7']);
    expect(summary.gastos).toBe(330);
  });

  it('no duplica movimientos por doble partida usando id canónico', ()=>{
    const duplicated = [...base, { ...base[3] }];
    const summary = buildDynamicSummary(duplicated);
    expect(summary.count).toBe(base.length);
    expect(summary.transferenciasInternas).toBe(1200);
  });

  
  it('al cambiar de custom a this_month ignora rango personalizado previo', ()=>{
    const filtered = filterMovements(base, {
      ...f,
      dateFilter: 'this_month',
      customDateFrom: '2026-04-29',
      customDateTo: '2026-04-29'
    }, [], new Date('2026-04-29T12:00:00Z'));

    expect(filtered.map((m) => m.id)).toEqual(['1','2','3','4','6','7']);
  });
it('aplica chips rápidos y resumen dinámico sin inflar transferencias internas', ()=>{
    const chip = applyQuickFilter('gastos_fuertes', f);
    expect(filterMovements(base, chip, []).map(m=>m.id)).toEqual(['1','4']);
  });
});
