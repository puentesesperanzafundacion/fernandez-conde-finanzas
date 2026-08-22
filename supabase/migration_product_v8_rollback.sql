begin;

-- Este rollback elimina exclusivamente objetos creados por V8. No actualiza
-- ni elimina filas de clients, documents, movements ni de las tablas V6.
revoke all on function public.set_client_case_stage_v8(bigint, bigint, boolean)
  from public, anon, authenticated;
drop function if exists public.set_client_case_stage_v8(bigint, bigint, boolean);

drop table if exists public.client_case_stage_progress_v8;
drop table if exists public.case_stage_steps_v8;
drop table if exists public.case_stage_templates_v8;

alter table public.clients
  drop constraint if exists clients_practice_area_v8_check;
alter table public.clients
  drop column if exists practice_area;

notify pgrst, 'reload schema';
commit;
