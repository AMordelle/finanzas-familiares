'use server';
import { revalidatePath } from 'next/cache';
import { createFlowAllocation, deleteFlowAllocation, flowAllocationCreateSchema, flowAllocationDeleteSchema } from '@/lib/flows/service';

export async function createFlowAllocationAction(payload: unknown) {
  const parsed = flowAllocationCreateSchema.safeParse(payload);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar la asignación.');
  await createFlowAllocation(parsed.data);
  revalidatePath('/flujos');
  return { success: true, message: 'Dinero asignado virtualmente.' };
}

export async function deleteFlowAllocationAction(payload: unknown) {
  const parsed = flowAllocationDeleteSchema.safeParse(payload);
  if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? 'No se pudo validar la asignación.');
  await deleteFlowAllocation(parsed.data.allocationId);
  revalidatePath('/flujos');
  return { success: true, message: 'Asignación eliminada.' };
}
