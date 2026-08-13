# Estado actual — Finanzas Familiares

> Fuente de contexto rápido para retomar el proyecto. Debe reflejar el presente, no funcionar como diario histórico.

## Objetivo

Aplicación web responsiva para gestionar las finanzas del hogar compartido, priorizando una captura sencilla y una interpretación financiera útil para la familia.

## Stack vigente

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (Auth + Postgres)
- Drizzle ORM
- Zod
- Vitest
- OpenAI Responses API en módulos de IA

## Arquitectura relevante

- La lógica financiera determinística vive en TypeScript y no depende de IA.
- La IA interpreta y redacta, pero no modifica directamente la base de datos.
- El flujo conversacional previsto es: interpretar → validar faltantes → confirmar → guardar → recalcular.

## Estado funcional conocido

- Cuentas: funcional.
- Movimientos: funcional y pieza central para consulta mediante filtros. Está confirmada su siguiente evolución: filtro dependiente por subcategoría y control para volver al inicio del historial.
- Extras: funcional para tiempo extra, destajo y comidas; permite crear, editar, marcar pagado y eliminar.
- Flujos: en desarrollo activo.
- Registro: funcional con captura conversacional multi-movimiento integrada mediante PR #58; permite interpretar y guardar varios movimientos en una sola entrada conservando trazabilidad individual.
- Cierre semanal/mensual: pendiente de evolución.
- Publicación para acceso desde distintos dispositivos: pendiente.
- Dashboard/IA: alcance futuro por definir.

El repositorio contiene además rutas para otros módulos y pantallas; su mera existencia no implica que estén terminados o visibles en la navegación actual.

## Estado técnico

- Rama base: `main`.
- El último bloque integrado antes del trabajo activo de calendario es el PR #72, relacionado con historial y estado financiero de Flujos.
- No hay CI automático registrado actualmente; las validaciones críticas dependen de pruebas ejecutadas por Codex/desarrollo y de validación local antes del merge.

## Trabajo activo

### PR #73 — Calendario individual de compromisos

Estado: abierto y requiere correcciones antes de validación local.

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

Antes de validación local, la implementación debe reconstruirse o actualizarse desde `main` y corregir conjuntamente esos bloqueos.

## Riesgos actuales

- Existen PR antiguos abiertos, varios con conflictos o propuestas solapadas; no deben asumirse vigentes por el mero hecho de estar abiertos.
- No hay CI que confirme automáticamente pruebas, tipado y build.
- La memoria viva se está incorporando ahora; cualquier dato histórico no confirmado debe contrastarse con código, GitHub y decisiones vigentes antes de elevarlo a regla.

## Siguiente paso

Preparar una especificación autosuficiente para implementar en un PR pequeño el filtro por subcategoría y el control para volver al inicio del historial de Movimientos, partiendo del `main` vigente.

## Última actualización

2026-08-12 — Evolución de Movimientos confirmada: filtro dependiente por subcategoría y control para volver al inicio del historial.