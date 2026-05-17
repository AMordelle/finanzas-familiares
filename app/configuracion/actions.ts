'use server';

import { revalidatePath } from 'next/cache';
import {
  assignCategoryToProjectionColumn,
  createFinancialCategory,
  createFinancialSubcategory,
  createProjectionColumn,
  removeCategoryFromProjectionColumn,
  reclassifyCategoryAuditMovement,
  toggleFinancialCategory,
  toggleFinancialSubcategory,
  toggleProjectionColumn,
  updateFinancialCategory,
  updateFinancialSubcategory,
  updateProjectionColumn
} from '@/lib/db/queries';

function revalidateConfigurationPaths() {
  revalidatePath('/configuracion');
  revalidatePath('/movimientos');
  revalidatePath('/registro');
  revalidatePath('/dashboard');
  revalidatePath('/proyeccion');
}

function revalidateAuditPaths() {
  revalidatePath('/configuracion');
  revalidatePath('/movimientos');
  revalidatePath('/proyeccion');
}

export async function createFinancialCategoryAction(payload: unknown) {
  const data = await createFinancialCategory(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Categoría creada correctamente.', data };
}

export async function updateFinancialCategoryAction(payload: unknown) {
  const data = await updateFinancialCategory(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Categoría editada correctamente.', data };
}

export async function toggleFinancialCategoryAction(payload: unknown) {
  await toggleFinancialCategory(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Estado de categoría actualizado.' };
}

export async function createFinancialSubcategoryAction(payload: unknown) {
  const data = await createFinancialSubcategory(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Subcategoría creada correctamente.', data };
}

export async function updateFinancialSubcategoryAction(payload: unknown) {
  const data = await updateFinancialSubcategory(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Subcategoría editada correctamente.', data };
}

export async function toggleFinancialSubcategoryAction(payload: unknown) {
  await toggleFinancialSubcategory(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Estado de subcategoría actualizado.' };
}

export async function createProjectionColumnAction(payload: unknown) {
  const data = await createProjectionColumn(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Columna de Proyección creada correctamente.', data };
}

export async function updateProjectionColumnAction(payload: unknown) {
  const data = await updateProjectionColumn(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Columna editada correctamente.', data };
}

export async function toggleProjectionColumnAction(payload: unknown) {
  await toggleProjectionColumn(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Estado de columna actualizado.' };
}

export async function assignCategoryToProjectionColumnAction(payload: unknown) {
  await assignCategoryToProjectionColumn(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Categoría asignada a columna.' };
}

export async function removeCategoryFromProjectionColumnAction(payload: unknown) {
  await removeCategoryFromProjectionColumn(payload);
  revalidateConfigurationPaths();
  return { success: true, message: 'Categoría removida de columna.' };
}

export async function reclassifyCategoryAuditMovementAction(payload: unknown) {
  const data = await reclassifyCategoryAuditMovement(payload);
  revalidateAuditPaths();
  return { success: true, message: 'Movimiento reclasificado correctamente.', data };
}
