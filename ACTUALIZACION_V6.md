# Actualización V6

Fecha: 21 de agosto de 2026

## Respaldo previo obligatorio

- Rama de recuperación: `backup/pre-v6`.
- Commit respaldado: `3f1f181f17c99bd7a47c57eeb8fec307395119c1`.
- Respaldo privado de Supabase: `FernandezConde_Backup_PreV6_2026-08-21.zip`.
- Contenido del respaldo: `clients` (4 registros), `documents` (6), `movements` (6) y `partners` (2), incluyendo registros activos y en papelera, cada tabla en CSV y JSON.
- SHA-256 del archivo: `6e1e140be11a0d56d0782d93b2befd205304e117a00038d86029d7ce123cea68`.

## Cambios de producto

- El dashboard incorpora **Cuentas por cobrar**, ordenadas desde el presupuesto más antiguo.
- Cada cuenta muestra cliente, folio, saldo y días desde el último abono o desde su emisión.
- Los expedientes sin abonos durante 30 días se resaltan visualmente.
- Los gastos pueden vincularse opcionalmente a un presupuesto o registrarse como gasto general.
- El detalle del presupuesto muestra ingresos, gastos atribuibles, margen y porcentaje de margen.
- Las fichas e informes muestran el margen acumulado por cliente.
- Los informes incluyen márgenes por expediente y por cliente.
- Se agrega la sección **Reparto de utilidades** con porcentajes editables para Fondo, Oscar y Dan.
- El reparto guarda el periodo, las cifras calculadas y una copia de los porcentajes utilizados.
- El Fondo muestra el saldo acumulado de todos los repartos guardados.

## Cambios de base de datos

La migración `supabase/migration_product_v6.sql` agrega únicamente objetos nuevos:

- Vistas derivadas `finance_document_margins_v6` y `finance_client_margins_v6`.
- Tabla de configuración `profit_distribution_settings_v6`.
- Tabla histórica `profit_distributions_v6`.
- Vista acumulada `finance_fund_balance_v6`.
- RPC para configurar porcentajes y guardar repartos sin periodos superpuestos.
- RPC V6 para crear y editar gastos con atribución opcional a un documento.
- RPC de lectura mínima `finance_keep_alive_v6` que no expone datos.

La migración no agrega ni elimina columnas en `clients`, `documents` o `movements` y no modifica sus registros existentes.

## Reversión

El script `supabase/migration_product_v6_rollback.sql` elimina solamente vistas, funciones y tablas creadas por V6. No actualiza ni elimina clientes, documentos o movimientos.

Plan de reversión completo:

1. Restaurar `backup/pre-v6` como `main`.
2. Ejecutar `migration_product_v6_rollback.sql`.
3. Si fuera necesario restaurar datos operativos, usar el archivo privado de respaldo previo.

## Keep-alive

El workflow `.github/workflows/keep-alive.yml` se ejecuta cada cuatro días y también permite ejecución manual. Usa exclusivamente la clave pública ya incluida en el cliente para llamar una función de solo lectura. Si la petición o su respuesta fallan, GitHub Actions marca el trabajo como fallido.

## Verificaciones realizadas

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Auditoría de dependencias sin vulnerabilidades altas.
- Confirmación de conservación de clientes, documentos y movimientos existentes.
- Confirmación de exactamente dos socios autorizados: Oscar y Dan.
- Prueba controlada: presupuesto de $1,000.00, abono de $400.00, gasto atribuible de $100.00, saldo por cobrar de $600.00 y margen de $300.00 (75%).
- Prueba de reparto: utilidad de $300.00; Fondo $60.00, Oscar $120.00 y Dan $120.00 con la configuración inicial 20/40/40.
- Cliente, presupuesto, abono y gasto temporales enviados a la papelera; reparto temporal eliminado al terminar.
- Las huellas de integridad de los registros activos coincidieron antes y después de la prueba: `clients` `e96b1c3d9afc272d3e8118958d8d87e8`, `documents` `4732296a543a96d055a83c70f07f5b79`, `movements` `c614c76c72bdab32aa2bc2d811c2f315` y `partners` `2f0073064270572ac6161f0be4d20c7a`.
