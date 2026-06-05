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
