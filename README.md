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
4. Mantén deshabilitado el registro público de usuarios.
5. La publicación automática configura GitHub Pages desde el flujo incluido en el repositorio.

La clave `publishable` de Supabase está diseñada para aplicaciones cliente y puede utilizarse en el navegador. La protección de los datos depende de Authentication y de las políticas RLS incluidas en el esquema.

## Desarrollo

```bash
cp .env.example .env.local
npm ci
npm run dev
```

## Publicación

Cada cambio enviado a `main` ejecuta [`.github/workflows/pages.yml`](.github/workflows/pages.yml) y publica automáticamente GitHub Pages.
