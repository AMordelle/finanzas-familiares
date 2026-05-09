'use server';

import { revalidatePath } from 'next/cache';
import {
  createFinancialClosure,
  deleteFinancialClosure,
  financialClosureActionSchema,
  financialClosureCreateSchema,
  recalculateFinancialClosure
} from '@/lib/db/queries';

export async function createFinancialClosureAction(formData: FormData) {
  const payload = {
    type: formData.get('type'),
    periodStart: formData.get('periodStart'),
    periodEnd: formData.get('periodEnd'),
    notes: formData.get('notes')
  };

  const parsed = financialClosureCreateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el cierre.');
  }

  await createFinancialClosure(parsed.data);
  revalidatePath('/cierre');
}

export async function recalculateFinancialClosureAction(formData: FormData) {
  const parsed = financialClosureActionSchema.safeParse({ closureId: formData.get('closureId') });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el cierre.');
  }

  await recalculateFinancialClosure(parsed.data);
  revalidatePath('/cierre');
}

export async function deleteFinancialClosureAction(formData: FormData) {
  const parsed = financialClosureActionSchema.safeParse({ closureId: formData.get('closureId') });
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el cierre.');
  }

  await deleteFinancialClosure(parsed.data);
  revalidatePath('/cierre');
}
