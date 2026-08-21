begin;

-- V6.3 keeps planned dates separate from actual cash movements.
create or replace function public.is_valid_iso_date_v6_3(p_value text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_date date;
  v_clean text := trim(coalesce(p_value, ''));
begin
  if v_clean = '' then return true; end if;
  if v_clean !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return false; end if;
  begin
    v_date := v_clean::date;
  exception when others then
    return false;
  end;
  return v_date::text = v_clean;
end;
$$;

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
  if exists (
    select 1 from jsonb_array_elements(v_plan) stage
    where not public.is_valid_iso_date_v6_3(stage->>'scheduledDate')
  ) then
    raise exception 'La fecha prevista debe tener formato AAAA-MM-DD o quedar vacía.';
  end if;
  return v_plan;
end;
$$;

create or replace function public.create_document_payment_v6_3(
  p_document_id bigint,
  p_amount_cents bigint,
  p_occurred_at timestamptz,
  p_note text,
  p_payment_stage_id text,
  p_request_id uuid
)
returns setof public.movements
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_occurred_at is not null and (p_occurred_at at time zone 'America/Mexico_City')::date > (now() at time zone 'America/Mexico_City')::date then
    raise exception 'Un abono futuro no puede registrarse como ingreso recibido. Usa la fecha prevista del acto procesal.';
  end if;
  return query
    select * from public.create_document_payment_v5(
      p_document_id, p_amount_cents, p_occurred_at, p_note, p_payment_stage_id, p_request_id
    );
end;
$$;

revoke all on function public.is_valid_iso_date_v6_3(text) from public, authenticated;
revoke all on function public.validate_payment_plan(jsonb) from public, authenticated;
revoke all on function public.create_document_payment_v6_3(bigint,bigint,timestamptz,text,text,uuid) from public, anon;
grant execute on function public.create_document_payment_v6_3(bigint,bigint,timestamptz,text,text,uuid) to authenticated;

commit;
