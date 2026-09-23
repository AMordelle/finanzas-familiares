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

## Preparación para Cloudflare Workers

El proyecto mantiene dos flujos locales separados:

```bash
# Next.js convencional
npm run dev
npm run build

# Runtime compatible con Cloudflare Workers mediante Vinext
npm run dev:vinext
npm run build:vinext
npm run start:vinext
```

La configuración de Workers vive en `wrangler.jsonc`. Para comprobar localmente el paquete que se enviaría sin publicar nada:

```bash
npm run build:vinext
npx wrangler deploy --dry-run --config dist/server/wrangler.json
```

`npm run deploy:vinext` queda reservado para la fase de publicación. No debe ejecutarse hasta que estén configurados los secretos y Cloudflare Access.

### Variables y secretos

Variables públicas requeridas:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Secretos exclusivos del servidor:

- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `OPENAI_API_KEY`

`OPENAI_MODEL` es opcional. Los valores reales no deben guardarse en Git, `wrangler.jsonc` ni archivos `.dev.vars` versionados. En la fase de publicación, los secretos deben cargarse mediante Wrangler o el panel de Cloudflare.

### Acceso privado

Antes de exponer una URL con datos reales se debe habilitar Cloudflare Access sobre el Worker, permitiendo únicamente los correos familiares autorizados mediante código temporal. Esta protección perimetral no sustituye el cierre posterior del acceso anónimo de Supabase ni la adopción de Supabase Auth y RLS por hogar.

La configuración actual prepara el build y la ejecución local; no crea una aplicación de Access, una URL `workers.dev`, un dominio ni un despliegue remoto.

## Notas de arquitectura

- La lógica financiera vive en TypeScript puro y no depende de IA.
- La IA interpreta y redacta, pero no modifica BD directamente.
- El flujo conversacional debe ser: interpretar → validar faltantes → confirmar → guardar → recalcular.
