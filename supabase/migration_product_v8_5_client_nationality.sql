-- V8.5: nacionalidad opcional en la ficha del cliente.
-- Los clientes existentes permanecen sin nacionalidad hasta que un socio la capture.

begin;

alter table public.clients
  add column nationality text;

alter table public.clients
  add constraint clients_nationality_length_v8_5_check
  check (
    nationality is null
    or char_length(btrim(nationality)) between 2 and 80
  );

comment on column public.clients.nationality is
  'Nacionalidad declarada del cliente; admite valores preseleccionados o captura manual.';

commit;
