drop function if exists public.list_public_merchant_summaries();

create or replace function public.list_public_merchant_summaries()
returns table (
  id text,
  source_id text,
  name text,
  store_name text,
  source_name text,
  entry_url text,
  shop_url text,
  host text,
  collector_kind text,
  health_status text,
  last_success_at timestamptz,
  consecutive_failures integer,
  product_count bigint,
  offer_count bigint,
  in_stock_count bigint,
  out_of_stock_count bigint,
  platform_count bigint,
  platforms text[],
  product_types text[],
  lowest_hit_count bigint,
  warranty_lowest_hit_count bigint,
  risk_feedback_count bigint,
  latest_seen_at timestamptz,
  observation_started_at timestamptz,
  included_at timestamptz,
  shop_created_at timestamptz,
  representative_product text,
  representative_offer_title text,
  representative_price numeric,
  representative_currency text,
  has_platform_aftersales_mechanism boolean,
  total_count bigint
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
      products.display_name as product_display_name,
      products.platform as product_platform,
      products.product_type as product_type,
      coalesce(sources.name, raw_offers.source_name, raw_offers.source_store_name, '') as resolved_source_name,
      sources.entry_url,
      sources.base_url,
      sources.collector_kind,
      sources.health_status,
      sources.last_success_at,
      sources.consecutive_failures,
      sources.created_at as source_created_at,
      sources.shop_created_at,
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
      coalesce(raw_offers.source_store_name, raw_offers.source_name, sources.name, '') as public_source_label,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key
    from raw_offer_public_state raw_offers
    join products on products.id = raw_offers.canonical_product_id
    left join sources on sources.id = raw_offers.source_id
    where raw_offers.hidden = false
  ),
  deduped as (
    select *
    from (
      select
        offers.*,
        row_number() over (
          partition by offers.public_dedupe_key
          order by
            case when offers.is_public_available then 0 else 1 end asc,
            offers.source_priority desc nulls last,
            offers.confidence desc nulls last,
            offers.public_updated_at desc nulls last,
            offers.public_source_label asc,
            offers.source_title asc,
            offers.url asc,
            offers.id asc
        ) as dedupe_rank
      from offers
    ) ranked
    where ranked.dedupe_rank = 1
  ),
  lowest_ranked as (
    select
      deduped.*,
      row_number() over (
        partition by deduped.canonical_product_id
        order by
          deduped.price asc nulls last,
          deduped.public_updated_at desc nulls last,
          deduped.public_source_label asc,
          deduped.source_title asc,
          deduped.url asc,
          deduped.id asc
      ) as lowest_rank
    from deduped
    where deduped.is_public_available = true
      and not (deduped.public_offer_filter_tags @> array['shared_access']::text[])
      and not (deduped.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
  ),
  warranty_lowest_ranked as (
    select
      deduped.*,
      row_number() over (
        partition by deduped.canonical_product_id
        order by
          deduped.price asc nulls last,
          deduped.public_updated_at desc nulls last,
          deduped.public_source_label asc,
          deduped.source_title asc,
          deduped.url asc,
          deduped.id asc
      ) as warranty_lowest_rank
    from deduped
    where deduped.is_public_available = true
      and deduped.public_offer_filter_tags @> array['warranty_long']::text[]
      and not (deduped.public_offer_filter_tags @> array['shared_access']::text[])
      and not (deduped.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
  ),
  feedback as (
    select
      source_id,
      count(*) as risk_feedback_count
    from offer_feedback
    where status <> 'ignored'
      and source_id is not null
      and ai_review_result -> 'riskPrecheck' is not null
      and ai_review_result -> 'riskPrecheck' ->> 'status' = 'ready'
      and ai_review_result -> 'riskPrecheck' ->> 'canShowPublicly' = 'true'
      and coalesce(ai_review_result -> 'riskPrecheck' ->> 'publicHidden', 'false') <> 'true'
      and ai_review_result -> 'riskPrecheck' ->> 'sourceCanShowPublicly' = 'true'
    group by source_id
  ),
  merchant_rows as (
    select
      coalesce(deduped.source_id, 'fallback:' || md5(coalesce(deduped.public_source_label, '') || '|' || coalesce(deduped.collector_kind, '') || '|' || coalesce(deduped.url, ''))) as merchant_key,
      min(deduped.source_id) as source_id,
      coalesce(max(deduped.public_source_label), max(deduped.resolved_source_name), '未记录商家') as name,
      max(deduped.source_store_name) as store_name,
      coalesce(max(deduped.source_name), max(deduped.resolved_source_name), max(deduped.public_source_label), '未记录渠道') as source_name,
      max(deduped.entry_url) as entry_url,
      coalesce(
        max(deduped.entry_url) filter (where deduped.entry_url ~ '/shop/'),
        max(deduped.entry_url) filter (where deduped.entry_url !~ '/item/'),
        'https://pay.ldxp.cn/shop/' || nullif(substring(
          coalesce(
            min(deduped.source_id) filter (where deduped.source_id ~* '^ldxp-[^/]+$' and deduped.source_id <> 'ldxp-cn'),
            max(deduped.source_name) filter (where deduped.source_name ~* 'LDXP\s*/\s*[^/\s]+')
          )
          from '(?:^ldxp-|LDXP\s*/\s*)([^/\s]+)'
        ), ''),
        max(deduped.base_url)
      ) as shop_url,
      lower(regexp_replace((regexp_match(coalesce(max(deduped.entry_url), max(deduped.base_url), ''), '^https?://(?:www\.)?([^/?#]+)'))[1], '^www\.', '')) as host,
      max(deduped.collector_kind) as collector_kind,
      max(deduped.health_status) as health_status,
      max(deduped.last_success_at) as last_success_at,
      max(deduped.consecutive_failures) as consecutive_failures,
      count(distinct deduped.canonical_product_id) as product_count,
      count(*) as offer_count,
      count(*) filter (where deduped.is_public_available = true) as in_stock_count,
      count(*) filter (where deduped.is_public_available = false) as out_of_stock_count,
      count(distinct deduped.product_platform) as platform_count,
      array_agg(distinct deduped.product_platform order by deduped.product_platform) as platforms,
      array_agg(distinct deduped.product_type order by deduped.product_type) as product_types,
      count(*) filter (where lowest_ranked.lowest_rank = 1) as lowest_hit_count,
      count(*) filter (where warranty_lowest_ranked.warranty_lowest_rank = 1) as warranty_lowest_hit_count,
      max(coalesce(feedback.risk_feedback_count, 0)) as risk_feedback_count,
      max(deduped.public_updated_at) as latest_seen_at,
      min(coalesce(deduped.public_updated_at, deduped.captured_at)) as observation_started_at,
      min(deduped.source_created_at) as included_at,
      min(deduped.shop_created_at) as shop_created_at,
      (array_agg(deduped.product_display_name order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_product,
      (array_agg(deduped.source_title order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_offer_title,
      (array_agg(deduped.price order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_price,
      (array_agg(deduped.currency order by deduped.is_public_available desc, deduped.price asc nulls last, deduped.public_updated_at desc nulls last))[1] as representative_currency,
      bool_or(deduped.collector_kind = 'shopApi') as has_platform_aftersales_mechanism
    from deduped
    left join lowest_ranked
      on lowest_ranked.id = deduped.id
      and lowest_ranked.lowest_rank = 1
    left join warranty_lowest_ranked
      on warranty_lowest_ranked.id = deduped.id
      and warranty_lowest_ranked.warranty_lowest_rank = 1
    left join feedback on feedback.source_id = deduped.source_id
    group by coalesce(deduped.source_id, 'fallback:' || md5(coalesce(deduped.public_source_label, '') || '|' || coalesce(deduped.collector_kind, '') || '|' || coalesce(deduped.url, '')))
  )
  select
    'merchant-' || md5(merchant_rows.merchant_key) as id,
    merchant_rows.source_id,
    merchant_rows.name,
    merchant_rows.store_name,
    merchant_rows.source_name,
    merchant_rows.entry_url,
    merchant_rows.shop_url,
    merchant_rows.host,
    merchant_rows.collector_kind,
    merchant_rows.health_status,
    merchant_rows.last_success_at,
    merchant_rows.consecutive_failures,
    merchant_rows.product_count,
    merchant_rows.offer_count,
    merchant_rows.in_stock_count,
    merchant_rows.out_of_stock_count,
    merchant_rows.platform_count,
    merchant_rows.platforms,
    merchant_rows.product_types,
    merchant_rows.lowest_hit_count,
    merchant_rows.warranty_lowest_hit_count,
    merchant_rows.risk_feedback_count,
    merchant_rows.latest_seen_at,
    merchant_rows.observation_started_at,
    merchant_rows.included_at,
    merchant_rows.shop_created_at,
    merchant_rows.representative_product,
    merchant_rows.representative_offer_title,
    merchant_rows.representative_price,
    merchant_rows.representative_currency,
    merchant_rows.has_platform_aftersales_mechanism,
    count(*) over() as total_count
  from merchant_rows
  order by
    merchant_rows.in_stock_count desc,
    merchant_rows.warranty_lowest_hit_count desc,
    merchant_rows.lowest_hit_count desc,
    merchant_rows.has_platform_aftersales_mechanism desc,
    merchant_rows.latest_seen_at desc nulls last,
    merchant_rows.product_count desc,
    merchant_rows.risk_feedback_count asc,
    merchant_rows.name asc;
$$;

revoke execute on function public.list_public_merchant_summaries() from anon, authenticated, public;
grant execute on function public.list_public_merchant_summaries() to service_role;

delete from public_api_snapshots
where kind = 'merchants';

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
    'reason', 'migration restore merchant source times',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
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
