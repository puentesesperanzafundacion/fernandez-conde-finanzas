# Actualización V8.2 — Ícono de la aplicación

## Respaldo previo

- Rama: `backup/pre-v8-2`
- Commit respaldado: `5d34859232b0d3133a18838c9c8305df3e5b5cb1`
- Esta actualización no modifica Supabase ni los datos.

## Cambios realizados

- Se reemplazó el ícono genérico por el monograma oficial de Fernández Conde.
- Se generaron tamaños específicos para navegador, Android, iPhone y accesos instalados.
- Se agregó una variante `maskable` con margen seguro para evitar recortes en Android.
- Se versionó la caché del service worker para que los dispositivos descarguen los recursos nuevos.

## Archivos de imagen

- `public/fc-favicon-32.png`
- `public/fc-icon-192.png`
- `public/fc-icon-512.png`
- `public/fc-icon-maskable-512.png`
- `public/fc-apple-touch-icon.png`

## Verificaciones

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Validación de tamaños y formato de los cinco íconos.
