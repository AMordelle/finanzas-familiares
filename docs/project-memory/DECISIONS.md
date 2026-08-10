# Decisiones — Finanzas Familiares

> Registro de decisiones que condicionan el diseño futuro. Las decisiones sustituidas se conservan marcadas como `Sustituida`; nunca deben interpretarse dos decisiones contradictorias como simultáneamente vigentes.

## Estados permitidos

- `Vigente`: decisión aprobada que debe respetarse.
- `En implementación`: decisión aprobada cuya implementación todavía no está integrada/validada completamente.
- `Sustituida`: decisión histórica reemplazada por otra; se conserva solo para entender la evolución.
- `Objetivo operativo`: dirección aprobada del proceso, todavía en adopción progresiva.

> Las fechas anteriores a la creación de esta memoria solo se incorporarán cuando puedan confirmarse. `2026-08-09` identifica las decisiones formalizadas al crear la memoria viva, no necesariamente el día original en que se discutieron por primera vez.

## DEC-001 — Captura simple, interpretación potente

**Estado:** Vigente  
**Formalizada:** 2026-08-09

### Decisión
La experiencia de captura debe ser sencilla para los usuarios del hogar. La complejidad debe concentrarse en la interpretación, cálculos y presentación de información útil, no en exigir más trabajo manual al usuario.

### Consecuencia
Al diseñar nuevas funciones se debe evitar trasladar complejidad técnica o contable innecesaria al formulario de captura.

---

## DEC-002 — La lógica financiera crítica es determinística

**Estado:** Vigente  
**Formalizada:** 2026-08-09

### Decisión
Los cálculos y reglas financieras críticas deben residir en lógica determinística de la aplicación. La IA puede interpretar, explicar y redactar, pero no sustituye las reglas financieras ni modifica directamente la base de datos.

### Consecuencia
Una funcionalidad financiera debe poder validarse mediante código y pruebas independientemente de la salida generativa de IA.

---

## DEC-003 — Los préstamos recibidos no son ingresos

**Estado:** Vigente  
**Formalizada:** 2026-08-09

### Decisión
Un préstamo recibido no debe registrarse como ingreso ordinario del hogar. Debe representarse como una obligación/pasivo y el efectivo recibido debe reflejarse en la cuenta operativa correspondiente.

### Motivo
Evitar inflar artificialmente los ingresos y preservar una lectura real del flujo financiero.

---

## DEC-004 — Calendario de compromisos por subcategoría

**Estado:** En implementación  
**Formalizada:** 2026-08-09  
**Implementación relacionada:** PR #73

### Decisión
Los compromisos financieros utilizarán las subcategorías como fuente de verdad y cada subcategoría podrá tener su propio calendario según su periodicidad. No se añadirá una tabla independiente de compromisos para este propósito.

### Consecuencia
La generación de periodos/obligaciones debe distinguir subcategorías incluso cuando compartan flujo y fecha de vencimiento.

---

## DEC-005 — PR pequeños y funcionales

**Estado:** Vigente  
**Formalizada:** 2026-08-09

### Decisión
El desarrollo debe favorecer pull requests pequeños, enfocados y funcionales en lugar de grandes paquetes de cambios o parches acumulativos.

### Consecuencia
Las ideas útiles de PR antiguos/obsoletos deben reconstruirse desde el `main` vigente cuando sea necesario, no reintroducirse mediante merges riesgosos de ramas antiguas.

---

## DEC-006 — Validación humana antes del merge

**Estado:** Vigente  
**Formalizada:** 2026-08-09

### Decisión
La implementación puede delegarse a Codex y la revisión puede apoyarse en ChatGPT, Skills y GitHub, pero la validación local final y la decisión de merge permanecen bajo control humano.

### Consecuencia
Ningún reporte de IA, prueba focalizada o estado `mergeable` de GitHub sustituye la validación local requerida para cambios relevantes.

---

## DEC-007 — GitHub y la memoria viva sustituyen al chat como fuente de verdad

**Estado:** Vigente  
**Formalizada:** 2026-08-09

### Decisión
Los chats son espacio de análisis y diseño, pero no son la fuente persistente de verdad del proyecto.

- Código y estado técnico: GitHub.
- Estado vigente, reglas, decisiones y mapa funcional: `docs/project-memory/`.
- Procedimientos repetibles: Skills y `WORKFLOW.md`.

### Consecuencia
Una decisión importante acordada en conversación debe terminar reflejada en la memoria viva; un chat nuevo no debe depender de reconstruir manualmente conversaciones anteriores.

---

## DEC-008 — Memoria viva versionada en el repositorio

**Estado:** Vigente  
**Formalizada:** 2026-08-09

### Decisión
La memoria canónica del proyecto vivirá en `docs/project-memory/` dentro del repositorio y será versionada mediante Git.

### Motivo
Permite que ChatGPT, Codex y el desarrollador consulten el mismo contexto y que los cambios de memoria tengan historial y revisión.

---

## DEC-009 — Intervención manual mínima en el pipeline

**Estado:** Sustituida  
**Formalizada:** 2026-08-09  
**Sustituida por:** DEC-010

### Decisión histórica
El flujo debía automatizar tanto como fuera razonable entre el diseño y la validación final, concentrando la intervención manual deseada en conversar y decidir el comportamiento del producto, realizar la validación local y hacer el merge final.

El transporte manual de prompts, resúmenes y estado entre ChatGPT, Codex y GitHub debía reducirse progresivamente.

### Motivo de sustitución
La decisión expresaba la dirección general, pero no definía cuándo debía sincronizarse la memoria viva ni el nivel de supervisión requerido mientras la Skill responsable estuviera en pruebas.

---

## DEC-010 — Actualización de memoria activada por hitos

**Estado:** Objetivo operativo  
**Formalizada:** 2026-08-09

### Decisión
La actualización de la memoria viva forma parte del pipeline y debe activarse por cambios significativos del proyecto, no por una periodicidad fija.

Los hitos que pueden justificar una sincronización incluyen, según corresponda:

1. una conversación de diseño que cierre una decisión o regla nueva;
2. la sustitución explícita de una decisión vigente;
3. un cambio relevante del estado funcional o del siguiente paso;
4. un merge que cambie el estado descrito por la memoria.

Mientras `$actualizar-memoria-proyecto` permanezca en estado `Experimental`, su ejecución será supervisada: se invoca de forma explícita y cualquier cambio se presenta mediante un PR documental para revisión humana. Si no existe conocimiento nuevo confirmado, no se crea rama, commit ni PR.

### Consecuencia
La memoria deja de depender de recordatorios periódicos o de que el usuario reconstruya manualmente qué debe documentarse. La automatización futura puede detectar hitos y proponer o iniciar la sincronización, pero no debe convertir la actualización de memoria en una tarea periódica sin novedades ni eliminar la revisión humana mientras el contrato de la Skill siga en fase experimental.

## Regla de mantenimiento

Cuando una decisión cambie:

1. no borrar silenciosamente la decisión anterior si explica una evolución relevante;
2. marcarla `Sustituida` e indicar qué decisión la reemplaza;
3. crear/actualizar la decisión vigente con su fecha;
4. sincronizar `BUSINESS_RULES.md`, `PRODUCT_MAP.md` y `CURRENT_STATE.md` cuando corresponda.