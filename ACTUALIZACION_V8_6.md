# Actualización V8.6 — Cuentas por cobrar acumuladas

## Respaldo previo

- Rama: `backup/pre-v8-6-cuentas-por-cobrar`
- Commit respaldado: `bb3c38eaf1cf488e217e4e4b7c45b32b3acd8a8b`
- Supabase: no requirió respaldo ni migración porque esta versión no modifica el esquema ni los datos.

## Problema corregido

Al comenzar un mes nuevo, la tarjeta **Por cobrar** de Inicio se calculaba únicamente con los presupuestos emitidos durante ese mes. Los saldos anteriores seguían guardados en Supabase, pero dejaban de contarse en el dashboard.

## Comportamiento nuevo

- **Por cobrar** suma todos los saldos activos, sin importar el mes de emisión.
- Un saldo permanece hasta que quede liquidado, el presupuesto se marque como rechazado o se envíe a la papelera.
- La lista **Cuentas por cobrar** y la tarjeta **Por cobrar** comparten ahora la misma regla.
- La tarjeta indica expresamente **Saldo pendiente acumulado**.
- **Ingresos cobrados**, **Presupuestado** y **Balance del mes** conservan su alcance mensual.

## Datos y reversión

- No se alteraron clientes, presupuestos, movimientos, repartos ni Fondo.
- No existe migración o rollback SQL para V8.6 porque no hubo cambios en Supabase.
- Para revertir el código, puede restaurarse la rama `backup/pre-v8-6-cuentas-por-cobrar` como `main`.

## Verificaciones

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Comprobación contra los saldos existentes de meses anteriores en Supabase.
