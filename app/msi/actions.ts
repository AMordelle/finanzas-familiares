'use server';

import { revalidatePath } from 'next/cache';
import { markMsiInstallmentAsPaid, restoreMsiInstallmentToPending } from '@/lib/db/queries';

function revalidateMsiPaths() {
  revalidatePath('/msi');
}

export async function markMsiInstallmentAsPaidAction(payload: unknown) {
  await markMsiInstallmentAsPaid(payload);
  revalidateMsiPaths();
  return { success: true, message: 'Pago MSI marcado como pagado.' };
}

export async function restoreMsiInstallmentToPendingAction(payload: unknown) {
  await restoreMsiInstallmentToPending(payload);
  revalidateMsiPaths();
  return { success: true, message: 'Pago MSI regresado a pendiente.' };
}
