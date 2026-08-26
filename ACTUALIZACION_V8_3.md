# Actualización V8.3 — Aportación fija al Fondo

Fecha: 26 de agosto de 2026

## Respaldo previo

- Rama: `backup/pre-v8-3-fixed-fund`.
- Commit: `7fbbf0afac7ed5605b0d8a71c6ac08a718722798`.
- Respaldo privado: `FernandezConde_Backup_PreV8_3_FondoFijo_2026-08-26.zip`.
- SHA-256: `cca3b9f906ec74834e120a71e1b6e135962e085419273e2f57c3efcfde1c7d62`.
- Incluye clientes, presupuestos, movimientos, socios, configuración e histórico de repartos, anulaciones y saldo derivado del Fondo en JSON y CSV.

## Cambios

- El cálculo permite elegir **Porcentaje configurado** o **Cantidad fija** para el Fondo.
- La modalidad por porcentaje conserva exactamente el comportamiento anterior.
- En modalidad fija, la cantidad se valida contra la utilidad neta disponible.
- El remanente se divide entre Oscar y Dan respetando la proporción configurada entre ambos.
- La vista previa muestra los tres montos antes de guardar.
- El histórico conserva los montos exactos y sus porcentajes efectivos.

## Base de datos

- `migration_product_v8_3_fixed_fund.sql` agrega únicamente la RPC `create_profit_distribution_v8_3`.
- No altera tablas, columnas ni registros existentes.
- La función conserva la validación de socio autorizado, idempotencia y bloqueo de periodos superpuestos.
- La RPC no puede ser ejecutada por usuarios anónimos.

## Reversión

`migration_product_v8_3_fixed_fund_rollback.sql` elimina únicamente la RPC V8.3. Los repartos ya guardados permanecen intactos y la aplicación puede volver al commit respaldado.

## Verificaciones

- ESLint, TypeScript y compilación estática de producción: correctos.
- Prueba porcentual con utilidad neta de $800.00: Fondo $56.00, Oscar $372.00 y Dan $372.00, conforme a la configuración vigente 7% / 46.5% / 46.5%.
- Prueba con Fondo fijo de $200.00 sobre utilidad neta de $800.00: Fondo $200.00, Oscar $300.00 y Dan $300.00.
- Ambas pruebas se ejecutaron dentro de transacciones revertidas; no quedó ningún movimiento ni reparto de prueba.
- Antes y después permanecen: 19 clientes, 18 presupuestos, 19 movimientos, 2 socios y 2 repartos.
- Los socios autorizados continúan siendo exclusivamente Oscar y Dan.
