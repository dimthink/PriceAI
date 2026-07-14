create table if not exists public.api_transit_availability_hourly_rollups (
  bucket_start timestamptz not null,
  station_id text not null references public.api_transit_stations(id) on delete cascade,
  scope text not null check (scope in ('station', 'offer')),
  standard_model text not null default '',
  group_name text not null default '',
  source_type text not null default 'unknown' check (
    source_type in (
      'priceai_probe',
      'public_status',
      'public_model_catalog',
      'partner_api',
      'merchant_reported',
      'manual_snapshot',
      'unknown'
    )
  ),
  sample_count bigint not null check (sample_count >= 0),
  success_count bigint not null check (success_count >= 0 and success_count <= sample_count),
  latency_sample_count bigint not null default 0 check (latency_sample_count >= 0),
  latency_sum_ms bigint not null default 0 check (latency_sum_ms >= 0),
  latency_min_ms integer,
  latency_max_ms integer,
  ping_sample_count bigint not null default 0 check (ping_sample_count >= 0),
  ping_sum_ms bigint not null default 0 check (ping_sum_ms >= 0),
  ping_min_ms integer,
  ping_max_ms integer,
  first_checked_at timestamptz not null,
  last_checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_start, station_id, scope, standard_model, group_name, source_type)
);

create index if not exists api_transit_availability_hourly_station_time_idx
  on public.api_transit_availability_hourly_rollups(station_id, bucket_start desc);

create table if not exists public.api_transit_availability_daily_rollups (
  bucket_start timestamptz not null,
  station_id text not null references public.api_transit_stations(id) on delete cascade,
  scope text not null check (scope in ('station', 'offer')),
  standard_model text not null default '',
  group_name text not null default '',
  source_type text not null default 'unknown' check (
    source_type in (
      'priceai_probe',
      'public_status',
      'public_model_catalog',
      'partner_api',
      'merchant_reported',
      'manual_snapshot',
      'unknown'
    )
  ),
  sample_count bigint not null check (sample_count >= 0),
  success_count bigint not null check (success_count >= 0 and success_count <= sample_count),
  latency_sample_count bigint not null default 0 check (latency_sample_count >= 0),
  latency_sum_ms bigint not null default 0 check (latency_sum_ms >= 0),
  latency_min_ms integer,
  latency_max_ms integer,
  ping_sample_count bigint not null default 0 check (ping_sample_count >= 0),
  ping_sum_ms bigint not null default 0 check (ping_sum_ms >= 0),
  ping_min_ms integer,
  ping_max_ms integer,
  first_checked_at timestamptz not null,
  last_checked_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (bucket_start, station_id, scope, standard_model, group_name, source_type)
);

create index if not exists api_transit_availability_daily_station_time_idx
  on public.api_transit_availability_daily_rollups(station_id, bucket_start desc);

alter table public.api_transit_availability_hourly_rollups enable row level security;
alter table public.api_transit_availability_daily_rollups enable row level security;

revoke all on table public.api_transit_availability_hourly_rollups from public, anon, authenticated;
revoke all on table public.api_transit_availability_daily_rollups from public, anon, authenticated;

grant select, insert, update, delete on table public.api_transit_availability_hourly_rollups to service_role;
grant select, insert, update, delete on table public.api_transit_availability_daily_rollups to service_role;

create or replace function public.refresh_api_transit_availability_rollups(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin constant timestamptz := '2000-01-01 00:00:00+00'::timestamptz;
  v_requested_to timestamptz := least(coalesce(p_to, now()), now());
  v_requested_from timestamptz := coalesce(p_from, v_requested_to - interval '8 days');
  v_from timestamptz;
  v_to timestamptz;
  v_daily_from timestamptz;
  v_hourly_upserted bigint := 0;
  v_daily_upserted bigint := 0;
begin
  if v_requested_to <= v_requested_from then
    raise exception 'rollup end must be later than rollup start';
  end if;

  v_requested_from := greatest(v_requested_from, v_requested_to - interval '31 days');
  v_from := date_bin(interval '1 hour', v_requested_from, v_origin);
  v_to := date_bin(interval '1 hour', v_requested_to, v_origin);

  if v_to <= v_from then
    return jsonb_build_object(
      'hourlyUpserted', 0,
      'dailyUpserted', 0,
      'from', v_from,
      'to', v_to,
      'message', 'No complete hourly bucket is available in the requested window.'
    );
  end if;

  insert into public.api_transit_availability_hourly_rollups (
    bucket_start,
    station_id,
    scope,
    standard_model,
    group_name,
    source_type,
    sample_count,
    success_count,
    latency_sample_count,
    latency_sum_ms,
    latency_min_ms,
    latency_max_ms,
    ping_sample_count,
    ping_sum_ms,
    ping_min_ms,
    ping_max_ms,
    first_checked_at,
    last_checked_at,
    updated_at
  )
  select
    date_bin(interval '1 hour', checked_at, v_origin) as bucket_start,
    station_id,
    scope,
    coalesce(standard_model, '') as standard_model,
    coalesce(group_name, '') as group_name,
    coalesce(source_type, 'unknown') as source_type,
    count(*)::bigint as sample_count,
    count(*) filter (where ok)::bigint as success_count,
    count(*) filter (where latency_ms is not null)::bigint as latency_sample_count,
    coalesce(sum(latency_ms::bigint) filter (where latency_ms is not null), 0)::bigint as latency_sum_ms,
    min(latency_ms) filter (where latency_ms is not null) as latency_min_ms,
    max(latency_ms) filter (where latency_ms is not null) as latency_max_ms,
    count(*) filter (where ping_latency_ms is not null)::bigint as ping_sample_count,
    coalesce(sum(ping_latency_ms::bigint) filter (where ping_latency_ms is not null), 0)::bigint as ping_sum_ms,
    min(ping_latency_ms) filter (where ping_latency_ms is not null) as ping_min_ms,
    max(ping_latency_ms) filter (where ping_latency_ms is not null) as ping_max_ms,
    min(checked_at) as first_checked_at,
    max(checked_at) as last_checked_at,
    now() as updated_at
  from public.api_transit_availability_samples
  where checked_at >= v_from
    and checked_at < v_to
  group by 1, 2, 3, 4, 5, 6
  on conflict (bucket_start, station_id, scope, standard_model, group_name, source_type)
  do update set
    sample_count = excluded.sample_count,
    success_count = excluded.success_count,
    latency_sample_count = excluded.latency_sample_count,
    latency_sum_ms = excluded.latency_sum_ms,
    latency_min_ms = excluded.latency_min_ms,
    latency_max_ms = excluded.latency_max_ms,
    ping_sample_count = excluded.ping_sample_count,
    ping_sum_ms = excluded.ping_sum_ms,
    ping_min_ms = excluded.ping_min_ms,
    ping_max_ms = excluded.ping_max_ms,
    first_checked_at = excluded.first_checked_at,
    last_checked_at = excluded.last_checked_at,
    updated_at = now();
  get diagnostics v_hourly_upserted = row_count;

  v_daily_from := date_bin(interval '1 day', v_from, v_origin);

  insert into public.api_transit_availability_daily_rollups (
    bucket_start,
    station_id,
    scope,
    standard_model,
    group_name,
    source_type,
    sample_count,
    success_count,
    latency_sample_count,
    latency_sum_ms,
    latency_min_ms,
    latency_max_ms,
    ping_sample_count,
    ping_sum_ms,
    ping_min_ms,
    ping_max_ms,
    first_checked_at,
    last_checked_at,
    updated_at
  )
  select
    date_bin(interval '1 day', bucket_start, v_origin) as bucket_start,
    station_id,
    scope,
    standard_model,
    group_name,
    source_type,
    sum(sample_count)::bigint as sample_count,
    sum(success_count)::bigint as success_count,
    sum(latency_sample_count)::bigint as latency_sample_count,
    sum(latency_sum_ms)::bigint as latency_sum_ms,
    min(latency_min_ms) as latency_min_ms,
    max(latency_max_ms) as latency_max_ms,
    sum(ping_sample_count)::bigint as ping_sample_count,
    sum(ping_sum_ms)::bigint as ping_sum_ms,
    min(ping_min_ms) as ping_min_ms,
    max(ping_max_ms) as ping_max_ms,
    min(first_checked_at) as first_checked_at,
    max(last_checked_at) as last_checked_at,
    now() as updated_at
  from public.api_transit_availability_hourly_rollups
  where bucket_start >= v_daily_from
    and bucket_start < v_to
  group by 1, 2, 3, 4, 5, 6
  on conflict (bucket_start, station_id, scope, standard_model, group_name, source_type)
  do update set
    sample_count = excluded.sample_count,
    success_count = excluded.success_count,
    latency_sample_count = excluded.latency_sample_count,
    latency_sum_ms = excluded.latency_sum_ms,
    latency_min_ms = excluded.latency_min_ms,
    latency_max_ms = excluded.latency_max_ms,
    ping_sample_count = excluded.ping_sample_count,
    ping_sum_ms = excluded.ping_sum_ms,
    ping_min_ms = excluded.ping_min_ms,
    ping_max_ms = excluded.ping_max_ms,
    first_checked_at = excluded.first_checked_at,
    last_checked_at = excluded.last_checked_at,
    updated_at = now();
  get diagnostics v_daily_upserted = row_count;

  return jsonb_build_object(
    'hourlyUpserted', v_hourly_upserted,
    'dailyUpserted', v_daily_upserted,
    'from', v_from,
    'to', v_to
  );
end;
$$;

create or replace function public.prune_api_transit_availability_retention(
  p_raw_retention_days integer default 8,
  p_hourly_retention_days integer default 90,
  p_daily_retention_days integer default 365,
  p_batch_size integer default 5000,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin constant timestamptz := '2000-01-01 00:00:00+00'::timestamptz;
  v_raw_retention_days integer := greatest(1, least(coalesce(p_raw_retention_days, 8), 30));
  v_hourly_retention_days integer := greatest(8, least(coalesce(p_hourly_retention_days, 90), 730));
  v_daily_retention_days integer := greatest(30, least(coalesce(p_daily_retention_days, 365), 3650));
  v_batch_size integer := greatest(100, least(coalesce(p_batch_size, 5000), 20000));
  v_raw_cutoff timestamptz;
  v_hourly_cutoff timestamptz;
  v_daily_cutoff timestamptz;
  v_raw_candidates bigint := 0;
  v_hourly_candidates bigint := 0;
  v_daily_candidates bigint := 0;
  v_raw_deleted bigint := 0;
  v_hourly_deleted bigint := 0;
  v_daily_deleted bigint := 0;
  v_oldest_raw_candidate timestamptz;
  v_newest_raw_candidate timestamptz;
  v_oldest_raw_deleted timestamptz;
  v_newest_raw_deleted timestamptz;
  v_missing_rollup_groups bigint := 0;
  v_batch_ids text[] := array[]::text[];
begin
  v_raw_cutoff := date_bin(
    interval '1 hour',
    now() - make_interval(days => v_raw_retention_days),
    v_origin
  );
  v_hourly_cutoff := date_bin(
    interval '1 day',
    now() - make_interval(days => v_hourly_retention_days),
    v_origin
  );
  v_daily_cutoff := date_bin(
    interval '1 day',
    now() - make_interval(days => v_daily_retention_days),
    v_origin
  );

  select
    count(*)::bigint,
    min(checked_at),
    max(checked_at)
  into
    v_raw_candidates,
    v_oldest_raw_candidate,
    v_newest_raw_candidate
  from public.api_transit_availability_samples
  where checked_at < v_raw_cutoff;

  select count(*)::bigint
  into v_hourly_candidates
  from public.api_transit_availability_hourly_rollups
  where bucket_start < v_hourly_cutoff;

  select count(*)::bigint
  into v_daily_candidates
  from public.api_transit_availability_daily_rollups
  where bucket_start < v_daily_cutoff;

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'dryRun', true,
      'rawCandidates', v_raw_candidates,
      'hourlyCandidates', v_hourly_candidates,
      'dailyCandidates', v_daily_candidates,
      'oldestRawCandidate', v_oldest_raw_candidate,
      'newestRawCandidate', v_newest_raw_candidate,
      'settings', jsonb_build_object(
        'rawRetentionDays', v_raw_retention_days,
        'hourlyRetentionDays', v_hourly_retention_days,
        'dailyRetentionDays', v_daily_retention_days,
        'batchSize', v_batch_size,
        'rawCutoff', v_raw_cutoff,
        'hourlyCutoff', v_hourly_cutoff,
        'dailyCutoff', v_daily_cutoff
      )
    );
  end if;

  select coalesce(array_agg(id order by checked_at, id), array[]::text[])
  into v_batch_ids
  from (
    select id, checked_at
    from public.api_transit_availability_samples
    where checked_at < v_raw_cutoff
    order by checked_at, id
    limit v_batch_size
    for update skip locked
  ) as batch;

  if cardinality(v_batch_ids) > 0 then
    with batch_groups as (
      select distinct
        date_bin(interval '1 hour', checked_at, v_origin) as bucket_start,
        station_id,
        scope,
        coalesce(standard_model, '') as standard_model,
        coalesce(group_name, '') as group_name,
        coalesce(source_type, 'unknown') as source_type
      from public.api_transit_availability_samples
      where id = any(v_batch_ids)
    ), raw_group_counts as (
      select
        batch_groups.bucket_start,
        batch_groups.station_id,
        batch_groups.scope,
        batch_groups.standard_model,
        batch_groups.group_name,
        batch_groups.source_type,
        count(*)::bigint as sample_count,
        min(samples.checked_at) as first_checked_at,
        max(samples.checked_at) as last_checked_at
      from batch_groups
      join public.api_transit_availability_samples as samples
        on samples.station_id = batch_groups.station_id
       and samples.scope = batch_groups.scope
       and coalesce(samples.standard_model, '') = batch_groups.standard_model
       and coalesce(samples.group_name, '') = batch_groups.group_name
       and coalesce(samples.source_type, 'unknown') = batch_groups.source_type
       and samples.checked_at >= batch_groups.bucket_start
       and samples.checked_at < batch_groups.bucket_start + interval '1 hour'
      group by 1, 2, 3, 4, 5, 6
    )
    select count(*)::bigint
    into v_missing_rollup_groups
    from raw_group_counts
    left join public.api_transit_availability_hourly_rollups as rollup
      using (bucket_start, station_id, scope, standard_model, group_name, source_type)
    where rollup.bucket_start is null
      or rollup.sample_count < raw_group_counts.sample_count
      or rollup.first_checked_at > raw_group_counts.first_checked_at
      or rollup.last_checked_at < raw_group_counts.last_checked_at;

    if v_missing_rollup_groups > 0 then
      raise exception 'refusing raw availability deletion: % hourly rollup group(s) are missing or incomplete', v_missing_rollup_groups;
    end if;

    with deleted as (
      delete from public.api_transit_availability_samples
      where id = any(v_batch_ids)
      returning checked_at
    )
    select
      count(*)::bigint,
      min(checked_at),
      max(checked_at)
    into
      v_raw_deleted,
      v_oldest_raw_deleted,
      v_newest_raw_deleted
    from deleted;
  end if;

  with stale as (
    select ctid
    from public.api_transit_availability_hourly_rollups
    where bucket_start < v_hourly_cutoff
    order by bucket_start
    limit v_batch_size
    for update skip locked
  ), deleted as (
    delete from public.api_transit_availability_hourly_rollups as rollup
    using stale
    where rollup.ctid = stale.ctid
    returning 1
  )
  select count(*)::bigint into v_hourly_deleted from deleted;

  with stale as (
    select ctid
    from public.api_transit_availability_daily_rollups
    where bucket_start < v_daily_cutoff
    order by bucket_start
    limit v_batch_size
    for update skip locked
  ), deleted as (
    delete from public.api_transit_availability_daily_rollups as rollup
    using stale
    where rollup.ctid = stale.ctid
    returning 1
  )
  select count(*)::bigint into v_daily_deleted from deleted;

  return jsonb_build_object(
    'dryRun', false,
    'rawDeleted', v_raw_deleted,
    'hourlyDeleted', v_hourly_deleted,
    'dailyDeleted', v_daily_deleted,
    'rawCandidatesBeforeBatch', v_raw_candidates,
    'rawCandidatesAfterBatch', greatest(v_raw_candidates - v_raw_deleted, 0),
    'oldestRawDeleted', v_oldest_raw_deleted,
    'newestRawDeleted', v_newest_raw_deleted,
    'settings', jsonb_build_object(
      'rawRetentionDays', v_raw_retention_days,
      'hourlyRetentionDays', v_hourly_retention_days,
      'dailyRetentionDays', v_daily_retention_days,
      'batchSize', v_batch_size,
      'rawCutoff', v_raw_cutoff,
      'hourlyCutoff', v_hourly_cutoff,
      'dailyCutoff', v_daily_cutoff
    )
  );
end;
$$;

revoke execute on function public.refresh_api_transit_availability_rollups(timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.prune_api_transit_availability_retention(integer, integer, integer, integer, boolean)
  from public, anon, authenticated;

grant execute on function public.refresh_api_transit_availability_rollups(timestamptz, timestamptz)
  to service_role;
grant execute on function public.prune_api_transit_availability_retention(integer, integer, integer, integer, boolean)
  to service_role;

comment on table public.api_transit_availability_hourly_rollups is
  'Hourly API transit availability summaries. Empty standard_model/group_name represent aggregate scopes.';
comment on table public.api_transit_availability_daily_rollups is
  'Daily API transit availability summaries derived from hourly rollups.';
comment on function public.refresh_api_transit_availability_rollups(timestamptz, timestamptz) is
  'Rebuilds complete hourly buckets from raw samples and derives daily rollups. It does not delete raw data.';
comment on function public.prune_api_transit_availability_retention(integer, integer, integer, integer, boolean) is
  'Previews retention by default. Apply mode deletes one bounded batch and refuses raw deletion without complete hourly rollup coverage.';
