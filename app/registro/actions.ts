'use server';

import { revalidatePath } from 'next/cache';
import {
  applyFollowUpAnswer,
  batchTransactionInterpretationSchema,
  enforceFinancialConsistency,
  interpretTransactions,
  transactionIntentSchema
} from '@/lib/ai/transactionInterpreter';
import { getAccountsForRegistration, getDefaultHouseholdId, saveConversationalTransaction, saveConversationalTransactionBatch, validateCategorySelection } from '@/lib/db/queries';

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
  const householdId = await requireActiveHouseholdForCatalog();
  const selectedCategory = extractCategoryOverride(payload) ?? parsedIntent.category;
  const selectedSubcategory = extractSubcategoryOverride(payload) ?? parsedIntent.subcategory ?? null;
  const validated = await validateCategorySelection(householdId, selectedCategory ?? '', selectedSubcategory);
  const intent = enforceFinancialConsistency({
    ...parsedIntent,
    category: validated.categoryKey,
    subcategory: validated.subcategoryKey
  });

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

  const householdId = await requireActiveHouseholdForCatalog();
  const intents = await Promise.all(parsedBatch.items.map(async (item) => {
    const validated = await validateCategorySelection(householdId, item.category ?? '', item.subcategory ?? null);
    return enforceFinancialConsistency({
      ...item,
      category: validated.categoryKey,
      subcategory: validated.subcategoryKey
    });
  }));
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
  revalidatePath('/proyeccion');
}

async function requireActiveHouseholdForCatalog() {
  const householdId = await getDefaultHouseholdId();
  if (!householdId) throw new Error('No existe un hogar configurado para validar categorías.');
  return householdId;
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
  return override;
}

function extractSubcategoryOverride(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const override = (payload as Record<string, unknown>).subcategoryOverride;
  if (override === undefined || override === null) return null;
  if (typeof override !== 'string') throw new Error('La subcategoría del movimiento no es válida.');
  return override.trim() ? override : null;
}
