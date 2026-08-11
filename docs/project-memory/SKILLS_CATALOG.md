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

**Estado:** Experimental  
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

### Validación Experimental

Completada el 2026-08-09:

- primera sincronización con novedad real y PR documental mínimo;
- segunda ejecución sin novedades, sin duplicación ni PR adicional;
- sustitución explícita de una decisión con conservación de trazabilidad.

La Skill permanece `Experimental` hasta acumular uso real suficiente para decidir si su contrato puede considerarse estable y pasar a `Vigente`.

---

## $reconstruir-contexto-proyecto

**Estado:** Experimental  
**Versión de contrato:** 0.1  
**Última revisión:** 2026-08-09

### Propósito

Reconstruir el contexto operativo vigente de Finanzas Familiares al iniciar un chat, retomar una línea de trabajo o cuando exista duda sobre el estado real del proyecto, combinando la memoria viva con evidencia actual de GitHub sin depender del historial conversacional.

La Skill es de solo lectura: informa y detecta inconsistencias, pero no modifica memoria, código ni estado de GitHub.

### Cuándo usarla

- Al iniciar un chat nuevo de trabajo sobre Finanzas Familiares.
- Al retomar trabajo después de una pausa cuando sea necesario confirmar el punto vigente.
- Antes de diseñar o implementar una funcionalidad si el contexto actual no está suficientemente establecido.
- Cuando memoria y conversación parezcan contradictorias o exista duda sobre PR, ramas, merges o siguiente paso.

No es necesario ejecutarla repetidamente dentro de una conversación cuando el contexto vigente ya está establecido y no ocurrió un cambio relevante.

### Fuentes que debe consultar

1. `docs/project-memory/CURRENT_STATE.md` desde `main`.
2. `docs/project-memory/PRODUCT_MAP.md` desde `main`.
3. `docs/project-memory/BUSINESS_RULES.md` desde `main`.
4. `docs/project-memory/DECISIONS.md` desde `main`.
5. `docs/project-memory/WORKFLOW.md` desde `main` cuando sea necesario interpretar el siguiente paso o el proceso.
6. `docs/project-memory/SKILLS_CATALOG.md` desde `main` cuando el contexto involucre Skills o el pipeline.
7. Estado real de GitHub relevante para el trabajo actual: como mínimo PR abiertos o mencionados por la memoria, ramas/commits relacionados y estado de merge cuando afecten el contexto reconstruido.

La conversación actual puede aportar el objetivo inmediato del usuario, pero no debe sustituir la consulta de las fuentes canónicas.

### Procedimiento obligatorio

1. Leer primero `CURRENT_STATE.md` desde `main`.
2. Identificar el trabajo activo, riesgos y siguiente paso que declara la memoria.
3. Leer las decisiones y reglas de negocio relevantes para ese trabajo; consultar `PRODUCT_MAP.md` para ubicar el estado funcional de los módulos implicados.
4. Consultar `WORKFLOW.md` y `SKILLS_CATALOG.md` cuando el contexto dependa del proceso o de una Skill.
5. Consultar GitHub para validar las afirmaciones técnicas que puedan haber cambiado desde la última actualización de memoria, especialmente estado de PR, merges, ramas y trabajo activo.
6. Contrastar memoria y GitHub antes de presentar el contexto como vigente.
7. Si existe contradicción, no elegir silenciosamente una fuente ni inventar una reconciliación: describir la discrepancia, indicar cuál evidencia técnica muestra GitHub y señalar que la memoria requiere sincronización cuando corresponda.
8. Sintetizar únicamente el contexto necesario para continuar trabajando; no convertir la salida en un volcado completo de todos los documentos.
9. Terminar con un único siguiente paso respaldado por las fuentes disponibles. Si una contradicción impide determinarlo con seguridad, el siguiente paso debe ser resolver esa contradicción.

### Prioridad de fuentes

- Para código, ramas, commits, PR, merge y estado técnico observable: GitHub tiene prioridad factual.
- Para decisiones aprobadas, reglas de negocio y propósito funcional: la memoria canónica tiene prioridad mientras no exista evidencia explícita de que quedó desactualizada.
- La existencia de código o de un PR no convierte por sí sola una propuesta en decisión funcional vigente.
- Una conversación no debe sobrescribir silenciosamente una decisión registrada.

### Contradicciones y memoria desactualizada

Si, por ejemplo, `CURRENT_STATE.md` indica que un PR está abierto pero GitHub confirma que ya fue mergeado, la Skill debe:

1. informar que la memoria está desactualizada en ese punto;
2. utilizar el estado real de GitHub para describir la situación técnica actual;
3. no modificar `CURRENT_STATE.md`;
4. recomendar `$actualizar-memoria-proyecto` como siguiente acción cuando la discrepancia afecte el contexto vigente.

### Puede hacer

- Leer todos los archivos de `docs/project-memory/` necesarios para reconstruir contexto.
- Consultar repositorio, PR, ramas, commits y otros metadatos de GitHub en modo lectura.
- Relacionar estado técnico con decisiones, reglas y mapa funcional.
- Detectar memoria potencialmente desactualizada o contradicciones entre fuentes.
- Recomendar la Skill o acción siguiente apropiada.

### No puede hacer

- Modificar archivos del repositorio.
- Crear ramas, commits o PR.
- Hacer merge, cerrar PR ni cambiar su estado.
- Actualizar la memoria viva por sí misma.
- Inventar estado técnico, decisiones, reglas o fechas.
- Tratar un PR abierto, código existente o una idea de conversación como decisión aprobada sin respaldo canónico.
- Resolver contradicciones relevantes mediante suposición.

### Resultado esperado

La salida debe ser breve y operativa, estructurada alrededor de estas cuatro preguntas:

```text
CONTEXTO
Qué estamos construyendo y qué parte del proyecto es relevante ahora.

ESTADO ACTUAL
Qué está terminado, activo o pendiente según memoria + GitHub.

REGLAS Y DECISIONES A RESPETAR
Solo las que condicionan el trabajo inmediato.

SIGUIENTE PASO
Una sola acción concreta respaldada por las fuentes.
```

Si existe una contradicción relevante, debe destacarse dentro de `ESTADO ACTUAL` y afectar el `SIGUIENTE PASO` cuando impida continuar con seguridad.

### Criterios para pasar a Experimental

- Crear la Skill con este contrato como base.
- Ejecutarla en un chat/contexto nuevo y comprobar que reconstruye el proyecto sin depender del historial conversacional.
- Confirmar que consulta memoria desde `main` y valida contra GitHub.
- Confirmar que selecciona únicamente reglas y decisiones relevantes en lugar de volcar toda la memoria.
- Probar un caso donde memoria y GitHub coincidan.
- Probar al menos un caso controlado donde exista una discrepancia entre memoria y GitHub y verificar que la detecta sin modificar ninguna fuente.
- Confirmar que entrega un único siguiente paso accionable.

### Validación Experimental

Completada el 2026-08-09:

- ejecución en un chat nuevo sin depender del historial conversacional;
- lectura de memoria canónica desde `main` y contraste con GitHub;
- selección de reglas y decisiones únicamente relevantes para el trabajo activo;
- caso consistente entre memoria y GitHub con un único siguiente paso accionable;
- caso controlado de discrepancia donde GitHub mostraba el PR #73 cerrado sin merge mientras la memoria lo describía abierto;
- detección correcta de la contradicción sin modificar memoria ni GitHub y recomendación de `$actualizar-memoria-proyecto` como siguiente acción;
- restauración posterior del PR #73 a su estado abierto original.

La Skill permanece `Experimental` hasta acumular uso real suficiente para decidir si su contrato puede considerarse estable y pasar a `Vigente`.

---

## $preparar-especificacion-codex

**Estado:** Experimental  
**Versión de contrato:** 0.1  
**Última revisión:** 2026-08-10

### Propósito

Convertir una decisión funcional ya confirmada en una especificación autosuficiente, concreta y verificable para Codex, utilizando la memoria canónica y el estado real del repositorio para reducir al mínimo el transporte manual de contexto.

La Skill prepara instrucciones de implementación; no decide el producto, no implementa código y no modifica GitHub ni la memoria viva.

### Cuándo usarla

- Después de que una conversación de diseño haya cerrado suficientemente el comportamiento esperado de una funcionalidad o corrección.
- Antes de delegar una implementación a Codex.
- Cuando sea necesario reconstruir un prompt de implementación a partir de una decisión ya registrada y el estado actual del repositorio.
- Para reemplazar prompts manuales que dependan de copiar resúmenes extensos entre ChatGPT y Codex.

No debe utilizarse para decidir entre alternativas funcionales todavía abiertas ni para convertir una idea exploratoria en una instrucción de implementación.

### Fuentes que debe consultar

1. Objetivo o decisión confirmada en la conversación actual, cuando exista.
2. `docs/project-memory/CURRENT_STATE.md` desde `main`.
3. `docs/project-memory/PRODUCT_MAP.md` desde `main` para ubicar el módulo afectado.
4. `docs/project-memory/BUSINESS_RULES.md` desde `main` para reglas funcionales relevantes.
5. `docs/project-memory/DECISIONS.md` desde `main` para decisiones vigentes que condicionen la implementación.
6. `docs/project-memory/WORKFLOW.md` desde `main` para restricciones del proceso.
7. Estado real del repositorio y archivos/código relevantes en `main`.
8. PR o ramas relacionadas cuando sean necesarias para evitar repetir, solapar o basar trabajo nuevo sobre una implementación obsoleta.

### Procedimiento obligatorio

1. Confirmar primero cuál es la decisión o comportamiento que se pretende implementar.
2. Leer `CURRENT_STATE.md` desde `main` y ubicar la funcionalidad en el estado vigente del proyecto.
3. Leer únicamente las reglas y decisiones que condicionan ese cambio.
4. Inspeccionar el código y archivos relevantes en `main` para entender la arquitectura existente, nombres reales, puntos de integración y pruebas relacionadas.
5. Consultar PR o ramas relacionadas cuando exista riesgo de solapamiento, obsolescencia o trabajo previo relevante.
6. Detectar contradicciones entre la decisión confirmada, memoria y repositorio antes de redactar la especificación.
7. Si existe una ambigüedad funcional que pueda cambiar materialmente la implementación, no inventar una respuesta ni entregar un prompt aparentemente definitivo: señalar el bloqueo que debe resolverse primero.
8. Si el comportamiento está suficientemente definido, preparar una especificación que incluya como mínimo:
   - objetivo;
   - contexto técnico relevante;
   - comportamiento esperado;
   - reglas de negocio y decisiones aplicables;
   - alcance;
   - fuera de alcance;
   - casos límite relevantes;
   - requisitos de pruebas;
   - migraciones y compatibilidad de datos cuando corresponda;
   - restricciones de implementación derivadas de la arquitectura vigente;
   - criterios de aceptación;
   - resultado esperado del trabajo de Codex.
9. Referenciar rutas, módulos, funciones o pruebas concretas sólo cuando hayan sido observadas en el repositorio o estén respaldadas por la memoria; no inventar nombres técnicos para hacer el prompt parecer más específico.
10. Entregar la especificación lista para enviarse a Codex sin exigir que el usuario añada manualmente contexto ya disponible en las fuentes.

### Política de ambigüedad

Una especificación no debe ocultar decisiones pendientes.

Si falta una definición que pueda alterar comportamiento, modelo de datos, compatibilidad, UX, reglas financieras o criterios de aceptación, la Skill debe detener la preparación definitiva e indicar con precisión qué decisión falta.

Puede resolver detalles técnicos menores a partir de patrones observables del repositorio cuando no cambien el comportamiento aprobado, pero debe distinguir una decisión funcional pendiente de una elección de implementación delegable a Codex.

### Prioridad de fuentes

- Las decisiones funcionales confirmadas y reglas canónicas determinan qué debe hacer el producto.
- `main` determina la arquitectura y estado técnico sobre los que debe implementarse.
- Un PR antiguo puede aportar evidencia o ideas, pero no tiene prioridad sobre `main` ni se asume vigente por estar abierto.
- Si memoria y GitHub discrepan en un hecho técnico, debe resolverse o señalarse la discrepancia antes de basar la especificación en ese hecho.

### Puede hacer

- Leer memoria viva y archivos relevantes del repositorio.
- Consultar GitHub, PR, ramas y commits en modo lectura.
- Inspeccionar código, esquemas, migraciones y pruebas existentes.
- Traducir decisiones funcionales confirmadas a requisitos técnicos y criterios verificables.
- Recomendar qué áreas del repositorio debe revisar Codex sin imponer archivos inventados.
- Entregar un prompt/especificación listo para Codex.

### No puede hacer

- Inventar decisiones funcionales, reglas de negocio, estados o requisitos.
- Elegir silenciosamente entre alternativas de producto todavía abiertas.
- Modificar memoria, código, ramas, PR o datos.
- Implementar el cambio por sí misma.
- Crear un PR o hacer merge.
- Basar una implementación nueva en una rama antigua sin contrastarla con `main`.
- Presentar como obligatorio un detalle técnico no respaldado cuando Codex puede decidirlo dentro del alcance aprobado.

### Resultado esperado

Cuando la decisión esté suficientemente cerrada, entregar una especificación directamente reutilizable, por ejemplo:

```text
ESPECIFICACIÓN PARA CODEX

OBJETIVO
...

CONTEXTO TÉCNICO RELEVANTE
...

COMPORTAMIENTO ESPERADO
...

REGLAS Y DECISIONES A RESPETAR
...

ALCANCE
...

FUERA DE ALCANCE
...

CASOS LÍMITE
...

PRUEBAS REQUERIDAS
...

MIGRACIONES / COMPATIBILIDAD
...

RESTRICCIONES DE IMPLEMENTACIÓN
...

CRITERIOS DE ACEPTACIÓN
...

ENTREGA ESPERADA
- implementación en rama dedicada;
- PR pequeño y enfocado contra `main`;
- resumen de cambios, pruebas ejecutadas y riesgos/pendientes.
```

Cuando exista una ambigüedad material, no entregar un prompt definitivo. La salida debe identificar el bloqueo concreto y la decisión necesaria para poder preparar la especificación.

### Criterios para pasar a Experimental

- Crear la Skill con este contrato como base.
- Probarla con una decisión funcional real ya confirmada.
- Confirmar que consulta memoria y `main` antes de redactar.
- Confirmar que inspecciona código/pruebas relevantes y no inventa rutas o nombres técnicos.
- Confirmar que genera una especificación autosuficiente que pueda enviarse a Codex sin contexto manual adicional.
- Verificar que incluye alcance, fuera de alcance, casos límite, pruebas y criterios de aceptación.
- Probar un caso controlado con una ambigüedad funcional material y comprobar que se detiene en vez de inventar una decisión.
- Confirmar que no modifica repositorio ni memoria.

### Validación Experimental

Completada el 2026-08-10:

- prueba con DEC-004 — Calendario de compromisos por subcategoría, generando una especificación autosuficiente basada en memoria, `main`, código, pruebas, migraciones y PR relacionado;
- detección del solapamiento con el PR #73 sin tratarlo como fuente de verdad por encima de `main`;
- identificación de un riesgo real de idempotencia/upsert sin inventar rutas ni requisitos técnicos;
- inclusión explícita de alcance, fuera de alcance, casos límite, pruebas, compatibilidad, restricciones y criterios de aceptación;
- prueba controlada con Registro multi-movimiento, donde la Skill se detuvo al comprobar que el objetivo genérico ya estaba implementado y que faltaba definir un delta funcional legítimo;
- detección de memoria desactualizada respecto al PR #58, sin modificar ninguna fuente, y derivación correcta hacia `$actualizar-memoria-proyecto`;
- sincronización posterior de esa discrepancia mediante el PR documental #81, ya fusionado.

La Skill permanece `Experimental` hasta acumular uso real suficiente para decidir si su contrato puede considerarse estable y pasar a `Vigente`.

---

## $revisar-pr-proyecto

**Estado:** Planificada  
**Versión de contrato:** 0.1  
**Última revisión:** 2026-08-10

### Propósito

Auditar un pull request de Finanzas Familiares contra su objetivo funcional, la memoria canónica, el estado real de `main`, el diff completo y la evidencia disponible de pruebas, migraciones y checks, para decidir si requiere correcciones antes de continuar o si está listo para pasar a validación local humana.

La Skill es de solo lectura. No corrige el PR, no modifica GitHub y no sustituye la validación local ni la decisión humana de merge.

### Cuándo usarla

- Después de que Codex abra un PR de implementación o corrección.
- Después de que Codex aplique correcciones a un PR previamente revisado.
- Antes de preparar el protocolo de validación local.
- Cuando exista duda sobre si un PR respeta alcance, reglas, migraciones, pruebas o arquitectura vigente.

No debe utilizarse como sustituto de la especificación previa ni como aprobación automática de merge.

### Fuentes que debe consultar

1. PR objetivo: metadata, base/head, estado, descripción y commits relevantes.
2. Diff completo y lista real de archivos modificados del PR.
3. Checks/CI disponibles, estado de merge/conflictos y revisiones/comentarios relevantes cuando existan.
4. `docs/project-memory/CURRENT_STATE.md` desde `main`.
5. `docs/project-memory/PRODUCT_MAP.md` desde `main` para ubicar módulos afectados.
6. `docs/project-memory/BUSINESS_RULES.md` desde `main` para reglas funcionales aplicables.
7. `docs/project-memory/DECISIONS.md` desde `main` para decisiones vigentes.
8. `docs/project-memory/WORKFLOW.md` desde `main` para criterios del proceso.
9. Especificación para Codex u objetivo funcional confirmado, cuando esté disponible en la conversación, PR o memoria.
10. Código, pruebas, esquemas y migraciones relevantes en `main` cuando sean necesarios para interpretar correctamente el diff.

### Procedimiento obligatorio

1. Confirmar el PR exacto y verificar que su base sea la esperada; no asumir que un PR antiguo o abierto sigue vigente.
2. Leer el objetivo funcional/especificación que el PR pretende satisfacer. Si no existe suficiente contexto para evaluar el comportamiento, usar el dictamen `BLOQUEADO POR CONTEXTO` en lugar de inventarlo.
3. Leer memoria canónica relevante desde `main` y confirmar reglas/decisiones que condicionan el cambio.
4. Obtener la lista completa de archivos cambiados y revisar el diff real del PR; no basar la auditoría únicamente en el resumen del autor o de Codex.
5. Inspeccionar, cuando sea necesario, el código de `main` alrededor de los puntos modificados para distinguir cambios intencionales de regresiones o supuestos incorrectos.
6. Comprobar como mínimo:
   - alineación con objetivo y criterios de aceptación conocidos;
   - reglas de negocio y decisiones vigentes;
   - alcance y archivos/cambios fuera de alcance;
   - compatibilidad con arquitectura vigente;
   - migraciones, constraints, índices y compatibilidad de datos cuando apliquen;
   - pruebas añadidas/modificadas y huecos de cobertura relevantes;
   - riesgos de regresión;
   - manejo de errores, idempotencia, aislamiento por hogar y seguridad cuando sean pertinentes al cambio;
   - estado del PR, conflictos, checks/CI y revisiones pendientes disponibles.
7. Separar hechos observados de inferencias. Un check ausente no debe presentarse como check fallido; una prueba reportada por el PR no debe presentarse como ejecutada independientemente por la Skill.
8. Clasificar hallazgos por severidad:
   - `CRÍTICO`: puede causar pérdida/corrupción de datos, vulneración de aislamiento/seguridad, comportamiento financiero incorrecto grave o hace inviable la implementación;
   - `ALTO`: incumple un requisito/decisión, rompe un caso importante, introduce regresión material o deja una migración/compatibilidad insegura;
   - `MEDIO`: defecto real o cobertura insuficiente que conviene corregir antes de validación local, pero no amenaza por sí solo integridad crítica;
   - `BAJO`: mejora menor o riesgo residual que no bloquea necesariamente el paso a validación local.
9. Evitar comentarios cosméticos o preferencias de estilo que no afecten corrección, mantenibilidad relevante, alcance o riesgo.
10. Emitir exactamente uno de estos dictámenes:
   - `CORREGIR ANTES`: existe al menos un hallazgo que debe resolverse antes de pedir validación local;
   - `LISTO PARA VALIDACIÓN LOCAL`: no se observan bloqueos de revisión y las incertidumbres restantes pertenecen legítimamente a validación humana;
   - `BLOQUEADO POR CONTEXTO`: falta una decisión, especificación o evidencia imprescindible para evaluar el PR con seguridad.
11. Terminar con una sola siguiente acción concreta.

### Política de evidencia

La Skill debe distinguir claramente entre:

- hechos observados directamente en GitHub/diff/código;
- resultados de pruebas o checks mostrados por GitHub;
- pruebas que el autor afirma haber ejecutado pero que no están verificadas por CI;
- inferencias técnicas derivadas del diff.

No debe afirmar que una suite, TypeScript, build, migración o flujo manual “pasa” sin evidencia observable correspondiente.

### Relación con la validación local

`LISTO PARA VALIDACIÓN LOCAL` no significa `LISTO PARA MERGE`.

Cuando el dictamen sea `LISTO PARA VALIDACIÓN LOCAL`, la siguiente etapa del pipeline es preparar el protocolo específico mediante `$generar-plan-validacion-local` cuando esa Skill esté disponible, o entregar únicamente una indicación breve de que corresponde validación local si todavía no está disponible.

La revisión puede identificar áreas que deben probarse localmente, pero no debe reemplazar esa Skill generando un protocolo exhaustivo dentro del mismo resultado.

### Puede hacer

- Leer PR, diff, commits, comentarios, reviews, checks y estado de GitHub.
- Leer memoria canónica y código relevante en `main`.
- Inspeccionar pruebas, migraciones, esquemas y archivos modificados.
- Comparar implementación contra objetivo, decisiones, reglas y arquitectura.
- Señalar hallazgos concretos con archivo/área afectada cuando exista evidencia.
- Recomendar corrección por Codex o paso a validación local.

### No puede hacer

- Modificar código, memoria, ramas, PR, comentarios, reviews o labels.
- Resolver threads, aprobar/rechazar formalmente el PR ni cambiar su estado.
- Hacer merge.
- Inventar resultados de pruebas/checks.
- Tratar el resumen de Codex como sustituto del diff.
- Recomendar merge directo sin validación local cuando ésta sea requerida por el workflow.
- Convertir preferencias cosméticas en bloqueos.
- Generar el protocolo exhaustivo de validación local que corresponde a `$generar-plan-validacion-local`.

### Resultado esperado

La salida debe ser breve pero verificable y usar esta estructura:

```text
REVISIÓN DE PR

PR
#XXX — título

OBJETIVO EVALUADO
...

ESTADO TÉCNICO
- base/head
- merge/conflictos
- checks/CI disponibles

HALLAZGOS
[CRÍTICO|ALTO|MEDIO|BAJO] archivo/área — problema, evidencia e impacto
...

PRUEBAS / MIGRACIONES / COMPATIBILIDAD
- evidencia observada
- huecos relevantes

DICTAMEN
CORREGIR ANTES | LISTO PARA VALIDACIÓN LOCAL | BLOQUEADO POR CONTEXTO

SIGUIENTE ACCIÓN
Una sola acción concreta.
```

Si no existen hallazgos materiales, debe decirlo explícitamente en `HALLAZGOS`; no inventar observaciones para llenar la sección.

### Criterios para pasar a Experimental

- Crear la Skill con este contrato como base.
- Probarla contra un PR real con al menos un defecto/riesgo material conocido y confirmar que lo detecta desde el diff.
- Confirmar que consulta memoria canónica y objetivo/especificación relevantes.
- Confirmar que revisa la lista completa de archivos y no depende sólo del resumen del PR.
- Confirmar que distingue evidencia de checks/pruebas reportadas e inferencias.
- Probarla contra un PR sin bloqueos materiales conocidos y verificar que puede emitir `LISTO PARA VALIDACIÓN LOCAL` sin recomendar merge.
- Probar un caso con contexto insuficiente y comprobar `BLOQUEADO POR CONTEXTO` sin inventar requisitos.
- Confirmar que no modifica GitHub ni memoria.

---

## Skills previstas para el pipeline v2

Las siguientes Skills están identificadas como candidatas, pero su contrato todavía no está definido. No deben asumirse disponibles hasta que tengan una sección propia en este catálogo.

- `$generar-plan-validacion-local`: producir un protocolo específico de pruebas humanas para el PR listo para validar.

## Regla de mantenimiento del catálogo

Cuando una Skill cambie de comportamiento:

1. discutir y acordar el cambio en el espacio de trabajo correspondiente;
2. actualizar primero o junto con la implementación su contrato en este catálogo;
3. incrementar la versión de contrato cuando el cambio sea funcionalmente relevante;
4. mantener la implementación de la Skill coherente con este documento;
5. marcar una Skill `Retirada` en vez de borrar silenciosamente su contrato cuando su existencia histórica explique decisiones o automatizaciones anteriores.