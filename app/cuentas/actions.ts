'use server';

import { revalidatePath } from 'next/cache';
import {
  accountDeactivateSchema,
  accountUpdateSchema,
  accountUpsertSchema,
  accountReorderSchema,
  createAccount,
  deactivateAccount,
  saveAccountDisplayOrder,
  updateAccount
} from '@/lib/db/queries';

export async function createAccountAction(payload: unknown) {
  const parsed = accountUpsertSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar la cuenta.');
  }

  await createAccount(parsed.data);
  revalidatePath('/cuentas');
  revalidatePath('/dashboard');
  revalidatePath('/registro');

  return { success: true, message: 'Cuenta creada correctamente.' };
}

export async function updateAccountAction(payload: unknown) {
  const parsed = accountUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar la cuenta.');
  }

  await updateAccount(parsed.data);
  revalidatePath('/cuentas');
  revalidatePath('/dashboard');
  revalidatePath('/registro');

  return { success: true, message: 'Cuenta actualizada correctamente.' };
}

export async function deactivateAccountAction(payload: unknown) {
  const parsed = accountDeactivateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar la cuenta a desactivar.');
  }

  await deactivateAccount(parsed.data);
  revalidatePath('/cuentas');
  revalidatePath('/dashboard');
  revalidatePath('/registro');

  return { success: true, message: 'Cuenta desactivada correctamente.' };
}

export async function reorderAccountsAction(payload: unknown) {
  const parsed = accountReorderSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el nuevo orden.');
  }

  await saveAccountDisplayOrder(parsed.data);
  revalidatePath('/cuentas');

  return { success: true, message: 'Orden actualizado correctamente.' };
}
