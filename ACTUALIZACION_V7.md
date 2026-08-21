# Actualización V7

Fecha: 21 de agosto de 2026

## Respaldo previo obligatorio

- Rama de recuperación: `backup/pre-v7`.
- Commit respaldado: `fe03c3661bd18b2b61fa679d15ed3499ce80f3c8`.
- Rama de trabajo: `codex/v7-captura-rapida`.
- V7 no introduce tablas, columnas, vistas, funciones ni migraciones de Supabase; por ello no fue necesario generar un nuevo respaldo de la base de datos.

## Cambios de producto

- El botón **Nuevo** del encabezado y el botón flotante **+** de la navegación móvil abren la misma captura rápida.
- La captura rápida ofrece **Presupuesto**, **Gasto**, **Cliente** y **Abono**.
- **Presupuesto** abre el compositor existente sin alterar su funcionamiento.
- **Gasto** y **Cliente** abren directamente sus formularios, sin cambiar primero de sección.
- **Abono** abre un selector de presupuestos con saldo pendiente y después el formulario del presupuesto elegido.
- El selector de abonos excluye presupuestos rechazados y saldos liquidados, ordena del más antiguo al más reciente, permite buscar por cliente, folio o concepto y muestra el saldo antes de elegir.
- La sección visible **Documentos** se renombró como **Presupuestos** en escritorio, móvil, título de pantalla, actividad reciente, estados vacíos e informes.
- También se actualizaron la columna principal del listado, el texto del saldo mensual y la redacción del informe PDF.
- La anulación de repartos dejó de utilizar la confirmación nativa del navegador y ahora usa el mismo diálogo estilizado que las acciones de papelera.
- El diálogo explica el efecto sobre el Fondo, la conservación del registro anulado y su posible restauración.
- **Cancelar** cierra el diálogo sin anular ni modificar el reparto.

## Compatibilidad y conservación

- Los identificadores internos, tipos de documento y estructuras de datos permanecen intactos.
- No se modificaron clientes, presupuestos, movimientos, repartos ni socios existentes.
- La captura rápida reutiliza los formularios y operaciones ya existentes; no duplica lógica de guardado.
- La versión de caché del service worker se actualizó a `fc-finanzas-v7` para que los dispositivos reciban la interfaz nueva.

## Reversión

Plan de reversión completo:

1. Restaurar `backup/pre-v7` como `main`.
2. No se requiere rollback SQL porque V7 no modificó Supabase.

## Verificaciones realizadas

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Comparación de GitHub: V7 contiene únicamente `app/page.tsx`, `app/globals.css`, `public/sw.js` y este documento.
- Confirmación en código de que el encabezado y el FAB globales muestran las cuatro opciones desde Inicio, Presupuestos y Movimientos.
- Confirmación de que cada opción abre el estado del formulario correspondiente.
- Confirmación de que **Anular reparto** usa el diálogo compartido y de que **Cancelar** solo cierra ese diálogo.
- Búsqueda de textos visibles pendientes y ausencia de `window.confirm()` en la aplicación.
- Confirmación del despliegue de GitHub Pages mediante el service worker `fc-finanzas-v7`.
- La revisión interactiva detrás del inicio de sesión debe realizarse con una sesión de socio autorizada; no se incorporaron credenciales de prueba ni accesos temporales.
