create or replace function public.prune_api_transit_detection_run_retention(
  p_payload_retention_days integer default 14,
  p_run_retention_days integer default 30,
  p_batch_size integer default 5000,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload_retention_days integer := greatest(7, least(coalesce(p_payload_retention_days, 14), 90));
  v_run_retention_days integer := greatest(v_payload_retention_days, least(coalesce(p_run_retention_days, 30), 365));
  v_batch_size integer := greatest(100, least(coalesce(p_batch_size, 5000), 20000));
  v_payload_cutoff timestamptz := now() - make_interval(days => v_payload_retention_days);
  v_run_cutoff timestamptz := now() - make_interval(days => v_run_retention_days);
  v_payload_candidates bigint := 0;
  v_run_candidates bigint := 0;
  v_blocked_run_candidates bigint := 0;
  v_payload_candidate_bytes bigint := 0;
  v_payload_cleared bigint := 0;
  v_runs_deleted bigint := 0;
  v_oldest_payload_candidate timestamptz;
  v_oldest_run_candidate timestamptz;
begin
  select
    count(*)::bigint,
    coalesce(sum(pg_column_size(raw_snapshot) + pg_column_size(logs)), 0)::bigint,
    min(started_at)
  into
    v_payload_candidates,
    v_payload_candidate_bytes,
    v_oldest_payload_candidate
  from public.api_transit_detection_runs
  where started_at < v_payload_cutoff
    and (raw_snapshot <> '{}'::jsonb or logs <> '{}'::jsonb);

  select
    count(*) filter (
      where not exists (
        select 1
        from public.api_transit_availability_samples as samples
        where samples.run_id = runs.id
      )
    )::bigint,
    count(*) filter (
      where exists (
        select 1
        from public.api_transit_availability_samples as samples
        where samples.run_id = runs.id
      )
    )::bigint,
    min(started_at)
  into
    v_run_candidates,
    v_blocked_run_candidates,
    v_oldest_run_candidate
  from public.api_transit_detection_runs as runs
  where started_at < v_run_cutoff;

  if coalesce(p_dry_run, true) then
    return jsonb_build_object(
      'dryRun', true,
      'payloadCandidates', v_payload_candidates,
      'payloadCandidateBytes', v_payload_candidate_bytes,
      'runCandidates', v_run_candidates,
      'blockedRunCandidates', v_blocked_run_candidates,
      'oldestPayloadCandidate', v_oldest_payload_candidate,
      'oldestRunCandidate', v_oldest_run_candidate,
      'settings', jsonb_build_object(
        'payloadRetentionDays', v_payload_retention_days,
        'runRetentionDays', v_run_retention_days,
        'batchSize', v_batch_size,
        'payloadCutoff', v_payload_cutoff,
        'runCutoff', v_run_cutoff
      )
    );
  end if;

  with stale as (
    select id
    from public.api_transit_detection_runs
    where started_at < v_payload_cutoff
      and (raw_snapshot <> '{}'::jsonb or logs <> '{}'::jsonb)
    order by started_at, id
    limit v_batch_size
    for update skip locked
  ), cleared as (
    update public.api_transit_detection_runs as runs
    set
      raw_snapshot = '{}'::jsonb,
      logs = '{}'::jsonb
    from stale
    where runs.id = stale.id
    returning 1
  )
  select count(*)::bigint into v_payload_cleared from cleared;

  with stale as (
    select runs.id
    from public.api_transit_detection_runs as runs
    where runs.started_at < v_run_cutoff
      and not exists (
        select 1
        from public.api_transit_availability_samples as samples
        where samples.run_id = runs.id
      )
    order by runs.started_at, runs.id
    limit v_batch_size
    for update skip locked
  ), deleted as (
    delete from public.api_transit_detection_runs as runs
    using stale
    where runs.id = stale.id
    returning 1
  )
  select count(*)::bigint into v_runs_deleted from deleted;

  return jsonb_build_object(
    'dryRun', false,
    'payloadCleared', v_payload_cleared,
    'runsDeleted', v_runs_deleted,
    'payloadCandidatesBeforeBatch', v_payload_candidates,
    'payloadCandidatesAfterBatch', greatest(v_payload_candidates - v_payload_cleared, 0),
    'runCandidatesBeforeBatch', v_run_candidates,
    'runCandidatesAfterBatch', greatest(v_run_candidates - v_runs_deleted, 0),
    'blockedRunCandidates', v_blocked_run_candidates,
    'settings', jsonb_build_object(
      'payloadRetentionDays', v_payload_retention_days,
      'runRetentionDays', v_run_retention_days,
      'batchSize', v_batch_size,
      'payloadCutoff', v_payload_cutoff,
      'runCutoff', v_run_cutoff
    )
  );
end;
$$;

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

create or replace function public.get_priceai_infrastructure_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with table_stats as (
    select relname, n_live_tup::bigint as estimated_rows
    from pg_stat_user_tables
    where schemaname = 'public'
      and relname in (
        'api_transit_availability_samples',
        'api_transit_availability_hourly_rollups',
        'api_transit_availability_daily_rollups',
        'api_transit_detection_runs',
        'raw_offers',
        'raw_offer_confirmations'
      )
  ), covering_index as (
    select
      pg_relation_size(indexrelid)::bigint as size_bytes,
      coalesce(idx_scan, 0)::bigint as scan_count,
      coalesce(idx_tup_read, 0)::bigint as tuple_read_count,
      coalesce(idx_tup_fetch, 0)::bigint as tuple_fetch_count
    from pg_stat_user_indexes
    where schemaname = 'public'
      and indexrelname = 'api_transit_availability_samples_checked_time_idx'
    limit 1
  ), availability_bounds as (
    select min(checked_at) as oldest_at, max(checked_at) as latest_at
    from public.api_transit_availability_samples
  ), hourly_bounds as (
    select min(bucket_start) as oldest_at, max(bucket_start) as latest_at
    from public.api_transit_availability_hourly_rollups
  ), daily_bounds as (
    select min(bucket_start) as oldest_at, max(bucket_start) as latest_at
    from public.api_transit_availability_daily_rollups
  ), detection_bounds as (
    select min(started_at) as oldest_at, max(started_at) as latest_at
    from public.api_transit_detection_runs
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'databaseSizeBytes', pg_database_size(current_database())::bigint,
    'tables', jsonb_build_object(
      'availabilityRaw', jsonb_build_object(
        'estimatedRows', coalesce((select estimated_rows from table_stats where relname = 'api_transit_availability_samples'), 0),
        'totalBytes', pg_total_relation_size('public.api_transit_availability_samples'::regclass)::bigint,
        'retentionCandidates', (
          select count(*)::bigint
          from public.api_transit_availability_samples
          where checked_at < date_bin(interval '1 hour', now() - interval '8 days', '2000-01-01 00:00:00+00'::timestamptz)
        ),
        'oldestAt', (select oldest_at from availability_bounds),
        'latestAt', (select latest_at from availability_bounds),
        'retentionDays', 8
      ),
      'availabilityHourly', jsonb_build_object(
        'estimatedRows', coalesce((select estimated_rows from table_stats where relname = 'api_transit_availability_hourly_rollups'), 0),
        'totalBytes', pg_total_relation_size('public.api_transit_availability_hourly_rollups'::regclass)::bigint,
        'oldestAt', (select oldest_at from hourly_bounds),
        'latestAt', (select latest_at from hourly_bounds),
        'retentionDays', 90
      ),
      'availabilityDaily', jsonb_build_object(
        'estimatedRows', coalesce((select estimated_rows from table_stats where relname = 'api_transit_availability_daily_rollups'), 0),
        'totalBytes', pg_total_relation_size('public.api_transit_availability_daily_rollups'::regclass)::bigint,
        'oldestAt', (select oldest_at from daily_bounds),
        'latestAt', (select latest_at from daily_bounds),
        'retentionDays', 365
      ),
      'detectionRuns', jsonb_build_object(
        'estimatedRows', coalesce((select estimated_rows from table_stats where relname = 'api_transit_detection_runs'), 0),
        'totalBytes', pg_total_relation_size('public.api_transit_detection_runs'::regclass)::bigint,
        'payloadRetentionCandidates', (
          select count(*)::bigint
          from public.api_transit_detection_runs
          where started_at < now() - interval '14 days'
            and (raw_snapshot <> '{}'::jsonb or logs <> '{}'::jsonb)
        ),
        'payloadCandidateBytes', (
          select coalesce(sum(pg_column_size(raw_snapshot) + pg_column_size(logs)), 0)::bigint
          from public.api_transit_detection_runs
          where started_at < now() - interval '14 days'
            and (raw_snapshot <> '{}'::jsonb or logs <> '{}'::jsonb)
        ),
        'runRetentionCandidates', (
          select count(*)::bigint
          from public.api_transit_detection_runs as runs
          where runs.started_at < now() - interval '30 days'
            and not exists (
              select 1
              from public.api_transit_availability_samples as samples
              where samples.run_id = runs.id
            )
        ),
        'blockedRunCandidates', (
          select count(*)::bigint
          from public.api_transit_detection_runs as runs
          where runs.started_at < now() - interval '30 days'
            and exists (
              select 1
              from public.api_transit_availability_samples as samples
              where samples.run_id = runs.id
            )
        ),
        'oldestAt', (select oldest_at from detection_bounds),
        'latestAt', (select latest_at from detection_bounds),
        'payloadRetentionDays', 14,
        'runRetentionDays', 30
      ),
      'rawOffers', jsonb_build_object(
        'estimatedRows', coalesce((select estimated_rows from table_stats where relname = 'raw_offers'), 0),
        'totalBytes', pg_total_relation_size('public.raw_offers'::regclass)::bigint
      ),
      'rawOfferConfirmations', jsonb_build_object(
        'estimatedRows', coalesce((select estimated_rows from table_stats where relname = 'raw_offer_confirmations'), 0),
        'totalBytes', pg_total_relation_size('public.raw_offer_confirmations'::regclass)::bigint
      )
    ),
    'coveringIndex', jsonb_build_object(
      'name', 'api_transit_availability_samples_checked_time_idx',
      'sizeBytes', coalesce((select size_bytes from covering_index), 0),
      'scanCount', coalesce((select scan_count from covering_index), 0),
      'tupleReadCount', coalesce((select tuple_read_count from covering_index), 0),
      'tupleFetchCount', coalesce((select tuple_fetch_count from covering_index), 0),
      'decision', 'keep',
      'reason', 'The public recent-sample query depends on this checked_at-first covering index; rollups do not replace the latest raw-sample lookup.'
    ),
    'retention', jsonb_build_object(
      'availabilityRawDays', 8,
      'availabilityHourlyDays', 90,
      'availabilityDailyDays', 365,
      'detectionPayloadDays', 14,
      'detectionRunDays', 30,
      'defaultDryRun', true,
      'defaultBatchSize', 5000
    )
  );
$$;

revoke execute on function public.prune_api_transit_detection_run_retention(integer, integer, integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.prune_api_transit_retention(integer, boolean)
  from public, anon, authenticated;
revoke execute on function public.get_priceai_infrastructure_snapshot()
  from public, anon, authenticated;

grant execute on function public.prune_api_transit_detection_run_retention(integer, integer, integer, boolean)
  to service_role;
grant execute on function public.prune_api_transit_retention(integer, boolean)
  to service_role;
grant execute on function public.get_priceai_infrastructure_snapshot()
  to service_role;

comment on function public.prune_api_transit_detection_run_retention(integer, integer, integer, boolean) is
  'Previews retention by default. Apply mode clears large detection payloads after 14 days and deletes one bounded run batch after 30 days only when no availability samples still reference the run.';
comment on function public.prune_api_transit_retention(integer, boolean) is
  'Unified API transit retention entry point. It keeps availability at 8/90/365 days and detection payload/run metadata at 14/30 days, with dry-run enabled by default.';
comment on function public.get_priceai_infrastructure_snapshot() is
  'Service-role-only infrastructure snapshot for the PriceAI admin workflow. It reports capacity, retention candidates, rollup bounds, and covering-index usage without mutating data.';
