create table if not exists public.external_api_daily_usage (
  usage_date date not null,
  service text not null,
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (usage_date, service)
);

alter table public.external_api_daily_usage enable row level security;

drop trigger if exists external_api_daily_usage_set_updated_at on public.external_api_daily_usage;
create trigger external_api_daily_usage_set_updated_at
before update on public.external_api_daily_usage
for each row execute function public.set_updated_at();

create or replace function public.claim_external_api_daily_budget(
  p_service text,
  p_daily_limit integer,
  p_units integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service text := lower(trim(coalesce(p_service, '')));
  v_limit integer := greatest(1, least(coalesce(p_daily_limit, 1), 100000));
  v_units integer := greatest(1, least(coalesce(p_units, 1), 1000));
  v_used integer := 0;
  v_date date := (now() at time zone 'UTC')::date;
begin
  if v_service = '' or v_service !~ '^[a-z0-9][a-z0-9._-]{0,63}$' then
    raise exception 'invalid external api service';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_service || ':' || v_date::text, 0));

  select usage_count into v_used
  from public.external_api_daily_usage
  where usage_date = v_date and service = v_service;
  v_used := coalesce(v_used, 0);

  if v_used + v_units > v_limit then
    return jsonb_build_object(
      'allowed', false,
      'service', v_service,
      'date', v_date,
      'used', v_used,
      'limit', v_limit,
      'remaining', greatest(0, v_limit - v_used)
    );
  end if;

  insert into public.external_api_daily_usage (usage_date, service, usage_count, last_used_at)
  values (v_date, v_service, v_units, now())
  on conflict (usage_date, service) do update
  set usage_count = public.external_api_daily_usage.usage_count + excluded.usage_count,
      last_used_at = excluded.last_used_at,
      updated_at = now()
  returning usage_count into v_used;

  return jsonb_build_object(
    'allowed', true,
    'service', v_service,
    'date', v_date,
    'used', v_used,
    'limit', v_limit,
    'remaining', greatest(0, v_limit - v_used)
  );
end;
$$;

revoke all on function public.claim_external_api_daily_budget(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.claim_external_api_daily_budget(text, integer, integer)
to service_role;

create or replace function public.prune_api_transit_retention(
  p_batch_size integer default 5000,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not pg_try_advisory_xact_lock(hashtextextended('priceai:api-transit-retention', 0)) then
    return jsonb_build_object('dryRun', coalesce(p_dry_run, true), 'skipped', 'lease_busy');
  end if;

  return jsonb_build_object(
    'dryRun', coalesce(p_dry_run, true),
    'availability', public.prune_api_transit_availability_retention(
      8,
      90,
      365,
      p_batch_size,
      p_dry_run
    ),
    'detectionRuns', public.prune_api_transit_detection_run_retention(
      14,
      30,
      p_batch_size,
      p_dry_run
    )
  );
end;
$$;

revoke all on function public.prune_api_transit_retention(integer, boolean)
from public, anon, authenticated;
grant execute on function public.prune_api_transit_retention(integer, boolean)
to service_role;

comment on function public.claim_external_api_daily_budget(text, integer, integer) is
  'Atomically reserves bounded daily units for a named third-party API. Service role only.';
comment on function public.prune_api_transit_retention(integer, boolean) is
  'Unified, service-role-only API transit retention entry point with a transaction advisory lock. Dry-run remains the default.';
