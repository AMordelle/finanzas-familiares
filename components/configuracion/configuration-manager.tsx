'use client';

import React, { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrencyMXN } from '@/lib/formatters/currency';
import type { CategoryAuditGroup, CategoryAuditMovement, ConfigurationData, FinancialCategory, ProjectionColumn } from '@/lib/db/queries';
import {
  assignCategoryToProjectionColumnAction,
  createFinancialCategoryAction,
  createFinancialSubcategoryAction,
  createProjectionColumnAction,
  deleteFinancialCategoryAction,
  deleteFinancialSubcategoryAction,
  deleteProjectionColumnAction,
  reclassifyCategoryAuditMovementAction,
  removeCategoryFromProjectionColumnAction,
  toggleFinancialCategoryAction,
  toggleFinancialSubcategoryAction,
  toggleProjectionColumnAction,
  updateFinancialCategoryAction,
  updateFinancialSubcategoryAction,
  updateProjectionColumnAction
} from '@/app/configuracion/actions';

type Props = { data: ConfigurationData };
type CategoryType = 'income' | 'expense' | 'both';
type ColumnType = 'income' | 'expense';

const categoryTypeLabels: Record<CategoryType, string> = { income: 'Ingreso', expense: 'Gasto', both: 'Ambos' };
const columnTypeLabels: Record<ColumnType, string> = { income: 'Ingreso', expense: 'Gasto' };
const auditStatusLabels: Record<CategoryAuditMovement['status'], string> = {
  missing_category: 'Sin categoría configurada',
  inactive_category: 'Categoría inactiva',
  unassigned_projection: 'Sin columna asignada',
  no_projectable: 'No proyectable'
};

export function ConfigurationManager({ data }: Props) {
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<CategoryType>('expense');
  const [categoryNoProjectable, setCategoryNoProjectable] = useState(false);
  const [columnName, setColumnName] = useState('');
  const [columnType, setColumnType] = useState<ColumnType>('expense');
  const [columnDescription, setColumnDescription] = useState('');
  const [columnOrder, setColumnOrder] = useState('0');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingSubcategoryId, setEditingSubcategoryId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [subcategoryNames, setSubcategoryNames] = useState<Record<string, string>>({});
  const [assignmentSelection, setAssignmentSelection] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const hasConfiguration = data.categories.length > 0 || data.projectionColumns.length > 0;
  const activeCategories = useMemo(() => data.categories.filter((category) => category.isActive), [data.categories]);
  const projectableAssignmentCategories = useMemo(() => activeCategories.filter((category) => !category.noProjectable), [activeCategories]);

  function run(action: () => Promise<{ message?: string } | unknown>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result && typeof result === 'object' && 'message' in result && typeof result.message === 'string') setMessage(result.message);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">Modelo financiero configurable</h2>
        <p className="mt-2 text-sm text-slate-600">Las categorías principales alimentan las columnas de Proyección. Las subcategorías sirven para detallar en qué se movió el dinero dentro de cada categoría.</p>
        {!hasConfiguration && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Primero crea categorías y columnas para que Proyección pueda agrupar tus movimientos.</p>}
        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>

      <Card>
        <details open>
          <summary className="cursor-pointer text-base font-semibold">1. Categorías y subcategorías</summary>
          <form
            className="mt-4 grid gap-2 md:grid-cols-[1fr_160px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const result = await createFinancialCategoryAction({ name: categoryName, type: categoryType, noProjectable: categoryNoProjectable });
                setCategoryName('');
                setCategoryType('expense');
                setCategoryNoProjectable(false);
                return result;
              });
            }}
          >
            <input className="rounded-md border border-slate-300 p-2 text-sm" placeholder="Nombre de categoría principal" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} disabled={isPending} />
            <select className="rounded-md border border-slate-300 bg-white p-2 text-sm" value={categoryType} onChange={(event) => setCategoryType(event.target.value as CategoryType)} disabled={isPending}>
              <option value="income">Ingreso</option><option value="expense">Gasto</option><option value="both">Ambos</option>
            </select>
            <label className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 md:col-span-2">
              <input className="mr-2" type="checkbox" checked={categoryNoProjectable} onChange={(event) => setCategoryNoProjectable(event.target.checked)} disabled={isPending} />
              Excluir de Proyección
              <span className="block pl-5 text-slate-500">Usa esta opción para movimientos que no deben alimentar columnas de Proyección, como transferencias internas, pagos de tarjeta o recuperación de préstamos.</span>
            </label>
            <Button disabled={isPending || !categoryName.trim()}>{isPending ? 'Guardando...' : 'Crear categoría'}</Button>
          </form>

          <div className="mt-4 space-y-3">
            {data.categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                isPending={isPending}
                isEditing={editingCategoryId === category.id}
                editingSubcategoryId={editingSubcategoryId}
                subcategoryDraft={subcategoryNames[category.id] ?? ''}
                onToggleEdit={() => setEditingCategoryId((current) => current === category.id ? null : category.id)}
                onToggleSubcategoryEdit={setEditingSubcategoryId}
                onSubcategoryDraftChange={(value) => setSubcategoryNames((current) => ({ ...current, [category.id]: value }))}
                run={run}
              />
            ))}
          </div>
        </details>
      </Card>

      <Card>
        <details open>
          <summary className="cursor-pointer text-base font-semibold">2. Columnas de Proyección</summary>
          <form
            className="mt-4 grid gap-2 md:grid-cols-[1fr_130px_100px]"
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const result = await createProjectionColumnAction({ name: columnName, type: columnType, description: columnDescription, displayOrder: Number(columnOrder) });
                setColumnName(''); setColumnType('expense'); setColumnDescription(''); setColumnOrder('0');
                return result;
              });
            }}
          >
            <input className="rounded-md border border-slate-300 p-2 text-sm" placeholder="Nombre de columna" value={columnName} onChange={(event) => setColumnName(event.target.value)} disabled={isPending} />
            <select className="rounded-md border border-slate-300 bg-white p-2 text-sm" value={columnType} onChange={(event) => setColumnType(event.target.value as ColumnType)} disabled={isPending}>
              <option value="income">Ingreso</option><option value="expense">Gasto</option>
            </select>
            <input className="rounded-md border border-slate-300 p-2 text-sm" type="number" min="0" value={columnOrder} onChange={(event) => setColumnOrder(event.target.value)} disabled={isPending} />
            <input className="rounded-md border border-slate-300 p-2 text-sm md:col-span-2" placeholder="Descripción opcional" value={columnDescription} onChange={(event) => setColumnDescription(event.target.value)} disabled={isPending} />
            <Button disabled={isPending || !columnName.trim()}>{isPending ? 'Guardando...' : 'Crear columna'}</Button>
          </form>

          <div className="mt-4 space-y-3">
            {data.projectionColumns.map((column) => (
              <ProjectionColumnCard
                key={column.id}
                column={column}
                categories={projectableAssignmentCategories}
                selectedCategoryId={assignmentSelection[column.id] ?? ''}
                isPending={isPending}
                isEditing={editingColumnId === column.id}
                onToggleEdit={() => setEditingColumnId((current) => current === column.id ? null : column.id)}
                onSelectedCategoryChange={(value) => setAssignmentSelection((current) => ({ ...current, [column.id]: value }))}
                run={run}
              />
            ))}
          </div>
        </details>
      </Card>

      <CategoryAuditSection audit={data.categoryAudit} categories={activeCategories} isPending={isPending} run={run} />
    </div>
  );
}

function CategoryCard({ category, isPending, isEditing, editingSubcategoryId, subcategoryDraft, onToggleEdit, onToggleSubcategoryEdit, onSubcategoryDraftChange, run }: {
  category: FinancialCategory;
  isPending: boolean;
  isEditing: boolean;
  editingSubcategoryId: string | null;
  subcategoryDraft: string;
  onToggleEdit: () => void;
  onToggleSubcategoryEdit: (id: string | null) => void;
  onSubcategoryDraftChange: (value: string) => void;
  run: (action: () => Promise<{ message?: string } | unknown>) => void;
}) {
  const [name, setName] = useState(category.name);
  const [type, setType] = useState<CategoryType>(category.type);
  const [noProjectable, setNoProjectable] = useState(category.noProjectable);
  return (
    <details className="rounded-xl border border-slate-200 p-3" open={isEditing}>
      <summary className="cursor-pointer font-medium">
        {category.name} <span className="text-xs text-slate-500">· {category.key} · {categoryTypeLabels[category.type]} · {category.isActive ? 'Activa' : 'Inactiva'}{category.noProjectable ? ' · No proyectable' : ''}</span>
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onToggleEdit} disabled={isPending}>Editar</Button>
          <Button type="button" variant="outline" onClick={() => run(() => toggleFinancialCategoryAction({ categoryId: category.id, isActive: !category.isActive }))} disabled={isPending}>{category.isActive ? 'Desactivar' : 'Activar'}</Button>
        </div>
        {isEditing && (
          <form className="grid gap-2 md:grid-cols-[1fr_160px_auto]" onSubmit={(event) => { event.preventDefault(); run(() => updateFinancialCategoryAction({ categoryId: category.id, name, type, noProjectable, isActive: category.isActive })); }}>
            <input className="rounded-md border p-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} />
            <select className="rounded-md border bg-white p-2 text-sm" value={type} onChange={(event) => setType(event.target.value as CategoryType)}><option value="income">Ingreso</option><option value="expense">Gasto</option><option value="both">Ambos</option></select>
            <Button disabled={isPending}>Guardar</Button>
            <label className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700 md:col-span-3">
              <input className="mr-2" type="checkbox" checked={noProjectable} onChange={(event) => setNoProjectable(event.target.checked)} />
              Excluir de Proyección
              <span className="block pl-5 text-slate-500">Usa esta opción para movimientos que no deben alimentar columnas de Proyección, como transferencias internas, pagos de tarjeta o recuperación de préstamos.</span>
            </label>
            <div className="md:col-span-3">
              <Button type="button" variant="outline" disabled={isPending || !category.canDelete} onClick={() => { if (window.confirm('¿Eliminar esta categoría?')) run(() => deleteFinancialCategoryAction({ categoryId: category.id })); }}>Eliminar categoría</Button>
              {category.deleteBlockedReason && <p className="mt-1 text-xs text-amber-700">{category.deleteBlockedReason}</p>}
            </div>
          </form>
        )}
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); run(async () => { const result = await createFinancialSubcategoryAction({ financialCategoryId: category.id, name: subcategoryDraft }); onSubcategoryDraftChange(''); return result; }); }}><input className="min-w-0 flex-1 rounded-md border p-2 text-sm" placeholder="Nueva subcategoría" value={subcategoryDraft} onChange={(event) => onSubcategoryDraftChange(event.target.value)} /><Button disabled={isPending || !subcategoryDraft.trim()}>Agregar</Button></form>
        <div className="grid gap-2 md:grid-cols-2">
          {category.subcategories.map((subcategory) => <SubcategoryRow key={subcategory.id} subcategory={subcategory} isEditing={editingSubcategoryId === subcategory.id} isPending={isPending} onToggleEdit={() => onToggleSubcategoryEdit(editingSubcategoryId === subcategory.id ? null : subcategory.id)} run={run} />)}
        </div>
      </div>
    </details>
  );
}

function SubcategoryRow({ subcategory, isEditing, isPending, onToggleEdit, run }: { subcategory: FinancialCategory['subcategories'][number]; isEditing: boolean; isPending: boolean; onToggleEdit: () => void; run: (action: () => Promise<{ message?: string } | unknown>) => void }) {
  const [name, setName] = useState(subcategory.name);
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>{subcategory.name} <span className="text-xs text-slate-500">· {subcategory.key} · {subcategory.isActive ? 'Activa' : 'Inactiva'}</span></span>
        <div className="flex gap-1">
          <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={onToggleEdit} disabled={isPending}>Editar</Button>
          <Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => run(() => toggleFinancialSubcategoryAction({ subcategoryId: subcategory.id, isActive: !subcategory.isActive }))} disabled={isPending}>{subcategory.isActive ? 'Desactivar' : 'Activar'}</Button>
        </div>
      </div>
      {isEditing && (
        <div className="mt-2 space-y-2">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); run(() => updateFinancialSubcategoryAction({ subcategoryId: subcategory.id, financialCategoryId: subcategory.financialCategoryId, name, isActive: subcategory.isActive })); }}>
            <input className="min-w-0 flex-1 rounded-md border p-2" value={name} onChange={(event) => setName(event.target.value)} />
            <Button disabled={isPending}>Guardar</Button>
          </form>
          <div>
            <Button type="button" variant="outline" className="h-8 px-2 text-xs" disabled={isPending || !subcategory.canDelete} onClick={() => { if (window.confirm('¿Eliminar esta subcategoría?')) run(() => deleteFinancialSubcategoryAction({ subcategoryId: subcategory.id })); }}>Eliminar subcategoría</Button>
            {subcategory.deleteBlockedReason && <p className="mt-1 text-xs text-amber-700">{subcategory.deleteBlockedReason}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectionColumnCard({ column, categories, selectedCategoryId, isPending, isEditing, onToggleEdit, onSelectedCategoryChange, run }: { column: ProjectionColumn; categories: FinancialCategory[]; selectedCategoryId: string; isPending: boolean; isEditing: boolean; onToggleEdit: () => void; onSelectedCategoryChange: (value: string) => void; run: (action: () => Promise<{ message?: string } | unknown>) => void }) {
  const [name, setName] = useState(column.name);
  const [type, setType] = useState<ColumnType>(column.type);
  const [description, setDescription] = useState(column.description ?? '');
  const [displayOrder, setDisplayOrder] = useState(String(column.displayOrder));
  return (
    <details className="rounded-xl border border-slate-200 p-3" open={isEditing}>
      <summary className="cursor-pointer font-medium">{column.name} <span className="text-xs text-slate-500">· {column.key} · {columnTypeLabels[column.type]} · orden {column.displayOrder} · {column.isActive ? 'Activa' : 'Inactiva'}</span></summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onToggleEdit} disabled={isPending}>Editar</Button>
          <Button type="button" variant="outline" onClick={() => run(() => toggleProjectionColumnAction({ columnId: column.id, isActive: !column.isActive }))} disabled={isPending}>{column.isActive ? 'Desactivar' : 'Activar'}</Button>
        </div>
        {isEditing && (
          <div className="space-y-2">
            <form className="grid gap-2 md:grid-cols-[1fr_130px_100px_auto]" onSubmit={(event) => { event.preventDefault(); run(() => updateProjectionColumnAction({ columnId: column.id, name, type, description, displayOrder: Number(displayOrder), isActive: column.isActive })); }}>
              <input className="rounded-md border p-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} />
              <select className="rounded-md border bg-white p-2 text-sm" value={type} onChange={(event) => setType(event.target.value as ColumnType)}><option value="income">Ingreso</option><option value="expense">Gasto</option></select>
              <input className="rounded-md border p-2 text-sm" type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />
              <Button disabled={isPending}>Guardar</Button>
              <input className="rounded-md border p-2 text-sm md:col-span-4" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" />
            </form>
            <div>
              <Button type="button" variant="outline" disabled={isPending || !column.canDelete} onClick={() => { if (window.confirm('¿Eliminar esta columna de Proyección?')) run(() => deleteProjectionColumnAction({ columnId: column.id })); }}>Eliminar columna</Button>
              {column.deleteBlockedReason && <p className="mt-1 text-xs text-amber-700">{column.deleteBlockedReason}</p>}
            </div>
          </div>
        )}
        <div>
          <p className="text-sm font-medium">Categorías asignadas</p>
          <div className="mt-2 flex flex-wrap gap-2">{column.categories.length ? column.categories.map((category) => <span key={category.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">{category.name}<button type="button" className="font-bold text-red-600" onClick={() => run(() => removeCategoryFromProjectionColumnAction({ projectionColumnId: column.id, financialCategoryId: category.id }))} disabled={isPending}>×</button></span>) : <span className="text-sm text-slate-500">Sin categorías asignadas</span>}</div>
        </div>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!selectedCategoryId) return; run(() => assignCategoryToProjectionColumnAction({ projectionColumnId: column.id, financialCategoryId: selectedCategoryId })); }}>
          <select className="min-w-0 flex-1 rounded-md border bg-white p-2 text-sm" value={selectedCategoryId} onChange={(event) => onSelectedCategoryChange(event.target.value)}><option value="">Asignar categoría principal...</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <Button disabled={isPending || !selectedCategoryId}>Asignar</Button>
        </form>
      </div>
    </details>
  );
}

function CategoryAuditSection({ audit, categories, isPending, run }: { audit: ConfigurationData['categoryAudit']; categories: FinancialCategory[]; isPending: boolean; run: (action: () => Promise<{ message?: string } | unknown>) => void }) {
  return (
    <Card>
      <details open>
        <summary className="cursor-pointer text-base font-semibold">3. Auditoría de categorías</summary>
        <p className="mt-2 text-sm text-slate-600">Revisa movimientos que no están alimentando ninguna columna de Proyección o que usan categorías antiguas.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Categorías sin columna" value={String(audit.summary.problemCategoryCount)} />
          <Metric label="Movimientos afectados" value={String(audit.summary.problemMovementCount)} />
          <Metric label="Monto total afectado" value={formatCurrencyMXN(audit.summary.problemTotal)} />
        </div>
        {audit.groups.length === 0 ? <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">No hay movimientos pendientes de clasificar para Proyección.</p> : <div className="mt-4 space-y-3">{audit.groups.map((group) => <AuditGroupCard key={`${group.status}-${group.category}`} group={group} categories={categories} isPending={isPending} run={run} />)}</div>}
        {audit.noProjectableGroups.length > 0 && <details className="mt-4 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-700">No proyectables informativos ({audit.summary.noProjectableMovementCount})</summary><div className="mt-3 space-y-3">{audit.noProjectableGroups.map((group) => <AuditGroupCard key={`np-${group.category}`} group={group} categories={categories} isPending={isPending} run={run} />)}</div></details>}
      </details>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-slate-900">{value}</p></div>;
}

function AuditGroupCard({ group, categories, isPending, run }: { group: CategoryAuditGroup; categories: FinancialCategory[]; isPending: boolean; run: (action: () => Promise<{ message?: string } | unknown>) => void }) {
  return (
    <details className="rounded-xl border border-slate-200 p-3">
      <summary className="cursor-pointer font-medium">
        Categoría: {group.categoryName ?? group.category} <span className="text-xs text-slate-500">· {auditStatusLabels[group.status]} · Total: {formatCurrencyMXN(group.total)} · Movimientos: {group.movementCount}</span>
      </summary>
      <div className="mt-3 space-y-3">
        {group.movements.map((movement) => <AuditMovementRow key={movement.id} movement={movement} categories={categories} isPending={isPending} run={run} />)}
      </div>
    </details>
  );
}

function AuditMovementRow({ movement, categories, isPending, run }: { movement: CategoryAuditMovement; categories: FinancialCategory[]; isPending: boolean; run: (action: () => Promise<{ message?: string } | unknown>) => void }) {
  const initialCategory = categories.some((category) => category.key === movement.category) ? movement.category : '';
  const [categoryKey, setCategoryKey] = useState(initialCategory);
  const selectedCategory = categories.find((category) => category.key === categoryKey);
  const initialSubcategory = selectedCategory?.subcategories.some((subcategory) => subcategory.key === movement.subcategory && subcategory.isActive) ? movement.subcategory ?? '' : '';
  const [subcategoryKey, setSubcategoryKey] = useState(initialSubcategory);
  const activeSubcategories = selectedCategory?.subcategories.filter((subcategory) => subcategory.isActive) ?? [];

  return (
    <div className="rounded-lg bg-slate-50 p-3 text-sm">
      <div className="grid gap-1 md:grid-cols-2">
        <p><span className="font-medium">Fecha:</span> {movement.date ? new Date(movement.date).toLocaleDateString('es-MX') : 'Sin fecha'}</p>
        <p><span className="font-medium">Monto:</span> {formatCurrencyMXN(movement.amount)}</p>
        <p><span className="font-medium">Descripción:</span> {movement.description}</p>
        <p><span className="font-medium">Cuenta:</span> {movement.accountName ?? 'Sin cuenta'}</p>
        <p><span className="font-medium">Tipo:</span> {movement.type}</p>
        <p><span className="font-medium">Estado:</span> {auditStatusLabels[movement.status]}</p>
        <p><span className="font-medium">Categoría actual:</span> {movement.category}</p>
        <p><span className="font-medium">Subcategoría actual:</span> {movement.subcategory ?? 'Sin subcategoría'}</p>
      </div>
      <form className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); if (!categoryKey) return; run(() => reclassifyCategoryAuditMovementAction({ movementId: movement.id, category: categoryKey, subcategory: subcategoryKey || null })); }}>
        <select className="rounded-md border border-slate-300 bg-white p-2" value={categoryKey} onChange={(event) => { setCategoryKey(event.target.value); setSubcategoryKey(''); }} disabled={isPending} required>
          <option value="">Reclasificar a categoría...</option>
          {categories.map((category) => <option key={category.id} value={category.key}>{category.name}{category.noProjectable ? ' (no proyectable)' : ''}</option>)}
        </select>
        <select className="rounded-md border border-slate-300 bg-white p-2" value={subcategoryKey} onChange={(event) => setSubcategoryKey(event.target.value)} disabled={isPending || !categoryKey}>
          <option value="">Sin subcategoría</option>
          {activeSubcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.key}>{subcategory.name}</option>)}
        </select>
        <Button disabled={isPending || !categoryKey}>Guardar</Button>
      </form>
    </div>
  );
}
