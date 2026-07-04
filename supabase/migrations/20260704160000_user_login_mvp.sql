create table if not exists public_user_profiles (
  id uuid primary key,
  email text,
  display_name text,
  avatar_url text,
  provider text not null default 'google',
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public_user_profiles enable row level security;

drop trigger if exists public_user_profiles_set_updated_at on public_user_profiles;
create trigger public_user_profiles_set_updated_at
before update on public_user_profiles
for each row execute function set_updated_at();

alter table offer_feedback
  add column if not exists user_id uuid,
  add column if not exists user_email text,
  add column if not exists user_display_name text;

create index if not exists offer_feedback_user_id_created_at_idx
  on offer_feedback(user_id, created_at desc);

create table if not exists feedback_followups (
  id text primary key,
  feedback_id text not null references offer_feedback(id) on delete cascade,
  user_id uuid,
  role text not null default 'user' check (role in ('user', 'admin')),
  message text not null,
  evidence_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists feedback_followups_feedback_created_at_idx
  on feedback_followups(feedback_id, created_at asc);

alter table feedback_followups enable row level security;

create table if not exists transit_detector_jobs (
  id text primary key,
  user_id uuid not null,
  user_email text,
  protocol text not null,
  base_url text,
  target_model text not null,
  intensity text not null default 'standard',
  include_long_context boolean not null default false,
  upstream_type text,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  detector_job_id text,
  status_url text,
  result_url text,
  json_url text,
  image_url text,
  error_message text,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists transit_detector_jobs_user_submitted_idx
  on transit_detector_jobs(user_id, submitted_at desc);

create index if not exists transit_detector_jobs_detector_job_id_idx
  on transit_detector_jobs(detector_job_id);

alter table transit_detector_jobs enable row level security;

drop trigger if exists transit_detector_jobs_set_updated_at on transit_detector_jobs;
create trigger transit_detector_jobs_set_updated_at
before update on transit_detector_jobs
for each row execute function set_updated_at();
