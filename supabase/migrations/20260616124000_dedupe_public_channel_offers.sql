create or replace function priceai_public_offer_normalized_url(
  p_url text
)
returns text
language sql
immutable
set search_path = public
as $$
  with parsed as (
    select
      trim(coalesce(p_url, '')) as value,
      lower((regexp_match(trim(coalesce(p_url, '')), '^https?://(?:www\.)?([^/?#]+)'))[1]) as host,
      (regexp_match(trim(coalesce(p_url, '')), '^https?://(?:www\.)?[^/?#]+/item/([^/?#]+)'))[1] as path_goods_key,
      (regexp_match(trim(coalesce(p_url, '')), '[?&](commodity|id)=([^&#]+)'))[2] as query_goods_key
  )
  select
    case
      when host in ('catfk.com', 'ldxp.cn', 'pay.ldxp.cn', 'pay.qxvx.cn')
        and coalesce(path_goods_key, query_goods_key) is not null
      then 'https://' || host || '/item/' || coalesce(path_goods_key, query_goods_key)
      else regexp_replace(regexp_replace(lower(value), '#.*$', ''), '/$', '')
    end
  from parsed;
$$;

create or replace function priceai_public_offer_dedupe_key(
  p_product_id text,
  p_url text,
  p_source_title text,
  p_price numeric
)
returns text
language sql
immutable
set search_path = public
as $$
  select concat_ws(
    '|',
    coalesce(p_product_id, ''),
    priceai_public_offer_normalized_url(p_url),
    regexp_replace(lower(coalesce(p_source_title, '')), '[[:space:]]+', '', 'g'),
    regexp_replace(
      regexp_replace(coalesce(to_char(p_price, 'FM999999999999990.0000'), ''), '0+$', ''),
      '\.$',
      ''
    )
  );
$$;

create or replace function list_public_product_offer_filter_facets(
  p_product_id text
)
returns table (
  tag_id text,
  offer_count bigint
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
  tag_rows as (
    select distinct
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as offer_key,
      unnest(coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags))) as tag_id
    from raw_offers
    join product on product.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
  )
  select
    tag_rows.tag_id,
    count(*) as offer_count
  from tag_rows
  group by tag_rows.tag_id
  order by array_position(
    array[
      'proxy_supported',
      'warranty_long'
    ]::text[],
    tag_rows.tag_id
  );
$$;

create or replace function list_public_product_offers_page(
  p_product_id text,
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
  base as (
    select
      raw_offers.*,
      case
        when raw_offers.status <> 'out_of_stock'
          and raw_offers.price is not null
          and raw_offers.url <> ''
          and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
          and (raw_offers.expires_at is null or raw_offers.expires_at > now())
        then 0
        else 1
      end as availability_rank,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key
    from raw_offers
    join product on product.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
  ),
  deduped as (
    select *
    from (
      select
        base.*,
        row_number() over (
          partition by base.public_dedupe_key
          order by
            base.availability_rank asc,
            base.source_priority desc nulls last,
            base.confidence desc nulls last,
            base.public_updated_at desc nulls last,
            base.public_source_label asc,
            base.source_title asc,
            base.url asc,
            base.id asc
        ) as dedupe_rank
      from base
    ) ranked_dedupe
    where ranked_dedupe.dedupe_rank = 1
  ),
  ranked as (
    select
      deduped.*,
      count(*) over() as total_count
    from deduped
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
    ranked.price asc nulls last,
    ranked.public_updated_at desc nulls last,
    ranked.public_source_label asc,
    ranked.source_title asc,
    ranked.url asc,
    ranked.id asc
  limit greatest(least(coalesce(p_limit, 80), 1200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

drop function if exists list_public_product_offers_page_v2(text, text[], text, integer, integer);
drop function if exists list_public_product_offers_page_v2(text, text[], text, text, integer, integer);

create or replace function list_public_product_offers_page_v2(
  p_product_id text,
  p_filter_tags text[] default '{}',
  p_query text default null,
  p_exclude_query text default null,
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
  filter_tags text[],
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
      concat_ws(
        ' ',
        raw_offers.source_title,
        raw_offers.source_name,
        raw_offers.source_store_name,
        raw_offers.url,
        array_to_string(raw_offers.tags, ' ')
      ) as public_haystack,
      case
        when raw_offers.status <> 'out_of_stock'
          and raw_offers.price is not null
          and raw_offers.url <> ''
          and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
          and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
          and (raw_offers.expires_at is null or raw_offers.expires_at > now())
        then 0
        else 1
      end as availability_rank,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key
    from raw_offers
    join product on product.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
  ),
  matched_filter as (
    select *
    from filtered
    where (coalesce(array_length(p_filter_tags, 1), 0) = 0 or filtered.public_filter_tags @> p_filter_tags)
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
  ),
  deduped as (
    select *
    from (
      select
        matched_filter.*,
        row_number() over (
          partition by matched_filter.public_dedupe_key
          order by
            matched_filter.availability_rank asc,
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
  ranked as (
    select
      deduped.*,
      count(*) over() as total_count
    from deduped
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
    ranked.public_filter_tags as filter_tags,
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
    ranked.price asc nulls last,
    ranked.public_updated_at desc nulls last,
    ranked.public_source_label asc,
    ranked.source_title asc,
    ranked.url asc,
    ranked.id asc
  limit greatest(least(coalesce(p_limit, 80), 1200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

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
  offer_base as (
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
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key
    from raw_offers
    join products on products.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
  ),
  offers as (
    select *
    from (
      select
        offer_base.*,
        row_number() over (
          partition by offer_base.public_dedupe_key
          order by
            case when offer_base.is_public_available then 0 else 1 end asc,
            offer_base.source_priority desc nulls last,
            offer_base.confidence desc nulls last,
            offer_base.public_updated_at desc nulls last,
            offer_base.public_source_label asc,
            offer_base.source_title asc,
            offer_base.url asc,
            offer_base.id asc
        ) as dedupe_rank
      from offer_base
    ) ranked_dedupe
    where ranked_dedupe.dedupe_rank = 1
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
        480
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
        'url', lowest.url
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
        'url', warranty_lowest.url
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
        canonical_products.display_name,
        canonical_products.platform,
        canonical_products.product_type,
        canonical_products.spec
      ) as public_haystack
    from raw_offers
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
    case when p_sort = 'price' or p_sort is null or p_sort = '' or p_sort = 'available_price' then matched.price end asc nulls last,
    matched.public_updated_at desc nulls last,
    matched.public_source_label asc,
    matched.source_title asc,
    matched.url asc,
    matched.id asc
  limit greatest(least(coalesce(p_limit, 80), 1200), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke execute on function priceai_public_offer_normalized_url(text) from anon, public;
revoke execute on function priceai_public_offer_dedupe_key(text, text, text, numeric) from anon, public;
revoke execute on function list_public_product_offer_filter_facets(text) from anon, public;
revoke execute on function list_public_product_offers_page(text, integer, integer) from anon, public;
revoke execute on function list_public_product_offers_page_v2(text, text[], text, text, integer, integer) from anon, public;
revoke execute on function list_public_product_summaries() from anon, public;
revoke execute on function list_public_offers_page(
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  integer,
  integer
) from anon, public;

grant execute on function priceai_public_offer_normalized_url(text) to service_role;
grant execute on function priceai_public_offer_dedupe_key(text, text, text, numeric) to service_role;
grant execute on function list_public_product_offer_filter_facets(text) to service_role;
grant execute on function list_public_product_offers_page(text, integer, integer) to service_role;
grant execute on function list_public_product_offers_page_v2(text, text[], text, text, integer, integer) to service_role;
grant execute on function list_public_product_summaries() to service_role;
grant execute on function list_public_offers_page(
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  integer,
  integer
) to service_role;
