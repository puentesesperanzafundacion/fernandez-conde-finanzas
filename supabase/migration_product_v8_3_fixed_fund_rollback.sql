begin;

-- Elimina únicamente la función agregada por V8.3.
-- No modifica repartos, Fondo, clientes, presupuestos ni movimientos.
drop function if exists public.create_profit_distribution_v8_3(date, date, bigint, uuid);

commit;
