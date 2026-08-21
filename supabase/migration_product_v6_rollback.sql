begin;

-- This rollback removes only objects introduced by V6. It never updates or
-- deletes rows from clients, documents or movements.
drop view if exists public.finance_fund_balance_v6;
drop view if exists public.finance_client_margins_v6;
drop view if exists public.finance_document_margins_v6;

drop function if exists public.finance_keep_alive_v6();
drop function if exists public.update_finance_expense_v6(bigint, text, text, bigint, text, timestamptz, bigint, timestamptz);
drop function if exists public.create_finance_expense_v6(text, text, bigint, text, timestamptz, bigint, uuid);
drop function if exists public.create_profit_distribution_v6(date, date, uuid);
drop function if exists public.update_profit_distribution_settings_v6(integer, integer, integer);

drop table if exists public.profit_distributions_v6;
drop table if exists public.profit_distribution_settings_v6;

commit;
