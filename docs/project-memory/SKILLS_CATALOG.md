# Catálogo de Skills — Finanzas Familiares

> Contrato canónico de las Skills utilizadas por el proyecto. Este archivo documenta qué hace cada Skill, cuándo debe utilizarse, qué fuentes consulta, qué puede modificar y qué tiene prohibido. La implementación operativa vive en la Skill instalada; este catálogo permite reconstruir su propósito y auditar su evolución sin depender del chat donde fue diseñada.

## Estados permitidos

- `Planificada`: comportamiento acordado, Skill todavía no creada o no validada.
- `Experimental`: Skill creada y en pruebas; su contrato puede ajustarse.
- `Vigente`: Skill validada para uso normal.
- `Retirada`: Skill que ya no debe utilizarse; se conserva para entender la evolución.

## Reglas generales

1. Ninguna Skill puede elevar una idea exploratoria a decisión vigente sin confirmación explícita en la conversación o respaldo canónico equivalente.
2. Antes de modificar memoria, debe consultar la versión vigente en `main` y comparar el conocimiento propuesto contra ella.
3. Las operaciones de actualización deben ser idempotentes: repetir una Skill sin información nueva no debe duplicar decisiones, reglas ni PR.
4. Una contradicción entre conversación, memoria y estado técnico no debe resolverse mediante suposición; debe señalarse para revisión.
5. Ninguna Skill de este catálogo puede hacer merge a `main` salvo que una decisión futura lo autorice explícitamente y se actualice este contrato.
6. Las Skills reutilizables entre proyectos deben mantener su lógica general separada de las reglas específicas de Finanzas Familiares.

---

## $actualizar-memoria-proyecto

**Estado:** Planificada  
**Versión de contrato:** 0.1  
**Última revisión:** 2026-08-09

### Propósito

Mantener `docs/project-memory/` sincronizado con las conclusiones confirmadas del trabajo del proyecto, evitando que decisiones, reglas, estado o relaciones funcionales dependan del historial de chats.

### Cuándo usarla

- Después de cerrar una conversación de diseño que produjo decisiones o reglas nuevas.
- Cuando una decisión vigente sea sustituida explícitamente.
- Cuando cambie de forma relevante el estado funcional o el siguiente paso del proyecto.
- Después de un merge cuando ese merge cambie el estado que describe la memoria viva.

No debe ejecutarse por rutina si no existe conocimiento nuevo confirmado.

### Fuentes que debe consultar

1. Contexto relevante de la conversación actual.
2. `docs/project-memory/CURRENT_STATE.md`.
3. `docs/project-memory/PRODUCT_MAP.md`.
4. `docs/project-memory/BUSINESS_RULES.md`.
5. `docs/project-memory/DECISIONS.md`.
6. `docs/project-memory/WORKFLOW.md` cuando el cambio afecte el proceso.
7. `docs/project-memory/SKILLS_CATALOG.md` cuando el cambio afecte Skills.
8. Estado real de GitHub cuando una conclusión dependa de ramas, PR, commits o archivos del repositorio.

### Procedimiento obligatorio

1. Leer la memoria canónica vigente desde `main`.
2. Identificar únicamente conclusiones confirmadas relevantes de la conversación/estado actual.
3. Compararlas con lo que ya está registrado.
4. Clasificar cada novedad como una o más de estas categorías:
   - estado actual;
   - mapa funcional;
   - regla de negocio;
   - decisión;
   - workflow;
   - catálogo de Skills.
5. Detectar si una decisión nueva sustituye una decisión anterior y conservar la trazabilidad correspondiente.
6. Preparar solo los cambios necesarios.
7. Si no existe novedad real, terminar sin crear rama, commit ni PR.
8. Si existen cambios, trabajar en una rama documental dedicada y preparar un PR contra `main`.
9. Entregar un resumen preciso de archivos/secciones modificados y motivo de cada cambio.

### Idempotencia

La memoria vigente funciona como filtro de novedades. La Skill no depende de recordar un cursor interno del chat ni de asumir que solo debe leer mensajes posteriores a su última ejecución.

Si A, B y C ya están registrados y la conversación contiene A, B, C, D y E, únicamente D y E pueden producir cambios.

Si se ejecuta dos veces sin decisiones nuevas, la segunda ejecución debe informar que la memoria ya está sincronizada y no crear cambios.

### Decisiones sustituidas

Cuando una decisión vigente A sea reemplazada explícitamente por B:

- A debe conservarse cuando aporte trazabilidad y marcarse `Sustituida`;
- debe indicarse qué decisión la reemplaza;
- B debe registrarse con el estado apropiado;
- deben sincronizarse las reglas, mapa funcional y estado afectados.

### Puede hacer

- Leer memoria viva y archivos relevantes del repositorio.
- Consultar GitHub para validar estado técnico.
- Comparar conversación contra memoria canónica.
- Crear/actualizar archivos de `docs/project-memory/` en una rama dedicada.
- Crear un PR exclusivamente con los cambios documentales necesarios para sincronizar la memoria.

### No puede hacer

- Inventar decisiones, fechas históricas, estados o reglas.
- Registrar como vigentes hipótesis, alternativas exploratorias o propuestas no confirmadas.
- Duplicar conocimiento ya registrado.
- Resolver contradicciones relevantes por suposición.
- Modificar código de aplicación, migraciones o datos como parte de una actualización de memoria.
- Escribir directamente en `main`.
- Hacer merge del PR.

### Resultado esperado

Cuando haya cambios, presentar un resumen semejante a:

```text
Memoria preparada para sincronización

DECISIONS
+ DEC-XXX — nueva decisión
~ DEC-YYY — marcada como sustituida

BUSINESS_RULES
~ regla afectada

PRODUCT_MAP
~ módulo afectado

CURRENT_STATE
~ trabajo activo / siguiente paso

Sin cambios
WORKFLOW
```

Cuando no haya novedades:

```text
Memoria ya sincronizada.
No se detectaron nuevas decisiones, reglas ni cambios de estado confirmados.
No se creó ningún PR.
```

### Criterios para pasar a Experimental

- Crear la Skill con este contrato como base.
- Probarla en una conversación con una decisión nueva real.
- Confirmar que consulta primero la memoria vigente.
- Confirmar que genera un PR documental mínimo.
- Ejecutarla nuevamente sin cambios y verificar que no duplica información ni crea otro PR.
- Probar al menos una sustitución explícita de decisión.

---

## Skills previstas para el pipeline v2

Las siguientes Skills están identificadas como candidatas, pero su contrato todavía no está definido. No deben asumirse disponibles hasta que tengan una sección propia en este catálogo.

- `$reconstruir-contexto-proyecto`: recuperar memoria + estado real de GitHub al iniciar o retomar trabajo.
- `$preparar-especificacion-codex`: convertir una decisión funcional confirmada en una especificación implementable y verificable.
- `$revisar-pr-proyecto`: auditar un PR contra memoria, reglas, alcance, pruebas y riesgos.
- `$generar-plan-validacion-local`: producir un protocolo específico de pruebas humanas para el PR listo para validar.

## Regla de mantenimiento del catálogo

Cuando una Skill cambie de comportamiento:

1. discutir y acordar el cambio en el espacio de trabajo correspondiente;
2. actualizar primero o junto con la implementación su contrato en este catálogo;
3. incrementar la versión de contrato cuando el cambio sea funcionalmente relevante;
4. mantener la implementación de la Skill coherente con este documento;
5. marcar una Skill `Retirada` en vez de borrar silenciosamente su contrato cuando su existencia histórica explique decisiones o automatizaciones anteriores.