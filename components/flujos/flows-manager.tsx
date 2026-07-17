'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createFlowAllocationAction, deleteFlowAllocationAction } from '@/app/flujos/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import type { getFlowsData } from '@/lib/flows/service';

type Data = Awaited<ReturnType<typeof getFlowsData>> & { hasHousehold: true };
export function FlowsManager({ initialData }: { initialData: Data }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [accountId, setAccountId] = useState(initialData.accounts[0]?.id ?? ''); const [fundId, setFundId] = useState(initialData.funds[0]?.id ?? ''); const [amount, setAmount] = useState(''); const [notes, setNotes] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [pending, startTransition] = useTransition();
  const run = (operation: () => Promise<{ message: string }>) => startTransition(async () => { setError(''); setMessage(''); try { const result = await operation(); setMessage(result.message); setAmount(''); setNotes(''); setOpen(false); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.'); } });
  return <div className="space-y-4">
    <div className="grid gap-3 md:grid-cols-3">{[['Dinero líquido', initialData.liquidity], ['Dinero asignado', initialData.allocated], ['Dinero sin asignar', initialData.unallocated]].map(([label, value]) => <Card key={String(label)}><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{formatCurrencyMXN(Number(value))}</p></Card>)}</div>
    <Card><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Fondos virtuales</h2><p className="text-sm text-slate-600">Reservas virtuales: no alteran el saldo ni generan movimientos.</p></div><Button onClick={() => setOpen(!open)} disabled={!initialData.accounts.length}>Asignar dinero</Button></div>
      {open && <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); run(() => createFlowAllocationAction({ accountId, fundId, amount, notes })); }}>
        <label className="text-sm">Cuenta<select required className="mt-1 w-full rounded-xl border p-2" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{initialData.accounts.filter(a => a.available > 0).map(a => <option key={a.id} value={a.id}>{a.name} · {formatCurrencyMXN(a.available)} libres</option>)}</select></label>
        <label className="text-sm">Fondo<select required className="mt-1 w-full rounded-xl border p-2" value={fundId} onChange={(e) => setFundId(e.target.value)}>{initialData.funds.filter(f => f.isActive).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className="text-sm">Importe<input required type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-xl border p-2" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="text-sm">Nota opcional<input maxLength={500} className="mt-1 w-full rounded-xl border p-2" value={notes} onChange={(e) => setNotes(e.target.value)} /></label><Button disabled={pending} type="submit">{pending ? 'Guardando…' : 'Guardar asignación'}</Button>
      </form>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
      <div className="mt-4 divide-y">{initialData.funds.map(fund => <div className="flex items-center justify-between py-3" key={fund.id}><div><p className="font-medium">{fund.name}</p><p className="text-xs text-slate-500">Prioridad {fund.priority} · {fund.isActive ? 'Activo' : 'Inactivo'}</p></div><p className="font-semibold">{formatCurrencyMXN(fund.totalAllocated)}</p></div>)}</div>
    </Card>
    <Card><h2 className="font-semibold">Asignaciones actuales</h2>{!initialData.allocations.length ? <p className="mt-2 text-sm text-slate-500">Todavía no hay asignaciones.</p> : <div className="mt-2 divide-y">{initialData.allocations.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{initialData.funds.find(f => f.id === item.fundId)?.name} · {formatCurrencyMXN(item.amount)}</p><p className="text-xs text-slate-500">{initialData.accounts.find(a => a.id === item.accountId)?.name}{item.notes ? ` · ${item.notes}` : ''}</p></div><Button variant="outline" disabled={pending} onClick={() => run(() => deleteFlowAllocationAction({ allocationId: item.id }))}>Eliminar</Button></div>)}</div>}</Card>
  </div>;
}
