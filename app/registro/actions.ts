'use server';

import { revalidatePath } from 'next/cache';
import { isApprovedCategory } from '@/lib/ai/semanticCategory';
import { applyFollowUpAnswer, enforceFinancialConsistency, interpretTransaction, transactionIntentSchema } from '@/lib/ai/transactionInterpreter';
import { getAccountsForRegistration, saveConversationalTransaction } from '@/lib/db/queries';

export async function getRegistrationAccountsAction() {
  return getAccountsForRegistration();
}

export async function interpretTransactionAction(text: string) {
  const accounts = await getAccountsForRegistration();
  return interpretTransaction(text, accounts);
}

export async function applyFollowUpAnswerAction(current: unknown, answer: string) {
  const intent = transactionIntentSchema.parse(current);
  const accounts = await getAccountsForRegistration();
  return applyFollowUpAnswer(intent, answer, accounts);
}

export async function saveInterpretedTransactionAction(payload: unknown) {
  const parsedIntent = transactionIntentSchema.parse(payload);
  const categoryOverride = extractCategoryOverride(payload);
  const intent = enforceFinancialConsistency({
    ...parsedIntent,
    category: categoryOverride ?? parsedIntent.category
  });

  await saveConversationalTransaction(intent, {
    happenedAt: resolveMovementDate(payload)
  });
  revalidatePath('/dashboard');
  revalidatePath('/movimientos');
  revalidatePath('/cuentas');
  revalidatePath('/registro');

  return {
    success: true,
    message: 'Movimiento registrado correctamente.'
  };
}

function resolveMovementDate(payload: unknown) {
  const movementDate = extractMovementDate(payload);
  if (!movementDate) {
    return new Date().toISOString();
  }

  const [year, month, day] = movementDate.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date().toISOString();
  }

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).toISOString();
}

function extractMovementDate(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const maybeDate = (payload as Record<string, unknown>).movementDate;
  return typeof maybeDate === 'string' ? maybeDate : null;
}

function extractCategoryOverride(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const override = (payload as Record<string, unknown>).categoryOverride;
  if (typeof override !== 'string' || !isApprovedCategory(override)) return null;
  return override;
}
