create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  user_email text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'cancelled', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '7 days'),
  cancelled_at timestamptz,
  completed_at timestamptz,
  resolution_note text,
  updated_at timestamptz not null default now()
);

create unique index if not exists account_deletion_requests_one_active_idx
  on public.account_deletion_requests(user_id)
  where status in ('pending', 'processing');

create index if not exists account_deletion_requests_status_schedule_idx
  on public.account_deletion_requests(status, scheduled_for);

alter table public.account_deletion_requests enable row level security;

drop policy if exists account_deletion_requests_select_own on public.account_deletion_requests;
create policy account_deletion_requests_select_own
  on public.account_deletion_requests for select to authenticated
  using (auth.uid() = user_id);

drop trigger if exists account_deletion_requests_set_updated_at on public.account_deletion_requests;
create trigger account_deletion_requests_set_updated_at
before update on public.account_deletion_requests
for each row execute function public.set_updated_at();

comment on table public.account_deletion_requests is
  'User-initiated, reversible account deletion requests. Processing is deliberately separate from the request endpoint and must follow the documented retention policy.';
