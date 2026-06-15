create table if not exists canonical_products (
  id text primary key,
  slug text not null unique,
  display_name text not null,
  platform text not null,
  product_type text not null,
  spec text not null default '',
  summary text not null default '',
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id text primary key,
  name text not null,
  base_url text,
  entry_url text not null,
  collection_method text not null default 'manual',
  collector_kind text,
  runtime_region text not null default 'default',
  enabled boolean not null default true,
  notes text,
  health_status text not null default 'unknown',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  last_error text,
  collector_lock_until timestamptz,
  collector_lock_owner text,
  collector_lock_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sources add column if not exists health_status text not null default 'unknown';
alter table sources add column if not exists last_checked_at timestamptz;
alter table sources add column if not exists last_success_at timestamptz;
alter table sources add column if not exists consecutive_failures integer not null default 0;
alter table sources add column if not exists last_error text;
alter table sources add column if not exists collector_kind text;
alter table sources add column if not exists runtime_region text not null default 'default';
alter table sources add column if not exists collector_lock_until timestamptz;
alter table sources add column if not exists collector_lock_owner text;
alter table sources add column if not exists collector_lock_started_at timestamptz;

create table if not exists raw_offers (
  id text primary key,
  source_id text references sources(id) on delete set null,
  source_name text not null,
  source_store_name text,
  source_title text not null,
  price numeric,
  currency text not null default 'CNY',
  status text not null default 'unknown',
  source_status text not null default 'unknown',
  effective_status text not null default 'low_confidence',
  freshness_status text not null default 'fresh',
  url text not null,
  tags text[] not null default '{}',
  stock_count integer,
  hidden boolean not null default false,
  canonical_product_id text references canonical_products(id) on delete set null,
  category_slug text,
  captured_at timestamptz not null default now(),
  source_updated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  verified_at timestamptz,
  expires_at timestamptz,
  source_priority integer not null default 50,
  confidence numeric not null default 0.5,
  last_failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table raw_offers add column if not exists source_status text not null default 'unknown';
alter table raw_offers add column if not exists effective_status text not null default 'low_confidence';
alter table raw_offers add column if not exists freshness_status text not null default 'fresh';
alter table raw_offers add column if not exists verified_at timestamptz;
alter table raw_offers add column if not exists expires_at timestamptz;
alter table raw_offers add column if not exists source_priority integer not null default 50;
alter table raw_offers add column if not exists confidence numeric not null default 0.5;
alter table raw_offers add column if not exists last_failed_at timestamptz;
alter table raw_offers add column if not exists failure_reason text;

update raw_offers
set
  source_status = status,
  verified_at = coalesce(verified_at, last_seen_at, captured_at, source_updated_at),
  source_priority = case
    when exists (
      select 1 from sources
      where sources.id = raw_offers.source_id
        and sources.collection_method = 'public_json'
    ) then 40
    else 90
  end,
  confidence = case
    when exists (
      select 1 from sources
      where sources.id = raw_offers.source_id
        and sources.collection_method = 'public_json'
    ) then 0.55
    else 0.90
  end,
  effective_status = case
    when status = 'out_of_stock' then 'unavailable'
    else 'available'
  end,
  freshness_status = case
    when coalesce(expires_at, verified_at + interval '24 hours', last_seen_at + interval '24 hours', captured_at + interval '24 hours') < now() then 'expired'
    else 'fresh'
  end,
  expires_at = coalesce(
    expires_at,
    coalesce(verified_at, last_seen_at, captured_at, source_updated_at) +
      interval '24 hours'
  )
where true;

create table if not exists offer_matches (
  id text primary key,
  raw_offer_id text not null references raw_offers(id) on delete cascade,
  canonical_product_id text not null references canonical_products(id) on delete cascade,
  match_method text not null default 'rule',
  confidence numeric not null default 0.75,
  created_at timestamptz not null default now(),
  unique(raw_offer_id, canonical_product_id)
);

create table if not exists crawl_runs (
  id text primary key,
  source_id text references sources(id) on delete set null,
  source_name text,
  mode text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  message text,
  details jsonb not null default '{}'::jsonb
);

create table if not exists collection_jobs (
  id text primary key,
  job_type text not null check (job_type in ('all', 'source', 'official_prices', 'api_models')),
  source_id text references sources(id) on delete set null,
  source_name text,
  status text not null default 'pending' check (status in ('pending', 'running', 'success', 'failed', 'cancelled')),
  priority integer not null default 0,
  attempts integer not null default 0,
  max_attempts integer not null default 1,
  requested_by text,
  locked_by text,
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists collector_heartbeats (
  node_id text primary key,
  node_name text not null,
  node_type text,
  runtime text,
  region text,
  scope text,
  status text not null default 'unknown' check (status in ('running', 'success', 'partial', 'failed', 'idle', 'unknown')),
  started_at timestamptz,
  finished_at timestamptz,
  last_seen_at timestamptz not null default now(),
  success_count integer not null default 0,
  failure_count integer not null default 0,
  skipped_count integer not null default 0,
  offer_count integer not null default 0,
  message text,
  details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists raw_offers_canonical_product_id_idx on raw_offers(canonical_product_id);
create index if not exists raw_offers_source_id_idx on raw_offers(source_id);
create index if not exists raw_offers_status_idx on raw_offers(status);
create index if not exists raw_offers_effective_status_idx on raw_offers(effective_status);
create index if not exists raw_offers_verified_at_idx on raw_offers(verified_at desc);
create index if not exists raw_offers_expires_at_idx on raw_offers(expires_at);
create index if not exists raw_offers_hidden_idx on raw_offers(hidden);
create index if not exists raw_offers_product_public_page_idx
on raw_offers (
  canonical_product_id,
  hidden,
  status,
  price,
  verified_at desc,
  last_seen_at desc,
  captured_at desc,
  source_updated_at desc,
  id
);
create index if not exists canonical_products_slug_idx on canonical_products(slug);
create index if not exists sources_health_status_idx on sources(health_status);
create index if not exists sources_last_checked_at_idx on sources(last_checked_at desc);
create index if not exists sources_collector_kind_idx on sources(collector_kind);
create index if not exists sources_collector_lock_until_idx on sources(collector_lock_until);
create index if not exists crawl_runs_started_at_idx on crawl_runs(started_at desc);
create index if not exists collection_jobs_status_created_at_idx on collection_jobs(status, created_at desc);
create index if not exists collection_jobs_source_status_idx on collection_jobs(source_id, status);
create index if not exists collection_jobs_locked_until_idx on collection_jobs(locked_until);
create index if not exists collector_heartbeats_last_seen_at_idx on collector_heartbeats(last_seen_at desc);
create index if not exists collector_heartbeats_status_last_seen_at_idx on collector_heartbeats(status, last_seen_at desc);

create or replace function priceai_public_offer_filter_tags(
  p_source_title text,
  p_tags text[] default '{}'
)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  text_value text := regexp_replace(
    lower(
      regexp_replace(
        coalesce(p_source_title, '') || ' ' || array_to_string(coalesce(p_tags, array[]::text[]), ' '),
        '[[:space:]]+',
        '',
        'g'
      )
    ),
    '[【】\[\]（）()]',
    ' ',
    'g'
  );
  output text[] := '{}';
begin
  if text_value !~ '(仅支持?网页|只能网页|仅网页|网页号|不支持codex|无法使用codex|不能使用codex|不能直接登录codex|无法直接登录codex|无法codex|codex不售后|不可反代|无法反代|不能反代|不支持反代)'
    and text_value ~ '(可反代|支持反代|反代\+?codex|可用codex|支持codex|直接登录codex|sub2|cpa|api格式|json格式|json文件|sub格式|cpa格式)'
  then
    output := array_append(output, 'proxy_supported');
  end if;

  if text_value !~ '(无.{0,4}质保|没.{0,4}质保|不质保|不保|不售后|售后不管|一律不售后|无售后|不作售后条件|不做售后|不管售后)'
    and text_value !~ '(质保首登|保首登|包首登|首登质保|首次登录|首次登陆|质保首次|质保购买一小时内首登|质保[0-9]+h?内首登|质保(一|二|三|四|五|六|七|八|九|十)+小时内首登)'
    and text_value !~ '(质保([1-9]|1[0-4]|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天|(^|[^0-9])([1-9]|1[0-4])天质保|(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天质保|质保(一周|1周|两周|2周|二周)|(一周|1周|两周|2周|二周)质保|7天售后|七天售后|质保[0-9]{1,2}h|质保(24|48|72)小时|质保[0-9]+小时|[0-9]+h质保|[0-9]+小时质保|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次成功接码|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次接码|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次|质保额度|质保不来码|质保开通|仅质保开通|只质保开通|质保充值成功|质保激活成功|质保到手)'
    and text_value ~ '(质保(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天|(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天质保|质保(十五|二十|二十五|二十八|三十|一百八十)天|(十五|二十|二十五|二十八|三十|一百八十)天质保|质保(半个月|一个月|1个月|一月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|(半个月|一个月|1个月|一月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)质保|质保.{0,8}订阅|订阅.{0,8}质保|质保.{0,8}掉订阅|掉订阅.{0,8}质保|质保.{0,8}封号\+?订阅|全程质保|全程保|包月售后|(月卡|整月|1个月|一个月|一月|官方直充|正规充值|官方代充|代充|成品号|充值卡密|ios充值|美区ios).{0,18}质保|质保.{0,18}(月卡|整月|1个月|一个月|一月|官方直充|正规充值|官方代充|代充|成品号|充值卡密|ios充值|美区ios))'
  then
    output := array_append(output, 'warranty_long');
  end if;

  return output;
end;
$$;

alter table raw_offers
  add column if not exists public_filter_tags text[]
  generated always as (priceai_public_offer_filter_tags(source_title, tags)) stored;

create index if not exists raw_offers_public_filter_tags_idx
  on raw_offers using gin (public_filter_tags)
  where hidden = false;

create or replace function acquire_source_collection_lock(
  p_source_id text,
  p_owner text,
  p_lock_seconds integer default 600
)
returns table(acquired boolean, lock_owner text, lock_until timestamptz)
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_lock_until timestamptz := now() + make_interval(secs => greatest(60, least(coalesce(p_lock_seconds, 600), 3600)));
begin
  update sources
  set
    collector_lock_owner = p_owner,
    collector_lock_started_at = v_now,
    collector_lock_until = v_lock_until,
    updated_at = v_now
  where id = p_source_id
    and (
      collector_lock_until is null
      or collector_lock_until < v_now
      or collector_lock_owner = p_owner
    );

  if found then
    return query select true, p_owner, v_lock_until;
    return;
  end if;

  return query
  select
    false,
    sources.collector_lock_owner,
    sources.collector_lock_until
  from sources
  where sources.id = p_source_id;
end;
$$;

create or replace function release_source_collection_lock(
  p_source_id text,
  p_owner text
)
returns boolean
language plpgsql
security definer
as $$
begin
  update sources
  set
    collector_lock_owner = null,
    collector_lock_started_at = null,
    collector_lock_until = null,
    updated_at = now()
  where id = p_source_id
    and collector_lock_owner = p_owner;

  return found;
end;
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
  with ranked as (
    select
      raw_offers.*,
      count(*) over() as total_count,
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
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label
    from raw_offers
    where raw_offers.hidden = false
      and raw_offers.canonical_product_id = p_product_id
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

revoke execute on function priceai_public_offer_filter_tags(text, text[]) from anon, public;
revoke execute on function list_public_product_summaries() from anon, public;
revoke execute on function get_public_product_summary(text) from anon, public;

grant execute on function priceai_public_offer_filter_tags(text, text[]) to service_role;
grant execute on function list_public_product_summaries() to service_role;
grant execute on function get_public_product_summary(text) to service_role;

create or replace function claim_collection_job(
  p_worker text,
  p_lock_seconds integer default 1800
)
returns setof collection_jobs
language plpgsql
security definer
as $$
declare
  v_job_id text;
  v_now timestamptz := now();
  v_lock_until timestamptz := now() + make_interval(secs => greatest(60, least(coalesce(p_lock_seconds, 1800), 7200)));
begin
  select id into v_job_id
  from collection_jobs
  where
    status = 'pending'
    or (
      status = 'running'
      and locked_until is not null
      and locked_until < v_now
      and attempts < max_attempts
    )
  order by priority desc, created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  update collection_jobs
  set
    status = 'running',
    locked_by = p_worker,
    locked_until = v_lock_until,
    started_at = coalesce(started_at, v_now),
    finished_at = null,
    attempts = attempts + 1,
    updated_at = v_now
  where id = v_job_id;

  return query
  select *
  from collection_jobs
  where id = v_job_id;
end;
$$;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists canonical_products_set_updated_at on canonical_products;
create trigger canonical_products_set_updated_at
before update on canonical_products
for each row execute function set_updated_at();

drop trigger if exists sources_set_updated_at on sources;
create trigger sources_set_updated_at
before update on sources
for each row execute function set_updated_at();

drop trigger if exists raw_offers_set_updated_at on raw_offers;
create trigger raw_offers_set_updated_at
before update on raw_offers
for each row execute function set_updated_at();

drop trigger if exists collection_jobs_set_updated_at on collection_jobs;
create trigger collection_jobs_set_updated_at
before update on collection_jobs
for each row execute function set_updated_at();

drop trigger if exists collector_heartbeats_set_updated_at on collector_heartbeats;
create trigger collector_heartbeats_set_updated_at
before update on collector_heartbeats
for each row execute function set_updated_at();

-- Default-deny RLS. The Next.js app talks to Supabase via the service role key
-- (server-only), which bypasses RLS. The anon key cannot read or write.
alter table canonical_products enable row level security;
alter table sources enable row level security;
alter table raw_offers enable row level security;
alter table offer_matches enable row level security;
alter table crawl_runs enable row level security;
alter table collection_jobs enable row level security;
alter table collector_heartbeats enable row level security;

create table if not exists channel_submissions (
  id text primary key,
  url text not null,
  name text,
  contact text,
  notes text,
  parsed_title text,
  parsed_meta jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  reviewer_note text,
  approved_source_id text references sources(id) on delete set null,
  submitter_ip text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists channel_submissions_status_idx on channel_submissions(status);
create index if not exists channel_submissions_created_at_idx on channel_submissions(created_at desc);
create index if not exists channel_submissions_url_idx on channel_submissions(url);

alter table channel_submissions enable row level security;

create table if not exists offer_feedback (
  id text primary key,
  product_id text,
  product_slug text,
  product_name text,
  offer_id text references raw_offers(id) on delete set null,
  source_id text references sources(id) on delete set null,
  source_name text,
  source_title text,
  offer_url text,
  offer_price numeric,
  offer_currency text,
  offer_status text,
  offer_captured_at timestamptz,
  offer_source_updated_at timestamptz,
  offer_last_seen_at timestamptz,
  reason text not null,
  user_expected_action text not null default 'recheck',
  suggested_action text not null default 'recollect',
  evidence_text text,
  evidence_urls jsonb not null default '[]'::jsonb,
  ai_review_result jsonb,
  notes text,
  contact text,
  status text not null default 'pending',
  reviewer_note text,
  submitter_ip text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists offer_feedback_status_idx on offer_feedback(status);
create index if not exists offer_feedback_created_at_idx on offer_feedback(created_at desc);
create index if not exists offer_feedback_offer_id_idx on offer_feedback(offer_id);
create index if not exists offer_feedback_source_id_idx on offer_feedback(source_id);
create index if not exists offer_feedback_suggested_action_idx on offer_feedback(suggested_action);

alter table offer_feedback enable row level security;

create table if not exists site_feedback (
  id text primary key,
  type text not null,
  message text not null,
  contact text,
  page_url text,
  status text not null default 'pending',
  reviewer_note text,
  submitter_ip text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists site_feedback_status_idx on site_feedback(status);
create index if not exists site_feedback_created_at_idx on site_feedback(created_at desc);

alter table site_feedback enable row level security;

create extension if not exists pgcrypto;

create table if not exists official_subscription_apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  provider text not null,
  app_store_id text not null,
  app_store_slug text not null,
  logo_key text,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists official_subscription_regions (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  storefront_code text not null,
  country_label text not null,
  currency_code text not null,
  enabled boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists official_subscription_plans (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references official_subscription_apps(id) on delete cascade,
  slug text not null,
  label text not null,
  billing_period text not null check (billing_period in ('monthly', 'annual', 'one_time')),
  notes text,
  aliases text[] not null default '{}'::text[],
  match_rules jsonb not null default '{}'::jsonb,
  canonical_product_id text references canonical_products(id) on delete set null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, slug)
);

create table if not exists official_subscription_collect_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'manual' check (mode in ('manual', 'cron', 'worker')),
  target_app_slug text,
  target_region_codes text[],
  status text not null check (status in ('success', 'partial_success', 'failed')),
  success_count integer not null default 0,
  failure_count integer not null default 0,
  unmatched_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  logs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists official_subscription_region_prices (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references official_subscription_apps(id) on delete cascade,
  plan_id uuid not null references official_subscription_plans(id) on delete cascade,
  region_id uuid not null references official_subscription_regions(id) on delete cascade,
  price_text text,
  price_value numeric,
  currency_code text,
  cny_price numeric,
  fx_rate_to_cny numeric,
  fx_date date,
  source_url text not null,
  evidence_source text not null default 'app_store_html' check (evidence_source in ('app_store_html', 'amp_catalog', 'manual_verified')),
  status text not null check (status in ('available', 'stale', 'missing', 'parse_failed', 'needs_review')),
  raw_title text,
  raw_snippet_hash text,
  last_success_at timestamptz,
  last_checked_at timestamptz not null default now(),
  failure_reason text,
  updated_at timestamptz not null default now(),
  unique (app_id, plan_id, region_id)
);

create table if not exists official_subscription_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references official_subscription_collect_runs(id) on delete set null,
  app_id uuid not null references official_subscription_apps(id) on delete cascade,
  plan_id uuid not null references official_subscription_plans(id) on delete cascade,
  region_id uuid not null references official_subscription_regions(id) on delete cascade,
  price_text text,
  price_value numeric,
  currency_code text,
  cny_price numeric,
  fx_rate_to_cny numeric,
  fx_date date,
  source_url text not null,
  evidence_source text not null default 'app_store_html' check (evidence_source in ('app_store_html', 'amp_catalog', 'manual_verified')),
  raw_title text,
  raw_snippet_hash text,
  fetched_at timestamptz not null,
  status text not null check (status in ('available', 'stale', 'missing', 'parse_failed', 'needs_review')),
  failure_reason text,
  created_at timestamptz not null default now()
);

create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  target_currency text not null,
  rate numeric not null,
  date date not null,
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (base_currency, target_currency, date, source)
);

create index if not exists official_subscription_apps_enabled_sort_idx
  on official_subscription_apps(enabled, sort_order);
create index if not exists official_subscription_plans_app_sort_idx
  on official_subscription_plans(app_id, enabled, sort_order);
create index if not exists official_subscription_regions_enabled_priority_idx
  on official_subscription_regions(enabled, priority);
create index if not exists official_subscription_region_prices_status_idx
  on official_subscription_region_prices(status, updated_at desc);
create index if not exists official_subscription_region_prices_plan_idx
  on official_subscription_region_prices(plan_id, status, cny_price);
create index if not exists official_subscription_price_snapshots_run_idx
  on official_subscription_price_snapshots(run_id, created_at desc);
create index if not exists official_subscription_collect_runs_finished_idx
  on official_subscription_collect_runs(finished_at desc);

drop trigger if exists official_subscription_apps_set_updated_at on official_subscription_apps;
create trigger official_subscription_apps_set_updated_at
before update on official_subscription_apps
for each row execute function set_updated_at();

drop trigger if exists official_subscription_regions_set_updated_at on official_subscription_regions;
create trigger official_subscription_regions_set_updated_at
before update on official_subscription_regions
for each row execute function set_updated_at();

drop trigger if exists official_subscription_plans_set_updated_at on official_subscription_plans;
create trigger official_subscription_plans_set_updated_at
before update on official_subscription_plans
for each row execute function set_updated_at();

drop trigger if exists official_subscription_region_prices_set_updated_at on official_subscription_region_prices;
create trigger official_subscription_region_prices_set_updated_at
before update on official_subscription_region_prices
for each row execute function set_updated_at();

alter table official_subscription_apps enable row level security;
alter table official_subscription_regions enable row level security;
alter table official_subscription_plans enable row level security;
alter table official_subscription_collect_runs enable row level security;
alter table official_subscription_region_prices enable row level security;
alter table official_subscription_price_snapshots enable row level security;
alter table fx_rates enable row level security;
create table if not exists api_model_families (
  id text primary key,
  name text not null,
  slug text not null unique,
  logo_url text,
  official_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_models (
  id text primary key,
  family_id text not null references api_model_families(id) on delete restrict,
  display_name text not null,
  model_id text not null,
  aliases text[] not null default '{}'::text[],
  context_window text,
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive', 'needs_review')),
  source_url text not null,
  source_label text not null default '公开来源',
  capabilities text[] not null default '{}'::text[],
  suitable_tools text[] not null default '{}'::text[],
  data_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_providers (
  id text primary key,
  name text not null,
  slug text not null unique,
  type text not null check (type in ('official', 'router', 'free', 'subscription')),
  billing_mode text not null,
  official_url text not null,
  pricing_url text,
  logo_url text,
  description text not null default '',
  limit_summary text not null default '',
  limitations text not null default '',
  source_label text not null default '公开来源',
  collector_kind text,
  enabled boolean not null default true,
  data_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_plans (
  id text primary key,
  provider_id text not null references api_providers(id) on delete cascade,
  name text not null,
  type text not null check (type in ('official', 'router', 'free', 'subscription')),
  price_label text not null default '',
  price_usd_monthly numeric,
  price_cny_monthly numeric,
  quota_summary text not null default '',
  reset_summary text not null default '',
  limit_summary text not null default '',
  limitations text not null default '',
  coverage_label text,
  compatibility text[] not null default '{}'::text[],
  suitable_tools text[] not null default '{}'::text[],
  source_url text not null,
  source_label text not null default '公开来源',
  enabled boolean not null default true,
  data_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_plan_models (
  plan_id text not null references api_plans(id) on delete cascade,
  model_id text not null references api_models(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, model_id)
);

create table if not exists api_model_offers (
  id text primary key,
  model_id text not null references api_models(id) on delete cascade,
  provider_id text not null references api_providers(id) on delete cascade,
  plan_id text references api_plans(id) on delete set null,
  route_model_id text,
  input_price jsonb not null default '{"kind":"text","text":"待确认"}'::jsonb,
  output_price jsonb not null default '{"kind":"text","text":"待确认"}'::jsonb,
  cache_read_price jsonb,
  cache_write_price jsonb,
  free_or_plan text not null default '',
  limit_summary text not null default '',
  limitations text not null default '',
  compatibility text[] not null default '{}'::text[],
  suitable_tools text[] not null default '{}'::text[],
  pricing_url text,
  source_label text not null default '公开来源',
  collected_at timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive', 'needs_review')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_provider_submissions (
  id text primary key,
  submitted_url text not null,
  submitted_name text,
  submitted_contact text,
  submitted_note text,
  parsed_provider_url text,
  parsed_provider_name text,
  parsed_type text,
  parse_status text not null default 'pending',
  probe_status text not null default 'pending',
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'collector_todo', 'rejected')),
  admin_note text,
  provider_id text references api_providers(id) on delete set null,
  parsed_meta jsonb not null default '{}'::jsonb,
  submitter_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_collection_runs (
  id text primary key,
  provider_id text references api_providers(id) on delete set null,
  collector_kind text,
  status text not null check (status in ('success', 'partial', 'failed')),
  model_count integer not null default 0,
  offer_count integer not null default 0,
  error_message text,
  raw_snapshot_url text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  logs jsonb not null default '{}'::jsonb
);

create index if not exists api_models_family_id_idx on api_models(family_id);
create index if not exists api_models_status_idx on api_models(status);
create index if not exists api_providers_type_idx on api_providers(type);
create index if not exists api_providers_enabled_idx on api_providers(enabled);
create index if not exists api_plans_provider_id_idx on api_plans(provider_id);
create index if not exists api_model_offers_model_id_idx on api_model_offers(model_id);
create index if not exists api_model_offers_provider_id_idx on api_model_offers(provider_id);
create index if not exists api_model_offers_status_idx on api_model_offers(status);
create index if not exists api_collection_runs_started_at_idx on api_collection_runs(started_at desc);
create index if not exists api_provider_submissions_review_status_idx on api_provider_submissions(review_status);
create index if not exists api_provider_submissions_created_at_idx on api_provider_submissions(created_at desc);

drop trigger if exists api_model_families_set_updated_at on api_model_families;
create trigger api_model_families_set_updated_at
before update on api_model_families
for each row execute function set_updated_at();

drop trigger if exists api_models_set_updated_at on api_models;
create trigger api_models_set_updated_at
before update on api_models
for each row execute function set_updated_at();

drop trigger if exists api_providers_set_updated_at on api_providers;
create trigger api_providers_set_updated_at
before update on api_providers
for each row execute function set_updated_at();

drop trigger if exists api_plans_set_updated_at on api_plans;
create trigger api_plans_set_updated_at
before update on api_plans
for each row execute function set_updated_at();

drop trigger if exists api_model_offers_set_updated_at on api_model_offers;
create trigger api_model_offers_set_updated_at
before update on api_model_offers
for each row execute function set_updated_at();

drop trigger if exists api_provider_submissions_set_updated_at on api_provider_submissions;
create trigger api_provider_submissions_set_updated_at
before update on api_provider_submissions
for each row execute function set_updated_at();

alter table api_model_families enable row level security;
alter table api_models enable row level security;
alter table api_providers enable row level security;
alter table api_plans enable row level security;
alter table api_plan_models enable row level security;
alter table api_model_offers enable row level security;
alter table api_provider_submissions enable row level security;
alter table api_collection_runs enable row level security;

create or replace function prune_priceai_operational_logs(
  p_crawl_runs_per_source integer default 5,
  p_crawl_run_failure_retention_days integer default 7,
  p_crawl_run_global_limit integer default 1000,
  p_collection_jobs_limit integer default 200,
  p_official_collect_runs_limit integer default 5,
  p_api_collect_runs_limit integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crawl_runs_per_source integer := greatest(1, least(coalesce(p_crawl_runs_per_source, 5), 50));
  v_crawl_run_failure_retention_days integer := greatest(1, least(coalesce(p_crawl_run_failure_retention_days, 7), 90));
  v_crawl_run_global_limit integer := greatest(100, least(coalesce(p_crawl_run_global_limit, 1000), 100000));
  v_collection_jobs_limit integer := greatest(30, least(coalesce(p_collection_jobs_limit, 200), 10000));
  v_official_collect_runs_limit integer := greatest(1, least(coalesce(p_official_collect_runs_limit, 5), 5000));
  v_api_collect_runs_limit integer := greatest(1, least(coalesce(p_api_collect_runs_limit, 5), 5000));
  v_crawl_success_deleted integer := 0;
  v_crawl_failure_deleted integer := 0;
  v_crawl_global_deleted integer := 0;
  v_collection_jobs_deleted integer := 0;
  v_official_snapshots_deleted integer := 0;
  v_official_runs_deleted integer := 0;
  v_api_runs_deleted integer := 0;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by coalesce(source_id, source_name, 'unknown')
        order by started_at desc nulls last, id desc
      ) as run_rank
    from crawl_runs
    where status = 'success'
  )
  delete from crawl_runs
  using ranked
  where crawl_runs.id = ranked.id
    and ranked.run_rank > v_crawl_runs_per_source;
  get diagnostics v_crawl_success_deleted = row_count;

  delete from crawl_runs
  where status <> 'success'
    and started_at < now() - make_interval(days => v_crawl_run_failure_retention_days);
  get diagnostics v_crawl_failure_deleted = row_count;

  with ranked as (
    select
      id,
      row_number() over (
        order by started_at desc nulls last, id desc
      ) as global_rank
    from crawl_runs
  )
  delete from crawl_runs
  using ranked
  where crawl_runs.id = ranked.id
    and ranked.global_rank > v_crawl_run_global_limit;
  get diagnostics v_crawl_global_deleted = row_count;

  with ranked as (
    select
      id,
      row_number() over (
        order by created_at desc nulls last, id desc
      ) as job_rank
    from collection_jobs
    where status in ('success', 'failed', 'cancelled')
  )
  delete from collection_jobs
  using ranked
  where collection_jobs.id = ranked.id
    and ranked.job_rank > v_collection_jobs_limit;
  get diagnostics v_collection_jobs_deleted = row_count;

  with stale_runs as (
    select id
    from (
      select
        id,
        row_number() over (
          order by finished_at desc nulls last, created_at desc nulls last, id desc
        ) as run_rank
      from official_subscription_collect_runs
    ) ranked
    where run_rank > v_official_collect_runs_limit
  )
  delete from official_subscription_price_snapshots
  using stale_runs
  where official_subscription_price_snapshots.run_id = stale_runs.id;
  get diagnostics v_official_snapshots_deleted = row_count;

  with stale_runs as (
    select id
    from (
      select
        id,
        row_number() over (
          order by finished_at desc nulls last, created_at desc nulls last, id desc
        ) as run_rank
      from official_subscription_collect_runs
    ) ranked
    where run_rank > v_official_collect_runs_limit
  )
  delete from official_subscription_collect_runs
  using stale_runs
  where official_subscription_collect_runs.id = stale_runs.id;
  get diagnostics v_official_runs_deleted = row_count;

  with ranked as (
    select
      id,
      row_number() over (
        order by started_at desc nulls last, id desc
      ) as run_rank
    from api_collection_runs
  )
  delete from api_collection_runs
  using ranked
  where api_collection_runs.id = ranked.id
    and ranked.run_rank > v_api_collect_runs_limit;
  get diagnostics v_api_runs_deleted = row_count;

  return jsonb_build_object(
    'crawlRunsDeleted',
      v_crawl_success_deleted + v_crawl_failure_deleted + v_crawl_global_deleted,
    'crawlSuccessRunsDeleted', v_crawl_success_deleted,
    'crawlFailureRunsDeleted', v_crawl_failure_deleted,
    'crawlGlobalCapDeleted', v_crawl_global_deleted,
    'collectionJobsDeleted', v_collection_jobs_deleted,
    'officialSnapshotsDeleted', v_official_snapshots_deleted,
    'officialRunsDeleted', v_official_runs_deleted,
    'apiRunsDeleted', v_api_runs_deleted,
    'settings', jsonb_build_object(
      'crawlRunsPerSource', v_crawl_runs_per_source,
      'crawlRunFailureRetentionDays', v_crawl_run_failure_retention_days,
      'crawlRunGlobalLimit', v_crawl_run_global_limit,
      'collectionJobsLimit', v_collection_jobs_limit,
      'officialCollectRunsLimit', v_official_collect_runs_limit,
      'apiCollectRunsLimit', v_api_collect_runs_limit
    )
  );
end;
$$;

revoke execute on function prune_priceai_operational_logs(
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function prune_priceai_operational_logs(
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) to service_role;
