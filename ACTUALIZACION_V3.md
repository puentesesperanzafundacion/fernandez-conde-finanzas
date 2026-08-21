# Actualización V3

Esta versión conserva todos los datos existentes y agrega:

- clasificación de clientes: Aceptado, Pendiente o Rechazado;
- pagos parciales por documento, saldo y desglose de abonos;
- informes mensuales, anuales e históricos en PDF;
- identificación de quién realizó cada gasto;
- conceptos jurídicos sugeridos con captura manual libre;
- logotipo institucional en inicio e íconos instalables;
- gastos idempotentes y escrituras financieras protegidas por RPC;
- esquema base seguro ante una reejecución accidental.

## Orden de instalación

1. En Supabase ejecuta:

   ```sql
   select email, display_name from public.partners order by email;
   ```

   Deben aparecer exactamente los dos socios autorizados.

2. Ejecuta `supabase/migration_product_v3.sql`. Es transaccional y puede
   volver a ejecutarse sin duplicar columnas, índices ni funciones.
3. Publica el código de esta versión en GitHub.
4. Espera a que GitHub Actions termine correctamente y recarga la PWA.

No vuelvas a ejecutar `migration_integrity_v2.sql` después de instalar V3;
el propio archivo ahora bloquea ese uso fuera de orden.
