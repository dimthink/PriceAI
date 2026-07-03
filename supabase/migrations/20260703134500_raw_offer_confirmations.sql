create table if not exists raw_offer_confirmations (
  raw_offer_id text primary key references raw_offers(id) on delete cascade,
  source_id text references sources(id) on delete set null,
  confirmed_at timestamptz not null,
  captured_at timestamptz,
  last_seen_at timestamptz not null,
  verified_at timestamptz not null,
  expires_at timestamptz,
  source_status text not null default 'unknown',
  effective_status text not null default 'low_confidence',
  freshness_status text not null default 'fresh',
  source_priority integer,
  confidence numeric,
  price numeric,
  stock_count integer,
  updated_at timestamptz not null default now()
);

create index if not exists raw_offer_confirmations_confirmed_at_idx
  on raw_offer_confirmations(confirmed_at desc);

create index if not exists raw_offer_confirmations_source_confirmed_at_idx
  on raw_offer_confirmations(source_id, confirmed_at desc);

create index if not exists raw_offer_confirmations_expires_at_idx
  on raw_offer_confirmations(expires_at);

insert into raw_offer_confirmations (
  raw_offer_id,
  source_id,
  confirmed_at,
  captured_at,
  last_seen_at,
  verified_at,
  expires_at,
  source_status,
  effective_status,
  freshness_status,
  source_priority,
  confidence,
  price,
  stock_count,
  updated_at
)
select
  raw_offers.id,
  raw_offers.source_id,
  coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at, raw_offers.updated_at, now()),
  raw_offers.captured_at,
  coalesce(raw_offers.last_seen_at, raw_offers.verified_at, raw_offers.captured_at, raw_offers.updated_at, now()),
  coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.updated_at, now()),
  raw_offers.expires_at,
  raw_offers.source_status,
  raw_offers.effective_status,
  raw_offers.freshness_status,
  raw_offers.source_priority,
  raw_offers.confidence,
  raw_offers.price,
  raw_offers.stock_count,
  coalesce(raw_offers.updated_at, now())
from raw_offers
on conflict (raw_offer_id) do update
set
  source_id = excluded.source_id,
  confirmed_at = greatest(raw_offer_confirmations.confirmed_at, excluded.confirmed_at),
  captured_at = excluded.captured_at,
  last_seen_at = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.last_seen_at
    else raw_offer_confirmations.last_seen_at
  end,
  verified_at = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.verified_at
    else raw_offer_confirmations.verified_at
  end,
  expires_at = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.expires_at
    else raw_offer_confirmations.expires_at
  end,
  source_status = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.source_status
    else raw_offer_confirmations.source_status
  end,
  effective_status = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.effective_status
    else raw_offer_confirmations.effective_status
  end,
  freshness_status = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.freshness_status
    else raw_offer_confirmations.freshness_status
  end,
  source_priority = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.source_priority
    else raw_offer_confirmations.source_priority
  end,
  confidence = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.confidence
    else raw_offer_confirmations.confidence
  end,
  price = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.price
    else raw_offer_confirmations.price
  end,
  stock_count = case
    when excluded.confirmed_at >= raw_offer_confirmations.confirmed_at then excluded.stock_count
    else raw_offer_confirmations.stock_count
  end,
  updated_at = now();

drop view if exists raw_offer_public_state;

create view raw_offer_public_state as
select
  raw_offers.id,
  raw_offers.source_id,
  raw_offers.source_name,
  raw_offers.source_store_name,
  raw_offers.source_title,
  raw_offers.price,
  raw_offers.listed_price,
  raw_offers.fee_amount,
  raw_offers.price_basis,
  raw_offers.currency,
  raw_offers.status,
  coalesce(raw_offer_confirmations.source_status, raw_offers.source_status) as source_status,
  coalesce(raw_offer_confirmations.effective_status, raw_offers.effective_status) as effective_status,
  coalesce(raw_offer_confirmations.freshness_status, raw_offers.freshness_status) as freshness_status,
  raw_offers.url,
  raw_offers.tags,
  raw_offers.public_filter_tags,
  raw_offers.stock_count,
  raw_offers.hidden,
  raw_offers.canonical_product_id,
  raw_offers.category_slug,
  coalesce(raw_offer_confirmations.captured_at, raw_offers.captured_at) as captured_at,
  raw_offers.source_updated_at,
  coalesce(raw_offer_confirmations.last_seen_at, raw_offers.last_seen_at) as last_seen_at,
  coalesce(raw_offer_confirmations.verified_at, raw_offers.verified_at) as verified_at,
  coalesce(raw_offer_confirmations.expires_at, raw_offers.expires_at) as expires_at,
  coalesce(raw_offer_confirmations.source_priority, raw_offers.source_priority) as source_priority,
  coalesce(raw_offer_confirmations.confidence, raw_offers.confidence) as confidence,
  raw_offers.last_failed_at,
  raw_offers.failure_reason,
  raw_offers.created_at,
  raw_offers.updated_at
from raw_offers
left join raw_offer_confirmations
  on raw_offer_confirmations.raw_offer_id = raw_offers.id;

revoke all on table raw_offer_confirmations from anon, authenticated, public;
revoke all on table raw_offer_public_state from anon, authenticated, public;
grant select, insert, update, delete on table raw_offer_confirmations to service_role;
grant select on table raw_offer_public_state to service_role;

alter table raw_offer_confirmations enable row level security;

drop trigger if exists raw_offer_confirmations_set_updated_at on raw_offer_confirmations;
create trigger raw_offer_confirmations_set_updated_at
before update on raw_offer_confirmations
for each row execute function set_updated_at();

do $$
declare
  signature text;
  definition text;
begin
  foreach signature in array array[
    'list_public_product_offer_filter_facets(text)',
    'list_public_product_offers_page(text, integer, integer)',
    'list_public_product_offers_page_v2(text, text[], text, text, integer, integer)',
    'list_public_product_summaries()',
    'list_public_offers_page(text, text, text, text, text, numeric, numeric, integer, integer)',
    'list_public_merchant_summaries()'
  ]
  loop
    begin
      definition := pg_get_functiondef(signature::regprocedure);
      definition := replace(definition, 'from raw_offers', 'from raw_offer_public_state raw_offers');
      definition := replace(definition, 'from public.raw_offers', 'from public.raw_offer_public_state raw_offers');
      execute definition;
    exception
      when undefined_function then
        null;
    end;
  end loop;
end $$;
