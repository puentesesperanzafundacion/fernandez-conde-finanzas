begin;

-- V8.3 permite elegir entre el porcentaje configurado o una cantidad fija
-- para el Fondo. No modifica tablas ni registros existentes.
create or replace function public.create_profit_distribution_v8_3(
  p_period_start date,
  p_period_end date,
  p_fund_cents bigint,
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
  v_partner_pool_cents bigint;
  v_partner_weight integer;
  v_fund_bps integer;
  v_oscar_bps integer;
  v_dan_bps integer;
begin
  if not public.is_finance_partner() then
    raise exception 'Tu cuenta no está autorizada para administrar la firma.';
  end if;
  if p_request_id is null then raise exception 'Falta el identificador de la operación.'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'El periodo del reparto no es válido.';
  end if;

  select * into v_row
  from public.profit_distributions_v6
  where client_request_id = p_request_id;
  if found then return next v_row; return; end if;

  select * into v_settings
  from public.profit_distribution_settings_v6
  where id = true
  for update;

  if exists (
    select 1
    from public.profit_distributions_v6 d
    where not exists (
      select 1 from public.profit_distribution_voids_v6_2 v where v.distribution_id = d.id
    )
      and daterange(d.period_start, d.period_end, '[]')
        && daterange(p_period_start, p_period_end, '[]')
  ) then
    raise exception 'Este periodo se cruza con un reparto vigente ya guardado.';
  end if;

  select
    coalesce(sum(amount_cents) filter (where type = 'Ingreso'), 0)::bigint,
    coalesce(sum(amount_cents) filter (where type = 'Gasto'), 0)::bigint
  into v_income_cents, v_expense_cents
  from public.movements
  where deleted_at is null
    and (occurred_at at time zone 'America/Mexico_City')::date
      between p_period_start and p_period_end;

  v_net_profit_cents := v_income_cents - v_expense_cents;
  if v_net_profit_cents <= 0 then
    raise exception 'El periodo no tiene una utilidad neta positiva para repartir.';
  end if;

  if p_fund_cents is null then
    v_fund_cents := round(v_net_profit_cents::numeric * v_settings.fund_bps / 10000)::bigint;
    v_oscar_cents := round(v_net_profit_cents::numeric * v_settings.oscar_bps / 10000)::bigint;
    v_dan_cents := v_net_profit_cents - v_fund_cents - v_oscar_cents;
    v_fund_bps := v_settings.fund_bps;
    v_oscar_bps := v_settings.oscar_bps;
    v_dan_bps := v_settings.dan_bps;
  else
    if p_fund_cents < 0 or p_fund_cents > v_net_profit_cents then
      raise exception 'La cantidad fija del Fondo debe estar entre cero y la utilidad neta del periodo.';
    end if;

    v_fund_cents := p_fund_cents;
    v_partner_pool_cents := v_net_profit_cents - v_fund_cents;
    v_partner_weight := v_settings.oscar_bps + v_settings.dan_bps;
    if v_partner_pool_cents > 0 and v_partner_weight <= 0 then
      raise exception 'Configura un porcentaje para Oscar o Dan antes de repartir el remanente.';
    end if;

    if v_partner_pool_cents = 0 then
      v_oscar_cents := 0;
    else
      v_oscar_cents := round(v_partner_pool_cents::numeric * v_settings.oscar_bps / v_partner_weight)::bigint;
    end if;
    v_dan_cents := v_partner_pool_cents - v_oscar_cents;

    -- El histórico conserva el porcentaje efectivo que representa cada monto.
    v_fund_bps := round(v_fund_cents::numeric * 10000 / v_net_profit_cents)::integer;
    if v_partner_pool_cents = 0 then
      v_oscar_bps := 0;
      v_dan_bps := 0;
    else
      -- Reparte los puntos base restantes para evitar que dos redondeos
      -- independientes produzcan un total distinto de 10,000.
      v_oscar_bps := round(
        (10000 - v_fund_bps)::numeric * v_oscar_cents / v_partner_pool_cents
      )::integer;
      v_dan_bps := 10000 - v_fund_bps - v_oscar_bps;
    end if;
  end if;

  insert into public.profit_distributions_v6 (
    period_start, period_end, income_cents, expense_cents, net_profit_cents,
    fund_cents, oscar_cents, dan_cents, fund_bps, oscar_bps, dan_bps,
    client_request_id, created_by
  ) values (
    p_period_start, p_period_end, v_income_cents, v_expense_cents, v_net_profit_cents,
    v_fund_cents, v_oscar_cents, v_dan_cents,
    v_fund_bps, v_oscar_bps, v_dan_bps,
    p_request_id, auth.uid()
  ) returning * into v_row;

  return next v_row;
end;
$$;

revoke all on function public.create_profit_distribution_v8_3(date, date, bigint, uuid)
from public, anon, authenticated;
grant execute on function public.create_profit_distribution_v8_3(date, date, bigint, uuid)
to authenticated;

commit;
