# Decisiones vigentes — Finanzas Familiares

> Registro de decisiones que condicionan el diseño futuro. Las decisiones sustituidas deben marcarse como tales; no deben convivir como si ambas siguieran vigentes.

## DEC-001 — Captura simple, interpretación potente

**Estado:** vigente

### Decisión
La experiencia de captura debe ser sencilla para los usuarios del hogar. La complejidad debe concentrarse en la interpretación, cálculos y presentación de información útil, no en exigir más trabajo manual al usuario.

### Consecuencia
Al diseñar nuevas funciones se debe evitar trasladar complejidad técnica o contable innecesaria al formulario de captura.

---

## DEC-002 — La lógica financiera crítica es determinística

**Estado:** vigente

### Decisión
Los cálculos y reglas financieras críticas deben residir en lógica determinística de la aplicación. La IA puede interpretar, explicar y redactar, pero no sustituye las reglas financieras ni modifica directamente la base de datos.

### Consecuencia
Una funcionalidad financiera debe poder validarse mediante código y pruebas independientemente de la salida generativa de IA.

---

## DEC-003 — Los préstamos recibidos no son ingresos

**Estado:** vigente

### Decisión
Un préstamo recibido no debe registrarse como ingreso ordinario del hogar. Debe representarse como una obligación/pasivo y el efectivo recibido debe reflejarse en la cuenta operativa correspondiente.

### Motivo
Evitar inflar artificialmente los ingresos y preservar una lectura real del flujo financiero.

---

## DEC-004 — Calendario de compromisos por subcategoría

**Estado:** en implementación mediante PR #73

### Decisión
Los compromisos financieros utilizarán las subcategorías como fuente de verdad y cada subcategoría podrá tener su propio calendario según su periodicidad. No se añadirá una tabla independiente de compromisos para este propósito.

### Consecuencia
La generación de periodos/obligaciones debe distinguir subcategorías incluso cuando compartan flujo y fecha de vencimiento.

---

## DEC-005 — PR pequeños y funcionales

**Estado:** vigente

### Decisión
El desarrollo debe favorecer pull requests pequeños, enfocados y funcionales en lugar de grandes paquetes de cambios o parches acumulativos.

### Consecuencia
Las ideas útiles de PR antiguos/obsoletos deben reconstruirse desde el `main` vigente cuando sea necesario, no reintroducirse mediante merges riesgosos de ramas antiguas.

---

## DEC-006 — Validación humana antes del merge

**Estado:** vigente

### Decisión
La implementación puede delegarse a Codex y la revisión puede apoyarse en ChatGPT, Skills y GitHub, pero la validación local final y la decisión de merge permanecen bajo control humano.

### Consecuencia
Ningún reporte de IA, prueba focalizada o estado `mergeable` de GitHub sustituye la validación local requerida para cambios relevantes.

---

## DEC-007 — GitHub y la memoria viva sustituyen al chat como fuente de verdad

**Estado:** vigente

### Decisión
Los chats son espacio de análisis y diseño, pero no son la fuente persistente de verdad del proyecto.

- Código y estado técnico: GitHub.
- Estado vigente, reglas y decisiones: `docs/project-memory/`.
- Procedimientos repetibles: Skills y `WORKFLOW.md`.

### Consecuencia
Una decisión importante acordada en conversación debe terminar reflejada en la memoria viva; un chat nuevo no debe depender de reconstruir manualmente conversaciones anteriores.

---

## DEC-008 — Memoria viva versionada en el repositorio

**Estado:** vigente

### Decisión
La memoria canónica del proyecto vivirá en `docs/project-memory/` dentro del repositorio y será versionada mediante Git.

### Motivo
Permite que ChatGPT, Codex y el desarrollador consulten el mismo contexto y que los cambios de memoria tengan historial y revisión.

---

## DEC-009 — Intervención manual mínima en el pipeline

**Estado:** objetivo operativo

### Decisión
El flujo debe automatizar tanto como sea razonable entre el diseño y la validación final. La intervención manual deseada se concentra en:

1. Conversar y decidir el comportamiento del producto con ChatGPT.
2. Realizar la validación local cuando el cambio esté listo.
3. Hacer el merge final.

El transporte manual de prompts, resúmenes y estado entre ChatGPT, Codex y GitHub debe reducirse progresivamente.