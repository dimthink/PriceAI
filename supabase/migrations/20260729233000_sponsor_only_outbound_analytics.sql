create or replace function public.enforce_outbound_analytics_write_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.event_type <> 'sponsor_click' or new.entity_type <> 'sponsor' then
    raise exception using errcode = 'P0001', message = 'outbound_event_type_disabled';
  end if;

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
  where events.event_type = 'sponsor_click'
    and events.occurred_at >= p_since
  group by
    events.event_type, events.entity_type, events.entity_id, events.offer_id,
    events.source_id, events.product_id, events.station_id, events.placement,
    events.creative_id, events.campaign_id, events.target_host
  order by count(*) desc, max(events.occurred_at) desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
$$;

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
  where events.event_type = 'sponsor_click'
    and events.occurred_at >= p_since
  group by events.event_type
  order by count(*) desc;
$$;

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
  where events.event_type = 'sponsor_click'
    and events.occurred_at >= p_since;
$$;
