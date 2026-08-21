# Actualización V7 — Captura rápida y confirmaciones uniformes

## Objetivo

Reducir pasos en la captura diaria y hacer más clara la navegación visible de la aplicación, sin modificar la base de datos.

## Respaldo previo

- Rama: `backup/pre-v7`
- Commit respaldado: `fe03c3661bd18b2b61fa679d15ed3499ce80f3c8`
- Rama de trabajo: `codex/v7-captura-rapida`
- V7 no introduce tablas, columnas, vistas, funciones ni migraciones de Supabase.

## Cambios

### Captura rápida multi-tipo

El botón **Nuevo** del encabezado y el botón flotante **+** de la navegación móvil abren la misma hoja de captura rápida:

- **Presupuesto:** abre el compositor existente.
- **Gasto:** abre directamente el registro de gasto.
- **Cliente:** abre directamente el alta de cliente.
- **Abono:** abre un selector de presupuestos con saldo pendiente y después el formulario del abono elegido.

El selector de abonos:

- Excluye presupuestos rechazados y saldos liquidados.
- Ordena por antigüedad, del más antiguo al más reciente.
- Permite buscar por cliente, folio o concepto.
- Muestra el saldo pendiente antes de elegir.

### Navegación y textos

La sección visible **Documentos** se renombró como **Presupuestos**. También se actualizaron:

- Menú de escritorio.
- Menú inferior móvil (`Presup.`).
- Título de pantalla.
- Panel de actividad reciente.
- Estados vacíos.
- Columna principal del listado.
- Saldo mensual del dashboard.
- Indicador visual y PDF de informes.

Los tipos internos y técnicos continúan sin cambios.

### Confirmación de anulaciones

La anulación de repartos ya no utiliza `window.confirm()`. Ahora usa el mismo componente visual de confirmación que la papelera, con:

- Explicación del efecto sobre el Fondo.
- Conservación en el histórico.
- Posibilidad de restauración.
- Botón **Cancelar** que cierra el diálogo sin realizar cambios.

## Verificaciones

- ESLint.
- TypeScript.
- Compilación estática de producción.
- Búsqueda de textos visibles pendientes.
- Ausencia de `window.confirm()`.
- Apertura del mismo menú desde encabezado y FAB.
- Acceso a los cuatro flujos desde Inicio, Presupuestos y Movimientos.
- Revisión visual en escritorio y celular.
