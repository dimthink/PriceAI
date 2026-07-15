create table if not exists public.feedback_evidence_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  draft_id uuid not null,
  feedback_id text references public.offer_feedback(id) on delete set null,
  object_key text not null unique,
  reference text not null unique,
  status text not null default 'draft' check (status in ('draft', 'bound', 'deleted')),
  original_name text,
  mime_type text,
  size_bytes integer,
  expires_at timestamptz default (now() + interval '24 hours'),
  bound_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists feedback_evidence_objects_expiry_idx
  on public.feedback_evidence_objects(status, expires_at)
  where status = 'draft';

create index if not exists feedback_evidence_objects_user_created_idx
  on public.feedback_evidence_objects(user_id, created_at desc);

alter table public.feedback_evidence_objects enable row level security;

drop policy if exists feedback_evidence_objects_select_own on public.feedback_evidence_objects;
create policy feedback_evidence_objects_select_own
  on public.feedback_evidence_objects for select to authenticated
  using (auth.uid() = user_id);

drop trigger if exists feedback_evidence_objects_set_updated_at on public.feedback_evidence_objects;
create trigger feedback_evidence_objects_set_updated_at
before update on public.feedback_evidence_objects
for each row execute function public.set_updated_at();

comment on table public.feedback_evidence_objects is
  'Tracks authenticated feedback evidence drafts. Unbound R2 objects expire after 24 hours and can be removed by the feedback closeup cron.';
