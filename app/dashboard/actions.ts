'use server';

import { runFinancialAdvisorAnalysis } from '@/lib/finance/financialAdvisor';

export async function analyzeFinancialAdvisorAction() {
  return runFinancialAdvisorAnalysis();
}
