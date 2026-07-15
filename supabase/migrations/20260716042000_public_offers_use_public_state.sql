create or replace function list_public_offers_page(
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
set search_path = public
as $$
  with filtered as (
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
        when coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags)) @> array['shared_access']::text[]
        then 1
        else 0
      end as shared_access_rank,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key,
      concat_ws(
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
      ) as public_haystack
    from raw_offer_public_state raw_offers
    join canonical_products on canonical_products.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
      and canonical_products.is_active = true
      and (p_platform is null or p_platform = '' or p_platform = '全部' or canonical_products.platform = p_platform)
      and (p_product_type is null or p_product_type = '' or p_product_type = '全部' or canonical_products.product_type = p_product_type)
      and (p_min_price is null or raw_offers.price >= p_min_price)
      and (p_max_price is null or raw_offers.price <= p_max_price)
  ),
  matched_filter as (
    select *
    from filtered
    where (p_query is null or trim(p_query) = '' or filtered.public_haystack ilike ('%' || trim(p_query) || '%'))
      and (p_stock is null or p_stock = '' or p_stock = 'all'
        or (p_stock = 'available' and filtered.is_public_available = true)
        or (p_stock = 'out_of_stock' and filtered.is_public_available = false))
  ),
  deduped as (
    select *
    from (
      select
        matched_filter.*,
        row_number() over (
          partition by matched_filter.public_dedupe_key
          order by
            case when matched_filter.is_public_available then 0 else 1 end asc,
            matched_filter.shared_access_rank asc,
            matched_filter.source_priority desc nulls last,
            matched_filter.confidence desc nulls last,
            matched_filter.public_updated_at desc nulls last,
            matched_filter.public_source_label asc,
            matched_filter.source_title asc,
            matched_filter.url asc,
            matched_filter.id asc
        ) as dedupe_rank
      from matched_filter
    ) ranked_dedupe
    where ranked_dedupe.dedupe_rank = 1
  ),
  matched as (
    select
      deduped.*,
      count(*) over() as total_count
    from deduped
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

revoke execute on function list_public_offers_page(text, text, text, text, text, numeric, numeric, integer, integer) from anon, authenticated, public;
grant execute on function list_public_offers_page(text, text, text, text, text, numeric, numeric, integer, integer) to service_role;

delete from public_api_snapshots
where kind = 'offers';
