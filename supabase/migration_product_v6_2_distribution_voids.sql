begin;

-- Las anulaciones se guardan aparte para no alterar el histórico original.
create table public.profit_distribution_voids_v6_2 (
  distribution_id bigint primary key references public.profit_distributions_v6(id) on delete cascade,
  voided_at timestamptz not null default now(),
  voided_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.profit_distribution_voids_v6_2 enable row level security;
create policy "Socios consultan repartos anulados V6.2"
on public.profit_distribution_voids_v6_2 for select to authenticated
using (public.is_finance_partner());
grant select on public.profit_distribution_voids_v6_2 to authenticated;
revoke insert, update, delete on public.profit_distribution_voids_v6_2 from authenticated, anon;

create view public.finance_profit_distributions_v6_2
with (security_invoker = true)
as
select d.*, v.voided_at, v.voided_by
from public.profit_distributions_v6 d
left join public.profit_distribution_voids_v6_2 v on v.distribution_id = d.id;

grant select on public.finance_profit_distributions_v6_2 to authenticated;

-- El Fondo sólo suma repartos vigentes y continúa descontando sus gastos activos.
drop view if exists public.finance_fund_balance_v6;
create view public.finance_fund_balance_v6
with (security_invoker = true)
as
with allocated as (
  select coalesce(sum(d.fund_cents), 0)::bigint as amount_cents
  from public.profit_distributions_v6 d
  where not exists (
    select 1 from public.profit_distribution_voids_v6_2 v where v.distribution_id = d.id
  )
), spent as (
  select coalesce(sum(amount_cents), 0)::bigint as amount_cents
  from public.movements
  where type = 'Gasto' and spent_by = 'Fondo' and deleted_at is null
)
select
  allocated.amount_cents - spent.amount_cents as balance_cents,
  allocated.amount_cents as allocated_cents,
  spent.amount_cents as spent_cents
from allocated cross join spent;

grant select on public.finance_fund_balance_v6 to authenticated;

create or replace function public.set_profit_distribution_voided_v6_2(
  p_id bigint,
  p_voided boolean
)
returns table (voided_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_distribution public.profit_distributions_v6%rowtype;
  v_voided_at timestamptz;
begin
  if not public.is_finance_partner() then
    raise exception 'Tu cuenta no está autorizada para administrar la firma.';
  end if;

  select * into v_distribution
  from public.profit_distributions_v6
  where id = p_id
  for update;
  if not found then raise exception 'El reparto ya no existe.'; end if;

  if p_voided then
    insert into public.profit_distribution_voids_v6_2(distribution_id, voided_at, voided_by)
    values (p_id, now(), auth.uid())
    on conflict (distribution_id) do update
      set voided_at = excluded.voided_at, voided_by = excluded.voided_by
    returning profit_distribution_voids_v6_2.voided_at into v_voided_at;
  else
    if exists (
      select 1
      from public.profit_distributions_v6 other
      where other.id <> p_id
        and not exists (
          select 1 from public.profit_distribution_voids_v6_2 ov where ov.distribution_id = other.id
        )
        and daterange(other.period_start, other.period_end, '[]')
          && daterange(v_distribution.period_start, v_distribution.period_end, '[]')
    ) then
      raise exception 'No puedes restaurar este reparto porque su periodo se cruza con otro reparto vigente.';
    end if;
    delete from public.profit_distribution_voids_v6_2 where distribution_id = p_id;
    v_voided_at := null;
  end if;

  return query select v_voided_at;
end;
$$;

-- La creación V6.2 permite volver a calcular un periodo cuyo reparto fue anulado.
create or replace function public.create_profit_distribution_v6_2(
  p_period_start date,
  p_period_end date,
  p_request_id uuid
)
returns setof public.profit_distributions_v6
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.profit_distribution_settings_v6%rowtype;
  v_row public.profit_distributions_v6%rowtype;
  v_income_cents bigint;
  v_expense_cents bigint;
  v_net_profit_cents bigint;
  v_fund_cents bigint;
  v_oscar_cents bigint;
  v_dan_cents bigint;
begin
  if not public.is_finance_partner() then raise exception 'Tu cuenta no está autorizada para administrar la firma.'; end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'El periodo del reparto no es válido.';
  end if;

  select * into v_row from public.profit_distributions_v6 where client_request_id = p_request_id;
  if found then return next v_row; return; end if;

  select * into v_settings
  from public.profit_distribution_settings_v6
  where id = true
  for update;

  if exists (
    select 1 from public.profit_distributions_v6 d
    where not exists (
      select 1 from public.profit_distribution_voids_v6_2 v where v.distribution_id = d.id
    )
      and daterange(d.period_start, d.period_end, '[]') && daterange(p_period_start, p_period_end, '[]')
  ) then
    raise exception 'Este periodo se cruza con un reparto vigente ya guardado.';
  end if;

  select
    coalesce(sum(amount_cents) filter (where type = 'Ingreso'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where type = 'Gasto'), 0)::bigint
  into v_income_cents, v_expense_cents
  from public.movements
  where deleted_at is null
    and (occurred_at at time zone 'America/Mexico_City')::date between p_period_start and p_period_end;

  v_net_profit_cents := v_income_cents - v_expense_cents;
  if v_net_profit_cents <= 0 then raise exception 'El periodo no tiene una utilidad neta positiva para repartir.'; end if;

  v_fund_cents := round(v_net_profit_cents::numeric * v_settings.fund_bps / 10000)::bigint;
  v_oscar_cents := round(v_net_profit_cents::numeric * v_settings.oscar_bps / 10000)::bigint;
  v_dan_cents := v_net_profit_cents - v_fund_cents - v_oscar_cents;

  insert into public.profit_distributions_v6 (
    period_start, period_end, income_cents, expense_cents, net_profit_cents,
    fund_cents, oscar_cents, dan_cents, fund_bps, oscar_bps, dan_bps,
    client_request_id, created_by
  ) values (
    p_period_start, p_period_end, v_income_cents, v_expense_cents, v_net_profit_cents,
    v_fund_cents, v_oscar_cents, v_dan_cents,
    v_settings.fund_bps, v_settings.oscar_bps, v_settings.dan_bps,
    p_request_id, auth.uid()
  ) returning * into v_row;
  return next v_row;
end;
$$;

revoke all on function public.set_profit_distribution_voided_v6_2(bigint, boolean) from public, anon;
revoke all on function public.create_profit_distribution_v6_2(date, date, uuid) from public, anon;
grant execute on function public.set_profit_distribution_voided_v6_2(bigint, boolean) to authenticated;
grant execute on function public.create_profit_distribution_v6_2(date, date, uuid) to authenticated;

commit;
