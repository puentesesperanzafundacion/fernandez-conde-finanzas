# Actualización V6.1 — Gastos cubiertos por el Fondo

Fecha: 21 de agosto de 2026

## Respaldo previo

- Rama de recuperación: `backup/pre-v6-1-fondo-gastos`.
- Commit respaldado: `61d182533bf55315f46ab48602dc522de12f348c`.
- Respaldo de datos: `FernandezConde_Backup_PreV6_1_Fondo_2026-08-21.zip`.
- Incluye clientes, documentos, movimientos, socios, configuración de reparto e histórico de repartos en CSV y JSON.
- SHA-256: `6551590967acf569210a7da48118cd176e993817e24ac79ad2f4bff2fce1de8b`.

## Cambios de producto

- “Fondo” aparece junto con Oscar y Dan al registrar o editar un gasto.
- La etiqueta ahora pregunta **quién cubrió el gasto**, porque el origen puede ser una persona o el Fondo.
- Los gastos cubiertos por el Fondo se descuentan automáticamente de su saldo disponible.
- El apartado de reparto muestra saldo disponible, total aportado y total gastado por el Fondo.
- En el historial de movimientos se identifica el origen del pago como “Cubrió: Oscar”, “Cubrió: Dan” o “Cubrió: Fondo”.
- Un gasto del Fondo puede seguir vinculándose a un expediente y afectar también su margen.

## Cálculo

`Saldo disponible del Fondo = aportaciones históricas al Fondo − gastos activos cubiertos por el Fondo`

Los gastos enviados a la papelera dejan de descontarse. Al restaurarlos vuelven a descontarse automáticamente.

## Base de datos

La migración `supabase/migration_product_v6_1_fund_expenses.sql`:

- Actualiza la vista derivada `finance_fund_balance_v6` para incluir aportado, gastado y saldo.
- Agrega las RPC `create_finance_expense_v6_1` y `update_finance_expense_v6_1`.
- Mantiene las RPC V6 anteriores intactas para facilitar la reversión.
- No modifica clientes, documentos, movimientos ni repartos existentes.

## Reversión

`supabase/migration_product_v6_1_fund_expenses_rollback.sql` elimina únicamente las dos RPC de V6.1 y restaura la vista del Fondo a su cálculo de V6. No elimina registros operativos.

Plan completo:

1. Restaurar `backup/pre-v6-1-fondo-gastos` como `main`.
2. Ejecutar `migration_product_v6_1_fund_expenses_rollback.sql`.
3. Usar el respaldo de datos únicamente si se requiere recuperar el estado exacto previo.

## Verificaciones

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Prueba de creación: un gasto de $12.34 redujo el Fondo de $545.00 a $532.66.
- Prueba de edición: al cambiarlo a $20.00 el saldo quedó en $525.00.
- Prueba de papelera: retirarlo devolvió el saldo a $545.00; restaurarlo volvió a dejarlo en $525.00. El registro temporal quedó finalmente en la papelera.
- Confirmación de conservación de datos existentes mediante huellas de integridad idénticas antes y después de la prueba.
- Confirmación de exactamente dos socios autorizados.
- Confirmación de que las RPC V6.1 no son ejecutables por usuarios anónimos.
