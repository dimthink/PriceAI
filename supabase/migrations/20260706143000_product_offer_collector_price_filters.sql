drop function if exists list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer);

create or replace function list_public_product_offers_page_v2(
  p_product_id text,
  p_filter_tags text[] default '{}',
  p_query text default null,
  p_exclude_query text default null,
  p_collector text default null,
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
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with product as (
    select id
    from canonical_products
    where is_active = true
      and (canonical_products.id = p_product_id or canonical_products.slug = p_product_id)
    limit 1
  ),
  filtered as (
    select
      raw_offers.*,
      sources.collector_kind,
      concat_ws(
        ' ',
        raw_offers.source_title,
        raw_offers.source_name,
        raw_offers.source_store_name,
        raw_offers.url,
        array_to_string(raw_offers.tags, ' ')
      ) as public_haystack,
      case
        when sources.collector_kind = 'shopApi' then 'shopApi'
        when sources.collector_kind = 'dujiao' then 'dujiao'
        when sources.collector_kind = 'kami' then 'kami'
        else 'other'
      end as collector_group
    from raw_offer_public_state raw_offers
    join product on product.id = raw_offers.canonical_product_id
    left join sources on sources.id = raw_offers.source_id
    where raw_offers.hidden = false
  ),
  ranked as (
    select
      filtered.*,
      count(*) over() as total_count,
      case
        when filtered.status <> 'out_of_stock'
          and filtered.price is not null
          and filtered.url <> ''
          and coalesce(filtered.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(filtered.freshness_status, '') not in ('expired', 'failed')
          and (filtered.expires_at is null or filtered.expires_at > now())
        then 0
        else 1
      end as availability_rank,
      case
        when coalesce(filtered.public_filter_tags, priceai_public_offer_filter_tags(filtered.source_title, filtered.tags)) @> array['shared_access']::text[]
        then 1
        else 0
      end as shared_access_rank,
      coalesce(filtered.verified_at, filtered.last_seen_at, filtered.captured_at, filtered.source_updated_at) as public_updated_at,
      coalesce(filtered.source_store_name, filtered.source_name, '') as public_source_label
    from filtered
    where (coalesce(array_length(p_filter_tags, 1), 0) = 0 or coalesce(filtered.public_filter_tags, '{}'::text[]) @> p_filter_tags)
      and (p_query is null or trim(p_query) = '' or filtered.public_haystack ilike ('%' || trim(p_query) || '%'))
      and (
        p_exclude_query is null
        or trim(p_exclude_query) = ''
        or not exists (
          select 1
          from regexp_split_to_table(trim(p_exclude_query), '[,，[:space:]]+') as excluded_term(term)
          where excluded_term.term <> ''
            and filtered.public_haystack ilike ('%' || excluded_term.term || '%')
        )
      )
      and (p_collector is null or trim(p_collector) = '' or p_collector = 'all' or filtered.collector_group = p_collector)
      and (p_min_price is null or filtered.price >= p_min_price)
      and (p_max_price is null or filtered.price <= p_max_price)
  )
  select
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
    ranked.total_count
  from ranked
  order by
    ranked.availability_rank asc,
    ranked.shared_access_rank asc,
    ranked.price asc nulls last,
    ranked.public_updated_at desc nulls last,
    ranked.public_source_label asc,
    ranked.source_title asc,
    ranked.url asc,
    ranked.id asc
  limit greatest(least(coalesce(p_limit, 80), 1200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create index if not exists raw_offers_visible_product_price_idx
  on raw_offers(canonical_product_id, price)
  where hidden = false and price is not null;

revoke execute on function list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer) from anon, authenticated, public;
grant execute on function list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer) to service_role;
