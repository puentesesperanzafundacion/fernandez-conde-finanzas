# Actualización de integridad y recuperación V2

Esta actualización conserva GitHub Pages y el plan gratuito de Supabase.

## Orden obligatorio

1. En Supabase, abre **Authentication > Users** y confirma que sólo estén las dos cuentas autorizadas.
2. Confirma que **Allow new users to sign up** permanezca desactivado.
3. Abre **SQL Editor > New query**, copia todo el contenido de `supabase/migration_integrity_v2.sql` y pulsa **Run** una sola vez.
4. Espera el mensaje de ejecución correcta.
5. Publica juntos todos los archivos de esta actualización en la rama `main` de GitHub.
6. Espera que la acción **Publicar aplicación** termine en verde.

## Comprobación posterior

- Inicia sesión con una de las dos cuentas.
- Crea un cliente de prueba y un presupuesto pequeño.
- Envía el presupuesto a la papelera y restáuralo.
- Comprueba que la acción aparezca en la bitácora.
- Elimina después los registros de prueba enviándolos nuevamente a la papelera.

La migración no borra clientes, documentos ni movimientos existentes. Puede ejecutarse nuevamente sin duplicar las políticas, funciones o disparadores.
