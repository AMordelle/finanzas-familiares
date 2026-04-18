import React from 'react';
import { AppShell } from '@/components/app-shell';
import { Card } from '@/components/ui/card';
import { getDashboardData } from '@/lib/db/queries';
import { financialNarrator } from '@/lib/ai/financialNarrator';
import { FinancialStatusDetailsCard } from '@/components/analysis/financial-status-details-card';
import { ExtraordinaryIncomeAdvisorCard } from '@/components/analysis/extraordinary-income-advisor-card';

export default async function AnalisisPage() {
  const data = await getDashboardData();


  const suggestedExtraordinaryAmount = Number((data.monthlyOFH > 0 ? data.monthlyOFH * 0.5 : 15000).toFixed(2));

  const extraordinaryContext = {
    monthlyOFH: data.monthlyOFH,
    availableMoney: data.availableMoney,
    financialRadar: data.financialRadar,
    financialStatus: data.financialStatus,
    priorityDiagnostics: data.priorityDiagnostics.map((item) => item.title)
  };

  const texto = financialNarrator({
    ofh: Number.isFinite(Number(data.monthlyOFH)) ? Number(data.monthlyOFH) : 0,
    availableMoney: Number.isFinite(Number(data.availableMoney)) ? Number(data.availableMoney) : 0,
    diagnoses: data.diagnoses.length ? data.diagnoses : ['Sin diagnósticos críticos por ahora']
  });

  return (
    <AppShell title="Análisis y asistente financiero">
      <section className="grid gap-4">
        <FinancialStatusDetailsCard financialStatus={data.financialStatus} />
        <Card>
          <h2 className="font-semibold">Resumen general</h2>
          <p className="mt-3 text-slate-700">{texto}</p>
        </Card>
        <ExtraordinaryIncomeAdvisorCard
          context={extraordinaryContext}
          suggestedAmount={suggestedExtraordinaryAmount}
          suggestedLabel="Aguinaldo / ingreso extraordinario"
        />
      </section>
    </AppShell>
  );
}
