# Actualización V8.5 — Nacionalidad de clientes

Fecha: 31 de agosto de 2026

## Respaldo previo

- Rama: `backup/pre-v8-5-client-nationality`.
- Commit: `65e63d60f7f997d5decb8ab1fc464ad31fae2bec`.
- Respaldo privado: `FernandezConde_Backup_PreV8_5_Nacionalidad_2026-08-31.zip`.
- SHA-256: `5bd6daffb2d64be067170afe50e6f19c55d59dc55d30c3f014e14bae63aee1c6`.
- Incluye 25 clientes, 25 presupuestos, 26 movimientos, 2 socios y las tablas de configuración, histórico y saldo del Fondo.

## Cambios

- Se agregó el campo opcional `Nacionalidad` al alta y edición de clientes.
- Opciones preseleccionadas: Cubana, Venezolana, Colombiana y China.
- La opción `Otra` habilita captura manual de hasta 80 caracteres.
- La nacionalidad se muestra dentro de la ficha completa del cliente.
- Los clientes existentes permanecen como `Sin registrar`; no se clasifican automáticamente.
- Se actualizó el caché de la aplicación móvil.

## Base de datos

- `migration_product_v8_5_client_nationality.sql` agrega únicamente la columna opcional `clients.nationality` y una validación de longitud.
- No modifica clientes, presupuestos, movimientos, repartos ni saldos existentes.

## Reversión

`migration_product_v8_5_client_nationality_rollback.sql` elimina únicamente la restricción y columna agregadas por V8.5.

## Verificaciones

- ESLint, TypeScript y compilación estática de producción: correctos.
- Prueba transaccional como socio autorizado: alta con `Cubana` y edición posterior a la nacionalidad manual `Haitiana`.
- La transacción de prueba se revirtió; no quedó ningún cliente temporal.
- Antes y después permanecen 25 clientes, 25 presupuestos, 26 movimientos, 2 socios y 3 repartos.
- Los 25 clientes anteriores conservaron la nacionalidad sin registrar.
