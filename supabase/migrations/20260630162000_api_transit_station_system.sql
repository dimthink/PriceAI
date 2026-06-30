alter table public.api_transit_stations
  add column if not exists station_system text;

alter table public.api_transit_stations
  drop constraint if exists api_transit_stations_station_system_check;

alter table public.api_transit_stations
  add constraint api_transit_stations_station_system_check
  check (
    station_system is null
    or station_system in ('new_api', 'sub_to_api', 'custom', 'unknown')
  );

update public.api_transit_stations
set
  station_system = 'sub_to_api',
  collector_kind = case
    when collector_kind = 'apinode_public_site_info' then 'sub2api_public_site_info'
    else collector_kind
  end,
  summary = case
    when summary is null or btrim(summary) = '' then 'APINode 使用 Sub2API 系统，公开 site-info 接口可读取 OpenAI 分组倍率、充值倍率和公开可用率。'
    else summary
  end
where id = 'apinode-ltd';

comment on column public.api_transit_stations.station_system is
  'Operator-curated station system label for API transit listings: new_api, sub_to_api, custom, or unknown.';
