alter table api_transit_stations
  add column if not exists availability_source_type text not null default 'unknown',
  add column if not exists availability_source_label text,
  add column if not exists availability_source_url text;

alter table api_transit_offers
  add column if not exists availability_source_type text not null default 'unknown',
  add column if not exists availability_source_label text,
  add column if not exists availability_source_url text;

alter table api_transit_availability_samples
  add column if not exists source_type text not null default 'unknown',
  add column if not exists source_label text,
  add column if not exists source_url text;

alter table api_transit_stations
  drop constraint if exists api_transit_stations_availability_source_type_check;

alter table api_transit_stations
  add constraint api_transit_stations_availability_source_type_check
  check (
    availability_source_type in (
      'priceai_probe',
      'public_status',
      'public_model_catalog',
      'partner_api',
      'merchant_reported',
      'manual_snapshot',
      'unknown'
    )
  );

alter table api_transit_offers
  drop constraint if exists api_transit_offers_availability_source_type_check;

alter table api_transit_offers
  add constraint api_transit_offers_availability_source_type_check
  check (
    availability_source_type in (
      'priceai_probe',
      'public_status',
      'public_model_catalog',
      'partner_api',
      'merchant_reported',
      'manual_snapshot',
      'unknown'
    )
  );

alter table api_transit_availability_samples
  drop constraint if exists api_transit_availability_samples_source_type_check;

alter table api_transit_availability_samples
  add constraint api_transit_availability_samples_source_type_check
  check (
    source_type in (
      'priceai_probe',
      'public_status',
      'public_model_catalog',
      'partner_api',
      'merchant_reported',
      'manual_snapshot',
      'unknown'
    )
  );

create index if not exists api_transit_availability_samples_source_time_idx
  on api_transit_availability_samples(station_id, source_type, checked_at desc);

create index if not exists api_transit_stations_availability_source_type_idx
  on api_transit_stations(availability_source_type, availability_last_checked_at desc);

update api_transit_stations
set
  availability_source_type = case
    when availability_note ilike '%PriceAI API Key 探测%' then 'priceai_probe'
    when availability_note ilike '%PriceAI 临时 Key%' then 'priceai_probe'
    when availability_note ilike '%单轮准入抽样%' then 'priceai_probe'
    when availability_note ilike '%Zivv 公开状态页%' then 'public_status'
    when availability_note ilike '%OneHop 公开模型目录%' then 'public_model_catalog'
    when availability_note ilike '%APINode 公开 site-info%' then 'public_status'
    when availability_note ilike '%partner API%' then 'partner_api'
    when availability_note ilike '%站长监控截图%' then 'merchant_reported'
    when availability_seven_day_samples > 0 then 'manual_snapshot'
    else 'unknown'
  end,
  availability_source_label = case
    when availability_note ilike '%PriceAI API Key 探测%' then 'PriceAI 实测'
    when availability_note ilike '%PriceAI 临时 Key%' then 'PriceAI 实测'
    when availability_note ilike '%单轮准入抽样%' then 'PriceAI 实测'
    when availability_note ilike '%Zivv 公开状态页%' then '公开监测页'
    when availability_note ilike '%OneHop 公开模型目录%' then '公开模型页'
    when availability_note ilike '%APINode 公开 site-info%' then '公开站点接口'
    when availability_note ilike '%partner API%' then '站长接口'
    when availability_note ilike '%站长监控截图%' then '商家提交'
    when availability_seven_day_samples > 0 then '人工录入'
    else null
  end,
  availability_source_url = case
    when availability_note ilike '%Zivv 公开状态页%' then coalesce(monitor_url, availability_source_url)
    when availability_note ilike '%OneHop 公开模型目录%' then coalesce(pricing_endpoint_url, pricing_url, availability_source_url)
    when availability_note ilike '%APINode 公开 site-info%' then coalesce(pricing_endpoint_url, pricing_url, availability_source_url)
    when availability_note ilike '%partner API%' then coalesce(pricing_endpoint_url, availability_source_url)
    else availability_source_url
  end
where availability_source_type = 'unknown'
  or availability_source_label is null
  or availability_source_url is null;

update api_transit_offers as offer
set
  availability_source_type = case
    when offer.availability_note ilike '%PriceAI API Key 探测%' then 'priceai_probe'
    when offer.availability_note ilike '%PriceAI 临时 Key%' then 'priceai_probe'
    when offer.availability_note ilike '%单轮准入抽样%' then 'priceai_probe'
    when offer.availability_note ilike '%Zivv 公开状态页%' then 'public_status'
    when offer.availability_note ilike '%OneHop 公开模型目录%' then 'public_model_catalog'
    when offer.availability_note ilike '%partner API%' then 'partner_api'
    when offer.availability_note ilike '%站长监控截图%' then 'merchant_reported'
    when offer.availability_seven_day_samples > 0 then 'manual_snapshot'
    else 'unknown'
  end,
  availability_source_label = case
    when offer.availability_note ilike '%PriceAI API Key 探测%' then 'PriceAI 实测'
    when offer.availability_note ilike '%PriceAI 临时 Key%' then 'PriceAI 实测'
    when offer.availability_note ilike '%单轮准入抽样%' then 'PriceAI 实测'
    when offer.availability_note ilike '%Zivv 公开状态页%' then '公开监测页'
    when offer.availability_note ilike '%OneHop 公开模型目录%' then '公开模型页'
    when offer.availability_note ilike '%partner API%' then '站长接口'
    when offer.availability_note ilike '%站长监控截图%' then '商家提交'
    when offer.availability_seven_day_samples > 0 then '人工录入'
    else null
  end,
  availability_source_url = case
    when offer.availability_note ilike '%Zivv 公开状态页%' then coalesce(station.monitor_url, offer.availability_source_url, offer.source_url)
    when offer.availability_note ilike '%OneHop 公开模型目录%' then coalesce(offer.source_url, station.pricing_endpoint_url, station.pricing_url, offer.availability_source_url)
    when offer.availability_note ilike '%partner API%' then coalesce(offer.source_url, station.pricing_endpoint_url, offer.availability_source_url)
    else offer.availability_source_url
  end
from api_transit_stations as station
where offer.station_id = station.id
  and (
    offer.availability_source_type = 'unknown'
    or offer.availability_source_label is null
    or offer.availability_source_url is null
  );

update api_transit_availability_samples as sample
set
  source_type = case
    when run.run_type = 'api_probe' then 'priceai_probe'
    when run.logs ->> 'availabilitySourceUrl' is not null then 'public_status'
    when run.run_type = 'public_pricing' then coalesce(nullif(station.availability_source_type, 'unknown'), 'public_model_catalog')
    else 'unknown'
  end,
  source_label = case
    when run.run_type = 'api_probe' then 'PriceAI 实测'
    when run.logs ->> 'availabilitySourceUrl' is not null then '公开监测页'
    when run.run_type = 'public_pricing' then coalesce(station.availability_source_label, '公开资料')
    else null
  end,
  source_url = coalesce(run.logs ->> 'availabilitySourceUrl', station.availability_source_url, run.source_url)
from api_transit_detection_runs as run
left join api_transit_stations as station on station.id = sample.station_id
where sample.run_id = run.id
  and (sample.source_type = 'unknown' or sample.source_label is null or sample.source_url is null);
