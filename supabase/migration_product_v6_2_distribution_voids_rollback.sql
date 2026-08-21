begin;

drop view if exists public.finance_fund_balance_v6;
drop view if exists public.finance_profit_distributions_v6_2;
drop function if exists public.create_profit_distribution_v6_2(date, date, uuid);
drop function if exists public.set_profit_distribution_voided_v6_2(bigint, boolean);
drop table if exists public.profit_distribution_voids_v6_2;

-- Restaura el cálculo V6.1: todas las distribuciones guardadas menos gastos del Fondo.
create view public.finance_fund_balance_v6
with (security_invoker = true)
as
with allocated as (
  select coalesce(sum(fund_cents), 0)::bigint as amount_cents
  from public.profit_distributions_v6
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

commit;
