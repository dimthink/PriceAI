alter table public.transit_detector_jobs
  add column if not exists idempotency_key text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists attempt_count integer not null default 0;

alter table public.transit_detector_jobs
  drop constraint if exists transit_detector_jobs_status_check;

alter table public.transit_detector_jobs
  add constraint transit_detector_jobs_status_check
  check (status in ('queued', 'running', 'done', 'error', 'timed_out'));

create unique index if not exists transit_detector_jobs_user_idempotency_idx
  on public.transit_detector_jobs(user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists transit_detector_jobs_active_lease_idx
  on public.transit_detector_jobs(user_id, lease_expires_at)
  where status in ('queued', 'running');

create or replace function public.claim_transit_detector_job(
  p_id text,
  p_user_id uuid,
  p_user_email text,
  p_protocol text,
  p_base_url text,
  p_target_model text,
  p_intensity text,
  p_include_long_context boolean,
  p_upstream_type text,
  p_idempotency_key text,
  p_daily_limit integer,
  p_active_limit integer,
  p_lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.transit_detector_jobs%rowtype;
  v_recent_count integer := 0;
  v_active_count integer := 0;
  v_now timestamptz := now();
  v_lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 900), 3600));
begin
  if p_user_id is null or nullif(trim(p_id), '') is null or nullif(trim(p_idempotency_key), '') is null then
    raise exception 'invalid detector job claim';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
  into v_existing
  from public.transit_detector_jobs
  where user_id = p_user_id
    and idempotency_key = p_idempotency_key
  limit 1;

  if found then
    return jsonb_build_object(
      'outcome', 'existing',
      'jobId', v_existing.id,
      'status', v_existing.status
    );
  end if;

  update public.transit_detector_jobs
  set status = 'timed_out',
      error_message = coalesce(error_message, '检测任务超过等待时间，已自动释放名额。'),
      completed_at = v_now,
      lease_expires_at = null,
      updated_at = v_now
  where user_id = p_user_id
    and status in ('queued', 'running')
    and coalesce(lease_expires_at, updated_at + interval '30 minutes') < v_now;

  select count(*)::integer
  into v_recent_count
  from public.transit_detector_jobs
  where user_id = p_user_id
    and submitted_at >= v_now - interval '24 hours';

  if v_recent_count >= greatest(1, least(coalesce(p_daily_limit, 8), 100)) then
    return jsonb_build_object(
      'outcome', 'quota_exceeded',
      'recentCount', v_recent_count,
      'activeCount', 0
    );
  end if;

  select count(*)::integer
  into v_active_count
  from public.transit_detector_jobs
  where user_id = p_user_id
    and status in ('queued', 'running');

  if v_active_count >= greatest(1, least(coalesce(p_active_limit, 2), 20)) then
    return jsonb_build_object(
      'outcome', 'active_limit',
      'recentCount', v_recent_count,
      'activeCount', v_active_count
    );
  end if;

  insert into public.transit_detector_jobs (
    id,
    user_id,
    user_email,
    protocol,
    base_url,
    target_model,
    intensity,
    include_long_context,
    upstream_type,
    status,
    idempotency_key,
    lease_expires_at,
    last_heartbeat_at,
    attempt_count
  ) values (
    p_id,
    p_user_id,
    p_user_email,
    p_protocol,
    p_base_url,
    p_target_model,
    p_intensity,
    coalesce(p_include_long_context, false),
    p_upstream_type,
    'queued',
    p_idempotency_key,
    v_now + make_interval(secs => v_lease_seconds),
    v_now,
    1
  );

  return jsonb_build_object(
    'outcome', 'created',
    'jobId', p_id,
    'status', 'queued',
    'recentCount', v_recent_count + 1,
    'activeCount', v_active_count + 1
  );
end;
$$;

revoke all on function public.claim_transit_detector_job(
  text, uuid, text, text, text, text, text, boolean, text, text, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.claim_transit_detector_job(
  text, uuid, text, text, text, text, text, boolean, text, text, integer, integer, integer
) to service_role;

drop policy if exists public_user_profiles_select_own on public.public_user_profiles;
create policy public_user_profiles_select_own
  on public.public_user_profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists offer_feedback_select_own on public.offer_feedback;
create policy offer_feedback_select_own
  on public.offer_feedback for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists feedback_followups_select_own on public.feedback_followups;
create policy feedback_followups_select_own
  on public.feedback_followups for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists transit_detector_jobs_select_own on public.transit_detector_jobs;
create policy transit_detector_jobs_select_own
  on public.transit_detector_jobs for select to authenticated
  using (auth.uid() = user_id);

comment on function public.claim_transit_detector_job(
  text, uuid, text, text, text, text, text, boolean, text, text, integer, integer, integer
) is 'Atomically reaps expired user detector jobs, enforces daily and active limits, and creates or resumes an idempotent detector job. Service role only.';
