begin;

-- V6.1: el saldo disponible del Fondo descuenta todos los gastos activos
-- cuyo origen de pago sea "Fondo". Se conservan por separado aportado y gastado.
drop view if exists public.finance_fund_balance_v6;
create view public.finance_fund_balance_v6
with (security_invoker = true)
as
with allocated as (
  select coalesce(sum(fund_cents), 0)::bigint as amount_cents
  from public.profit_distributions_v6
), spent as (
  select coalesce(sum(amount_cents), 0)::bigint as amount_cents
  from public.movements
  where type = 'Gasto'
    and spent_by = 'Fondo'
    and deleted_at is null
)
select
  allocated.amount_cents - spent.amount_cents as balance_cents,
  allocated.amount_cents as allocated_cents,
  spent.amount_cents as spent_cents
from allocated cross join spent;

grant select on public.finance_fund_balance_v6 to authenticated;

-- Se crean RPC nuevas para que el rollback pueda volver a V6 sin modificar
-- las funciones originales de esa versión.
create or replace function public.create_finance_expense_v6_1(
  p_category text,
  p_description text,
  p_amount_cents bigint,
  p_spent_by text,
  p_occurred_at timestamptz,
  p_document_id bigint,
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
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_amount_cents <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if trim(coalesce(p_description, '')) = '' then raise exception 'Escribe la descripción del gasto.'; end if;
  if p_spent_by not in ('Oscar', 'Dan', 'Fondo') then raise exception 'Selecciona quién cubrió el gasto.'; end if;
  if p_document_id is not null and not exists (
    select 1 from public.documents where id = p_document_id and deleted_at is null
  ) then raise exception 'El presupuesto seleccionado ya no existe o está en la papelera.'; end if;

  select * into v_row from public.movements where client_request_id = p_request_id;
  if found then
    if v_row.type <> 'Gasto' then raise exception 'El identificador de operación ya pertenece a otro movimiento.'; end if;
    return next v_row; return;
  end if;

  insert into public.movements (
    type, category, description, amount_cents, spent_by, occurred_at,
    document_id, client_request_id
  ) values (
    'Gasto', trim(p_category), trim(p_description), p_amount_cents,
    p_spent_by, coalesce(p_occurred_at, now()), p_document_id, p_request_id
  )
  on conflict (client_request_id) where client_request_id is not null do nothing
  returning * into v_row;

  if not found then select * into v_row from public.movements where client_request_id = p_request_id; end if;
  return next v_row;
end;
$$;

create or replace function public.update_finance_expense_v6_1(
  p_id bigint,
  p_category text,
  p_description text,
  p_amount_cents bigint,
  p_spent_by text,
  p_occurred_at timestamptz,
  p_document_id bigint,
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
  if p_spent_by not in ('Oscar', 'Dan', 'Fondo') then raise exception 'Selecciona quién cubrió el gasto.'; end if;
  if p_document_id is not null and not exists (
    select 1 from public.documents where id = p_document_id and deleted_at is null
  ) then raise exception 'El presupuesto seleccionado ya no existe o está en la papelera.'; end if;

  select * into v_row from public.movements
  where id = p_id and type = 'Gasto' and deleted_at is null
  for update;
  if not found then raise exception 'Este gasto ya no existe o fue enviado a la papelera.'; end if;
  if p_expected_updated_at is not null and v_row.updated_at <> p_expected_updated_at then
    raise exception 'Este gasto fue modificado por tu socio. Actualiza la información antes de editarlo.';
  end if;

  update public.movements
  set category = trim(p_category),
      description = trim(p_description),
      amount_cents = p_amount_cents,
      spent_by = p_spent_by,
      occurred_at = coalesce(p_occurred_at, occurred_at),
      document_id = p_document_id
  where id = p_id
  returning * into v_row;
  return next v_row;
end;
$$;

revoke all on function public.create_finance_expense_v6_1(text, text, bigint, text, timestamptz, bigint, uuid) from public, anon;
revoke all on function public.update_finance_expense_v6_1(bigint, text, text, bigint, text, timestamptz, bigint, timestamptz) from public, anon;
grant execute on function public.create_finance_expense_v6_1(text, text, bigint, text, timestamptz, bigint, uuid) to authenticated;
grant execute on function public.update_finance_expense_v6_1(bigint, text, text, bigint, text, timestamptz, bigint, timestamptz) to authenticated;

commit;
