create or replace function claim_collection_job_by_id(
  p_job_id text,
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
  where id = p_job_id
    and (
      status = 'pending'
      or (
        status = 'running'
        and locked_until is not null
        and locked_until < v_now
        and attempts < max_attempts
      )
    )
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

alter function claim_collection_job_by_id(text, text, integer) set search_path = public;

revoke execute on function claim_collection_job_by_id(text, text, integer) from anon, authenticated, public;
grant execute on function claim_collection_job_by_id(text, text, integer) to service_role;
