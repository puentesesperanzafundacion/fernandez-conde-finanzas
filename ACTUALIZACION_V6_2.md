# Actualización V6.2 — Corrección de repartos

Fecha: 21 de agosto de 2026

## Respaldo previo

- Rama: `backup/pre-v6-2-repartos-papelera`.
- Commit: `ae1ea6103bf4277c3b17c1e0c94d8140c5f0c486`.
- Respaldo: `FernandezConde_Backup_PreV6_2_Repartos_2026-08-21.zip`.
- SHA-256: `df6530f1aefc6154d0de3609fddc9ad5c6ae1714438d7d26af8807b0c98120fd`.

## Funcionamiento

- Cada reparto vigente tiene una opción para **anularlo**.
- El reparto anulado deja de sumar al Fondo inmediatamente.
- Su periodo queda libre para crear un reparto corregido.
- El registro original aparece en **Repartos anulados**, conservando sus cifras históricas.
- Puede restaurarse mientras su periodo no se cruce con otro reparto vigente.
- Si ya se creó un reparto corregido para el mismo periodo, primero debe anularse el nuevo antes de restaurar el anterior.

## Base de datos

- La tabla `profit_distribution_voids_v6_2` conserva las anulaciones sin modificar `profit_distributions_v6`.
- La vista `finance_profit_distributions_v6_2` distingue repartos vigentes y anulados.
- La vista del Fondo sólo suma repartos vigentes.
- `create_profit_distribution_v6_2` permite recalcular periodos anulados.
- `set_profit_distribution_voided_v6_2` anula o restaura con validación de socio y de periodos superpuestos.

## Reversión

`migration_product_v6_2_distribution_voids_rollback.sql` elimina únicamente los objetos V6.2 y restaura el cálculo V6.1. No elimina repartos, movimientos, documentos ni clientes.

## Uso para corregir un error

1. Abre **Reparto de utilidades**.
2. Pulsa el icono de papelera del reparto incorrecto y confirma **Anular**.
3. Corrige el periodo, movimientos o porcentajes necesarios.
4. Calcula y guarda nuevamente el reparto.

No se permite editar directamente un histórico porque eso ocultaría que existió una corrección.

## Verificación aplicada

- El reparto existente aportaba $545.00 al Fondo.
- Al anularlo, pasó a “Repartos anulados” y el aporte vigente del Fondo bajó temporalmente a $0.00.
- Al restaurarlo, volvió al histórico vigente y el Fondo recuperó exactamente $545.00.
- La prueba terminó sin repartos anulados y sin cambios en las cifras del reparto original.
- Permanecen exactamente dos socios autorizados.
