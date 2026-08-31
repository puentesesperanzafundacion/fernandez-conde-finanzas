-- Reversión V8.5: elimina únicamente lo agregado para nacionalidad.

begin;

alter table public.clients
  drop constraint if exists clients_nationality_length_v8_5_check;

alter table public.clients
  drop column if exists nationality;

commit;
