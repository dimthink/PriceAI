alter table sources add column if not exists runtime_region text not null default 'default';

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

select prune_priceai_operational_logs();
