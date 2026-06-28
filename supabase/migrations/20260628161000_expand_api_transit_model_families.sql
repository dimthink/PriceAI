alter table api_transit_offers
  add column if not exists image_output_price numeric;

alter table api_transit_multiplier_history
  add column if not exists image_output_price numeric;

alter table api_transit_offers
  drop constraint if exists api_transit_offers_family_check;

alter table api_transit_offers
  add constraint api_transit_offers_family_check
  check (family in ('gpt', 'claude', 'gemini', 'glm', 'deepseek', 'image', 'video'));

alter table api_transit_multiplier_history
  drop constraint if exists api_transit_multiplier_history_family_check;

alter table api_transit_multiplier_history
  add constraint api_transit_multiplier_history_family_check
  check (family in ('gpt', 'claude', 'gemini', 'glm', 'deepseek', 'image', 'video'));

create or replace function record_api_transit_multiplier_history()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  observed_at timestamptz := now();
  coefficient numeric := api_transit_recharge_coefficient(new.recharge_ratio);
  combined numeric;
begin
  if new.model_multiplier is null or new.status <> 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status is not distinct from new.status
      and old.recharge_ratio is not distinct from new.recharge_ratio
      and old.model_multiplier is not distinct from new.model_multiplier
      and old.input_price is not distinct from new.input_price
      and old.output_price is not distinct from new.output_price
      and old.cache_read_price is not distinct from new.cache_read_price
      and old.cache_write_price is not distinct from new.cache_write_price
      and old.image_output_price is not distinct from new.image_output_price
      and old.price_source is not distinct from new.price_source
      and old.source_url is not distinct from new.source_url
    then
      return new;
    end if;
  end if;

  if coefficient is not null then
    combined := coefficient * new.model_multiplier;
  else
    combined := new.model_multiplier;
  end if;

  insert into api_transit_multiplier_history (
    id,
    station_id,
    offer_id,
    family,
    standard_model,
    group_name,
    recharge_ratio,
    recharge_coefficient,
    model_multiplier,
    combined_rate,
    input_price,
    output_price,
    cache_read_price,
    cache_write_price,
    image_output_price,
    price_source,
    source_url,
    status,
    observed_at
  )
  values (
    api_transit_multiplier_history_id(new.id, new.station_id, new.standard_model, new.group_name, observed_at),
    new.station_id,
    new.id,
    new.family,
    new.standard_model,
    new.group_name,
    new.recharge_ratio,
    coefficient,
    new.model_multiplier,
    combined,
    new.input_price,
    new.output_price,
    new.cache_read_price,
    new.cache_write_price,
    new.image_output_price,
    new.price_source,
    new.source_url,
    new.status,
    observed_at
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists api_transit_offers_record_multiplier_history on api_transit_offers;
create trigger api_transit_offers_record_multiplier_history
after insert or update of
  recharge_ratio,
  model_multiplier,
  input_price,
  output_price,
  cache_read_price,
  cache_write_price,
  image_output_price,
  price_source,
  source_url,
  status
on api_transit_offers
for each row
execute function record_api_transit_multiplier_history();
