# Finanzas Familiares (MVP)

MVP web responsivo para gestión financiera del hogar compartido, enfocado en interpretación humana de la situación financiera.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS + componentes estilo shadcn/ui
- Supabase (Auth + Postgres)
- Drizzle ORM
- Zod
- OpenAI Responses API (módulos en `lib/ai`)
- Preparado para Vercel

## Módulos principales

- `lib/financial/engine.ts`: motor financiero determinístico (OFH, MRF, diagnósticos, recomendaciones, cierre, calendario, objetivos).
- `lib/ai/*`: interpretación conversacional, narrativas y asistentes de simulación/recurrencia/calendario.
- `lib/db/schema.ts`: esquema relacional Drizzle para hogares, cuentas, transacciones agrupadas, por cobrar, objetivos y snapshots.
- `app/*`: pantallas principales del MVP.

## Pantallas incluidas

- Bienvenida (`/`)
- Onboarding (`/onboarding`)
- Dashboard (`/dashboard`)
- Registro conversacional (`/registro`)
- Cuentas (`/cuentas`)
- Movimientos (`/movimientos`)
- Análisis (`/analisis`)
- Simulación (`/simulacion`)
- Detalle de deuda (`/deudas/[id]`)
- Detalle de por cobrar (`/por-cobrar/[id]`)
- Calendario financiero (`/calendario`)
- Objetivos (`/objetivos`)
- Cierre de periodo (`/cierre`)

## Setup local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env` desde `.env.example` y llena variables.

3. Ejecuta en desarrollo:

```bash
npm run dev
```

4. Corre pruebas:

```bash
npm run test
```

## Drizzle

Generar migraciones:

```bash
npx drizzle-kit generate
```

Aplicar migraciones (según tu flujo):

```bash
npx drizzle-kit push
```

## Despliegue en Vercel

1. Conecta el repositorio en Vercel.
2. Configura variables de entorno (Supabase, DB, OpenAI).
3. Build command: `npm run build`.
4. Output estándar Next.js.

## Notas de arquitectura

- La lógica financiera vive en TypeScript puro y no depende de IA.
- La IA interpreta y redacta, pero no modifica BD directamente.
- El flujo conversacional debe ser: interpretar → validar faltantes → confirmar → guardar → recalcular.
