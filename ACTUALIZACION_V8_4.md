# Actualización V8.4 — Datos de contacto en documentos

Fecha: 29 de agosto de 2026

## Respaldo previo

- Rama: `backup/pre-v8-4-pdf-contact`.
- Commit: `80d0a4c1c29da1297f92063989e05281fe5da659`.
- No se modificó la base de datos ni fue necesaria una migración de Supabase.

## Cambios

- Se corrigió el correo del pie de página a `contacto@fernandezconde.com`.
- Se agregó el sitio web `www.fernandezconde.com`.
- Se agregó la dirección de la firma:
  - Av. Insurgentes Sur 1783, Oficina 301, Tercer Piso.
  - Colonia Guadalupe Inn, Álvaro Obregón, CDMX.
- El pie corporativo se aplica a presupuestos, cuentas de cobro, recibos de pago e informes financieros.
- Se actualizó la versión del caché para que las instalaciones móviles reciban la plantilla nueva.

## Verificaciones

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Revisión visual del pie en formato carta, sin desbordamientos.
