'use server';

import { createHouseholdOnboarding, onboardingSchema } from '@/lib/db/queries';

export async function submitOnboardingAction(payload: unknown) {
  const parsed = onboardingSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(parsed.error.errors[0]?.message ?? 'Datos inválidos en onboarding.');
  }

  return createHouseholdOnboarding(parsed.data);
}
