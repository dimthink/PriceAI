alter table public.sources
  add column if not exists availability_status text not null default 'unknown',
  add column if not exists out_of_stock_since timestamptz,
  add column if not exists consecutive_out_of_stock_snapshots integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sources_availability_status_check'
      and conrelid = 'public.sources'::regclass
  ) then
    alter table public.sources
      add constraint sources_availability_status_check
      check (availability_status in ('unknown', 'available', 'out_of_stock'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sources_out_of_stock_snapshot_count_check'
      and conrelid = 'public.sources'::regclass
  ) then
    alter table public.sources
      add constraint sources_out_of_stock_snapshot_count_check
      check (consecutive_out_of_stock_snapshots >= 0);
  end if;
end
$$;

create index if not exists sources_availability_observation_idx
  on public.sources (availability_status, out_of_stock_since, last_checked_at)
  where enabled = true;

comment on column public.sources.availability_status is
  'Latest source-level availability from a complete healthy snapshot; independent from collector health.';
comment on column public.sources.out_of_stock_since is
  'First complete snapshot in the current continuous out-of-stock observation window.';
comment on column public.sources.consecutive_out_of_stock_snapshots is
  'Complete out-of-stock snapshot confirmations since the source last returned a sellable offer.';

update public.sources
set
  availability_status = 'out_of_stock',
  out_of_stock_since = coalesce(last_checked_at, updated_at, now()),
  consecutive_out_of_stock_snapshots = greatest(consecutive_failures, 1),
  health_status = 'healthy',
  consecutive_failures = 0,
  last_error = null,
  updated_at = now()
where last_error ~* '(店铺接口正常.*(完整)?商品快照为空|店铺正常.*(没有商品|无商品|商品为空)|shop (api )?(reachable|healthy).*(0 goods|empty (goods )?snapshot)|goods_count[[:space:]]*[=:][[:space:]]*0)';
