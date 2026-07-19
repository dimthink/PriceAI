alter table public.sources
  add column if not exists buyer_fee_rate numeric,
  add column if not exists buyer_fee_payment_method text,
  add column if not exists buyer_fee_strategy text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sources_buyer_fee_rate_check'
      and conrelid = 'public.sources'::regclass
  ) then
    alter table public.sources
      add constraint sources_buyer_fee_rate_check
      check (buyer_fee_rate is null or (buyer_fee_rate >= 0 and buyer_fee_rate <= 0.2));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sources_buyer_fee_strategy_check'
      and conrelid = 'public.sources'::regclass
  ) then
    alter table public.sources
      add constraint sources_buyer_fee_strategy_check
      check (buyer_fee_strategy is null or buyer_fee_strategy = 'manual_verified');
  end if;
end;
$$;

comment on column public.sources.buyer_fee_rate is
  'Manually verified buyer-side fee rate applied to otherwise unadjusted listed prices.';
comment on column public.sources.buyer_fee_payment_method is
  'Payment method represented by the manually verified buyer fee, for example alipay.';
comment on column public.sources.buyer_fee_strategy is
  'Evidence strategy for the source-level buyer fee. Currently manual_verified only.';

update public.sources
set
  buyer_fee_rate = 0.04,
  buyer_fee_payment_method = 'alipay',
  buyer_fee_strategy = 'manual_verified',
  updated_at = now()
where id = 'fk-10886-xyz';
