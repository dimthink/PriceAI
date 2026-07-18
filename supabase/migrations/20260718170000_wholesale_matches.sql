create table if not exists wholesale_matches (
  id text primary key,
  demand_submission_id text not null references api_transit_submissions(id) on delete cascade,
  supply_submission_id text not null references api_transit_submissions(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'consent_pending', 'connected', 'trial', 'deal', 'closed')),
  match_score integer not null default 0 check (match_score between 0 and 100),
  match_reasons jsonb not null default '[]'::jsonb,
  admin_note text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (demand_submission_id, supply_submission_id),
  check (demand_submission_id <> supply_submission_id)
);

create index if not exists wholesale_matches_status_follow_up_idx
  on wholesale_matches(status, next_follow_up_at nulls last, created_at desc);

create index if not exists wholesale_matches_demand_idx
  on wholesale_matches(demand_submission_id, created_at desc);

create index if not exists wholesale_matches_supply_idx
  on wholesale_matches(supply_submission_id, created_at desc);

drop trigger if exists wholesale_matches_set_updated_at on wholesale_matches;
create trigger wholesale_matches_set_updated_at
before update on wholesale_matches
for each row execute function set_updated_at();

alter table wholesale_matches enable row level security;
