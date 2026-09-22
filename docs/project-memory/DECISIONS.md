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
**Situación operativa:** pausada; el módulo Flujos no se utiliza actualmente y se retomará en una etapa posterior aprovechando el trabajo ya realizado.

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

---

## DEC-011 — Preservar Supabase como baseline técnico sin aprobar el PR #73

**Estado:** Vigente  
**Formalizada:** 2026-09-15

### Decisión
El esquema y los datos existentes del proyecto Supabase `finanzas-familiares` se preservarán como baseline técnico durante la adopción de FARO y la preparación para despliegue. Esta preservación no implica aprobar funcionalmente el PR #73 ni considerar integrado en `main` su comportamiento.

### Motivo
La base activa contiene datos y estructura no reproducibles actualmente desde `main`, incluidas columnas, restricciones e índices relacionados con el PR #73 y otros elementos sin migración versionada. Eliminar esa estructura para forzar coincidencia con `main` arriesgaría información real y ocultaría la deriva existente.

### Consecuencia
Antes de nuevas migraciones o del despliegue público se debe reconciliar de forma versionada y no destructiva el esquema remoto con Drizzle y las migraciones del repositorio. La reconciliación debe conservar los datos existentes, documentar los objetos aplicados fuera de GitHub y mantener la aprobación funcional del PR #73 como una decisión independiente.

---

## DEC-012 — El merge a main delimita el estado funcional integrado

**Estado:** Vigente  
**Formalizada:** 2026-09-15

### Decisión
El estado funcional canónico se construye únicamente con cambios integrados en `main` y decisiones confirmadas explícitamente. Un PR abierto puede documentarse como trabajo pendiente, pausado, bloqueado, obsoleto, antecedente o deriva técnica, pero no como funcionalidad vigente.

### Consecuencia
Las propuestas de un PR abierto no deben incorporarse como comportamiento vigente en `PRODUCT_MAP.md` ni como reglas aprobadas por su mera existencia. Si un PR abierto dejó estructura o datos en Supabase, ese efecto se preserva y documenta como estado técnico observable, sin considerar aprobada su funcionalidad. Al retomarlo, debe evaluarse contra el `main` vigente y preferentemente reconstruirse desde esa base cuando exista deriva o antigüedad relevante.

---

## DEC-013 — Baseline no destructivo del Supabase activo

**Estado:** Objetivo operativo  
**Formalizada:** 2026-09-15

### Decisión
El proyecto Supabase `finanzas-familiares` activo no se reiniciará ni se reconstruirá para reconciliarlo con el repositorio. Su esquema y sus datos se preservarán íntegramente, y la nueva cadena reproducible de migraciones partirá de un baseline completo del esquema remoto actual.

Antes de adoptar el baseline se debe:

1. obtener un respaldo verificable de datos y esquema;
2. extraer y versionar el esquema completo sin incluir datos personales ni secretos;
3. sincronizar `lib/db/schema.ts` con ese baseline;
4. validar el baseline en una base temporal vacía;
5. demostrar equivalencia estructural entre la base temporal y la base activa;
6. sólo entonces registrar el baseline como ya aplicado en la base existente, sin ejecutar nuevamente su DDL.

Las migraciones incrementales actuales `0001–0014` se conservarán como historia archivada y dejarán de funcionar como cadena activa una vez establecido el baseline. Toda modificación posterior deberá contar con una migración incremental versionada y verificable.

### Consecuencia
La reconciliación no puede eliminar, recrear ni transformar destructivamente objetos o datos de la base activa. Auth/RLS, actualización de dependencias y Cloudflare Workers se tratarán después en cambios separados para que la integridad del baseline pueda demostrarse de forma aislada.

---

## DEC-014 — Supabase CLI gobierna el historial canónico de migraciones

**Estado:** Objetivo operativo
**Formalizada:** 2026-09-21

### Decisión
Supabase CLI será la autoridad del historial canónico de migraciones del proyecto. El baseline y las migraciones incrementales futuras vivirán en `supabase/migrations/` y se crearán, validarán y aplicarán mediante el flujo reproducible de Supabase CLI.

Drizzle ORM se conservará como modelo tipado utilizado por la aplicación. `lib/db/schema.ts` deberá mantenerse estructuralmente sincronizado con el esquema canónico de Supabase, pero Drizzle Kit no gobernará un historial de migraciones paralelo.

Los archivos de migración actuales `0001–0014` se conservarán íntegramente como archivo histórico y dejarán de ser la cadena activa después de adoptar el baseline conforme a DEC-013.

### Consecuencia
La reconciliación debe evitar dos fuentes competidoras de migraciones. La primera implementación sólo capturará y validará el baseline fuera de la base activa; registrar el baseline como aplicado en el proyecto existente será un paso posterior y separado, autorizado únicamente después del respaldo y la demostración de equivalencia estructural exigidos por DEC-013.

## DEC-015 — Respaldar primero y pausar la reconstrucción local del baseline

**Estado:** Vigente  
**Formalizada:** 2026-09-21

### Decisión
Antes de preparar el despliegue se obtendrá un respaldo verificable de la base Supabase activa, sin modificar su esquema ni sus datos. La reconstrucción y validación del baseline en una instancia local queda pausada por ahora; no se instalará Docker ni se levantará Supabase local como requisito del siguiente bloque de trabajo.

DEC-013 y DEC-014 se conservan como dirección técnica futura: cuando se retome la formalización del historial de migraciones, el baseline deberá seguir el procedimiento no destructivo ya acordado y Supabase CLI continuará como autoridad canónica.

### Consecuencia
El siguiente trabajo se enfocará en respaldar la base activa y después preparar la seguridad y el despliegue en Cloudflare Workers. Posponer la instancia local no autoriza cambios manuales sin respaldo, no elimina la deriva documentada y no permite exponer públicamente la aplicación mientras persista el riesgo crítico de RLS y acceso administrativo.

---

## DEC-016 — Seguridad progresiva para el acceso privado

**Estado:** En implementación  
**Formalizada:** 2026-09-22

### Decisión
La publicación de Finanzas Familiares se preparará mediante tres capas progresivas y separadas:

1. Cloudflare Access protegerá el perímetro de la aplicación mediante una lista de correos autorizados y acceso con código temporal.
2. El acceso anónimo directo a la Data API de Supabase se cerrará mediante un cambio versionado y verificable.
3. Supabase Auth y RLS por hogar sustituirán progresivamente el uso rutinario de `supabaseAdmin` para que cada operación quede asociada a una identidad y a su hogar.

El primer PR técnico se limitará a preparar compatibilidad con Cloudflare Workers y el acceso privado. No publicará la aplicación ni modificará el esquema o los datos de Supabase.

### Consecuencia
Cloudflare Access será una barrera perimetral, no un sustituto de la autorización en Supabase. `SUPABASE_SERVICE_ROLE_KEY` debe permanecer exclusivamente del lado servidor y configurarse como secreto. La publicación con datos reales no se considerará segura hasta bloquear el acceso anónimo directo a Supabase; Auth/RLS y la retirada progresiva de privilegios administrativos se implementarán en cambios posteriores y separados.

---

## Regla de mantenimiento

Cuando una decisión cambie:

1. no borrar silenciosamente la decisión anterior si explica una evolución relevante;
2. marcarla `Sustituida` e indicar qué decisión la reemplaza;
3. crear/actualizar la decisión vigente con su fecha;
4. sincronizar `BUSINESS_RULES.md`, `PRODUCT_MAP.md` y `CURRENT_STATE.md` cuando corresponda.
