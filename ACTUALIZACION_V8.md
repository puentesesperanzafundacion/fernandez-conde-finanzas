# Actualización V8

Fecha: 22 de agosto de 2026

## Respaldo previo obligatorio

- Rama de recuperación: `backup/pre-v8`.
- Commit respaldado: `a11c1aab8aefb25697f1005b174068a3e4b5b865`.
- Rama de trabajo: `codex/v8-seguimiento-comar`.
- Respaldo privado de Supabase: `FernandezConde_Backup_PreV8_2026-08-22.zip`.
- SHA-256 del respaldo: `6047e01af32e810aa6ebd495f896f0933cd1bb67db641a115d45ab00bd728aca`.
- El ZIP contiene exportaciones JSON y CSV, manifiesto con conteos y hashes por archivo de `clients`, `documents`, `movements`, `partners`, `finance_audit_log`, las tablas de reparto V6 y las vistas de reparto y Fondo.
- Conteos previos: 17 clientes, 15 presupuestos/documentos, 13 movimientos, 2 socios, 90 eventos de bitácora y un registro en cada estructura de reparto/Fondo V6.

## Cambios de producto

- La ficha del cliente incorpora el selector opcional **Área de práctica** con Migratorio/COMAR, Arrendamiento, Civil y Otro.
- No existe valor predeterminado: los 17 clientes anteriores permanecen sin clasificar.
- Las plantillas procesales y sus etapas se modelan en tablas independientes y extensibles por área de práctica.
- Se incorporó la plantilla **Seguimiento COMAR** con ocho etapas agrupadas visualmente en **Trámite ante COMAR** y **En paralelo**.
- La ficha de un cliente Migratorio/COMAR muestra su avance `X de 8` y permite alternar cada etapa entre **Pendiente** y **Completado**.
- Cada cambio de etapa se guarda inmediatamente con fecha, hora y socio responsable, y se muestra de forma descriptiva en la bitácora.
- La nueva sección **Seguimiento COMAR** aparece en el menú únicamente cuando existe al menos un cliente activo con esa área.
- La vista resumen muestra una fila por cliente y una columna compacta por etapa; el nombre abre la ficha completa y cada celda actualiza el mismo avance compartido.
- En móvil, la matriz usa encabezados numéricos accesibles con nombre completo y desplazamiento horizontal, manteniendo fija la columna del cliente.
- La versión de caché del service worker se actualizó a `fc-finanzas-v8`.

## Migración de Supabase

- `supabase/migration_product_v8.sql` agrega únicamente:
  - la columna nullable `clients.practice_area`, sin valor predeterminado;
  - `case_stage_templates_v8`;
  - `case_stage_steps_v8`;
  - `client_case_stage_progress_v8`;
  - índices para sus llaves foráneas;
  - políticas RLS de lectura para socios;
  - el RPC idempotente `set_client_case_stage_v8` para marcar/desmarcar y registrar la bitácora.
- Las escrituras directas a las tablas V8 están revocadas para `authenticated`; el cambio de avance solo pasa por el RPC, que comprueba `auth.uid()`, pertenencia a `partners`, exactamente dos socios, cliente activo y coincidencia entre área y plantilla.
- `anon` no puede consultar las tablas V8 ni ejecutar el RPC.
- Durante la prueba transaccional inicial se detectó y corrigió una ambigüedad del `ON CONFLICT`; la prueba fallida abortó su transacción y no conservó datos temporales.

## Compatibilidad y conservación

- El seguimiento se liga exclusivamente a `clients`; no se modificó la relación ni el contenido de documentos o movimientos.
- Después de la migración se conservaron los conteos previos: 17 clientes, 15 documentos, 13 movimientos, 2 socios y un registro en cada estructura V6 de reparto/Fondo.
- Los clientes clasificados después de V8 aparecen inmediatamente en la ficha y en el resumen; los no clasificados quedan fuera de Seguimiento COMAR.
- La interfaz utiliza una sola colección de avances para la ficha y la matriz, evitando estados divergentes.
- El asesor de seguridad de Supabase reporta el RPC V8 como `SECURITY DEFINER` ejecutable por usuarios autenticados; es intencional y está limitado internamente a los dos socios. No existe acceso anónimo V8.
- Los índices V8 aparecen inicialmente como no utilizados porque todavía no hay clientes clasificados ni avances persistidos; se conservaron para cubrir las llaves foráneas al crecer la información.

## Reversión

Plan de reversión completo:

1. Restaurar `backup/pre-v8` como `main`.
2. Ejecutar `supabase/migration_product_v8_rollback.sql`.
3. Si se requiriera recuperar información previa, usar `FernandezConde_Backup_PreV8_2026-08-22.zip` y comprobar su SHA-256.

El rollback revoca y elimina el RPC, elimina únicamente las tres tablas V8 y retira la restricción y columna `clients.practice_area`. No actualiza ni elimina filas de `clients`, `documents`, `movements`, `partners` ni de las estructuras V6.

## Verificaciones realizadas

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Confirmación de RLS activo y una política de lectura en cada tabla V8.
- Confirmación de acceso anónimo denegado y ejecución del RPC permitida únicamente a sesiones autenticadas que además pasan la validación interna de socio.
- Confirmación de una plantilla Migratorio/COMAR y exactamente ocho etapas con nombres, grupos y orden solicitados.
- Confirmación de que los 17 clientes anteriores tienen `practice_area` nulo.
- Prueba completa dentro de una transacción revertida: cliente temporal sin clasificar, clasificación Migratorio/COMAR, marcado y desmarcado, sincronización del estado y dos eventos de bitácora con el socio correcto.
- Tras el rollback de la prueba: 17 clientes, cero avances V8 y 90 eventos de bitácora; no quedó ningún dato de prueba.
- Confirmación de que los dos únicos socios autorizados siguen siendo exactamente dos.
- Revisión del script de reversión para asegurar que solo elimina objetos V8.
