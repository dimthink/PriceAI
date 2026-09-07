create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

create table if not exists public_offer_read_model (
  public_dedupe_key text primary key,
  id text not null,
  source_id text,
  source_name text,
  source_store_name text,
  source_title text not null,
  price numeric,
  currency text,
  status text,
  url text,
  tags text[],
  stock_count integer,
  min_order_quantity integer,
  bulk_pricing_tiers jsonb not null default '[]'::jsonb,
  hidden boolean not null default false,
  canonical_product_id text,
  category_slug text,
  captured_at timestamptz,
  source_updated_at timestamptz,
  last_seen_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  source_priority integer,
  confidence numeric,
  effective_status text,
  freshness_status text,
  last_failed_at timestamptz,
  failure_reason text,
  product_id text not null,
  product_slug text not null,
  product_display_name text not null,
  product_platform text not null,
  product_type text not null,
  product_spec text,
  product_summary text,
  product_updated_at timestamptz,
  is_public_available boolean not null,
  shared_access_rank integer not null default 0,
  public_updated_at timestamptz,
  public_source_label text not null default '',
  public_haystack text not null default '',
  refresh_generation text not null,
  refreshed_at timestamptz not null
);

create index if not exists public_offer_read_model_product_idx
  on public_offer_read_model(product_id);

create index if not exists public_offer_read_model_platform_type_idx
  on public_offer_read_model(product_platform, product_type);

create index if not exists public_offer_read_model_availability_price_idx
  on public_offer_read_model(is_public_available, price, public_updated_at desc);

create index if not exists public_offer_read_model_updated_idx
  on public_offer_read_model(public_updated_at desc);

create index if not exists public_offer_read_model_source_idx
  on public_offer_read_model(public_source_label, public_updated_at desc);

create index if not exists public_offer_read_model_haystack_trgm_idx
  on public_offer_read_model using gin(public_haystack extensions.gin_trgm_ops);

alter table public_offer_read_model enable row level security;

revoke all on table public_offer_read_model from anon, authenticated, public;
grant select on table public_offer_read_model to service_role;

create or replace function refresh_public_offer_read_model()
returns table (
  row_count bigint,
  generated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_generated_at timestamptz := clock_timestamp();
  v_generation text := md5(txid_current()::text || ':' || clock_timestamp()::text || ':' || random()::text);
  v_row_count bigint := 0;
begin
  with base as (
    select
      raw_offers.*,
      canonical_products.id as product_id,
      canonical_products.slug as product_slug,
      canonical_products.display_name as product_display_name,
      canonical_products.platform as product_platform,
      canonical_products.product_type,
      canonical_products.spec as product_spec,
      canonical_products.summary as product_summary,
      canonical_products.updated_at as product_updated_at,
      case
        when raw_offers.status <> 'out_of_stock'
          and raw_offers.price is not null
          and raw_offers.url <> ''
          and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
          and (raw_offers.expires_at is null or raw_offers.expires_at > now())
        then true
        else false
      end as is_public_available,
      case
        when coalesce(
          raw_offers.public_filter_tags,
          priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags),
          '{}'::text[]
        ) && array['shared_access', 'web_only_account', 'domestic_mirror_site']::text[]
        then 1
        else 0
      end as shared_access_rank,
      coalesce(
        raw_offers.verified_at,
        raw_offers.last_seen_at,
        raw_offers.captured_at,
        raw_offers.source_updated_at
      ) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key,
      lower(concat_ws(
        ' ',
        raw_offers.source_title,
        raw_offers.source_name,
        raw_offers.source_store_name,
        raw_offers.url,
        substring(raw_offers.url from '/item/([^/?#]+)'),
        substring(raw_offers.url from '[?&]commodity=([^&#]+)'),
        substring(raw_offers.url from '[?&]id=([^&#]+)'),
        canonical_products.display_name,
        canonical_products.platform,
        canonical_products.product_type,
        canonical_products.spec
      )) as public_haystack
    from raw_offer_public_state raw_offers
    join canonical_products on canonical_products.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
      and canonical_products.is_active = true
  ),
  ranked as (
    select
      base.*,
      row_number() over (
        partition by base.public_dedupe_key
        order by
          case when base.is_public_available then 0 else 1 end asc,
          base.shared_access_rank asc,
          base.source_priority desc nulls last,
          base.confidence desc nulls last,
          base.public_updated_at desc nulls last,
          base.public_source_label asc,
          base.source_title asc,
          base.url asc,
          base.id asc
      ) as dedupe_rank
    from base
  )
  insert into public_offer_read_model (
    public_dedupe_key,
    id,
    source_id,
    source_name,
    source_store_name,
    source_title,
    price,
    currency,
    status,
    url,
    tags,
    stock_count,
    min_order_quantity,
    bulk_pricing_tiers,
    hidden,
    canonical_product_id,
    category_slug,
    captured_at,
    source_updated_at,
    last_seen_at,
    verified_at,
    expires_at,
    source_priority,
    confidence,
    effective_status,
    freshness_status,
    last_failed_at,
    failure_reason,
    product_id,
    product_slug,
    product_display_name,
    product_platform,
    product_type,
    product_spec,
    product_summary,
    product_updated_at,
    is_public_available,
    shared_access_rank,
    public_updated_at,
    public_source_label,
    public_haystack,
    refresh_generation,
    refreshed_at
  )
  select
    ranked.public_dedupe_key,
    ranked.id,
    ranked.source_id,
    ranked.source_name,
    ranked.source_store_name,
    ranked.source_title,
    ranked.price,
    ranked.currency,
    ranked.status,
    ranked.url,
    ranked.tags,
    ranked.stock_count,
    ranked.min_order_quantity,
    coalesce(ranked.bulk_pricing_tiers, '[]'::jsonb),
    ranked.hidden,
    ranked.canonical_product_id,
    ranked.category_slug,
    ranked.captured_at,
    ranked.source_updated_at,
    ranked.last_seen_at,
    ranked.verified_at,
    ranked.expires_at,
    ranked.source_priority,
    ranked.confidence,
    ranked.effective_status,
    ranked.freshness_status,
    ranked.last_failed_at,
    ranked.failure_reason,
    ranked.product_id,
    ranked.product_slug,
    ranked.product_display_name,
    ranked.product_platform,
    ranked.product_type,
    ranked.product_spec,
    ranked.product_summary,
    ranked.product_updated_at,
    ranked.is_public_available,
    ranked.shared_access_rank,
    ranked.public_updated_at,
    ranked.public_source_label,
    ranked.public_haystack,
    v_generation,
    v_generated_at
  from ranked
  where ranked.dedupe_rank = 1
  on conflict (public_dedupe_key) do update set
    id = excluded.id,
    source_id = excluded.source_id,
    source_name = excluded.source_name,
    source_store_name = excluded.source_store_name,
    source_title = excluded.source_title,
    price = excluded.price,
    currency = excluded.currency,
    status = excluded.status,
    url = excluded.url,
    tags = excluded.tags,
    stock_count = excluded.stock_count,
    min_order_quantity = excluded.min_order_quantity,
    bulk_pricing_tiers = excluded.bulk_pricing_tiers,
    hidden = excluded.hidden,
    canonical_product_id = excluded.canonical_product_id,
    category_slug = excluded.category_slug,
    captured_at = excluded.captured_at,
    source_updated_at = excluded.source_updated_at,
    last_seen_at = excluded.last_seen_at,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at,
    source_priority = excluded.source_priority,
    confidence = excluded.confidence,
    effective_status = excluded.effective_status,
    freshness_status = excluded.freshness_status,
    last_failed_at = excluded.last_failed_at,
    failure_reason = excluded.failure_reason,
    product_id = excluded.product_id,
    product_slug = excluded.product_slug,
    product_display_name = excluded.product_display_name,
    product_platform = excluded.product_platform,
    product_type = excluded.product_type,
    product_spec = excluded.product_spec,
    product_summary = excluded.product_summary,
    product_updated_at = excluded.product_updated_at,
    is_public_available = excluded.is_public_available,
    shared_access_rank = excluded.shared_access_rank,
    public_updated_at = excluded.public_updated_at,
    public_source_label = excluded.public_source_label,
    public_haystack = excluded.public_haystack,
    refresh_generation = excluded.refresh_generation,
    refreshed_at = excluded.refreshed_at;

  select count(*)::bigint
  into v_row_count
  from public_offer_read_model
  where refresh_generation = v_generation;

  if v_row_count = 0 and exists (
    select 1
    from public_offer_read_model
    where refresh_generation <> v_generation
  ) then
    raise exception 'public offer read model refresh produced zero rows; preserving the previous generation';
  end if;

  delete from public_offer_read_model
  where refresh_generation <> v_generation;

  return query
  select v_row_count, v_generated_at;
end;
$$;

create or replace function list_public_offers_page_v2(
  p_query text default null,
  p_platform text default null,
  p_product_type text default null,
  p_stock text default null,
  p_sort text default null,
  p_min_price numeric default null,
  p_max_price numeric default null,
  p_limit integer default 80,
  p_offset integer default 0
)
returns table (
  id text,
  source_id text,
  source_name text,
  source_store_name text,
  source_title text,
  price numeric,
  currency text,
  status text,
  url text,
  tags text[],
  stock_count integer,
  min_order_quantity integer,
  bulk_pricing_tiers jsonb,
  hidden boolean,
  canonical_product_id text,
  category_slug text,
  captured_at timestamptz,
  source_updated_at timestamptz,
  last_seen_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  source_priority integer,
  confidence numeric,
  effective_status text,
  freshness_status text,
  last_failed_at timestamptz,
  failure_reason text,
  product_id text,
  product_slug text,
  product_display_name text,
  product_platform text,
  product_type text,
  product_spec text,
  product_summary text,
  product_updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with matched as (
    select
      public_offer_read_model.*,
      count(*) over() as total_count
    from public_offer_read_model
    where (p_query is null or trim(p_query) = '' or public_offer_read_model.public_haystack like ('%' || lower(trim(p_query)) || '%'))
      and (p_platform is null or p_platform = '' or p_platform = '全部' or public_offer_read_model.product_platform = p_platform)
      and (p_product_type is null or p_product_type = '' or p_product_type = '全部' or public_offer_read_model.product_type = p_product_type)
      and (p_min_price is null or public_offer_read_model.price >= p_min_price)
      and (p_max_price is null or public_offer_read_model.price <= p_max_price)
      and (p_stock is null or p_stock = '' or p_stock = 'all'
        or (p_stock = 'available' and public_offer_read_model.is_public_available = true)
        or (p_stock = 'out_of_stock' and public_offer_read_model.is_public_available = false))
  )
  select
    matched.id,
    matched.source_id,
    matched.source_name,
    matched.source_store_name,
    matched.source_title,
    matched.price,
    matched.currency,
    matched.status,
    matched.url,
    matched.tags,
    matched.stock_count,
    matched.min_order_quantity,
    matched.bulk_pricing_tiers,
    matched.hidden,
    matched.canonical_product_id,
    matched.category_slug,
    matched.captured_at,
    matched.source_updated_at,
    matched.last_seen_at,
    matched.verified_at,
    matched.expires_at,
    matched.source_priority,
    matched.confidence,
    matched.effective_status,
    matched.freshness_status,
    matched.last_failed_at,
    matched.failure_reason,
    matched.product_id,
    matched.product_slug,
    matched.product_display_name,
    matched.product_platform,
    matched.product_type,
    matched.product_spec,
    matched.product_summary,
    matched.product_updated_at,
    matched.total_count
  from matched
  order by
    case matched.product_platform
      when 'ChatGPT' then 1
      when 'Claude' then 2
      when 'Gemini' then 3
      when 'Grok' then 4
      when 'Google' then 5
      when 'API/CDK' then 6
      when '邮箱' then 7
      when '接码' then 8
      when '其他' then 99
      else 50
    end asc,
    case when p_sort = 'updated' then null else case when matched.is_public_available then 0 else 1 end end asc nulls last,
    case when p_sort = 'updated' then matched.public_updated_at end desc nulls last,
    case when p_sort = 'channels' then matched.public_source_label end asc nulls last,
    case when p_sort = 'updated' or p_sort = 'channels' then null else case when matched.is_public_available then matched.shared_access_rank else 0 end end asc nulls last,
    case when p_sort = 'price' or p_sort is null or p_sort = '' or p_sort = 'available_price' then matched.price end asc nulls last,
    matched.public_updated_at desc nulls last,
    matched.public_source_label asc,
    matched.source_title asc,
    matched.url asc,
    matched.id asc
  limit greatest(least(coalesce(p_limit, 80), 1200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function refresh_public_offer_read_model() from anon, authenticated, public;
revoke execute on function list_public_offers_page_v2(text, text, text, text, text, numeric, numeric, integer, integer) from anon, authenticated, public;
grant execute on function refresh_public_offer_read_model() to service_role;
grant execute on function list_public_offers_page_v2(text, text, text, text, text, numeric, numeric, integer, integer) to service_role;

comment on table public_offer_read_model is
  'Precomputed, deduplicated public offer read model. Rebuilt by the protected snapshot refresh path; public requests must not rebuild it.';

comment on function refresh_public_offer_read_model() is
  'Atomically rebuilds the deduplicated public offer read model and removes rows from older generations.';

comment on function list_public_offers_page_v2(text, text, text, text, text, numeric, numeric, integer, integer) is
  'Lists public offers from the precomputed read model without scanning and deduplicating raw offer state per request.';

select * from refresh_public_offer_read_model();

do $mark_public_offer_snapshots_dirty$
begin
  if to_regclass('public.public_api_snapshots') is not null then
    insert into public_api_snapshots (
      kind,
      cache_key,
      schema_version,
      payload,
      generated_at,
      updated_at
    )
    values (
      'refresh_state',
      'public-prices',
      1,
      jsonb_build_object(
        'dirty', true,
        'dirtyAt', now(),
        'reason', 'migration public offer read model',
        'refreshIntervalSeconds', 180,
        'globalDirty', true,
        'fullRefreshRequired', false,
        'affectedProductIds', jsonb_build_array(),
        'affectedOfferIds', jsonb_build_array(),
        'affectedSourceIds', jsonb_build_array()
      ),
      now(),
      now()
    )
    on conflict (kind, cache_key) do update set
      schema_version = excluded.schema_version,
      payload = public_api_snapshots.payload || excluded.payload,
      generated_at = excluded.generated_at,
      updated_at = excluded.updated_at;
  end if;
end;
$mark_public_offer_snapshots_dirty$;
