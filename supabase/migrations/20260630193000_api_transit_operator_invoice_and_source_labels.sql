alter table api_transit_stations
  add column if not exists operator_type text not null default 'unknown',
  add column if not exists invoice_support text not null default 'unknown';

alter table api_transit_stations
  drop constraint if exists api_transit_stations_operator_type_check,
  add constraint api_transit_stations_operator_type_check
    check (operator_type in ('company', 'individual', 'unknown'));

alter table api_transit_stations
  drop constraint if exists api_transit_stations_invoice_support_check,
  add constraint api_transit_stations_invoice_support_check
    check (invoice_support in ('supported', 'unsupported', 'unknown'));

update api_transit_stations
set
  availability_source_type = 'public_status',
  availability_source_label = '公开来源',
  availability_source_url = coalesce(availability_source_url, pricing_endpoint_url, pricing_url, monitor_url, website_url)
where id = 'apinode-ltd'
  and (
    collector_kind in ('apinode_public_site_info', 'sub2api_public_site_info')
    or availability_note ilike '%APINode 公开 site-info%'
  );

update api_transit_offers offer
set
  availability_source_type = 'public_status',
  availability_source_label = '公开来源',
  availability_source_url = coalesce(offer.availability_source_url, offer.source_url, station.pricing_endpoint_url, station.pricing_url, station.monitor_url, station.website_url)
from api_transit_stations station
where offer.station_id = station.id
  and station.id = 'apinode-ltd'
  and (
    offer.availability_note ilike '%APINode 公开 site-info%'
    or offer.price_source ilike '%APINode site-info%'
    or offer.price_source ilike '%APINode 公开%'
  );
