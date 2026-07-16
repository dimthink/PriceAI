alter table api_transit_offers
  add column if not exists billing_mode text,
  add column if not exists fixed_price numeric,
  add column if not exists fixed_price_currency text not null default 'CNY',
  add column if not exists fixed_price_unit text,
  add column if not exists fixed_price_tiers jsonb not null default '[]'::jsonb;

alter table api_transit_offers
  drop constraint if exists api_transit_offers_billing_mode_check;

alter table api_transit_offers
  add constraint api_transit_offers_billing_mode_check
  check (billing_mode is null or billing_mode in ('token', 'per_request', 'fixed'));

alter table api_transit_offers
  drop constraint if exists api_transit_offers_fixed_price_currency_check;

alter table api_transit_offers
  add constraint api_transit_offers_fixed_price_currency_check
  check (fixed_price_currency in ('CNY'));

update api_transit_offers
set
  billing_mode = case
    when nullif(raw_payload #>> '{model,billing_mode}', '') in ('per_request', 'fixed', 'token')
      then raw_payload #>> '{model,billing_mode}'
    when nullif(raw_payload #>> '{fixed_price}', '') is not null and family in ('image', 'video', 'grok')
      then 'fixed'
    else coalesce(billing_mode, 'token')
  end,
  fixed_price = case
    when fixed_price is not null then fixed_price
    when nullif(raw_payload #>> '{fixed_price}', '') ~ '^[0-9]+(\.[0-9]+)?$' and family in ('image', 'video', 'grok')
      then (raw_payload #>> '{fixed_price}')::numeric * coalesce(api_transit_recharge_coefficient(recharge_ratio), 1)
    else fixed_price
  end,
  fixed_price_currency = 'CNY',
  fixed_price_unit = case
    when fixed_price_unit is not null then fixed_price_unit
    when nullif(raw_payload #>> '{fixed_price}', '') is not null and family in ('image', 'video', 'grok')
      then 'request'
    else fixed_price_unit
  end
where
  billing_mode is null
  or fixed_price is null
  or fixed_price_currency is distinct from 'CNY'
  or fixed_price_unit is null;
