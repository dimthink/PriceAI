create table if not exists collection_jobs (
  id text primary key,
  job_type text not null check (job_type in ('all', 'source')),
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

create index if not exists collection_jobs_status_created_at_idx on collection_jobs(status, created_at desc);
create index if not exists collection_jobs_source_status_idx on collection_jobs(source_id, status);
create index if not exists collection_jobs_locked_until_idx on collection_jobs(locked_until);

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

drop trigger if exists collection_jobs_set_updated_at on collection_jobs;
create trigger collection_jobs_set_updated_at
before update on collection_jobs
for each row execute function set_updated_at();

alter table collection_jobs enable row level security;
