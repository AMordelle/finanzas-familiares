# Mapa funcional — Finanzas Familiares

> Describe el papel vigente de cada área del producto. No es un inventario de rutas ni un historial de implementación. Cuando el código y este mapa difieran, debe investigarse cuál está desactualizado antes de diseñar trabajo nuevo.

## Principio del producto

Finanzas Familiares busca que la captura cotidiana sea sencilla y que la aplicación transforme esos datos en una lectura financiera útil del hogar. Los módulos no deben evolucionar como silos: cuentas, movimientos, flujos, cierres y análisis representan distintas vistas de una misma realidad financiera.

## Navegación principal conocida

La navegación simplificada del producto se concentra actualmente en seis áreas principales: Dashboard, Registro, Cuentas, Movimientos, Extras y Cierre. Flujos forma parte del desarrollo financiero activo y Configuración contiene definiciones necesarias para el comportamiento de categorías/subcategorías y calendarios. La existencia de otras rutas en el repositorio no implica que formen parte de la navegación vigente.

## Dashboard

**Propósito:** ofrecer una lectura resumida del estado financiero del hogar.

**Estado:** funcionalidad existente, con alcance futuro de IA todavía por definir.

**Relaciones:** consume información derivada de cuentas, movimientos y otros módulos financieros; no debe convertirse en una segunda fuente de cálculo independiente.

**Pendiente relevante:** definir qué interpretación aporta realmente la IA y qué indicadores deben permanecer determinísticos.

## Registro

**Propósito:** ser la entrada sencilla para capturar actividad financiera.

**Estado:** existente; evolución pendiente.

**Comportamiento objetivo conocido:** interpretar → detectar/validar faltantes → confirmar → guardar → recalcular.

**Pendiente relevante:** permitir captura multi-movimiento en una sola entrada, conservando la trazabilidad individual de los movimientos generados.

## Cuentas

**Propósito:** representar dónde está el dinero y, cuando corresponda, posiciones financieras u obligaciones necesarias para interpretar correctamente el patrimonio/flujo.

**Estado:** funcional.

**Características conocidas:** ordenamiento persistente por grupo visual; coexistencia de cuentas operativas y cuentas que representan obligaciones/posiciones financieras.

**Relaciones:** los movimientos modifican/reflejan sus saldos; transferencias entre cuentas no deben crear ingresos o gastos artificiales.

## Movimientos

**Propósito:** registrar y consultar la actividad financiera con trazabilidad.

**Estado:** funcional y considerado una pieza central del producto.

**Características conocidas:** filtros para consultar movimientos y localizar actividad financiera relevante.

**Relaciones:** alimenta saldos, cierres, análisis y otras lecturas derivadas. La captura desde Registro debe terminar produciendo movimientos trazables.

## Extras

**Propósito:** registrar ingresos laborales extraordinarios o variables que requieren seguimiento separado.

**Estado:** funcional.

**Tipos conocidos:**
- tiempo extra, medido en horas;
- destajo, medido en unidades;
- comidas, registradas por importe.

**Características conocidas:** crear, editar, marcar pagado y eliminar; resumen con totales y orden temporal.

## Flujos

**Propósito:** representar compromisos/periodos financieros y su estado a través del tiempo.

**Estado:** en desarrollo activo.

**Base actual:** historial y estado financiero integrados mediante PR #72.

**Trabajo activo:** PR #73, calendario individual de compromisos por subcategoría.

**Relaciones:** depende de la configuración financiera de categorías/subcategorías y de su calendario; debe mantener identidad por subcategoría para evitar colisiones entre obligaciones del mismo flujo.

**Pendiente inmediato:** validación local integral del PR #73 antes de decidir su merge.

## Cierre

**Propósito:** representar el estado financiero de un periodo y permitir evaluar cómo terminó respecto de su inicio.

**Estado:** existente, con evolución pendiente.

**Regla relevante:** financiamiento recibido no debe transformarse en ingreso del periodo.

**Pendiente conocido:** evolucionar la lectura semanal y mensual del estado al inicio y al final del periodo.

## Configuración

**Propósito:** mantener definiciones que gobiernan el comportamiento financiero de la aplicación sin obligar a codificarlas en cada operación cotidiana.

**Estado:** funcionalidad existente y actualmente relacionada con el desarrollo de Flujos.

**Características conocidas:** configuración de categorías/subcategorías; calendario individual por subcategoría en el trabajo del PR #73.

**Relaciones:** es fuente de parámetros para generación e interpretación de compromisos financieros.

## Áreas ocultas o futuras conocidas

Existen o han existido conceptos/rutas para Análisis, Simulación, Calendario y Objetivos que no deben asumirse como módulos activos de navegación. Su alcance deberá confirmarse contra el estado vigente antes de reactivar trabajo sobre ellos.

## Regla de mantenimiento

Cuando cambie el papel de un módulo:

1. actualizar aquí su propósito, estado y relaciones;
2. actualizar `CURRENT_STATE.md` si afecta el estado global o siguiente paso;
3. registrar en `DECISIONS.md` únicamente las decisiones relevantes que expliquen el cambio;
4. actualizar `BUSINESS_RULES.md` si el cambio crea, modifica o elimina una regla funcional.