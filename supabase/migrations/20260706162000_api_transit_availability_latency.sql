alter table api_transit_stations
  add column if not exists availability_latest_latency_ms integer,
  add column if not exists availability_avg_latency_7d_ms integer;

alter table api_transit_offers
  add column if not exists availability_latest_latency_ms integer,
  add column if not exists availability_avg_latency_7d_ms integer;

alter table api_transit_availability_samples
  add column if not exists latency_ms integer,
  add column if not exists ping_latency_ms integer;
