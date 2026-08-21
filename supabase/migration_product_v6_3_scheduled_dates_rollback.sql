begin;

drop function if exists public.create_document_payment_v6_3(bigint,bigint,timestamptz,text,text,uuid);

create or replace function public.validate_payment_plan(p_payment_plan jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_plan jsonb := coalesce(p_payment_plan, '[]'::jsonb);
begin
  if jsonb_typeof(v_plan) <> 'array' then
    raise exception 'El plan de pagos debe ser una lista.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_plan) stage
    where trim(coalesce(stage->>'id', '')) = ''
       or trim(coalesce(stage->>'description', '')) = ''
       or case
            when jsonb_typeof(stage->'amountCents') = 'number'
              then (stage->>'amountCents')::numeric <= 0 or trunc((stage->>'amountCents')::numeric) <> (stage->>'amountCents')::numeric
            else true
          end
  ) then
    raise exception 'Cada acto procesal debe tener descripción e importe mayor que cero.';
  end if;
  if exists (
    select stage->>'id'
    from jsonb_array_elements(v_plan) stage
    group by stage->>'id'
    having count(*) > 1
  ) then
    raise exception 'El plan de pagos contiene actos procesales duplicados.';
  end if;
  return v_plan;
end;
$$;

revoke all on function public.validate_payment_plan(jsonb) from public, authenticated;
drop function if exists public.is_valid_iso_date_v6_3(text);

commit;

