# Fernández Conde Finanzas

Aplicación web progresiva para clientes, presupuestos, recibos, pagos parciales, gastos e informes históricos de Fernández Conde, S.C.

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
6. Mantén deshabilitado el registro público de usuarios.
7. La publicación automática configura GitHub Pages desde el flujo incluido en el repositorio.

La clave `publishable` de Supabase está diseñada para aplicaciones cliente y puede utilizarse en el navegador. La protección de los datos depende de Authentication, la lista `partners` y las políticas RLS incluidas en la migración.

## Actualización de una instalación existente

1. Comprueba con `select email, display_name from public.partners order by email;` que existan exactamente los dos socios autorizados.
2. Si V2 todavía no está aplicada, ejecuta una sola vez `supabase/migration_integrity_v2.sql`.
3. Ejecuta `supabase/migration_product_v3.sql` en SQL Editor.
4. Publica el código actualizado. No inviertas este orden: la aplicación V3 utiliza las funciones creadas por la migración.

## Desarrollo

```bash
cp .env.example .env.local
npm ci
npm run dev
```

## Publicación

Cada cambio enviado a `main` ejecuta [`.github/workflows/pages.yml`](.github/workflows/pages.yml) y publica automáticamente GitHub Pages.
