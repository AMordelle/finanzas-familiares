# Reglas de negocio vigentes — Finanzas Familiares

> Este archivo contiene reglas funcionales que futuras implementaciones deben respetar. No debe usarse para ideas tentativas ni para detalles puramente técnicos.

## Principios generales

1. La aplicación administra finanzas de un hogar compartido.
2. La captura debe mantenerse simple; la aplicación debe asumir la mayor parte posible del trabajo de interpretación.
3. La información presentada debe ayudar a entender la situación financiera, no limitarse a almacenar movimientos.
4. Las reglas financieras críticas deben ser determinísticas y verificables.

## Movimientos y cuentas

1. Los movimientos deben conservar trazabilidad suficiente para consultar y filtrar la actividad financiera.
2. Las cuentas pueden representar dinero operativo o posiciones financieras/obligaciones según su función.
3. Una transferencia entre cuentas no debe convertirse artificialmente en ingreso o gasto cuando económicamente solo representa movimiento de fondos.
4. Un préstamo recibido no es ingreso: aumenta la disponibilidad de efectivo y simultáneamente genera una obligación.

## Registro

1. El flujo de registro debe seguir el principio: interpretar → detectar/validar faltantes → confirmar → guardar → recalcular.
2. La evolución prevista del Registro debe permitir capturar múltiples movimientos relacionados en una sola entrada sin sacrificar trazabilidad individual.

## Extras

1. Los extras laborales contemplan al menos:
   - tiempo extra, medido en horas;
   - destajo, medido en unidades;
   - comidas, registradas por importe.
2. Los extras deben poder crearse, editarse, marcarse como pagados y eliminarse.
3. El resumen debe permitir conocer los totales relevantes y conservar orden temporal.

## Flujos y compromisos

1. Los compromisos financieros se modelan a partir de subcategorías; no se crea una tabla independiente de compromisos para el calendario individual definido actualmente.
2. Cada subcategoría puede tener su propia configuración de calendario.
3. La periodicidad puede requerir diferentes datos de calendario, incluyendo día del mes y, cuando corresponda, mes o mes inicial.
4. La generación de obligaciones debe respetar `tracking_start_date`.
5. Dos subcategorías del mismo flujo deben poder coexistir aunque tengan la misma fecha de vencimiento; no deben colisionar por compartir flujo y periodo.
6. La generación de periodos debe ser idempotente: volver a calcular no debe crear duplicados de la misma obligación/subcategoría/periodo.
7. Una subcategoría que requiera calendario pero no tenga configuración completa debe poder distinguirse como pendiente de configuración en lugar de generar obligaciones incorrectas.

## Cierre

1. El cierre debe representar el estado financiero del periodo sin convertir financiamiento recibido en ingreso.
2. La evolución prevista contempla lectura semanal y mensual del estado al inicio y al final del periodo.

## IA

1. La IA puede interpretar lenguaje natural, redactar explicaciones y asistir al usuario.
2. La IA no debe ser la autoridad de cálculo financiero ni modificar directamente la base de datos sin el flujo de validación/confirmación definido por la aplicación.
3. Una respuesta de IA nunca debe sustituir reglas de negocio persistentes cuando exista una regla determinística aplicable.

## Regla de mantenimiento

Cuando una decisión funcional cambie una regla de este archivo:

- actualizar la regla vigente;
- registrar el cambio y su razón en `DECISIONS.md` si es arquitectónica o relevante para decisiones futuras;
- no conservar dos reglas contradictorias como simultáneamente vigentes.