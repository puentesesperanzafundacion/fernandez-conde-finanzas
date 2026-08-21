begin;

-- V3 requires the closed two-partner directory created by V2.
do $$
declare
  v_partner_count integer;
begin
  select count(*) into v_partner_count from public.partners;
  if v_partner_count <> 2 then
    raise exception 'La actualización V3 requiere exactamente dos socios autorizados; se encontraron %.', v_partner_count;
  end if;
end
$$;

-- Client commercial classification.
alter table public.clients
  add column if not exists stage text not null default 'Pendiente';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'clients_stage_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_stage_check check (stage in ('Aceptado','Pendiente','Rechazado'));
  end if;
end
$$;

-- Budgets can be rejected, and payments are independent movements.
alter table public.documents drop constraint if exists documents_status_check;
alter table public.documents
  add constraint documents_status_check
  check (status in ('Pagado','Pendiente','Vencido','Aceptado','Rechazado'));

drop index if exists public.one_income_per_document;

alter table public.movements
  add column if not exists spent_by text not null default '',
  add column if not exists note text not null default '',
  add column if not exists client_request_id uuid,
  add column if not exists deleted_with_document boolean not null default false;

update public.movements
set spent_by = 'Sin especificar'
where type = 'Gasto' and trim(coalesce(spent_by, '')) = '';

update public.movements m
set deleted_with_document = true
from public.documents d
where m.document_id = d.id
  and m.deleted_at is not null
  and d.deleted_at is not null;

create unique index if not exists movements_client_request_id_unique
on public.movements(client_request_id)
where client_request_id is not null;

-- Internal helper: document payment state is derived from active income rows.
create or replace function public.sync_document_payment_status(p_document_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_paid_cents bigint;
  v_status text;
begin
  select * into v_document
  from public.documents
  where id = p_document_id and deleted_at is null
  for update;
  if not found then return; end if;

  select coalesce(sum(amount_cents), 0) into v_paid_cents
  from public.movements
  where document_id = p_document_id
    and type = 'Ingreso'
    and deleted_at is null;

  v_status := case
    when v_paid_cents >= v_document.amount_cents then 'Pagado'
    when v_paid_cents > 0 and v_document.status in ('Pagado','Pendiente','Vencido','Rechazado') then 'Aceptado'
    when v_document.status = 'Pagado' then 'Aceptado'
    else v_document.status
  end;

  if v_status <> v_document.status then
    update public.documents set status = v_status where id = p_document_id;
  end if;
end;
$$;

revoke all on function public.sync_document_payment_status(bigint) from public, authenticated;

-- Atomic, idempotent expense creation.
create or replace function public.create_finance_expense(
  p_category text,
  p_description text,
  p_amount_cents bigint,
  p_spent_by text,
  p_occurred_at timestamptz,
  p_request_id uuid
)
returns setof public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.movements%rowtype;
begin
  if not public.is_finance_partner() then
    raise exception 'Tu cuenta no está autorizada para administrar la firma.';
  end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_amount_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if trim(coalesce(p_description, '')) = '' then raise exception 'Escribe la descripción del gasto.'; end if;
  if trim(coalesce(p_spent_by, '')) = '' then raise exception 'Indica quién realizó el gasto.'; end if;

  select * into v_row from public.movements where client_request_id = p_request_id;
  if found then
    if v_row.type <> 'Gasto' then raise exception 'El identificador de operación ya pertenece a otro movimiento.'; end if;
    return next v_row;
    return;
  end if;

  insert into public.movements(type, category, description, amount_cents, spent_by, occurred_at, client_request_id)
  values ('Gasto', trim(p_category), trim(p_description), p_amount_cents, trim(p_spent_by), coalesce(p_occurred_at, now()), p_request_id)
  on conflict (client_request_id) where client_request_id is not null do nothing
  returning * into v_row;

  if not found then select * into v_row from public.movements where client_request_id = p_request_id; end if;
  return next v_row;
end;
$$;

create or replace function public.update_finance_expense(
  p_id bigint,
  p_category text,
  p_description text,
  p_amount_cents bigint,
  p_spent_by text,
  p_occurred_at timestamptz,
  p_expected_updated_at timestamptz
)
returns setof public.movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.movements%rowtype;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_amount_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if trim(coalesce(p_description, '')) = '' then raise exception 'Escribe la descripción del gasto.'; end if;
  if trim(coalesce(p_spent_by, '')) = '' then raise exception 'Indica quién realizó el gasto.'; end if;

  select * into v_row from public.movements
  where id = p_id and type = 'Gasto' and document_id is null and deleted_at is null
  for update;
  if not found then raise exception 'Este gasto ya no existe o fue enviado a la papelera.'; end if;
  if p_expected_updated_at is not null and v_row.updated_at <> p_expected_updated_at then
    raise exception 'Este gasto fue modificado por tu socio. Actualiza la información antes de editarlo.';
  end if;

  update public.movements
  set category = trim(p_category), description = trim(p_description), amount_cents = p_amount_cents,
      spent_by = trim(p_spent_by), occurred_at = coalesce(p_occurred_at, occurred_at)
  where id = p_id
  returning * into v_row;
  return next v_row;
end;
$$;

-- Each partial payment is an auditable income movement.
create or replace function public.create_document_payment(
  p_document_id bigint,
  p_amount_cents bigint,
  p_occurred_at timestamptz,
  p_note text,
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
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_amount_cents <= 0 then raise exception 'El pago debe ser mayor que cero.'; end if;

  select * into v_row from public.movements where client_request_id = p_request_id;
  if found then
    if v_row.type <> 'Ingreso' or v_row.document_id <> p_document_id then
      raise exception 'El identificador de operación ya pertenece a otro movimiento.';
    end if;
    return next v_row;
    return;
  end if;

  select * into v_document from public.documents
  where id = p_document_id and deleted_at is null
  for update;
  if not found then raise exception 'El documento ya no existe o está en la papelera.'; end if;

  select coalesce(sum(amount_cents), 0) into v_paid_cents
  from public.movements
  where document_id = p_document_id and type = 'Ingreso' and deleted_at is null;
  if v_paid_cents + p_amount_cents > v_document.amount_cents then
    raise exception 'El pago excede el saldo pendiente de este documento.';
  end if;

  insert into public.movements(type, category, description, amount_cents, document_id, note, occurred_at, client_request_id)
  values ('Ingreso', 'Honorarios', 'Pago ' || v_document.folio, p_amount_cents, p_document_id, trim(coalesce(p_note, '')), coalesce(p_occurred_at, now()), p_request_id)
  on conflict (client_request_id) where client_request_id is not null do nothing
  returning * into v_row;

  if not found then select * into v_row from public.movements where client_request_id = p_request_id; end if;
  perform public.sync_document_payment_status(p_document_id);
  return next v_row;
end;
$$;

-- Replace document functions so they support multiple payments.
create or replace function public.create_finance_document(
  p_kind text,
  p_client_id bigint,
  p_concept text,
  p_amount_cents bigint,
  p_status text,
  p_notes text,
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
  v_prefix text;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_amount_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.deleted_at is null) then raise exception 'El cliente ya no existe o se encuentra en la papelera.'; end if;

  select d.id, d.folio, d.issued_at, d.updated_at into v_id, v_folio, v_issued_at, v_updated_at
  from public.documents d where d.client_request_id = p_request_id;
  if found then return query select v_id, v_folio, v_issued_at, v_updated_at; return; end if;

  v_prefix := case p_kind when 'Presupuesto' then 'PRE' when 'Recibo' then 'REC' when 'Cuenta de cobro' then 'COB' else null end;
  if v_prefix is null then raise exception 'Tipo de documento no válido.'; end if;
  v_id := nextval(pg_get_serial_sequence('public.documents', 'id'));
  v_folio := v_prefix || '-' || lpad(v_id::text, 4, '0');

  insert into public.documents(id, folio, kind, client_id, concept, amount_cents, status, notes, client_request_id)
  values (v_id, v_folio, p_kind, p_client_id, trim(p_concept), p_amount_cents, p_status, coalesce(p_notes, ''), p_request_id)
  on conflict (client_request_id) do nothing
  returning documents.issued_at, documents.updated_at into v_issued_at, v_updated_at;

  if not found then
    select d.id, d.folio, d.issued_at, d.updated_at into v_id, v_folio, v_issued_at, v_updated_at
    from public.documents d where d.client_request_id = p_request_id;
    return query select v_id, v_folio, v_issued_at, v_updated_at; return;
  end if;

  if p_status = 'Pagado' then
    insert into public.movements(type, category, description, amount_cents, document_id, note, client_request_id)
    values ('Ingreso', 'Honorarios', 'Pago ' || v_folio, p_amount_cents, v_id, 'Pago completo al crear el documento', p_request_id);
  end if;
  return query select v_id, v_folio, v_issued_at, v_updated_at;
end;
$$;

create or replace function public.update_finance_document(
  p_id bigint,
  p_kind text,
  p_client_id bigint,
  p_concept text,
  p_amount_cents bigint,
  p_status text,
  p_notes text,
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
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_amount_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  select * into v_document from public.documents where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Este documento ya no existe o fue enviado a la papelera.'; end if;
  if p_expected_updated_at is not null and v_document.updated_at <> p_expected_updated_at then raise exception 'Este documento fue modificado por tu socio. Actualiza la información antes de volver a editarlo.'; end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.deleted_at is null) then raise exception 'El cliente ya no existe o se encuentra en la papelera.'; end if;

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
      notes = coalesce(p_notes, '')
  where id = p_id
  returning documents.updated_at into v_updated_at;
  return query select v_updated_at;
end;
$$;

create or replace function public.mark_finance_document_paid(p_id bigint, p_expected_updated_at timestamptz)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.documents%rowtype;
  v_paid_cents bigint;
  v_updated_at timestamptz;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  select * into v_document from public.documents where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Este documento ya no existe o fue enviado a la papelera.'; end if;
  if p_expected_updated_at is not null and v_document.updated_at <> p_expected_updated_at then raise exception 'Este documento fue modificado por tu socio. Actualiza la información antes de registrar el pago.'; end if;

  select coalesce(sum(amount_cents), 0) into v_paid_cents from public.movements
  where document_id = p_id and type = 'Ingreso' and deleted_at is null;
  if v_paid_cents < v_document.amount_cents then
    insert into public.movements(type, category, description, amount_cents, document_id, note)
    values ('Ingreso', 'Honorarios', 'Pago ' || v_document.folio, v_document.amount_cents - v_paid_cents, p_id, 'Liquidación del saldo');
  end if;
  update public.documents set status = 'Pagado' where id = p_id returning documents.updated_at into v_updated_at;
  return query select v_updated_at;
end;
$$;

-- Soft-delete now supports individual payments and preserves payment breakdowns.
create or replace function public.set_finance_record_trashed(
  p_entity text,
  p_id bigint,
  p_expected_updated_at timestamptz,
  p_trashed boolean
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_updated_at timestamptz;
  v_client_id bigint;
  v_document_id bigint;
  v_movement_type text;
  v_updated_at timestamptz;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;

  if p_entity = 'client' then
    select clients.updated_at into v_current_updated_at from public.clients where id = p_id for update;
    if not found then raise exception 'El cliente ya no existe.'; end if;
    if p_expected_updated_at is not null and v_current_updated_at <> p_expected_updated_at then raise exception 'Este cliente fue modificado por tu socio. Actualiza la información antes de continuar.'; end if;
    if p_trashed and exists (select 1 from public.documents d where d.client_id = p_id and d.deleted_at is null) then raise exception 'No puedes enviar este cliente a la papelera porque tiene documentos activos.'; end if;
    update public.clients set deleted_at = case when p_trashed then now() else null end, deleted_by = case when p_trashed then auth.uid() else null end
    where id = p_id returning clients.updated_at into v_updated_at;

  elsif p_entity = 'document' then
    select documents.updated_at, documents.client_id into v_current_updated_at, v_client_id from public.documents where id = p_id for update;
    if not found then raise exception 'El documento ya no existe.'; end if;
    if p_expected_updated_at is not null and v_current_updated_at <> p_expected_updated_at then raise exception 'Este documento fue modificado por tu socio. Actualiza la información antes de continuar.'; end if;
    if not p_trashed and not exists (select 1 from public.clients c where c.id = v_client_id and c.deleted_at is null) then raise exception 'Restaura primero al cliente relacionado con este documento.'; end if;
    update public.documents set deleted_at = case when p_trashed then now() else null end, deleted_by = case when p_trashed then auth.uid() else null end
    where id = p_id returning documents.updated_at into v_updated_at;
    if p_trashed then
      update public.movements set deleted_at = now(), deleted_by = auth.uid(), deleted_with_document = true
      where document_id = p_id and deleted_at is null;
    else
      update public.movements set deleted_at = null, deleted_by = null, deleted_with_document = false
      where document_id = p_id and deleted_with_document = true;
      perform public.sync_document_payment_status(p_id);
    end if;

  elsif p_entity = 'movement' then
    select movements.updated_at, movements.document_id, movements.type into v_current_updated_at, v_document_id, v_movement_type
    from public.movements where id = p_id for update;
    if not found then raise exception 'El movimiento ya no existe.'; end if;
    if p_expected_updated_at is not null and v_current_updated_at <> p_expected_updated_at then raise exception 'Este movimiento fue modificado por tu socio. Actualiza la información antes de continuar.'; end if;
    if v_movement_type = 'Ingreso' and v_document_id is null then raise exception 'El ingreso no está vinculado a un documento válido.'; end if;
    if not p_trashed and v_document_id is not null and not exists (select 1 from public.documents d where d.id = v_document_id and d.deleted_at is null) then raise exception 'Restaura primero el documento relacionado con este pago.'; end if;
    update public.movements
    set deleted_at = case when p_trashed then now() else null end,
        deleted_by = case when p_trashed then auth.uid() else null end,
        deleted_with_document = false
    where id = p_id returning movements.updated_at into v_updated_at;
    if v_document_id is not null then perform public.sync_document_payment_status(v_document_id); end if;
  else
    raise exception 'Tipo de registro no válido.';
  end if;
  return query select v_updated_at;
end;
$$;

-- Enforce all document and movement writes through reviewed RPCs.
drop policy if exists "Socios crean documentos" on public.documents;
drop policy if exists "Socios actualizan documentos" on public.documents;
drop policy if exists "Socios crean movimientos" on public.movements;
drop policy if exists "Socios actualizan movimientos" on public.movements;
revoke insert, update, delete on public.documents, public.movements from authenticated;
grant select on public.documents, public.movements to authenticated;

revoke all on function public.create_finance_expense(text,text,bigint,text,timestamptz,uuid) from public;
revoke all on function public.update_finance_expense(bigint,text,text,bigint,text,timestamptz,timestamptz) from public;
revoke all on function public.create_document_payment(bigint,bigint,timestamptz,text,uuid) from public;
revoke all on function public.create_finance_document(text,bigint,text,bigint,text,text,uuid) from public;
revoke all on function public.update_finance_document(bigint,text,bigint,text,bigint,text,text,timestamptz) from public;
revoke all on function public.mark_finance_document_paid(bigint,timestamptz) from public;
revoke all on function public.set_finance_record_trashed(text,bigint,timestamptz,boolean) from public;

grant execute on function public.create_finance_expense(text,text,bigint,text,timestamptz,uuid) to authenticated;
grant execute on function public.update_finance_expense(bigint,text,text,bigint,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.create_document_payment(bigint,bigint,timestamptz,text,uuid) to authenticated;
grant execute on function public.create_finance_document(text,bigint,text,bigint,text,text,uuid) to authenticated;
grant execute on function public.update_finance_document(bigint,text,bigint,text,bigint,text,text,timestamptz) to authenticated;
grant execute on function public.mark_finance_document_paid(bigint,timestamptz) to authenticated;
grant execute on function public.set_finance_record_trashed(text,bigint,timestamptz,boolean) to authenticated;

commit;
