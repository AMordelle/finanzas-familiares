'use server';

import { revalidatePath } from 'next/cache';
import { resolveCategoryInput } from '@/lib/ai/semanticCategory';
import {
  applyFollowUpAnswer,
  batchTransactionInterpretationSchema,
  enforceFinancialConsistency,
  interpretTransactions,
  transactionIntentSchema
} from '@/lib/ai/transactionInterpreter';
import { getAccountsForRegistration, saveConversationalTransaction, saveConversationalTransactionBatch } from '@/lib/db/queries';

export async function getRegistrationAccountsAction() {
  return getAccountsForRegistration();
}

export async function interpretTransactionAction(text: string) {
  const accounts = await getAccountsForRegistration();
  return interpretTransactions(text, accounts);
}

export async function applyFollowUpAnswerAction(current: unknown, answer: string) {
  const intent = transactionIntentSchema.parse(current);
  const accounts = await getAccountsForRegistration();
  return applyFollowUpAnswer(intent, answer, accounts);
}

export async function saveInterpretedTransactionAction(payload: unknown) {
  const parsedIntent = transactionIntentSchema.parse(payload);
  const categoryOverride = extractCategoryOverride(payload);
  const subcategoryOverride = extractSubcategoryOverride(payload);
  const intentPayload = {
    ...parsedIntent,
    category: categoryOverride ?? parsedIntent.category
  };
  if (subcategoryOverride !== null || parsedIntent.subcategory) {
    Object.assign(intentPayload, { subcategory: subcategoryOverride ?? parsedIntent.subcategory });
  }
  const intent = enforceFinancialConsistency(intentPayload);

  await saveConversationalTransaction(intent, {
    happenedAt: resolveMovementDate(payload)
  });
  revalidateRegistrationPaths();

  return {
    success: true,
    message: 'Movimiento registrado correctamente.'
  };
}

export async function saveInterpretedTransactionBatchAction(payload: unknown) {
  const parsedBatch = batchTransactionInterpretationSchema.parse(payload);
  const incompleteItems = parsedBatch.items.filter((item) => item.missingFieldKinds.length > 0);
  if (incompleteItems.length > 0) {
    throw new Error(`Hay ${parsedBatch.items.length - incompleteItems.length} movimientos listos y ${incompleteItems.length} necesita aclaración. Corrige el texto y vuelve a interpretarlo.`);
  }

  const intents = parsedBatch.items.map((item, index) => {
    const intentPayload = {
      ...item,
      category: resolvePayloadCategory(item.category, `movimiento ${index + 1}`)
    };
    const subcategory = resolveOptionalPayloadSubcategory(item.subcategory, `movimiento ${index + 1}`);
    if (subcategory) Object.assign(intentPayload, { subcategory });
    return enforceFinancialConsistency(intentPayload);
  });
  await saveConversationalTransactionBatch(intents, {
    happenedAt: resolveMovementDate(payload)
  });
  revalidateRegistrationPaths();

  return {
    success: true,
    message: `${intents.length} movimientos registrados correctamente.`
  };
}

function revalidateRegistrationPaths() {
  revalidatePath('/dashboard');
  revalidatePath('/movimientos');
  revalidatePath('/cuentas');
  revalidatePath('/registro');
  revalidatePath('/msi');
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
  if (typeof override !== 'string') return null;
  return resolvePayloadCategory(override, 'movimiento');
}

function resolvePayloadCategory(category: unknown, label: string) {
  if (typeof category !== 'string') {
    throw new Error(`La categoría del ${label} no puede estar vacía.`);
  }
  const resolved = resolveCategoryInput(category);
  if (resolved.error || !resolved.value) {
    throw new Error(`${resolved.error ?? 'Categoría inválida'} (${label}).`);
  }
  return resolved.value;
}


function extractSubcategoryOverride(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const override = (payload as Record<string, unknown>).subcategoryOverride;
  return resolveOptionalPayloadSubcategory(override, 'movimiento');
}

function resolveOptionalPayloadSubcategory(subcategory: unknown, label: string) {
  if (subcategory === undefined || subcategory === null) return null;
  if (typeof subcategory !== 'string') throw new Error(`La subcategoría del ${label} no es válida.`);
  if (!subcategory.trim()) return null;
  const resolved = resolveCategoryInput(subcategory);
  if (resolved.error || !resolved.value) throw new Error(`${resolved.error ?? 'Subcategoría inválida'} (${label}).`);
  return resolved.value;
}
