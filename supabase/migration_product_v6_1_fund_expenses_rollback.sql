begin;

drop function if exists public.update_finance_expense_v6_1(bigint, text, text, bigint, text, timestamptz, bigint, timestamptz);
drop function if exists public.create_finance_expense_v6_1(text, text, bigint, text, timestamptz, bigint, uuid);

-- Restaura la vista exactamente como estaba en V6: sólo aportaciones.
drop view if exists public.finance_fund_balance_v6;
create view public.finance_fund_balance_v6
with (security_invoker = true)
as
select coalesce(sum(fund_cents), 0)::bigint as balance_cents
from public.profit_distributions_v6;

grant select on public.finance_fund_balance_v6 to authenticated;

commit;
