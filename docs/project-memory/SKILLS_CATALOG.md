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
**Versión de contrato:** 0.2  
**Última revisión:** 2026-08-12

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

Cuando la decisión esté suficientemente cerrada, entregar un único bloque directamente reutilizable, por ejemplo:

```text
INSTRUCCIÓN DE IMPLEMENTACIÓN

Implementa la siguiente especificación partiendo del main vigente. Crea una rama nueva y un PR pequeño y enfocado contra main. No hagas merge. Ejecuta las pruebas requeridas e informa el número del PR, el head SHA, los archivos modificados y los resultados exactos de las pruebas.

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

### Ajuste de contrato 0.2

Motivado por el uso real posterior a la especificación del filtro de subcategorías de Movimientos. La versión 0.1 entregaba correctamente el contenido técnico, pero dejaba fuera del bloque reutilizable la instrucción operativa para que Codex partiera de `main`, creara rama y PR, evitara el merge y reportara evidencia exacta de la entrega. La versión 0.2 incorpora esa instrucción como parte obligatoria e inseparable de la salida.

---

## $revisar-pr-proyecto

**Estado:** Experimental  
**Versión de contrato:** 0.3  
**Última revisión:** 2026-08-12

### Propósito

Auditar un pull request de Finanzas Familiares contra un objetivo funcional vigente y respaldado, la memoria canónica, el estado real de `main`, el diff completo y la evidencia disponible de pruebas, migraciones y checks, para decidir si requiere correcciones antes de continuar, si está listo para validación local humana o si no puede evaluarse con seguridad por falta de contexto vigente.

La Skill es de solo lectura. No corrige el PR, no modifica GitHub y no sustituye la validación local ni la decisión humana de merge.

### Cuándo usarla

- Después de que Codex abra un PR de implementación o corrección.
- Después de que Codex aplique correcciones a un PR previamente revisado.
- Antes de preparar el protocolo de validación local.
- Cuando exista duda sobre si un PR respeta alcance, reglas, migraciones, pruebas o arquitectura vigente.
- Para auditar PR históricos, siempre distinguiendo su objetivo declarado de la vigencia actual de ese objetivo.

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
9. Especificación para Codex, decisión canónica o contexto conversacional confirmado que respalde actualmente el objetivo del PR, cuando exista.
10. Código, pruebas, esquemas y migraciones relevantes en `main` cuando sean necesarios para interpretar correctamente el diff.

La descripción del PR es evidencia de su **objetivo declarado**, pero por sí sola no constituye respaldo de que ese objetivo siga vigente para el producto.

### Objetivo declarado y respaldo vigente

La Skill debe distinguir obligatoriamente entre:

- **OBJETIVO DECLARADO:** lo que el PR, su autor o sus commits dicen que pretende hacer.
- **RESPALDO VIGENTE:** una decisión canónica, especificación vigente, trabajo activo registrado en memoria o contexto conversacional confirmado que demuestre que ese objetivo sigue siendo trabajo deseado actualmente.

Un PR abierto, una rama existente, código escrito o una descripción detallada no convierten por sí solos una propuesta histórica en trabajo vigente.

Para PR recientes creados dentro del pipeline actual, una especificación confirmada o el contexto conversacional que originó el PR puede aportar respaldo vigente. Para PR antiguos o no reconocidos como trabajo activo, la Skill debe buscar respaldo independiente de la propia descripción del PR.

### Procedimiento obligatorio

1. Confirmar el PR exacto y verificar que su base sea la esperada; no asumir que un PR antiguo o abierto sigue vigente.
2. Identificar el `OBJETIVO DECLARADO` del PR.
3. Buscar `RESPALDO VIGENTE` independiente en memoria canónica, especificación o contexto conversacional confirmado.
4. Si el PR no está reconocido como trabajo vigente y no existe respaldo independiente suficiente, puede inspeccionar técnicamente el diff para aportar contexto, pero el dictamen final debe ser `BLOQUEADO POR CONTEXTO`; no debe convertir defectos técnicos del PR en autorización implícita para reconstruirlo o continuar su implementación.
5. Leer memoria canónica relevante desde `main` y confirmar reglas/decisiones que condicionan el cambio.
6. Obtener la lista completa de archivos cambiados y revisar el diff real del PR; no basar la auditoría únicamente en el resumen del autor o de Codex.
7. Inspeccionar, cuando sea necesario, el código de `main` alrededor de los puntos modificados para distinguir cambios intencionales de regresiones o supuestos incorrectos.
8. Cuando exista respaldo vigente suficiente, comprobar como mínimo:
   - alineación con objetivo y criterios de aceptación conocidos;
   - reglas de negocio y decisiones vigentes;
   - alcance y archivos/cambios fuera de alcance;
   - compatibilidad con arquitectura vigente;
   - migraciones, constraints, índices y compatibilidad de datos cuando apliquen;
   - pruebas añadidas/modificadas y huecos de cobertura relevantes;
   - riesgos de regresión;
   - manejo de errores, idempotencia, aislamiento por hogar y seguridad cuando sean pertinentes al cambio;
   - estado del PR, conflictos, checks/CI y revisiones pendientes disponibles.
9. Separar hechos observados de inferencias. Un check ausente no debe presentarse como check fallido; una prueba reportada por el PR no debe presentarse como ejecutada independientemente por la Skill.
10. Clasificar hallazgos por severidad:
   - `CRÍTICO`: puede causar pérdida/corrupción de datos, vulneración de aislamiento/seguridad, comportamiento financiero incorrecto grave o hace inviable la implementación;
   - `ALTO`: incumple un requisito/decisión, rompe un caso importante, introduce regresión material o deja una migración/compatibilidad insegura;
   - `MEDIO`: defecto real o cobertura insuficiente que conviene corregir antes de validación local, pero no amenaza por sí solo integridad crítica;
   - `BAJO`: mejora menor o riesgo residual que no bloquea necesariamente el paso a validación local.
11. Evitar comentarios cosméticos o preferencias de estilo que no afecten corrección, mantenibilidad relevante, alcance o riesgo.
12. Emitir exactamente uno de estos dictámenes:
   - `CORREGIR ANTES`: existe respaldo vigente y al menos un hallazgo que debe resolverse antes de pedir validación local;
   - `LISTO PARA VALIDACIÓN LOCAL`: existe respaldo vigente, no se observan bloqueos de revisión y las incertidumbres restantes pertenecen legítimamente a validación humana;
   - `BLOQUEADO POR CONTEXTO`: falta respaldo vigente, una decisión, una especificación o evidencia imprescindible para evaluar legítimamente si el PR debe continuar.
13. Terminar con una sola siguiente acción concreta. Cuando el dictamen sea `CORREGIR ANTES`, esa acción debe ser un prompt correctivo autosuficiente listo para copiar a Codex, anclado al PR, rama y `head SHA` revisado. Debe convertir los hallazgos bloqueantes en correcciones concretas, exigir las pruebas necesarias, ordenar publicar sobre la misma rama sin merge y pedir como evidencia el nuevo head, archivos modificados y resultados exactos. Si el head cambió desde la revisión, el prompt debe ordenar detenerse y reportarlo.

### Regla de precedencia del contexto

La ausencia de respaldo vigente es un bloqueo previo al dictamen técnico de continuidad.

Si un PR histórico presenta defectos técnicos pero no existe evidencia independiente de que su objetivo siga siendo deseado, el dictamen debe seguir siendo `BLOQUEADO POR CONTEXTO`, no `CORREGIR ANTES`.

La revisión técnica puede documentar riesgos útiles para una futura decisión, pero no debe recomendar reconstruir, corregir o continuar el PR hasta confirmar primero su vigencia funcional.

### Política de evidencia

La Skill debe distinguir claramente entre:

- hechos observados directamente en GitHub/diff/código;
- resultados de pruebas o checks mostrados por GitHub;
- pruebas que el autor afirma haber ejecutado pero que no están verificadas por CI;
- inferencias técnicas derivadas del diff;
- afirmaciones del propio PR sobre su objetivo, que no equivalen a respaldo funcional vigente.

No debe afirmar que una suite, TypeScript, build, migración o flujo manual “pasa” sin evidencia observable correspondiente.

### Relación con la validación local

`LISTO PARA VALIDACIÓN LOCAL` no significa `LISTO PARA MERGE`.

Cuando el dictamen sea `LISTO PARA VALIDACIÓN LOCAL`, la siguiente etapa del pipeline es preparar el protocolo específico mediante `$generar-plan-validacion-local` cuando esa Skill esté disponible, o entregar únicamente una indicación breve de que corresponde validación local si todavía no está disponible.

La revisión puede identificar áreas que deben probarse localmente, pero no debe reemplazar esa Skill generando un protocolo exhaustivo dentro del mismo resultado.

### Puede hacer

- Leer PR, diff, commits, comentarios, reviews, checks y estado de GitHub.
- Leer memoria canónica y código relevante en `main`.
- Inspeccionar pruebas, migraciones, esquemas y archivos modificados.
- Distinguir objetivo declarado de respaldo vigente.
- Comparar implementación contra objetivo, decisiones, reglas y arquitectura cuando exista respaldo suficiente.
- Señalar hallazgos técnicos incluso en un PR histórico, siempre sin convertirlos en autorización para continuar el trabajo.
- Recomendar corrección por Codex o paso a validación local únicamente cuando el objetivo tenga respaldo vigente.

### No puede hacer

- Modificar código, memoria, ramas, PR, comentarios, reviews o labels.
- Resolver threads, aprobar/rechazar formalmente el PR ni cambiar su estado.
- Hacer merge.
- Inventar resultados de pruebas/checks.
- Tratar el resumen de Codex como sustituto del diff.
- Tratar la descripción, existencia o estado abierto de un PR como prueba suficiente de vigencia funcional.
- Recomendar reconstruir o corregir un PR histórico sin confirmar primero que su objetivo sigue siendo deseado.
- Recomendar merge directo sin validación local cuando ésta sea requerida por el workflow.
- Convertir preferencias cosméticas en bloqueos.
- Generar el protocolo exhaustivo de validación local que corresponde a `$generar-plan-validacion-local`.

### Resultado esperado

La salida debe ser breve pero verificable y usar esta estructura:

```text
REVISIÓN DE PR

PR
#XXX — título

OBJETIVO DECLARADO
...

RESPALDO VIGENTE
Decisión/especificación/contexto que lo respalda, o indicar explícitamente que no se encontró respaldo suficiente.

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

Cuando el dictamen sea CORREGIR ANTES:

PROMPT PARA CODEX
Corrige el PR #XXX sobre su misma rama, partiendo del head revisado <SHA>. Confirma primero que el head no cambió; si cambió, detente y repórtalo.

Correcciones obligatorias:
1. [archivo/área, problema, evidencia, comportamiento esperado e impacto que debe evitarse]

Pruebas requeridas:
- [pruebas y comandos concretos]

Publica en la misma rama, no hagas merge e informa el nuevo head SHA, archivos modificados, resultados exactos y limitaciones pendientes.
```

Si no existen hallazgos materiales, debe decirlo explícitamente en `HALLAZGOS`; no inventar observaciones para llenar la sección.

Cuando falte respaldo vigente, la siguiente acción debe orientarse a confirmar si el objetivo sigue siendo deseado o a obtener la decisión/especificación necesaria; no a corregir el PR.

### Criterios para pasar a Experimental

- Crear la Skill con este contrato como base.
- Probarla contra un PR real con al menos un defecto/riesgo material conocido y confirmar que lo detecta desde el diff cuando existe respaldo vigente.
- Confirmar que consulta memoria canónica y objetivo/especificación relevantes.
- Confirmar que revisa la lista completa de archivos y no depende sólo del resumen del PR.
- Confirmar que distingue evidencia de checks/pruebas reportadas e inferencias.
- Probarla contra un PR sin bloqueos materiales conocidos y verificar que puede emitir `LISTO PARA VALIDACIÓN LOCAL` sin recomendar merge.
- Probar un PR antiguo/no vigente cuya descripción explique bien su objetivo pero que carezca de respaldo funcional actual, y comprobar que emite `BLOQUEADO POR CONTEXTO` aunque encuentre defectos técnicos.
- Confirmar que no modifica GitHub ni memoria.

### Validación Experimental

Completada el 2026-08-10:

- PR #73 como caso vigente con defectos materiales: detectó desalineación entre índice único y `onConflict`, colisión entre obligaciones de distintas subcategorías, estados mixtos incompletos y regresión semanal; emitió `CORREGIR ANTES`;
- PR #82 como caso histórico sin bloqueos materiales: distinguió el estado posterior al merge de la evaluación histórica, verificó el alcance documental y emitió `LISTO PARA VALIDACIÓN LOCAL` sin recomendar merge;
- PR #24 como caso histórico sin respaldo vigente: tras el ajuste 0.2 separó objetivo declarado de vigencia funcional, mantuvo los riesgos técnicos como contexto y emitió `BLOQUEADO POR CONTEXTO` con una siguiente acción orientada a confirmar la decisión;
- en los tres casos consultó memoria canónica, estado real de GitHub, diff y evidencia disponible, distinguió pruebas reportadas de checks observables y no modificó GitHub ni memoria.

La Skill permanece `Experimental` hasta acumular uso real suficiente para decidir si su contrato puede considerarse estable y pasar a `Vigente`.

---

### Ajuste de contrato 0.2

Motivado por la tercera prueba controlada de la versión 0.1 con el PR #24. La Skill identificó correctamente defectos técnicos y obsolescencia, pero tomó el objetivo declarado por el propio PR como autoridad suficiente para recomendar reconstruirlo. El contrato 0.2 corrige esa debilidad: separa explícitamente objetivo declarado de respaldo vigente y da precedencia a la falta de vigencia funcional sobre el dictamen técnico de continuidad.

---

### Ajuste de contrato 0.3

Motivado por el uso real con el PR #90. La versión 0.2 detectó y clasificó correctamente los bloqueos, pero su siguiente acción todavía requería que el usuario tradujera manualmente los hallazgos a instrucciones para Codex. La versión 0.3 exige que `CORREGIR ANTES` entregue un prompt correctivo autosuficiente, anclado al PR y `head SHA`, listo para copiar y con evidencia de retorno obligatoria.

---

## $generar-plan-validacion-local

**Estado:** Planificada  
**Versión de contrato:** 0.2  
**Última revisión:** 2026-08-11

### Propósito

Convertir un PR que ya fue revisado y obtuvo `LISTO PARA VALIDACIÓN LOCAL` en un protocolo concreto, reproducible y priorizado de pruebas que el usuario pueda ejecutar en su entorno local antes de decidir el merge.

La Skill prepara la validación humana. No repite la auditoría completa del PR, no ejecuta por defecto las pruebas en lugar del usuario y no decide ni realiza el merge.

### Cuándo usarla

- Después de `$revisar-pr-proyecto` cuando el dictamen vigente sea `LISTO PARA VALIDACIÓN LOCAL`.
- Cuando un PR revisado necesite traducir riesgos residuales, criterios de aceptación y cambios reales a pasos de validación local.
- Para regenerar el plan si la revisión se repite sobre un nuevo `head SHA` y vuelve a resultar `LISTO PARA VALIDACIÓN LOCAL`.

No debe utilizarse para un PR con dictamen `CORREGIR ANTES` o `BLOQUEADO POR CONTEXTO`, ni como sustituto de `$revisar-pr-proyecto`.

### Precondiciones

Antes de generar el protocolo debe existir evidencia suficiente de que:

1. el PR exacto está identificado;
2. existe un dictamen vigente `LISTO PARA VALIDACIÓN LOCAL`;
3. ese dictamen corresponde al mismo `head SHA` que se pretende validar;
4. la procedencia del dictamen y del `head SHA` revisado es verificable;
5. el objetivo/criterios de aceptación y los riesgos residuales relevantes pueden reconstruirse desde la revisión, especificación, memoria y PR.

Si el `head SHA` cambió después de la revisión, la validación anterior queda obsoleta y debe repetirse `$revisar-pr-proyecto` antes de generar un nuevo plan.

Si no puede confirmar un dictamen vigente `LISTO PARA VALIDACIÓN LOCAL`, no debe inventarlo ni realizar una revisión abreviada para saltarse la etapa anterior.

### Procedencia verificable de la revisión

Una revisión previa sólo puede considerarse válida para esta Skill cuando su resultado y el `head SHA` revisado están disponibles de forma observable en una fuente explícita accesible durante la ejecución.

Fuentes aceptables:

- una salida de `$revisar-pr-proyecto` presente en la conversación actual;
- una fuente persistente/canónica explícita que registre inequívocamente el PR, el dictamen y el `head SHA` revisado.

No son fuentes suficientes:

- memoria implícita del modelo;
- una conversación borrada o no accesible;
- una afirmación genérica de que “ya se revisó” sin evidencia del resultado y SHA;
- un SHA inferido o reconstruido sin fuente explícita;
- datos que parezcan provenir de otra revisión o PR.

Si la procedencia no puede verificarse:

- tratar el dictamen como no confirmado;
- mostrar `HEAD REVISADO: No confirmado`;
- no inventar ni reutilizar un hash;
- emitir `PLAN DE VALIDACIÓN BLOQUEADO`;
- indicar como siguiente acción ejecutar `$revisar-pr-proyecto` sobre el PR real.

### Fuentes que debe consultar

1. PR objetivo: metadata, base/head, estado, lista de archivos y diff vigente.
2. Resultado vigente de `$revisar-pr-proyecto`, únicamente cuando su procedencia sea observable y verificable según la regla anterior.
3. Especificación para Codex, decisión o criterios de aceptación relevantes.
4. `docs/project-memory/CURRENT_STATE.md` desde `main`.
5. `docs/project-memory/PRODUCT_MAP.md` desde `main`.
6. `docs/project-memory/BUSINESS_RULES.md` y `DECISIONS.md` sólo cuando condicionen las pruebas.
7. `docs/project-memory/WORKFLOW.md` desde `main`.
8. Código, pruebas, migraciones, esquemas y configuración modificados o directamente relacionados con el PR.
9. `package.json` y scripts/configuración reales del repositorio cuando proponga comandos automatizados.

### Procedimiento obligatorio

1. Confirmar PR, rama/head y `head SHA` actual.
2. Identificar la fuente observable de la última revisión aplicable.
3. Extraer de esa fuente el dictamen y el `head SHA` revisado; si cualquiera falta, es ambiguo o no corresponde al PR real, bloquear el plan sin inventar valores.
4. Confirmar que la revisión emitió `LISTO PARA VALIDACIÓN LOCAL` para el mismo `head SHA` actual.
5. Reconstruir el objetivo y los criterios de aceptación que la validación debe demostrar.
6. Revisar el diff y los archivos afectados sólo con el nivel necesario para diseñar las pruebas; no reabrir una auditoría general ya concluida.
7. Identificar las superficies que requieren validación humana o local, priorizando:
   - comportamiento funcional visible;
   - regresiones en rutas relacionadas;
   - persistencia y saldos/cálculos financieros cuando apliquen;
   - migraciones y compatibilidad con datos existentes cuando apliquen;
   - permisos/aislamiento por hogar cuando apliquen;
   - estados de error y casos límite relevantes;
   - build, tipado, tests u otros comandos necesarios según el cambio.
8. Derivar comandos únicamente de scripts, herramientas y convenciones observables del repositorio. No inventar scripts inexistentes.
9. Separar el protocolo en preparación, verificaciones automatizadas, validación manual y comprobaciones de datos/migración cuando correspondan.
10. Para cada paso manual indicar:
   - acción concreta;
   - resultado esperado;
   - qué evidencia o anomalía debe reportarse.
11. Ordenar las pruebas para detectar primero bloqueos baratos/rápidos y evitar trabajo manual innecesario si falla una comprobación crítica temprana.
12. Incluir condiciones de parada: si una prueba crítica falla o aparece corrupción, regresión material, error de migración o comportamiento contrario a una regla/criterio, detener la validación y devolver el PR a corrección/revisión.
13. No recomendar merge mientras quede pendiente una prueba crítica capaz de cambiar la decisión.
14. Terminar indicando qué resultados mínimos debe devolver el usuario para poder decidir el siguiente paso.

### Anclaje al commit revisado

El protocolo debe mostrar explícitamente el `head SHA` al que aplica.

Si GitHub informa un SHA diferente antes o durante la validación:

- detener el protocolo;
- no asumir que los pasos siguen siendo suficientes;
- ejecutar nuevamente `$revisar-pr-proyecto` sobre el nuevo head;
- generar después un plan nuevo si vuelve a resultar `LISTO PARA VALIDACIÓN LOCAL`.

### Política de entorno y datos

- La validación se realiza en un entorno local/no productivo salvo decisión explícita distinta y segura.
- No proponer operaciones destructivas sobre producción.
- Si una migración o prueba puede modificar datos locales relevantes, advertirlo y definir precondiciones de respaldo/fixture cuando sea necesario.
- No pedir secretos ni incluirlos en comandos o evidencia.
- Cuando una prueba requiera datos representativos, describir las condiciones mínimas del escenario sin inventar datos personales o financieros reales.

### Puede hacer

- Leer PR, diff, commits y estado de GitHub en modo lectura.
- Leer memoria, especificación, revisión previa verificable y código relacionado.
- Inspeccionar scripts, tests, migraciones y configuración.
- Diseñar comandos y escenarios específicos respaldados por el repositorio.
- Priorizar pruebas según riesgo e impacto.
- Indicar resultados esperados, evidencia mínima y condiciones de parada.

### No puede hacer

- Modificar código, memoria, ramas, PR o datos del usuario.
- Hacer merge, aprobar formalmente el PR o cambiar su estado.
- Sustituir `$revisar-pr-proyecto` ni convertir `CORREGIR ANTES`/`BLOQUEADO POR CONTEXTO` en un plan de validación.
- Inventar que una prueba ya pasó.
- Inventar o inferir una revisión previa, un dictamen o un `head SHA` sin fuente explícita verificable.
- Usar memoria implícita del modelo como evidencia de una revisión previa.
- Inventar scripts, rutas, comandos, tablas o flujos no observados.
- Ejecutar operaciones destructivas sobre producción.
- Recomendar merge antes de completar las validaciones críticas aplicables.
- Convertir el plan en una checklist genérica idéntica para cualquier PR.

### Resultado esperado

Cuando proceda generar el plan, la salida debe utilizar esta estructura:

```text
PLAN DE VALIDACIÓN LOCAL

PR
#XXX — título

HEAD VALIDADO
<sha>

OBJETIVO A DEMOSTRAR
...

PREPARACIÓN
1. ...

VERIFICACIONES AUTOMATIZADAS
1. Comando: ...
   Esperado: ...

VALIDACIÓN MANUAL
1. Acción: ...
   Esperado: ...
   Reportar si: ...

DATOS / MIGRACIONES
No aplica | pasos concretos y seguros

REGRESIONES CLAVE
1. ...

CONDICIONES DE PARADA
- ...

RESULTADO A REPORTAR
- comprobaciones críticas satisfactorias;
- fallos/anomalías con paso y síntoma;
- cualquier diferencia de SHA o cambio del PR durante la validación.
```

Cuando no proceda generar el plan por falta de revisión verificable o por diferencia de SHA, debe usar:

```text
PLAN DE VALIDACIÓN BLOQUEADO

PR
#XXX — título

MOTIVO
...

HEAD ACTUAL
<sha>

HEAD REVISADO
<sha> | No confirmado

SIGUIENTE ACCIÓN
Una sola acción concreta.
```

Debe omitir secciones operativas que realmente no apliquen, excepto `DATOS / MIGRACIONES`, que puede indicar explícitamente `No aplica` cuando sea útil para dejar constancia.

### Criterios para pasar a Experimental

- Crear la Skill con este contrato como base.
- Probarla con un PR real que haya obtenido `LISTO PARA VALIDACIÓN LOCAL` y confirmar que genera un protocolo específico, no genérico.
- Confirmar que el plan queda anclado al `head SHA` revisado.
- Confirmar que deriva comandos de scripts/configuración reales y distingue pruebas automatizadas de validación humana.
- Probar un cambio con migración/persistencia y comprobar que incluye validaciones de datos seguras y específicas.
- Probar un PR o nuevo commit cuyo `head SHA` no coincida con la revisión previa y comprobar que se bloquea y pide repetir `$revisar-pr-proyecto`.
- Probar un caso sin revisión previa observable y comprobar que emite `PLAN DE VALIDACIÓN BLOQUEADO`, muestra `HEAD REVISADO: No confirmado` y no inventa un SHA ni un dictamen.
- Confirmar que incluye resultados esperados, condiciones de parada y evidencia mínima a reportar.
- Confirmar que no modifica repositorio, GitHub ni datos.

### Ajuste de contrato 0.2

Motivado por la primera prueba controlada de la versión 0.1 con el PR #82 en un chat donde la revisión anterior ya no estaba disponible. La Skill se bloqueó correctamente, pero presentó como recuperado un dictamen y un SHA sin fuente observable. El contrato 0.2 exige procedencia verificable de la revisión previa y prohíbe reconstruir o inventar el dictamen o `head SHA` desde memoria implícita.

---

## Skills previstas para el pipeline v2

No quedan Skills candidatas con contrato pendiente en el pipeline v2 actualmente definido. Nuevas Skills deberán discutirse y añadirse aquí antes de asumirse disponibles.

## Regla de mantenimiento del catálogo

Cuando una Skill cambie de comportamiento:

1. discutir y acordar el cambio en el espacio de trabajo correspondiente;
2. actualizar primero o junto con la implementación su contrato en este catálogo;
3. incrementar la versión de contrato cuando el cambio sea funcionalmente relevante;
4. mantener la implementación de la Skill coherente con este documento;
5. marcar una Skill `Retirada` en vez de borrar silenciosamente su contrato cuando su existencia histórica explique decisiones o automatizaciones anteriores.