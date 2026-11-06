# FARO 1.1 — Laboratorio local y agentes supervisados

**Estado:** política documental propuesta. No instala ni activa runner o agente.

## Objetivo
Extender FARO sin sustituir las reglas vigentes del proyecto: **Fundamentar** objetivos y evidencia; **Aplicar** cambios aislados y pequeños; **Revisar** con pruebas y registros; **Oficializar** solo con revisión y aprobación.

## Modalidades
- Manual asistida: el usuario ejecuta pasos guiados y comparte resultados.
- Runner local: ejecuta trabajos reproducibles en una computadora encendida y disponible; pendiente de configurar y validar para este proyecto.
- Agente supervisado: investiga y prepara cambios en rama aislada con límites de permisos, tiempo y recursos; pendiente de configurar y validar.

El runner ejecuta comandos y no sustituye un agente capaz de razonar. GitHub conserva versiones y PR; se priorizan pruebas locales cuando el laboratorio del proyecto esté preparado.

## Seguridad y control
- Nunca escribir directamente en `main`, fusionar PR o desplegar a producción sin aprobación.
- Nunca operar sobre datos reales, credenciales, secretos o infraestructura crítica sin autorización expresa.
- Nunca ejecutar PR no confiables con secretos en runner self-hosted.
- No relajar pruebas para forzar resultados favorables.
- Cada trabajo declara alcance, commit, directorios autorizados, comandos, tiempo máximo, evidencias, criterios de aceptación y condición de parada.
- Mantener registros y opción de interrupción; avisar solo cuando exista un resultado verificable.

## Reglas particulares
Finanzas Familiares: usar datos de prueba; prohibido modificar Supabase productiva, saldos, movimientos, migraciones, despliegues Cloudflare o secretos sin aprobación específica. Priorizar pruebas automatizadas de doble partida, operaciones atómicas y edición de movimientos. No asumir que hay laboratorio ni runner configurado.

## Memoria Viva
Registrar versión FARO, rutas y herramientas del laboratorio, estado del runner y agente (no instalado/configurado/validado), último commit, comandos de prueba, resultados reales, incidentes y próxima acción. Distinguir siempre intención de implementación efectiva.

## Adopción
La presente actualización solo introduce una política de trabajo; no acredita ejecución de pruebas, instalación de runner ni cambios funcionales.
