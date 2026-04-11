'use server';

import { revalidatePath } from 'next/cache';
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
  const intent = enforceFinancialConsistency(transactionIntentSchema.parse(payload));
  await saveConversationalTransaction(intent);
  revalidatePath('/dashboard');
  revalidatePath('/movimientos');
  revalidatePath('/cuentas');
  revalidatePath('/registro');

  return {
    success: true,
    message: 'Movimiento registrado correctamente.'
  };
}
