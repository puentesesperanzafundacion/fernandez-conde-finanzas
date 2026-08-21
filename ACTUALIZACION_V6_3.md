# Actualización V6.3 — Fechas previstas y pagos recibidos

## Objetivo

Separar la programación de una parcialidad del momento en que el dinero realmente entra a la firma.

## Cambios

- Cada acto procesal puede tener una **fecha prevista opcional**.
- Una fecha prevista es solo informativa: no aumenta ingresos, no reduce el saldo y no participa en informes, márgenes ni reparto.
- El detalle del presupuesto y su PDF muestran la fecha prevista.
- Los actos no cubiertos cuya fecha prevista ya pasó aparecen como **Atrasado**.
- El formulario de abono ahora dice **Fecha real de recepción** y no permite fechas futuras.
- El servidor también rechaza abonos con fecha futura, aunque se intente omitir la validación de la interfaz.
- Los planes antiguos sin fecha siguen siendo válidos.

## Ejemplo

Si en agosto se programa un acto por $10,000 para el 15 de octubre, agosto no recibe ningún ingreso. Cuando el pago llegue en octubre se registra el abono con su fecha real y entonces aparece en los informes de octubre.

## Base de datos

Ejecutar:

```sql
supabase/migration_product_v6_3_scheduled_dates.sql
```

Reversión:

```sql
supabase/migration_product_v6_3_scheduled_dates_rollback.sql
```

La reversión elimina únicamente la función de pago V6.3 y la validación adicional de fechas. No elimina clientes, documentos, movimientos ni fechas ya guardadas dentro de `payment_plan`.

## Verificaciones

- ESLint
- TypeScript
- Compilación de producción
- Conservación de registros existentes y de los dos socios autorizados
- Validación SQL de fecha prevista correcta e incorrecta
- Rechazo SQL de abonos futuros

