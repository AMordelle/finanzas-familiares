import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 p-6">
      <Card className="p-8">
        <h1 className="text-4xl font-bold text-primaria">Finanzas Familiares</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          Entiende cómo está tu hogar hoy, qué presión viene y qué decisiones te conviene tomar con un lenguaje claro y humano.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild><Link href="/onboarding">Comenzar onboarding</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard">Ir al dashboard</Link></Button>
        </div>
      </Card>
    </main>
  );
}
