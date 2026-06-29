alter table api_transit_stations
  add column if not exists availability_first_checked_at timestamptz;

alter table api_transit_offers
  add column if not exists availability_first_checked_at timestamptz;

update api_transit_stations as station
set availability_first_checked_at = sample_window.first_checked_at
from (
  select
    station_id,
    min(checked_at) as first_checked_at
  from api_transit_availability_samples
  where scope = 'station'
  group by station_id
) as sample_window
where station.id = sample_window.station_id
  and station.availability_first_checked_at is null;

update api_transit_offers as offer
set availability_first_checked_at = sample_window.first_checked_at
from (
  select
    station_id,
    standard_model,
    group_name,
    min(checked_at) as first_checked_at
  from api_transit_availability_samples
  where scope = 'offer'
  group by station_id, standard_model, group_name
) as sample_window
where offer.station_id = sample_window.station_id
  and offer.standard_model = sample_window.standard_model
  and offer.group_name = sample_window.group_name
  and offer.availability_first_checked_at is null;
