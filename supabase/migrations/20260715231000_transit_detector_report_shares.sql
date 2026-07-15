create table if not exists public.transit_detector_report_shares (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.transit_detector_jobs(id) on delete cascade,
  user_id uuid not null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists transit_detector_report_shares_user_job_idx
  on public.transit_detector_report_shares(user_id, job_id, created_at desc);

create unique index if not exists transit_detector_report_shares_one_active_job_idx
  on public.transit_detector_report_shares(job_id)
  where status = 'active';

alter table public.transit_detector_report_shares enable row level security;

drop policy if exists transit_detector_report_shares_select_own on public.transit_detector_report_shares;
create policy transit_detector_report_shares_select_own
  on public.transit_detector_report_shares for select to authenticated
  using (auth.uid() = user_id);

comment on table public.transit_detector_report_shares is
  'Revocable, token-hash-based public shares for user-owned detector reports. Internal detector job IDs are not public credentials.';
