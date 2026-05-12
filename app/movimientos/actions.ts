'use server';

import { revalidatePath } from 'next/cache';
import { deleteMovement, movementDeleteSchema, movementEditSchema, movementProjectionTypeUpdateSchema, updateMovement, updateMovementProjectionType } from '@/lib/db/queries';

export async function updateMovementAction(payload: unknown) {
  const parsed = movementEditSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el movimiento.');
  }

  await updateMovement(parsed.data);
  revalidatePath('/dashboard');
  revalidatePath('/movimientos');
  revalidatePath('/cuentas');

  return {
    success: true,
    message: 'Movimiento actualizado correctamente.'
  };
}

export async function deleteMovementAction(payload: unknown) {
  const parsed = movementDeleteSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar el movimiento.');
  }

  await deleteMovement(parsed.data);
  revalidatePath('/dashboard');
  revalidatePath('/movimientos');
  revalidatePath('/cuentas');

  return {
    success: true,
    message: 'Movimiento eliminado correctamente.'
  };
}


export async function updateMovementProjectionTypeAction(payload: unknown) {
  const parsed = movementProjectionTypeUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar la clasificación de proyección.');
  }

  await updateMovementProjectionType(parsed.data);
  revalidatePath('/movimientos');
  revalidatePath('/proyeccion');

  return {
    success: true,
    message: 'Clasificación de proyección actualizada.'
  };
}
