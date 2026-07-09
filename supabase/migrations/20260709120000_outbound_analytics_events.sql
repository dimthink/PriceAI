create table if not exists outbound_analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (
    event_type in (
      'card_offer_click',
      'merchant_shop_click',
      'api_transit_outbound_click',
      'api_transit_coupon_copy',
      'sponsor_click'
    )
  ),
  entity_type text not null check (
    entity_type in (
      'card_offer',
      'merchant',
      'api_transit_station',
      'sponsor'
    )
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
  on outbound_analytics_events(occurred_at desc);
create index if not exists outbound_analytics_events_entity_idx
  on outbound_analytics_events(entity_type, entity_id, occurred_at desc);
create index if not exists outbound_analytics_events_event_type_idx
  on outbound_analytics_events(event_type, occurred_at desc);
create index if not exists outbound_analytics_events_offer_id_idx
  on outbound_analytics_events(offer_id)
  where offer_id is not null;
create index if not exists outbound_analytics_events_source_id_idx
  on outbound_analytics_events(source_id)
  where source_id is not null;
create index if not exists outbound_analytics_events_station_id_idx
  on outbound_analytics_events(station_id)
  where station_id is not null;
create index if not exists outbound_analytics_events_campaign_id_idx
  on outbound_analytics_events(campaign_id)
  where campaign_id is not null;

alter table outbound_analytics_events enable row level security;

create or replace function list_outbound_analytics_rollups(
  p_since timestamptz default now() - interval '30 days'
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
set search_path = public
as $$
  select
    outbound_analytics_events.event_type,
    outbound_analytics_events.entity_type,
    outbound_analytics_events.entity_id,
    outbound_analytics_events.offer_id,
    outbound_analytics_events.source_id,
    outbound_analytics_events.product_id,
    outbound_analytics_events.station_id,
    outbound_analytics_events.placement,
    outbound_analytics_events.creative_id,
    outbound_analytics_events.campaign_id,
    outbound_analytics_events.target_host,
    count(*)::bigint as click_count,
    count(distinct outbound_analytics_events.session_id)::bigint as unique_session_count,
    max(outbound_analytics_events.occurred_at) as last_clicked_at
  from outbound_analytics_events
  where outbound_analytics_events.occurred_at >= p_since
  group by
    outbound_analytics_events.event_type,
    outbound_analytics_events.entity_type,
    outbound_analytics_events.entity_id,
    outbound_analytics_events.offer_id,
    outbound_analytics_events.source_id,
    outbound_analytics_events.product_id,
    outbound_analytics_events.station_id,
    outbound_analytics_events.placement,
    outbound_analytics_events.creative_id,
    outbound_analytics_events.campaign_id,
    outbound_analytics_events.target_host
  order by click_count desc, last_clicked_at desc;
$$;

revoke execute on function list_outbound_analytics_rollups(timestamptz) from anon, authenticated, public;
grant execute on function list_outbound_analytics_rollups(timestamptz) to service_role;

create or replace function get_outbound_analytics_totals(
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
set search_path = public
as $$
  select
    count(*)::bigint as clicks_total,
    count(*) filter (where occurred_at >= p_recent_since)::bigint as clicks_recent,
    count(distinct session_id)::bigint as unique_sessions_total,
    count(distinct session_id) filter (where occurred_at >= p_recent_since)::bigint as unique_sessions_recent
  from outbound_analytics_events
  where occurred_at >= p_since;
$$;

revoke execute on function get_outbound_analytics_totals(timestamptz, timestamptz) from anon, authenticated, public;
grant execute on function get_outbound_analytics_totals(timestamptz, timestamptz) to service_role;
