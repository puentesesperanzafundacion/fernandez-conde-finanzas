# Fernández Conde Finanzas

Aplicación web progresiva para clientes, presupuestos, pagos por actos procesales, recibos de abonos, cuentas por cobrar, gastos, márgenes e informes históricos de Fernández Conde, S.C.

## Arquitectura gratuita

- GitHub Pages publica la aplicación.
- Supabase Auth permite el acceso de los dos socios.
- Supabase Database sincroniza los registros entre PC y celular.
- Los PDF se generan en el dispositivo y pueden descargarse o compartirse.

## Configuración inicial

1. Crea un proyecto gratuito en Supabase.
2. Abre **SQL Editor** y ejecuta [`supabase/schema.sql`](supabase/schema.sql).
3. En **Authentication > Users**, crea únicamente las dos cuentas de los socios.
4. Confirma que sólo estén esas dos cuentas y ejecuta [`supabase/migration_integrity_v2.sql`](supabase/migration_integrity_v2.sql). La migración exige exactamente dos usuarios, incorpora operaciones atómicas, bitácora y papelera.
5. Ejecuta [`supabase/migration_product_v3.sql`](supabase/migration_product_v3.sql) para habilitar clasificación de clientes, pagos parciales, gastos atribuibles y escritura exclusiva mediante RPC.
6. Ejecuta [`supabase/migration_product_v5.sql`](supabase/migration_product_v5.sql) para habilitar acompañantes, claves internas, planes de pago por actos procesales y recibos por abono.
7. Ejecuta [`supabase/migration_product_v6.sql`](supabase/migration_product_v6.sql) para habilitar cuentas por cobrar, márgenes derivados, gastos por expediente, fondo y reparto histórico de utilidades.
8. Ejecuta [`supabase/migration_product_v6_1_fund_expenses.sql`](supabase/migration_product_v6_1_fund_expenses.sql) para permitir gastos cubiertos por el Fondo y descontarlos de su saldo.
9. Ejecuta [`supabase/migration_product_v6_2_distribution_voids.sql`](supabase/migration_product_v6_2_distribution_voids.sql) para anular, corregir y restaurar repartos sin borrar su histórico.
10. Mantén deshabilitado el registro público de usuarios.
11. La publicación automática configura GitHub Pages desde el flujo incluido en el repositorio.

La clave `publishable` de Supabase está diseñada para aplicaciones cliente y puede utilizarse en el navegador. La protección de los datos depende de Authentication, la lista `partners` y las políticas RLS incluidas en la migración.

## Actualización de una instalación existente

1. Comprueba con `select email, display_name from public.partners order by email;` que existan exactamente los dos socios autorizados.
2. Si V2 todavía no está aplicada, ejecuta una sola vez `supabase/migration_integrity_v2.sql`.
3. Ejecuta `supabase/migration_product_v3.sql` en SQL Editor.
4. Ejecuta `supabase/migration_product_v5.sql` en SQL Editor.
5. Respalda los datos y ejecuta `supabase/migration_product_v6.sql` en SQL Editor.
6. Ejecuta `supabase/migration_product_v6_1_fund_expenses.sql` en SQL Editor.
7. Ejecuta `supabase/migration_product_v6_2_distribution_voids.sql` en SQL Editor.
8. Publica el código actualizado. No inviertas este orden: la aplicación utiliza las vistas y funciones creadas por las migraciones.

Para volver desde V6, restaura el código anterior y ejecuta [`supabase/migration_product_v6_rollback.sql`](supabase/migration_product_v6_rollback.sql). El rollback elimina sólo objetos agregados por V6.

Para revertir únicamente V6.1, ejecuta [`supabase/migration_product_v6_1_fund_expenses_rollback.sql`](supabase/migration_product_v6_1_fund_expenses_rollback.sql) y restaura la rama de respaldo correspondiente.

Para revertir únicamente V6.2, ejecuta [`supabase/migration_product_v6_2_distribution_voids_rollback.sql`](supabase/migration_product_v6_2_distribution_voids_rollback.sql).

## Desarrollo

```bash
cp .env.example .env.local
npm ci
npm run dev
```

## Publicación

Cada cambio enviado a `main` ejecuta [`.github/workflows/pages.yml`](.github/workflows/pages.yml) y publica automáticamente GitHub Pages.
