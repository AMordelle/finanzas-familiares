# Flujo de desarrollo — Finanzas Familiares

> Procedimiento canónico para evolucionar el proyecto minimizando transporte manual de contexto y manteniendo control humano en las decisiones importantes.

## Objetivo

Mantener continuidad entre chats y sesiones, permitir que ChatGPT/Codex trabajen con contexto actualizado y reducir la intervención manual a los puntos donde aporta mayor valor.

## Fuentes de verdad

- **Código, ramas, commits, PR y estado técnico:** GitHub.
- **Estado actual del proyecto:** `CURRENT_STATE.md`.
- **Decisiones vigentes y su razón:** `DECISIONS.md`.
- **Reglas funcionales:** `BUSINESS_RULES.md`.
- **Procedimiento de desarrollo:** este archivo y Skills reutilizables.
- **Chats:** espacio de análisis y diseño; no son fuente persistente de verdad.

Si las fuentes se contradicen, no se debe adivinar. Se debe contrastar el código/estado real con la memoria y corregir la fuente desactualizada.

## Organización de conversaciones del proyecto

Los chats pueden separarse por módulo, problema o línea de trabajo para mantener cada conversación enfocada. Además, el proyecto mantiene un chat específico de Skills para definir su propósito, revisar su contrato y acordar cambios de comportamiento.

Esta organización no convierte los chats en fuente de verdad. Las conclusiones vigentes que deban sobrevivir al historial conversacional se reflejan en `docs/project-memory/`, y el contrato canónico de cada Skill del proyecto se mantiene en `SKILLS_CATALOG.md`.

## Inicio o reanudación de trabajo

Antes de diseñar o implementar una funcionalidad:

1. Leer `CURRENT_STATE.md`.
2. Leer las secciones relevantes de `BUSINESS_RULES.md` y `DECISIONS.md`.
3. Consultar GitHub para confirmar `main`, PR activos y estado técnico relacionado.
4. Detectar contradicciones entre memoria y repositorio.
5. Corregir/advertir cualquier desactualización antes de basar trabajo nuevo en ella.
6. Continuar desde el siguiente paso vigente.

Un chat nuevo debe poder reconstruir el contexto con estas fuentes sin exigir al usuario que vuelva a explicar decisiones ya registradas.

## Flujo para una funcionalidad

### 1. Diseño conversacional — humano + ChatGPT

- El usuario plantea necesidad, problema u objetivo.
- ChatGPT ayuda a explorar alternativas, casos límite e implicaciones.
- No se implementa mientras la decisión funcional siga ambigua.
- Cuando se alcanza acuerdo, se formula claramente el comportamiento esperado y criterios de aceptación.

### 2. Persistencia de la decisión

La memoria se sincroniza cuando existe un hito significativo, no por una periodicidad fija. Entre los hitos relevantes están una decisión o regla nueva confirmada, la sustitución explícita de una decisión, un cambio relevante del estado/siguiente paso y un merge que cambie lo descrito por la memoria.

Mientras `$actualizar-memoria-proyecto` permanezca en estado `Experimental`:

- su ejecución se invoca de forma explícita;
- debe consultar primero la memoria vigente en `main`;
- sólo prepara cambios cuando detecta conocimiento nuevo confirmado;
- cualquier sincronización se propone mediante un PR documental para revisión humana;
- si no existe novedad real, termina sin crear rama, commit ni PR.

Según el tipo de cambio:

- actualizar `DECISIONS.md` si existe una decisión nueva/reemplazada relevante;
- actualizar `BUSINESS_RULES.md` si cambian reglas funcionales;
- actualizar `PRODUCT_MAP.md` si cambia el papel o relación de un módulo;
- actualizar `CURRENT_STATE.md` si cambia el trabajo activo, estado global o siguiente paso;
- actualizar `WORKFLOW.md` o `SKILLS_CATALOG.md` si cambia el proceso o el contrato/estado de una Skill.

Guardar conclusiones, no el diálogo completo ni ideas descartadas sin valor futuro.

### 3. Especificación para Codex

La especificación debe derivarse del estado real del repositorio y de la memoria vigente e incluir:

- objetivo;
- comportamiento esperado;
- restricciones/reglas de negocio;
- alcance y fuera de alcance;
- casos límite relevantes;
- pruebas esperadas;
- migraciones/compatibilidad cuando corresponda.

Evitar que el usuario tenga que transportar manualmente contexto ya disponible en GitHub o en la memoria viva.

### 4. Implementación — Codex

- Trabajar en rama dedicada.
- Mantener el PR pequeño y enfocado.
- Añadir/actualizar pruebas relevantes.
- Documentar migraciones y riesgos.
- Abrir PR contra `main`.

### 5. Revisión asistida — ChatGPT + Skills + GitHub

Revisar directamente el PR y no depender únicamente del resumen generado por Codex.

Como mínimo comprobar:

- alineación con objetivo y reglas de negocio;
- diff y archivos fuera de alcance;
- migraciones y compatibilidad de datos;
- pruebas añadidas/modificadas;
- riesgos de regresión;
- conflictos o estado del PR;
- checks/CI disponibles;
- protocolo concreto de validación local.

Si se detectan problemas, la corrección debe volver a Codex y repetirse la revisión antes de pedir validación local.

### 6. Validación local — humano

Este punto no se automatiza por defecto.

ChatGPT debe entregar un protocolo específico para el PR. El usuario valida en su entorno local (VS Code/aplicación/base de datos según corresponda) y reporta únicamente resultados relevantes.

No recomendar merge si una validación crítica pendiente puede cambiar la decisión.

### 7. Merge — humano

El merge final a `main` permanece bajo decisión del usuario.

### 8. Cierre y actualización de memoria

Después del merge, si el merge cambia el estado descrito por la memoria, se ejecuta `$actualizar-memoria-proyecto` para:

- confirmar el estado real en GitHub;
- mover la funcionalidad de trabajo activo a terminada cuando corresponda;
- registrar decisiones finales que hayan cambiado durante la implementación;
- actualizar `CURRENT_STATE.md` y el siguiente paso;
- mantener la memoria breve, vigente y sin convertirla en un historial de commits.

Si el merge no introduce ninguna novedad documental real, la Skill no debe producir cambios.

## Automatización prevista

Se pueden utilizar Programación/Work para vigilar eventos que reduzcan trabajo administrativo, por ejemplo:

- cambios en PR activos;
- nuevos commits/checks/revisiones;
- conflictos o riesgos que requieran atención;
- detección de merge para iniciar el cierre documental.

La automatización futura de memoria debe basarse en detección de hitos, no en una ejecución periódica indiscriminada. Las automatizaciones deben avisar según reglas explícitas y no realizar merges por defecto.

## Política para PR antiguos

- Un PR abierto no implica que siga vigente.
- PR con arquitectura antigua, conflictos o alternativas ya superadas no deben mezclarse automáticamente con `main`.
- Si una idea antigua sigue siendo útil, se reevalúa contra el estado actual y preferentemente se reconstruye desde `main`.

## Definición de terminado para un cambio relevante

Un cambio se considera listo para merge cuando, según aplique:

- satisface criterios de aceptación;
- respeta reglas de negocio;
- pruebas relevantes pasan;
- suite/tipado/build requeridos han sido comprobados;
- migraciones han sido evaluadas;
- validación local fue satisfactoria;
- no quedan riesgos críticos conocidos sin decisión explícita.

## Principio operativo

Automatizar transporte de información, inspección repetitiva y seguimiento. Mantener intervención humana en diseño del producto, validación local y merge final.