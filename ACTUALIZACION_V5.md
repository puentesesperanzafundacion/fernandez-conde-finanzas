# Actualización V5

Fecha: 21 de agosto de 2026

## Cambios de producto

- La creación de documentos se concentra en presupuestos; los documentos históricos de otros tipos se conservan.
- Los conceptos jurídicos se muestran en un selector completo con opción de captura manual.
- Los clientes admiten una clave interna meramente informativa y varios acompañantes con parentesco o relación.
- Los gastos se atribuyen mediante un selector limitado a Oscar o Dan.
- Se agrega la categoría `Impresiones y copias`.
- Cada presupuesto puede incorporar un plan opcional de pagos por actos procesales, sin fechas obligatorias.
- Los abonos pueden ligarse a un acto procesal o registrarse como pago general.
- Cada abono permite descargar o compartir su propio recibo PDF.
- El presupuesto PDF incorpora el plan de pagos y la relación entre abonos y actos procesales.

## Cambios de base de datos

La migración `supabase/migration_product_v5.sql` agrega:

- `clients.internal_key`
- `clients.companions`
- `documents.payment_plan`
- `movements.payment_stage_id`
- `create_finance_budget_v5`
- `update_finance_document_v5`
- `create_document_payment_v5`

Las nuevas funciones validan que un pago no exceda el saldo general ni el saldo del acto procesal. También impiden retirar de un plan una etapa que ya tenga pagos activos.

## Compatibilidad y conservación

- La migración no elimina clientes, documentos ni movimientos existentes.
- Los registros anteriores reciben listas vacías de acompañantes y planes de pago.
- Los RPC anteriores permanecen disponibles temporalmente para navegadores con una versión antigua en caché.
- Los RPC financieros ya no son ejecutables por usuarios anónimos.

## Verificaciones realizadas

- ESLint
- TypeScript
- Compilación estática de producción
- Validación de la migración en Supabase
- Confirmación de dos socios autorizados
- Confirmación de conservación de clientes, documentos y movimientos existentes

