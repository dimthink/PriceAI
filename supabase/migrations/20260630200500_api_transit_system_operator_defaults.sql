update public.api_transit_stations
set station_system = case
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%sub2api%' then 'sub_to_api'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%sub-to-api%' then 'sub_to_api'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%sub_to_api%' then 'sub_to_api'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%subway%' then 'sub_to_api'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%callai_partner_status%' then 'sub_to_api'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%onehop%' then 'custom'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%new_api%' then 'new_api'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%new-api%' then 'new_api'
  when lower(concat_ws(' ', collector_kind, id, slug, name, website_url)) like '%new api%' then 'new_api'
  else null
end
where station_system = 'unknown';

update public.api_transit_stations
set operator_type = 'individual'
where operator_type = 'unknown';

alter table public.api_transit_stations
  alter column operator_type set default 'individual';
