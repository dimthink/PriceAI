create table if not exists public.runtime_leases (
  lease_key text primary key,
  owner text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists runtime_leases_expires_at_idx
  on public.runtime_leases(expires_at);

alter table public.runtime_leases enable row level security;

create or replace function public.claim_runtime_lease(
  p_lease_key text,
  p_owner text,
  p_lease_seconds integer default 1800,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 1800), 7200)));
  v_row public.runtime_leases%rowtype;
begin
  if nullif(trim(p_lease_key), '') is null or nullif(trim(p_owner), '') is null then
    raise exception 'runtime lease key and owner are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_lease_key), 0));

  insert into public.runtime_leases (lease_key, owner, acquired_at, expires_at, heartbeat_at, metadata)
  values (trim(p_lease_key), trim(p_owner), v_now, v_expires_at, v_now, coalesce(p_metadata, '{}'::jsonb))
  on conflict (lease_key) do update
  set owner = excluded.owner,
      acquired_at = case
        when public.runtime_leases.owner = excluded.owner then public.runtime_leases.acquired_at
        else excluded.acquired_at
      end,
      expires_at = excluded.expires_at,
      heartbeat_at = excluded.heartbeat_at,
      metadata = excluded.metadata
  where public.runtime_leases.expires_at <= v_now
     or public.runtime_leases.owner = excluded.owner;

  select * into v_row
  from public.runtime_leases
  where lease_key = trim(p_lease_key);

  return jsonb_build_object(
    'acquired', v_row.owner = trim(p_owner),
    'leaseKey', v_row.lease_key,
    'owner', v_row.owner,
    'expiresAt', v_row.expires_at,
    'heartbeatAt', v_row.heartbeat_at
  );
end;
$$;

create or replace function public.release_runtime_lease(
  p_lease_key text,
  p_owner text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.runtime_leases
  where lease_key = trim(p_lease_key)
    and owner = trim(p_owner);
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.claim_runtime_lease(text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.release_runtime_lease(text, text) from public, anon, authenticated;
grant execute on function public.claim_runtime_lease(text, text, integer, jsonb) to service_role;
grant execute on function public.release_runtime_lease(text, text) to service_role;

comment on table public.runtime_leases is
  'Cross-runtime leases shared by VPS timers, GitHub Actions, Workers cron routes, and manual recovery runs.';


create or replace function public.renew_runtime_lease(
  p_lease_key text,
  p_owner text,
  p_lease_seconds integer default 1800
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 1800), 7200)));
  v_row public.runtime_leases%rowtype;
  v_renewed boolean := false;
begin
  if nullif(trim(p_lease_key), '') is null or nullif(trim(p_owner), '') is null then
    raise exception 'runtime lease key and owner are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_lease_key), 0));

  update public.runtime_leases
  set expires_at = v_expires_at,
      heartbeat_at = v_now
  where lease_key = trim(p_lease_key)
    and owner = trim(p_owner)
    and expires_at > v_now
  returning * into v_row;

  v_renewed := found;

  if not v_renewed then
    select * into v_row
    from public.runtime_leases
    where lease_key = trim(p_lease_key);
  end if;

  return jsonb_build_object(
    'renewed', v_renewed,
    'leaseKey', trim(p_lease_key),
    'owner', coalesce(v_row.owner, ''),
    'expiresAt', v_row.expires_at,
    'heartbeatAt', v_row.heartbeat_at
  );
end;
$$;

revoke all on function public.renew_runtime_lease(text, text, integer) from public, anon, authenticated;
grant execute on function public.renew_runtime_lease(text, text, integer) to service_role;

create table if not exists public.feedback_evidence_upload_rate_limits (
  key_hash text primary key,
  upload_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_evidence_upload_rate_limits_updated_at_idx
  on public.feedback_evidence_upload_rate_limits(updated_at);

alter table public.feedback_evidence_upload_rate_limits enable row level security;

create or replace function public.consume_feedback_evidence_upload_quota(
  p_key_hash text,
  p_window_seconds integer default 3600,
  p_max_uploads integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_seconds integer := greatest(60, least(coalesce(p_window_seconds, 3600), 86400));
  v_max_uploads integer := greatest(1, least(coalesce(p_max_uploads, 30), 1000));
  v_row public.feedback_evidence_upload_rate_limits%rowtype;
  v_retry_after integer := 0;
begin
  if nullif(trim(p_key_hash), '') is null then
    raise exception 'feedback evidence upload rate-limit key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_key_hash), 0));

  select * into v_row
  from public.feedback_evidence_upload_rate_limits
  where key_hash = trim(p_key_hash)
  for update;

  if not found or v_row.window_started_at <= v_now - make_interval(secs => v_window_seconds) then
    insert into public.feedback_evidence_upload_rate_limits (
      key_hash,
      upload_count,
      window_started_at,
      updated_at
    )
    values (trim(p_key_hash), 1, v_now, v_now)
    on conflict (key_hash) do update
    set upload_count = 1,
        window_started_at = v_now,
        updated_at = v_now
    returning * into v_row;

    return jsonb_build_object(
      'allowed', true,
      'count', v_row.upload_count,
      'retryAfterSeconds', 0
    );
  end if;

  if v_row.upload_count >= v_max_uploads then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (
        v_row.window_started_at + make_interval(secs => v_window_seconds) - v_now
      )))::integer
    );
    return jsonb_build_object(
      'allowed', false,
      'count', v_row.upload_count,
      'retryAfterSeconds', v_retry_after
    );
  end if;

  update public.feedback_evidence_upload_rate_limits
  set upload_count = upload_count + 1,
      updated_at = v_now
  where key_hash = trim(p_key_hash)
  returning * into v_row;

  return jsonb_build_object(
    'allowed', true,
    'count', v_row.upload_count,
    'retryAfterSeconds', 0
  );
end;
$$;

revoke all on function public.consume_feedback_evidence_upload_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_feedback_evidence_upload_quota(text, integer, integer) to service_role;

comment on table public.feedback_evidence_upload_rate_limits is
  'Persistent upload quotas shared across Workers isolates and PoPs. Keys are HMAC-derived and do not store raw user or network identifiers.';


create table if not exists public.admin_login_rate_limits (
  key_hash text primary key,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists admin_login_rate_limits_updated_at_idx
  on public.admin_login_rate_limits(updated_at);

alter table public.admin_login_rate_limits enable row level security;

create or replace function public.read_admin_login_rate_limit(
  p_key_hash text,
  p_window_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.admin_login_rate_limits%rowtype;
begin
  if nullif(trim(p_key_hash), '') is null then
    raise exception 'admin login rate-limit key is required';
  end if;

  select * into v_row
  from public.admin_login_rate_limits
  where key_hash = trim(p_key_hash);

  if not found then
    return jsonb_build_object('retryAfterSeconds', 0, 'failureCount', 0);
  end if;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return jsonb_build_object(
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer),
      'failureCount', v_row.failure_count
    );
  end if;

  if v_row.window_started_at < v_now - make_interval(secs => greatest(60, least(coalesce(p_window_seconds, 900), 86400))) then
    delete from public.admin_login_rate_limits where key_hash = trim(p_key_hash);
    return jsonb_build_object('retryAfterSeconds', 0, 'failureCount', 0);
  end if;

  return jsonb_build_object('retryAfterSeconds', 0, 'failureCount', v_row.failure_count);
end;
$$;

create or replace function public.record_admin_login_attempt(
  p_key_hash text,
  p_succeeded boolean,
  p_window_seconds integer default 900,
  p_max_failures integer default 8,
  p_lock_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_seconds integer := greatest(60, least(coalesce(p_window_seconds, 900), 86400));
  v_max_failures integer := greatest(2, least(coalesce(p_max_failures, 8), 100));
  v_lock_seconds integer := greatest(60, least(coalesce(p_lock_seconds, 900), 86400));
  v_row public.admin_login_rate_limits%rowtype;
begin
  if nullif(trim(p_key_hash), '') is null then
    raise exception 'admin login rate-limit key is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(trim(p_key_hash), 0));

  if coalesce(p_succeeded, false) then
    delete from public.admin_login_rate_limits where key_hash = trim(p_key_hash);
    return jsonb_build_object('retryAfterSeconds', 0, 'failureCount', 0);
  end if;

  select * into v_row
  from public.admin_login_rate_limits
  where key_hash = trim(p_key_hash)
  for update;

  if not found or v_row.window_started_at < v_now - make_interval(secs => v_window_seconds) then
    insert into public.admin_login_rate_limits (key_hash, failure_count, window_started_at, locked_until, updated_at)
    values (trim(p_key_hash), 1, v_now, null, v_now)
    on conflict (key_hash) do update
    set failure_count = 1,
        window_started_at = v_now,
        locked_until = null,
        updated_at = v_now
    returning * into v_row;
  else
    update public.admin_login_rate_limits
    set failure_count = failure_count + 1,
        locked_until = case
          when failure_count + 1 >= v_max_failures then v_now + make_interval(secs => v_lock_seconds)
          else locked_until
        end,
        updated_at = v_now
    where key_hash = trim(p_key_hash)
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'retryAfterSeconds', case
      when v_row.locked_until is not null and v_row.locked_until > v_now
        then greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::integer)
      else 0
    end,
    'failureCount', v_row.failure_count
  );
end;
$$;

revoke all on function public.read_admin_login_rate_limit(text, integer) from public, anon, authenticated;
revoke all on function public.record_admin_login_attempt(text, boolean, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.read_admin_login_rate_limit(text, integer) to service_role;
grant execute on function public.record_admin_login_attempt(text, boolean, integer, integer, integer) to service_role;

comment on table public.admin_login_rate_limits is
  'Persistent, privacy-preserving rate-limit counters for administrator password login. Only HMAC-derived request keys are stored.';

alter table public.account_deletion_requests
  alter column user_id drop not null,
  add column if not exists subject_hash text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

create index if not exists account_deletion_requests_processing_lease_idx
  on public.account_deletion_requests(status, lease_expires_at)
  where status = 'processing';

create or replace function public.claim_due_account_deletion_request(
  p_worker text,
  p_lease_seconds integer default 900
)
returns table (
  id uuid,
  user_id uuid,
  user_email text,
  attempt_count integer,
  scheduled_for timestamptz,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_lease_until timestamptz := v_now + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 900), 3600)));
begin
  return query
  with candidate as (
    select request.id
    from public.account_deletion_requests request
    where request.user_id is not null
      and request.scheduled_for <= v_now
      and (
        request.status = 'pending'
        or (request.status = 'processing' and coalesce(request.lease_expires_at, request.processing_started_at, request.updated_at) <= v_now)
      )
    order by request.scheduled_for asc, request.requested_at asc
    for update skip locked
    limit 1
  )
  update public.account_deletion_requests request
  set status = 'processing',
      processing_started_at = v_now,
      lease_expires_at = v_lease_until,
      attempt_count = request.attempt_count + 1,
      last_error = null,
      resolution_note = concat('由 ', left(trim(coalesce(p_worker, 'account-deletion-worker')), 120), ' 处理'),
      updated_at = v_now
  from candidate
  where request.id = candidate.id
  returning request.id, request.user_id, request.user_email, request.attempt_count, request.scheduled_for, request.lease_expires_at;
end;
$$;

create or replace function public.purge_account_data(
  p_request_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feedback integer := 0;
  v_followups integer := 0;
  v_evidence_metadata integer := 0;
  v_detector_jobs integer := 0;
  v_profiles integer := 0;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'account deletion request and user are required';
  end if;

  if not exists (
    select 1 from public.account_deletion_requests
    where id = p_request_id and user_id = p_user_id and status = 'processing'
  ) then
    raise exception 'account deletion request is not processing';
  end if;

  delete from public.feedback_followups where user_id = p_user_id;
  get diagnostics v_followups = row_count;

  delete from public.feedback_evidence_objects where user_id = p_user_id;
  get diagnostics v_evidence_metadata = row_count;

  update public.offer_feedback
  set user_id = null,
      user_email = null,
      user_display_name = null,
      contact = null,
      evidence_text = null,
      evidence_urls = '[]'::jsonb,
      notes = case when notes is null then null else '[账号删除后已清除用户补充说明]' end,
      public_status = case when public_status = 'public' then 'withdrawn' else public_status end,
      withdrawn_at = case when public_status = 'public' then now() else withdrawn_at end,
      withdraw_reason = case when public_status = 'public' then 'account_deleted' else withdraw_reason end
  where user_id = p_user_id;
  get diagnostics v_feedback = row_count;

  delete from public.transit_detector_jobs where user_id = p_user_id;
  get diagnostics v_detector_jobs = row_count;

  delete from public.public_user_profiles where id = p_user_id;
  get diagnostics v_profiles = row_count;

  return jsonb_build_object(
    'feedbackAnonymized', v_feedback,
    'followupsDeleted', v_followups,
    'evidenceMetadataDeleted', v_evidence_metadata,
    'detectorJobsDeleted', v_detector_jobs,
    'profilesDeleted', v_profiles
  );
end;
$$;

create or replace function public.complete_account_deletion_request(
  p_request_id uuid,
  p_user_id uuid,
  p_subject_hash text,
  p_resolution_note text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.account_deletion_requests
  set status = 'completed',
      subject_hash = nullif(trim(p_subject_hash), ''),
      user_id = null,
      user_email = null,
      completed_at = now(),
      lease_expires_at = null,
      last_error = null,
      resolution_note = left(coalesce(nullif(trim(p_resolution_note), ''), '账号与关联数据已按隐私策略处理。'), 1000),
      updated_at = now()
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

create or replace function public.retry_account_deletion_request(
  p_request_id uuid,
  p_user_id uuid,
  p_error text,
  p_retry_seconds integer default 3600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.account_deletion_requests
  set status = case when attempt_count >= 10 then 'rejected' else 'pending' end,
      scheduled_for = case
        when attempt_count >= 10 then scheduled_for
        else now() + make_interval(secs => greatest(300, least(coalesce(p_retry_seconds, 3600), 86400)))
      end,
      lease_expires_at = null,
      last_error = left(coalesce(nullif(trim(p_error), ''), '账号删除处理失败。'), 1000),
      resolution_note = case when attempt_count >= 10 then '自动处理多次失败，需要人工复核。' else resolution_note end,
      updated_at = now()
  where id = p_request_id
    and user_id = p_user_id
    and status = 'processing';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.claim_due_account_deletion_request(text, integer) from public, anon, authenticated;
revoke all on function public.purge_account_data(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_account_deletion_request(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.retry_account_deletion_request(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_due_account_deletion_request(text, integer) to service_role;
grant execute on function public.purge_account_data(uuid, uuid) to service_role;
grant execute on function public.complete_account_deletion_request(uuid, uuid, text, text) to service_role;
grant execute on function public.retry_account_deletion_request(uuid, uuid, text, integer) to service_role;

comment on function public.claim_due_account_deletion_request(text, integer) is
  'Atomically claims one due account-deletion request with an expiring lease so repeated cron invocations remain idempotent.';
comment on function public.purge_account_data(uuid, uuid) is
  'Deletes private account records and anonymizes retained feedback after evidence objects have been removed from R2.';
