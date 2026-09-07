create table if not exists public.outbound_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'card_offer_click', 'merchant_shop_click', 'api_transit_outbound_click',
    'api_transit_coupon_copy', 'sponsor_click'
  )),
  entity_type text not null check (entity_type in (
    'card_offer', 'merchant', 'api_transit_station', 'sponsor'
  )),
  constraint outbound_analytics_events_event_entity_check check (
    (event_type = 'card_offer_click' and entity_type = 'card_offer') or
    (event_type = 'merchant_shop_click' and entity_type = 'merchant') or
    (event_type in ('api_transit_outbound_click', 'api_transit_coupon_copy') and entity_type = 'api_transit_station') or
    (event_type = 'sponsor_click' and entity_type = 'sponsor')
  ),
  entity_id text not null,
  offer_id text,
  source_id text,
  product_id text,
  station_id text,
  placement text,
  creative_id text,
  campaign_id text,
  target_host text,
  target_url_hash text,
  page_path text,
  referrer_path text,
  session_id text,
  submitter_ip text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists outbound_analytics_events_occurred_at_idx
  on public.outbound_analytics_events(occurred_at desc);
create index if not exists outbound_analytics_events_entity_idx
  on public.outbound_analytics_events(entity_type, entity_id, occurred_at desc);
create index if not exists outbound_analytics_events_event_type_idx
  on public.outbound_analytics_events(event_type, occurred_at desc);
create index if not exists outbound_analytics_events_offer_id_idx
  on public.outbound_analytics_events(offer_id) where offer_id is not null;
create index if not exists outbound_analytics_events_source_id_idx
  on public.outbound_analytics_events(source_id) where source_id is not null;
create index if not exists outbound_analytics_events_station_id_idx
  on public.outbound_analytics_events(station_id) where station_id is not null;
create index if not exists outbound_analytics_events_campaign_id_idx
  on public.outbound_analytics_events(campaign_id) where campaign_id is not null;
create index if not exists outbound_analytics_events_submitter_rate_idx
  on public.outbound_analytics_events(submitter_ip, occurred_at desc);

alter table public.outbound_analytics_events enable row level security;
revoke all on table public.outbound_analytics_events from public, anon, authenticated;
grant insert on table public.outbound_analytics_events to service_role;

create or replace function public.enforce_outbound_analytics_write_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submitter_ip is null or new.submitter_ip = '' then
    raise exception using errcode = 'P0001', message = 'outbound_fingerprint_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('priceai:outbound:' || new.submitter_ip, 0)
  );

  if (
    select count(*)
    from public.outbound_analytics_events as events
    where events.submitter_ip = new.submitter_ip
      and events.occurred_at >= now() - interval '1 hour'
  ) >= 240 then
    raise exception using errcode = 'P0001', message = 'outbound_rate_limit_exceeded';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_outbound_analytics_write_policy() from public, anon, authenticated;

drop trigger if exists outbound_analytics_events_write_policy on public.outbound_analytics_events;
create trigger outbound_analytics_events_write_policy
  before insert on public.outbound_analytics_events
  for each row execute function public.enforce_outbound_analytics_write_policy();

create or replace function public.prune_outbound_analytics_events(
  p_retention_days integer default 45,
  p_batch_size integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retention_days integer := greatest(30, least(coalesce(p_retention_days, 45), 365));
  v_batch_size integer := greatest(100, least(coalesce(p_batch_size, 5000), 10000));
  v_deleted integer := 0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('priceai:outbound-retention', 0)) then
    return 0;
  end if;

  with candidates as (
    select id
    from public.outbound_analytics_events
    where occurred_at < now() - pg_catalog.make_interval(days => v_retention_days)
    order by occurred_at
    limit v_batch_size
  )
  delete from public.outbound_analytics_events as events
  using candidates
  where events.id = candidates.id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_outbound_analytics_events(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_outbound_analytics_events(integer, integer) to service_role;

create or replace function public.list_outbound_analytics_rollups(
  p_since timestamptz default now() - interval '30 days',
  p_limit integer default 200
)
returns table (
  event_type text,
  entity_type text,
  entity_id text,
  offer_id text,
  source_id text,
  product_id text,
  station_id text,
  placement text,
  creative_id text,
  campaign_id text,
  target_host text,
  click_count bigint,
  unique_session_count bigint,
  last_clicked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    events.event_type,
    events.entity_type,
    events.entity_id,
    events.offer_id,
    events.source_id,
    events.product_id,
    events.station_id,
    events.placement,
    events.creative_id,
    events.campaign_id,
    events.target_host,
    count(*)::bigint,
    count(distinct events.session_id)::bigint,
    max(events.occurred_at)
  from public.outbound_analytics_events as events
  where events.occurred_at >= p_since
  group by
    events.event_type, events.entity_type, events.entity_id, events.offer_id,
    events.source_id, events.product_id, events.station_id, events.placement,
    events.creative_id, events.campaign_id, events.target_host
  order by count(*) desc, max(events.occurred_at) desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

revoke all on function public.list_outbound_analytics_rollups(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.list_outbound_analytics_rollups(timestamptz, integer) to service_role;

create or replace function public.list_outbound_analytics_event_totals(
  p_since timestamptz default now() - interval '30 days'
)
returns table (
  event_type text,
  event_count bigint,
  unique_session_count bigint,
  last_occurred_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    events.event_type,
    count(*)::bigint,
    count(distinct events.session_id)::bigint,
    max(events.occurred_at)
  from public.outbound_analytics_events as events
  where events.occurred_at >= p_since
  group by events.event_type
  order by count(*) desc;
$$;

revoke all on function public.list_outbound_analytics_event_totals(timestamptz) from public, anon, authenticated;
grant execute on function public.list_outbound_analytics_event_totals(timestamptz) to service_role;

create or replace function public.get_outbound_analytics_totals(
  p_since timestamptz default now() - interval '30 days',
  p_recent_since timestamptz default now() - interval '7 days'
)
returns table (
  clicks_total bigint,
  clicks_recent bigint,
  unique_sessions_total bigint,
  unique_sessions_recent bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint,
    count(*) filter (where events.occurred_at >= p_recent_since)::bigint,
    count(distinct events.session_id)::bigint,
    count(distinct events.session_id) filter (where events.occurred_at >= p_recent_since)::bigint
  from public.outbound_analytics_events as events
  where events.occurred_at >= p_since;
$$;

revoke all on function public.get_outbound_analytics_totals(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_outbound_analytics_totals(timestamptz, timestamptz) to service_role;
