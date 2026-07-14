create table if not exists source_shard_assignments (
  source_id text not null references sources(id) on delete cascade,
  collector_kind text not null default 'shopApi',
  family text not null,
  shard_count integer not null check (shard_count between 1 and 32),
  shard_index integer not null check (shard_index >= 0 and shard_index < shard_count),
  weight numeric not null default 1,
  weight_signals jsonb not null default '{}'::jsonb,
  assignment_version text not null default 'manual',
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, collector_kind, family, shard_count)
);

create index if not exists source_shard_assignments_lookup_idx
  on source_shard_assignments(collector_kind, family, shard_count, shard_index)
  where active = true;

create index if not exists source_shard_assignments_assigned_at_idx
  on source_shard_assignments(assigned_at desc);

drop trigger if exists source_shard_assignments_set_updated_at on source_shard_assignments;
create trigger source_shard_assignments_set_updated_at
before update on source_shard_assignments
for each row execute function set_updated_at();

alter table source_shard_assignments enable row level security;
