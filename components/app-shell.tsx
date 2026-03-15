import Link from 'next/link';
import { Button } from '@/components/ui/button';

const nav = [
  ['Dashboard', '/dashboard'],
  ['Registro', '/registro'],
  ['Cuentas', '/cuentas'],
  ['Movimientos', '/movimientos'],
  ['Análisis', '/analisis'],
  ['Simulación', '/simulacion'],
  ['Calendario', '/calendario'],
  ['Objetivos', '/objetivos'],
  ['Cierre', '/cierre']
] as const;

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-6xl p-4 md:p-8">
      <header className="mb-6 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold">{title}</h1>
          <nav className="flex flex-wrap gap-2">
            {nav.map(([label, href]) => (
              <Button asChild key={href} variant="outline" className="h-8 px-3 text-xs">
                <Link href={href}>{label}</Link>
              </Button>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
