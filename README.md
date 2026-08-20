# Fernández Conde Finanzas

Aplicación web progresiva para presupuestos, recibos, cuentas de cobro, clientes, gastos e informes financieros de Fernández Conde, S.C.

## Arquitectura gratuita

- GitHub Pages publica la aplicación.
- Supabase Auth permite el acceso de los dos socios.
- Supabase Database sincroniza los registros entre PC y celular.
- Los PDF se generan en el dispositivo y pueden descargarse o compartirse.

## Configuración inicial

1. Crea un proyecto gratuito en Supabase.
2. Abre **SQL Editor** y ejecuta [`supabase/schema.sql`](supabase/schema.sql).
3. En **Authentication > Users**, crea únicamente las dos cuentas de los socios.
4. Confirma que sólo estén esas dos cuentas y ejecuta [`supabase/migration_integrity_v2.sql`](supabase/migration_integrity_v2.sql). La migración autoriza a los usuarios existentes, incorpora operaciones atómicas, bitácora y papelera.
5. Mantén deshabilitado el registro público de usuarios.
6. La publicación automática configura GitHub Pages desde el flujo incluido en el repositorio.

La clave `publishable` de Supabase está diseñada para aplicaciones cliente y puede utilizarse en el navegador. La protección de los datos depende de Authentication, la lista `partners` y las políticas RLS incluidas en la migración.

## Actualización de una instalación existente

1. Comprueba en **Authentication > Users** que sólo estén las cuentas autorizadas.
2. Ejecuta una sola vez `supabase/migration_integrity_v2.sql` en SQL Editor.
3. Publica el código actualizado. No inviertas este orden: la aplicación nueva utiliza las funciones transaccionales creadas por la migración.

## Desarrollo

```bash
cp .env.example .env.local
npm ci
npm run dev
```

## Publicación

Cada cambio enviado a `main` ejecuta [`.github/workflows/pages.yml`](.github/workflows/pages.yml) y publica automáticamente GitHub Pages.
