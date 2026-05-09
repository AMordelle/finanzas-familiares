'use server';

import { revalidatePath } from 'next/cache';
import { createFinancialClosure, financialClosureCreateSchema } from '@/lib/db/queries';

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
