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
  job_type text not null check (job_type in ('all', 'source', 'official_prices')),
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

create index if not exists raw_offers_canonical_product_id_idx on raw_offers(canonical_product_id);
create index if not exists raw_offers_source_id_idx on raw_offers(source_id);
create index if not exists raw_offers_status_idx on raw_offers(status);
create index if not exists raw_offers_effective_status_idx on raw_offers(effective_status);
create index if not exists raw_offers_verified_at_idx on raw_offers(verified_at desc);
create index if not exists raw_offers_expires_at_idx on raw_offers(expires_at);
create index if not exists raw_offers_hidden_idx on raw_offers(hidden);
create index if not exists sources_health_status_idx on sources(health_status);
create index if not exists sources_last_checked_at_idx on sources(last_checked_at desc);
create index if not exists sources_collector_kind_idx on sources(collector_kind);
create index if not exists sources_collector_lock_until_idx on sources(collector_lock_until);
create index if not exists crawl_runs_started_at_idx on crawl_runs(started_at desc);
create index if not exists collection_jobs_status_created_at_idx on collection_jobs(status, created_at desc);
create index if not exists collection_jobs_source_status_idx on collection_jobs(source_id, status);
create index if not exists collection_jobs_locked_until_idx on collection_jobs(locked_until);

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

-- Default-deny RLS. The Next.js app talks to Supabase via the service role key
-- (server-only), which bypasses RLS. The anon key cannot read or write.
alter table canonical_products enable row level security;
alter table sources enable row level security;
alter table raw_offers enable row level security;
alter table offer_matches enable row level security;
alter table crawl_runs enable row level security;
alter table collection_jobs enable row level security;

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
  reason text not null,
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
  submitted_note text,
  parsed_provider_url text,
  parsed_provider_name text,
  parsed_type text,
  parse_status text not null default 'pending',
  probe_status text not null default 'pending',
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'collector_todo', 'rejected')),
  admin_note text,
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
