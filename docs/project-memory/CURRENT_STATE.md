# Estado actual — Finanzas Familiares

> Fuente de contexto rápido para retomar el proyecto. Debe reflejar el presente, no funcionar como diario histórico.

## Objetivo

Aplicación web responsiva para gestionar las finanzas del hogar compartido, priorizando una captura sencilla y una interpretación financiera útil para la familia.

## Stack vigente

- Next.js 15.5.25 (App Router) + React 19.2.8 + TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres)
- Drizzle ORM
- Zod
- Vitest 5.0.1
- Vinext 1.0.0-beta.11 + Cloudflare Workers (compatibilidad y caché KV integradas; despliegue de la aplicación real todavía pendiente)
- OpenAI Responses API en módulos de IA

## Arquitectura relevante

- La lógica financiera determinística vive en TypeScript y no depende de IA.
- La IA interpreta y redacta, pero no modifica directamente la base de datos.
- El flujo conversacional previsto es: interpretar → validar faltantes → confirmar → guardar → recalcular.

## Estado funcional conocido

- Cuentas: funcional.
- Movimientos: funcional y pieza central para consulta mediante filtros. El PR #90 integró el filtro dependiente por subcategoría, compatibilidad con subcategorías históricas y el control para volver al inicio del historial.
- Extras: funcional para tiempo extra, destajo y comidas; permite crear, editar, marcar pagado y eliminar.
- Flujos: en desarrollo activo.
- Registro: funcional con captura conversacional multi-movimiento integrada mediante PR #58; permite interpretar y guardar varios movimientos en una sola entrada conservando trazabilidad individual.
- Cierre semanal/mensual: pendiente de evolución.
- Publicación para acceso desde distintos dispositivos: en preparación final; el Worker marcador está protegido por Cloudflare Access y la compatibilidad, los secretos y la caché KV necesarios para desplegar la aplicación real ya están configurados.
- Dashboard/IA: alcance futuro por definir.

El repositorio contiene además rutas para otros módulos y pantallas; su mera existencia no implica que estén terminados o visibles en la navegación actual.

## Estado técnico

- Rama base: `main`.
- El último bloque funcional integrado es el PR #90, relacionado con el filtro por subcategoría y navegación del historial de Movimientos.
- El PR #102 modernizó el framework a Next.js 15.5.25 y React 19.2.8, incorporó un lockfile reproducible y quedó integrado después de pasar tipado, lint, 370 pruebas, build y validación local de los módulos y rutas dinámicas principales.
- No hay CI automático registrado actualmente; las validaciones críticas dependen de pruebas ejecutadas por Codex/desarrollo y de validación local antes del merge.
- El PR #104 integró Vinext y la configuración de Cloudflare Workers, declaró Node.js `>=22.12.0` y conservó en paralelo el flujo convencional de Next.js. La validación confirmó 100% de compatibilidad, 370 pruebas, ambos builds, dry run de Wrangler y funcionamiento local en Next.js, Vinext y Workers.
- El PR #106 integró el runbook del despliegue privado: destino `https://finanzas-familiares.amordelle.workers.dev/`, Cloudflare Access con OTP y autorización inicial exclusiva para `wilcas0207@gmail.com`. El Worker marcador ya está protegido y el acceso autorizado/no autorizado fue validado.
- El PR #108 integró `kvDataAdapter()` y el binding `VINEXT_KV_CACHE`, eliminó el bloqueo de caché persistente de Vinext y pasó build, compatibilidad, dry run y validación local de todos los módulos. La aplicación real todavía no se ha desplegado.

## Baseline técnico de Supabase

Decisión confirmada el 2026-09-15:

- El esquema actual del proyecto Supabase `finanzas-familiares` se preserva como baseline técnico por contener la estructura y los datos reales vigentes.
- Preservar ese baseline no aprueba funcionalmente el PR #73 ni convierte automáticamente en canónico el código que todavía no está integrado en `main`.
- Antes de nuevas migraciones o de un despliegue público sin protección adicional, debe reconciliarse el esquema remoto con `lib/db/schema.ts` y con las migraciones versionadas.
- Supabase CLI gobernará el historial canónico futuro en `supabase/migrations/`; Drizzle ORM se conservará como modelo tipado sincronizado, sin mantener una segunda cadena activa de migraciones.
- La reconstrucción y validación del baseline en una instancia local queda pausada por ahora; Docker y Supabase local no serán requisitos del siguiente bloque de trabajo.

Respaldo verificado el 2026-09-20:

- Exportación lógica externa en formato personalizado realizada con `pg_dump 18.6` mediante el session pooler, sin modificar la base activa.
- Archivo de 513,323 bytes, validado correctamente mediante el catálogo de `pg_restore`.
- Catálogo con 603 entradas y 29 entradas `TABLE DATA` del esquema `public`.
- SHA-256: `04102ECB53BDED4B3FD3FC47ED20D8E0210E0762480F861CBFD6870E3B600788`.
- El respaldo contiene datos reales y permanece fuera de Git; la memoria conserva únicamente evidencia no sensible.

Deriva verificada:

- Supabase no registra historial de migraciones, mientras `main` contiene 15 archivos incrementales entre `0001` y `0014` y no contiene una migración base completa.
- Existen dos migraciones con prefijo `0006`.
- La base remota ya contiene `calendar_day`, `calendar_month` y `financial_subcategory_id`, además de restricciones e índices relacionados con el PR #73; esos campos contienen datos, aunque el PR sigue abierto y no aprobado.
- La base remota contiene también `transactions.projection_type`, que no está representado en el esquema ni en las migraciones de `main`.
- La reconciliación debe conservar datos, producir una fuente reproducible y mantener separada la aprobación funcional del PR #73.

## Trabajo pausado

### PR #73 — Calendario individual de compromisos

Estado: abierto, no integrado y pausado mientras se priorizan funcionalidades de otros módulos. El módulo Flujos no se utiliza actualmente.

Objetivo:
- Usar las subcategorías como fuente de verdad para los compromisos financieros, sin crear una tabla adicional de compromisos.
- Permitir calendario individual por subcategoría según periodicidad.
- Respetar `tracking_start_date` al generar obligaciones.

Cambios relevantes reportados:
- Migración `0015_add_subcategory_commitment_calendar.sql`.
- `calendar_day` y `calendar_month` en subcategorías financieras.
- Relación de `flow_periods` con `financial_subcategory_id`.
- Generación de periodos por subcategoría/vencimiento.
- Configuración de calendario desde la UI de subcategorías.
- Estados de Flujos `Pendiente de iniciar` y `Requiere configuración`.

Validación reportada por el PR:
- 23 pruebas focalizadas pasaron.

Resultado de revisión asistida:
- Dictamen: `CORREGIR ANTES`.
- La identidad única vigente y el `onConflict` no garantizan obligaciones independientes por subcategoría.
- Un flujo con compromisos completos e incompletos puede ocultar el estado `Requiere configuración`.
- La implementación propuesta introduce una regresión para subcategorías semanales calculadas.
- Faltan pruebas de integración para identidad/idempotencia persistida y estados mixtos.
- La rama está desactualizada y GitHub la marca como no mergeable.

Cuando se retome Flujos, el trabajo existente del PR #73 y la estructura/datos preservados en Supabase deben utilizarse como antecedente. La nueva implementación debe partir del `main` vigente, conservar los datos y corregir conjuntamente los bloqueos ya identificados antes de validación local.

## Estrategia de seguridad y acceso privado

Decisión confirmada el 2026-09-22:

- La preparación del despliegue seguirá una estrategia progresiva: Cloudflare Access como perímetro privado, cierre del acceso anónimo directo a Supabase y adopción posterior de Supabase Auth con RLS por hogar.
- El PR #104 preparó la compatibilidad con Cloudflare Workers, el PR #106 integró el procedimiento controlado y el PR #108 añadió la caché KV persistente requerida por Vinext. Cloudflare Access ya protege el Worker marcador y autoriza únicamente `wilcas0207@gmail.com`; los secretos del Worker y el namespace KV también están configurados. La aplicación real y las capas posteriores de seguridad todavía no se han desplegado ni implementado.
- El cierre de la Data API anónima y la migración hacia sesiones de usuario se tratarán en cambios posteriores, pequeños y separados.
- `SUPABASE_SERVICE_ROLE_KEY` sólo puede permanecer del lado servidor y deberá configurarse como secreto; su uso rutinario se retirará progresivamente al adoptar Auth/RLS.

## Riesgos actuales

- El proyecto Supabase expone 17 tablas públicas con RLS deshabilitado; otras siete tienen RLS habilitado sin políticas, y `extra_work_entries` usa una política autenticada sin aislamiento por hogar. El acceso mayoritario mediante `supabaseAdmin` evita RLS. Esto bloquea un despliegue público seguro hasta definir Auth y aislamiento por hogar.
- La base remota contiene cambios y datos que no pueden reproducirse desde `main`; no debe reiniciarse ni alterarse destructivamente durante la reconciliación.
- Existen PR antiguos abiertos, varios con conflictos o propuestas solapadas; no deben asumirse vigentes por el mero hecho de estar abiertos.
- No hay CI que confirme automáticamente pruebas, tipado y build.
- La memoria viva se está incorporando ahora; cualquier dato histórico no confirmado debe contrastarse con código, GitHub y decisiones vigentes antes de elevarlo a regla.

## Siguiente paso

Actualizar `main` después del PR #108, realizar el despliegue controlado de la aplicación real en el Worker ya protegido y validar acceso autorizado, bloqueo anónimo, `/api/health` y módulos principales. Después del despliegue estable, preparar Supabase Auth y RLS por hogar como un bloque separado.

## Última actualización

2026-09-24 — Cloudflare Access quedó configurado y validado sobre el Worker marcador; los secretos y el namespace KV están disponibles, y el PR #108 integró la caché persistente requerida por Vinext. El siguiente paso es desplegar y validar la aplicación real protegida.
