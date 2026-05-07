'use server';

import { revalidatePath } from 'next/cache';
import {
  createExtraWorkEntry,
  extraWorkCreateSchema,
  extraWorkPaidSchema,
  getExtraWorkHistory,
  getPendingExtraWorkEntries,
  markExtraWorkEntryAsPaid
} from '@/lib/db/queries';

export async function createExtraWorkAction(payload: unknown) {
  const parsed = extraWorkCreateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el extra.');
  }

  await createExtraWorkEntry(parsed.data);
  revalidatePath('/extras');

  return { success: true, message: 'Extra registrado correctamente.' };
}

export async function markExtraWorkAsPaidAction(payload: unknown) {
  const parsed = extraWorkPaidSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el extra a marcar como pagado.');
  }

  await markExtraWorkEntryAsPaid(parsed.data);
  revalidatePath('/extras');

  return { success: true, message: 'Extra marcado como pagado.' };
}

export async function loadPendingExtraWorkAction() {
  return getPendingExtraWorkEntries();
}

export async function loadExtraWorkHistoryAction() {
  return getExtraWorkHistory();
}
