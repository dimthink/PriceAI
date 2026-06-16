drop function if exists get_public_product_summary(text);
drop function if exists list_public_product_summaries();

create or replace function list_public_product_summaries()
returns table (
  id text,
  slug text,
  display_name text,
  platform text,
  product_type text,
  spec text,
  summary text,
  aliases text[],
  updated_at timestamptz,
  offer_count bigint,
  in_stock_count bigint,
  out_of_stock_count bigint,
  lowest_price numeric,
  warranty_lowest_price numeric,
  warranty_offer_count bigint,
  latest_seen_at timestamptz,
  lowest_offer jsonb,
  warranty_lowest_offer jsonb,
  has_out_of_stock boolean,
  offer_search_text text
)
language sql
stable
security definer
set search_path = public
as $$
  with products as (
    select *
    from canonical_products
    where is_active = true
  ),
  offers as (
    select
      raw_offers.*,
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
      coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags)) as public_offer_filter_tags,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label
    from raw_offers
    join products on products.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
  ),
  lowest_ranked as (
    select
      offers.*,
      row_number() over (
        partition by offers.canonical_product_id
        order by
          offers.price asc nulls last,
          offers.public_updated_at desc nulls last,
          offers.public_source_label asc,
          offers.source_title asc,
          offers.url asc,
          offers.id asc
      ) as lowest_rank
    from offers
    where offers.is_public_available = true
  ),
  warranty_lowest_ranked as (
    select
      offers.*,
      row_number() over (
        partition by offers.canonical_product_id
        order by
          offers.price asc nulls last,
          offers.public_updated_at desc nulls last,
          offers.public_source_label asc,
          offers.source_title asc,
          offers.url asc,
          offers.id asc
      ) as warranty_lowest_rank
    from offers
    where offers.is_public_available = true
      and offers.public_offer_filter_tags @> array['warranty_long']::text[]
  ),
  stats as (
    select
      offers.canonical_product_id,
      count(*) as offer_count,
      count(*) filter (where offers.is_public_available = true) as in_stock_count,
      count(*) filter (
        where offers.is_public_available = true
          and offers.public_offer_filter_tags @> array['warranty_long']::text[]
      ) as warranty_offer_count,
      count(*) filter (where offers.is_public_available = false) as out_of_stock_count,
      max(offers.public_updated_at) as latest_seen_at,
      bool_or(offers.is_public_available = false) as has_out_of_stock,
      left(
        string_agg(
          distinct concat_ws(' ', offers.source_title, offers.source_name, offers.source_store_name),
          ' '
        ),
        1000
      ) as offer_search_text
    from offers
    group by offers.canonical_product_id
  )
  select
    products.id,
    products.slug,
    products.display_name,
    products.platform,
    products.product_type,
    products.spec,
    products.summary,
    products.aliases,
    products.updated_at,
    coalesce(stats.offer_count, 0) as offer_count,
    coalesce(stats.in_stock_count, 0) as in_stock_count,
    coalesce(stats.out_of_stock_count, 0) as out_of_stock_count,
    lowest.price as lowest_price,
    warranty_lowest.price as warranty_lowest_price,
    coalesce(stats.warranty_offer_count, 0) as warranty_offer_count,
    stats.latest_seen_at,
    case
      when lowest.id is null then null
      else jsonb_build_object(
        'id', lowest.id,
        'source_id', lowest.source_id,
        'source_name', lowest.source_name,
        'source_store_name', lowest.source_store_name,
        'source_title', lowest.source_title,
        'price', lowest.price,
        'currency', lowest.currency,
        'status', lowest.status,
        'url', lowest.url,
        'tags', lowest.tags,
        'filter_tags', lowest.public_offer_filter_tags,
        'stock_count', lowest.stock_count,
        'hidden', lowest.hidden,
        'canonical_product_id', lowest.canonical_product_id,
        'category_slug', lowest.category_slug,
        'captured_at', lowest.captured_at,
        'source_updated_at', lowest.source_updated_at,
        'last_seen_at', lowest.last_seen_at,
        'verified_at', lowest.verified_at,
        'expires_at', lowest.expires_at,
        'source_priority', lowest.source_priority,
        'confidence', lowest.confidence,
        'effective_status', lowest.effective_status,
        'freshness_status', lowest.freshness_status,
        'last_failed_at', lowest.last_failed_at,
        'failure_reason', lowest.failure_reason
      )
    end as lowest_offer,
    case
      when warranty_lowest.id is null then null
      else jsonb_build_object(
        'id', warranty_lowest.id,
        'source_id', warranty_lowest.source_id,
        'source_name', warranty_lowest.source_name,
        'source_store_name', warranty_lowest.source_store_name,
        'source_title', warranty_lowest.source_title,
        'price', warranty_lowest.price,
        'currency', warranty_lowest.currency,
        'status', warranty_lowest.status,
        'url', warranty_lowest.url,
        'tags', warranty_lowest.tags,
        'filter_tags', warranty_lowest.public_offer_filter_tags,
        'stock_count', warranty_lowest.stock_count,
        'hidden', warranty_lowest.hidden,
        'canonical_product_id', warranty_lowest.canonical_product_id,
        'category_slug', warranty_lowest.category_slug,
        'captured_at', warranty_lowest.captured_at,
        'source_updated_at', warranty_lowest.source_updated_at,
        'last_seen_at', warranty_lowest.last_seen_at,
        'verified_at', warranty_lowest.verified_at,
        'expires_at', warranty_lowest.expires_at,
        'source_priority', warranty_lowest.source_priority,
        'confidence', warranty_lowest.confidence,
        'effective_status', warranty_lowest.effective_status,
        'freshness_status', warranty_lowest.freshness_status,
        'last_failed_at', warranty_lowest.last_failed_at,
        'failure_reason', warranty_lowest.failure_reason
      )
    end as warranty_lowest_offer,
    coalesce(stats.has_out_of_stock, false) as has_out_of_stock,
    coalesce(stats.offer_search_text, '') as offer_search_text
  from products
  left join stats on stats.canonical_product_id = products.id
  left join lowest_ranked lowest
    on lowest.canonical_product_id = products.id
    and lowest.lowest_rank = 1
  left join warranty_lowest_ranked warranty_lowest
    on warranty_lowest.canonical_product_id = products.id
    and warranty_lowest.warranty_lowest_rank = 1
  order by products.platform, products.display_name, products.id;
$$;

create or replace function get_public_product_summary(p_product_key text)
returns table (
  id text,
  slug text,
  display_name text,
  platform text,
  product_type text,
  spec text,
  summary text,
  aliases text[],
  updated_at timestamptz,
  offer_count bigint,
  in_stock_count bigint,
  out_of_stock_count bigint,
  lowest_price numeric,
  warranty_lowest_price numeric,
  warranty_offer_count bigint,
  latest_seen_at timestamptz,
  lowest_offer jsonb,
  warranty_lowest_offer jsonb,
  has_out_of_stock boolean,
  offer_search_text text
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from list_public_product_summaries()
  where list_public_product_summaries.id = p_product_key
    or list_public_product_summaries.slug = p_product_key
  limit 1;
$$;

revoke execute on function list_public_product_summaries() from anon, public;
revoke execute on function get_public_product_summary(text) from anon, public;

grant execute on function list_public_product_summaries() to service_role;
grant execute on function get_public_product_summary(text) to service_role;
