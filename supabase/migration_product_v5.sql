begin;

-- V5 keeps the application closed to the two authorized partners.
do $$
declare
  v_partner_count integer;
begin
  select count(*) into v_partner_count from public.partners;
  if v_partner_count <> 2 then
    raise exception 'La actualización V5 requiere exactamente dos socios autorizados; se encontraron %.', v_partner_count;
  end if;
end
$$;

-- Informational client data. Companions are embedded so they never become clients.
alter table public.clients
  add column if not exists internal_key text not null default '',
  add column if not exists companions jsonb not null default '[]'::jsonb;

-- Procedural payment stages live with the budget; payments may point to one stage.
alter table public.documents
  add column if not exists payment_plan jsonb not null default '[]'::jsonb;

alter table public.movements
  add column if not exists payment_stage_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_companions_array_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_companions_array_check
      check (jsonb_typeof(companions) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_payment_plan_array_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_payment_plan_array_check
      check (jsonb_typeof(payment_plan) = 'array');
  end if;
end
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
  return v_plan;
end;
$$;

revoke all on function public.validate_payment_plan(jsonb) from public, authenticated;

-- New budgets and their payment plan are saved atomically.
create or replace function public.create_finance_budget_v5(
  p_client_id bigint,
  p_concept text,
  p_amount_cents bigint,
  p_status text,
  p_notes text,
  p_payment_plan jsonb,
  p_request_id uuid
)
returns table (id bigint, folio text, issued_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_folio text;
  v_issued_at timestamptz;
  v_updated_at timestamptz;
  v_plan jsonb;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_amount_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if trim(coalesce(p_concept, '')) = '' then raise exception 'Selecciona o escribe el concepto del presupuesto.'; end if;
  if p_status not in ('Pendiente','Aceptado','Rechazado','Vencido') then raise exception 'Estado inicial no válido.'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.deleted_at is null) then raise exception 'El cliente ya no existe o se encuentra en la papelera.'; end if;
  v_plan := public.validate_payment_plan(p_payment_plan);

  select d.id, d.folio, d.issued_at, d.updated_at into v_id, v_folio, v_issued_at, v_updated_at
  from public.documents d where d.client_request_id = p_request_id;
  if found then return query select v_id, v_folio, v_issued_at, v_updated_at; return; end if;

  v_id := nextval(pg_get_serial_sequence('public.documents', 'id'));
  v_folio := 'PRE-' || lpad(v_id::text, 4, '0');
  insert into public.documents(id, folio, kind, client_id, concept, amount_cents, status, notes, payment_plan, client_request_id)
  values (v_id, v_folio, 'Presupuesto', p_client_id, trim(p_concept), p_amount_cents, p_status, coalesce(p_notes, ''), v_plan, p_request_id)
  on conflict (client_request_id) do nothing
  returning documents.issued_at, documents.updated_at into v_issued_at, v_updated_at;

  if not found then
    select d.id, d.folio, d.issued_at, d.updated_at into v_id, v_folio, v_issued_at, v_updated_at
    from public.documents d where d.client_request_id = p_request_id;
  end if;
  return query select v_id, v_folio, v_issued_at, v_updated_at;
end;
$$;

-- Existing historical document types remain editable, but only budgets are created in V5.
create or replace function public.update_finance_document_v5(
  p_id bigint,
  p_kind text,
  p_client_id bigint,
  p_concept text,
  p_amount_cents bigint,
  p_status text,
  p_notes text,
  p_payment_plan jsonb,
  p_expected_updated_at timestamptz
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_paid_cents bigint;
  v_updated_at timestamptz;
  v_plan jsonb;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_amount_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if p_kind not in ('Presupuesto','Recibo','Cuenta de cobro') then raise exception 'Tipo de documento no válido.'; end if;
  v_plan := public.validate_payment_plan(p_payment_plan);

  select * into v_document from public.documents where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Este documento ya no existe o fue enviado a la papelera.'; end if;
  if p_expected_updated_at is not null and v_document.updated_at <> p_expected_updated_at then raise exception 'Este documento fue modificado por tu socio. Actualiza la información antes de volver a editarlo.'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.deleted_at is null) then raise exception 'El cliente ya no existe o se encuentra en la papelera.'; end if;

  if exists (
    select 1 from public.movements m
    where m.document_id = p_id and m.type = 'Ingreso' and m.deleted_at is null and m.payment_stage_id is not null
      and not exists (select 1 from jsonb_array_elements(v_plan) stage where stage->>'id' = m.payment_stage_id)
  ) then
    raise exception 'No puedes quitar un acto procesal que ya tiene pagos registrados.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_plan) stage
    where (stage->>'amountCents')::bigint < coalesce((
      select sum(m.amount_cents) from public.movements m
      where m.document_id = p_id and m.type = 'Ingreso' and m.deleted_at is null and m.payment_stage_id = stage->>'id'
    ), 0)
  ) then
    raise exception 'El importe de un acto procesal no puede ser menor que sus pagos registrados.';
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid_cents from public.movements
  where document_id = p_id and type = 'Ingreso' and deleted_at is null;
  if p_amount_cents < v_paid_cents then raise exception 'El importe del documento no puede ser menor que los pagos ya registrados.'; end if;

  if p_status = 'Pagado' and v_paid_cents < p_amount_cents then
    insert into public.movements(type, category, description, amount_cents, document_id, note)
    values ('Ingreso', 'Honorarios', 'Pago ' || v_document.folio, p_amount_cents - v_paid_cents, p_id, 'Liquidación del saldo');
    v_paid_cents := p_amount_cents;
  end if;

  update public.documents
  set kind = p_kind, client_id = p_client_id, concept = trim(p_concept), amount_cents = p_amount_cents,
      status = case when v_paid_cents >= p_amount_cents then 'Pagado' else p_status end,
      notes = coalesce(p_notes, ''), payment_plan = v_plan
  where id = p_id
  returning documents.updated_at into v_updated_at;
  return query select v_updated_at;
end;
$$;

-- Payments may be linked to a freely described procedural act or remain general.
create or replace function public.create_document_payment_v5(
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
declare
  v_document public.documents%rowtype;
  v_row public.movements%rowtype;
  v_paid_cents bigint;
  v_stage_id text := nullif(trim(coalesce(p_payment_stage_id, '')), '');
  v_stage_description text;
  v_stage_amount_cents bigint;
  v_stage_paid_cents bigint;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_amount_cents <= 0 then raise exception 'El pago debe ser mayor que cero.'; end if;

  select * into v_row from public.movements where client_request_id = p_request_id;
  if found then
    if v_row.type <> 'Ingreso' or v_row.document_id <> p_document_id then raise exception 'El identificador de operación ya pertenece a otro movimiento.'; end if;
    return next v_row;
    return;
  end if;

  select * into v_document from public.documents where id = p_document_id and deleted_at is null for update;
  if not found then raise exception 'El documento ya no existe o está en la papelera.'; end if;

  if v_stage_id is not null then
    select stage->>'description', (stage->>'amountCents')::bigint into v_stage_description, v_stage_amount_cents
    from jsonb_array_elements(v_document.payment_plan) stage
    where stage->>'id' = v_stage_id;
    if v_stage_description is null then raise exception 'El acto procesal seleccionado ya no existe en el plan de pagos.'; end if;
    select coalesce(sum(amount_cents), 0) into v_stage_paid_cents from public.movements
    where document_id = p_document_id and type = 'Ingreso' and payment_stage_id = v_stage_id and deleted_at is null;
    if v_stage_paid_cents + p_amount_cents > v_stage_amount_cents then raise exception 'El pago excede el saldo pendiente de este acto procesal.'; end if;
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid_cents from public.movements
  where document_id = p_document_id and type = 'Ingreso' and deleted_at is null;
  if v_paid_cents + p_amount_cents > v_document.amount_cents then raise exception 'El pago excede el saldo pendiente de este documento.'; end if;

  insert into public.movements(type, category, description, amount_cents, document_id, payment_stage_id, note, occurred_at, client_request_id)
  values ('Ingreso', 'Honorarios', 'Pago ' || v_document.folio || case when v_stage_description is null then '' else ' · ' || v_stage_description end,
          p_amount_cents, p_document_id, v_stage_id, trim(coalesce(p_note, '')), coalesce(p_occurred_at, now()), p_request_id)
  on conflict (client_request_id) where client_request_id is not null do nothing
  returning * into v_row;

  if not found then select * into v_row from public.movements where client_request_id = p_request_id; end if;
  perform public.sync_document_payment_status(p_document_id);
  return next v_row;
end;
$$;

revoke all on function public.create_finance_budget_v5(bigint,text,bigint,text,text,jsonb,uuid) from public;
revoke all on function public.update_finance_document_v5(bigint,text,bigint,text,bigint,text,text,jsonb,timestamptz) from public;
revoke all on function public.create_document_payment_v5(bigint,bigint,timestamptz,text,text,uuid) from public;
grant execute on function public.create_finance_budget_v5(bigint,text,bigint,text,text,jsonb,uuid) to authenticated;
grant execute on function public.update_finance_document_v5(bigint,text,bigint,text,bigint,text,text,jsonb,timestamptz) to authenticated;
grant execute on function public.create_document_payment_v5(bigint,bigint,timestamptz,text,text,uuid) to authenticated;

-- Supabase grants EXECUTE to anon explicitly by default; close every financial RPC to signed-out callers.
revoke execute on function public.create_finance_expense(text,text,bigint,text,timestamptz,uuid) from anon;
revoke execute on function public.update_finance_expense(bigint,text,text,bigint,text,timestamptz,timestamptz) from anon;
revoke execute on function public.create_document_payment(bigint,bigint,timestamptz,text,uuid) from anon;
revoke execute on function public.create_finance_document(text,bigint,text,bigint,text,text,uuid) from anon;
revoke execute on function public.update_finance_document(bigint,text,bigint,text,bigint,text,text,timestamptz) from anon;
revoke execute on function public.mark_finance_document_paid(bigint,timestamptz) from anon;
revoke execute on function public.set_finance_record_trashed(text,bigint,timestamptz,boolean) from anon;
revoke execute on function public.create_finance_budget_v5(bigint,text,bigint,text,text,jsonb,uuid) from anon;
revoke execute on function public.update_finance_document_v5(bigint,text,bigint,text,bigint,text,text,jsonb,timestamptz) from anon;
revoke execute on function public.create_document_payment_v5(bigint,bigint,timestamptz,text,text,uuid) from anon;
revoke execute on function public.sync_document_payment_status(bigint) from anon;
revoke execute on function public.is_finance_partner() from anon;
revoke execute on function public.log_finance_change() from anon, authenticated;

commit;
