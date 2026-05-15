'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { ConfigurationData, FinancialCategory, ProjectionColumn } from '@/lib/db/queries';
import {
  assignCategoryToProjectionColumnAction,
  createFinancialCategoryAction,
  createFinancialSubcategoryAction,
  createProjectionColumnAction,
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

export function ConfigurationManager({ data }: Props) {
  const [categoryName, setCategoryName] = useState('');
  const [categoryType, setCategoryType] = useState<CategoryType>('expense');
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
                const result = await createFinancialCategoryAction({ name: categoryName, type: categoryType });
                setCategoryName('');
                setCategoryType('expense');
                return result;
              });
            }}
          >
            <input className="rounded-md border border-slate-300 p-2 text-sm" placeholder="Nombre de categoría principal" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} disabled={isPending} />
            <select className="rounded-md border border-slate-300 bg-white p-2 text-sm" value={categoryType} onChange={(event) => setCategoryType(event.target.value as CategoryType)} disabled={isPending}>
              <option value="income">Ingreso</option><option value="expense">Gasto</option><option value="both">Ambos</option>
            </select>
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
                categories={activeCategories}
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
  return (
    <details className="rounded-xl border border-slate-200 p-3" open={isEditing}>
      <summary className="cursor-pointer font-medium">{category.name} <span className="text-xs text-slate-500">· {category.key} · {categoryTypeLabels[category.type]} · {category.isActive ? 'Activa' : 'Inactiva'}</span></summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onToggleEdit} disabled={isPending}>Editar</Button>
          <Button type="button" variant="outline" onClick={() => run(() => toggleFinancialCategoryAction({ categoryId: category.id, isActive: !category.isActive }))} disabled={isPending}>{category.isActive ? 'Desactivar' : 'Activar'}</Button>
        </div>
        {isEditing && <form className="grid gap-2 md:grid-cols-[1fr_160px_auto]" onSubmit={(event) => { event.preventDefault(); run(() => updateFinancialCategoryAction({ categoryId: category.id, name, type, isActive: category.isActive })); }}><input className="rounded-md border p-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} /><select className="rounded-md border bg-white p-2 text-sm" value={type} onChange={(event) => setType(event.target.value as CategoryType)}><option value="income">Ingreso</option><option value="expense">Gasto</option><option value="both">Ambos</option></select><Button disabled={isPending}>Guardar</Button></form>}
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
  return <div className="rounded-lg bg-slate-50 p-2 text-sm"><div className="flex items-center justify-between gap-2"><span>{subcategory.name} <span className="text-xs text-slate-500">· {subcategory.key} · {subcategory.isActive ? 'Activa' : 'Inactiva'}</span></span><div className="flex gap-1"><Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={onToggleEdit} disabled={isPending}>Editar</Button><Button type="button" variant="outline" className="h-7 px-2 text-xs" onClick={() => run(() => toggleFinancialSubcategoryAction({ subcategoryId: subcategory.id, isActive: !subcategory.isActive }))} disabled={isPending}>{subcategory.isActive ? 'Desactivar' : 'Activar'}</Button></div></div>{isEditing && <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); run(() => updateFinancialSubcategoryAction({ subcategoryId: subcategory.id, financialCategoryId: subcategory.financialCategoryId, name, isActive: subcategory.isActive })); }}><input className="min-w-0 flex-1 rounded-md border p-2" value={name} onChange={(event) => setName(event.target.value)} /><Button disabled={isPending}>Guardar</Button></form>}</div>;
}

function ProjectionColumnCard({ column, categories, selectedCategoryId, isPending, isEditing, onToggleEdit, onSelectedCategoryChange, run }: { column: ProjectionColumn; categories: FinancialCategory[]; selectedCategoryId: string; isPending: boolean; isEditing: boolean; onToggleEdit: () => void; onSelectedCategoryChange: (value: string) => void; run: (action: () => Promise<{ message?: string } | unknown>) => void }) {
  const [name, setName] = useState(column.name);
  const [type, setType] = useState<ColumnType>(column.type);
  const [description, setDescription] = useState(column.description ?? '');
  const [displayOrder, setDisplayOrder] = useState(String(column.displayOrder));
  return <details className="rounded-xl border border-slate-200 p-3" open={isEditing}><summary className="cursor-pointer font-medium">{column.name} <span className="text-xs text-slate-500">· {column.key} · {columnTypeLabels[column.type]} · orden {column.displayOrder} · {column.isActive ? 'Activa' : 'Inactiva'}</span></summary><div className="mt-3 space-y-3"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onToggleEdit} disabled={isPending}>Editar</Button><Button type="button" variant="outline" onClick={() => run(() => toggleProjectionColumnAction({ columnId: column.id, isActive: !column.isActive }))} disabled={isPending}>{column.isActive ? 'Desactivar' : 'Activar'}</Button></div>{isEditing && <form className="grid gap-2 md:grid-cols-[1fr_130px_100px_auto]" onSubmit={(event) => { event.preventDefault(); run(() => updateProjectionColumnAction({ columnId: column.id, name, type, description, displayOrder: Number(displayOrder), isActive: column.isActive })); }}><input className="rounded-md border p-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} /><select className="rounded-md border bg-white p-2 text-sm" value={type} onChange={(event) => setType(event.target.value as ColumnType)}><option value="income">Ingreso</option><option value="expense">Gasto</option></select><input className="rounded-md border p-2 text-sm" type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} /><Button disabled={isPending}>Guardar</Button><input className="rounded-md border p-2 text-sm md:col-span-4" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripción" /></form>}<div><p className="text-sm font-medium">Categorías asignadas</p><div className="mt-2 flex flex-wrap gap-2">{column.categories.length ? column.categories.map((category) => <span key={category.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs">{category.name}<button type="button" className="font-bold text-red-600" onClick={() => run(() => removeCategoryFromProjectionColumnAction({ projectionColumnId: column.id, financialCategoryId: category.id }))} disabled={isPending}>×</button></span>) : <span className="text-sm text-slate-500">Sin categorías asignadas</span>}</div></div><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (!selectedCategoryId) return; run(() => assignCategoryToProjectionColumnAction({ projectionColumnId: column.id, financialCategoryId: selectedCategoryId })); }}><select className="min-w-0 flex-1 rounded-md border bg-white p-2 text-sm" value={selectedCategoryId} onChange={(event) => onSelectedCategoryChange(event.target.value)}><option value="">Asignar categoría principal...</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Button disabled={isPending || !selectedCategoryId}>Asignar</Button></form></div></details>;
}
