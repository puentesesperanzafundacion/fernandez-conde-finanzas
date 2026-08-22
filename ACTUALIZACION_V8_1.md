# Actualización V8.1

Fecha: 22 de agosto de 2026

## Respaldo previo

- Rama de recuperación: `backup/pre-v8-1`.
- Commit respaldado: `7ec6e0416ebf97a8f268ec05f473b74f755fe230`.
- Este ajuste no modifica Supabase ni requiere una migración adicional.

## Ajuste de experiencia de uso

- Se retiró la pestaña independiente **Seguimiento COMAR** de los menús de escritorio y celular.
- Se eliminó la matriz general de clientes y etapas, que en dispositivos móviles generaba un área de desplazamiento propia y dificultaba subir o bajar entre registros.
- El menú inferior móvil vuelve a tener ocho posiciones, con más espacio para Inicio, Presupuestos, captura rápida, Clientes, Gastos, Informes, Reparto y Papelera.
- El seguimiento COMAR continúa dentro de la ficha individual de cada cliente clasificado como Migratorio/COMAR.
- Desde la ficha siguen disponibles las ocho etapas, el avance `X de 8`, los botones Pendiente/Completado y la bitácora con socio, fecha y hora.
- La caché del service worker se actualizó a `fc-finanzas-v8-1` para forzar la descarga del diseño corregido.

## Conservación de datos

- No se eliminaron áreas de práctica, plantillas, etapas ni avances ya registrados.
- No se modificaron clientes, documentos, movimientos, repartos, Fondo ni socios.
- El RPC y las tablas V8 permanecen activos porque siguen siendo utilizados por el checklist de la ficha del cliente.

## Reversión

Para regresar a la interfaz anterior, restaurar `backup/pre-v8-1` como `main`. No debe ejecutarse el rollback de V8, porque este ajuste es exclusivamente visual.

## Verificaciones

- Ausencia de la pestaña COMAR en los menús de escritorio y celular.
- Ausencia de la matriz general y de su contenedor con desplazamiento propio.
- Confirmación de que la ficha del cliente conserva el checklist completo y el guardado compartido de avances.
- ESLint.
- TypeScript.
- Compilación estática de producción.
