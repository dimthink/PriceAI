alter table raw_offer_confirmations
  add column if not exists canonical_product_id text;
alter table raw_offer_confirmations
  add column if not exists consecutive_valid_confirmations integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'raw_offer_confirmations_consecutive_valid_check'
      and conrelid = 'raw_offer_confirmations'::regclass
  ) then
    alter table raw_offer_confirmations
      add constraint raw_offer_confirmations_consecutive_valid_check
      check (consecutive_valid_confirmations >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'raw_offer_confirmations_canonical_product_id_fkey'
      and conrelid = 'raw_offer_confirmations'::regclass
  ) then
    alter table raw_offer_confirmations
      add constraint raw_offer_confirmations_canonical_product_id_fkey
      foreign key (canonical_product_id)
      references canonical_products(id)
      on delete set null;
  end if;
end $$;

update raw_offer_confirmations confirmations
set
  canonical_product_id = offers.canonical_product_id,
  consecutive_valid_confirmations = case
    when offers.canonical_product_id is not null
      and confirmations.price > 0
      and confirmations.source_status in ('in_stock', 'low_stock')
      and confirmations.effective_status = 'available'
      and confirmations.freshness_status = 'fresh'
      and (confirmations.stock_count is null or confirmations.stock_count > 0)
      and (confirmations.expires_at is null or confirmations.expires_at > confirmations.confirmed_at)
    then 1
    else 0
  end
from raw_offers offers
where offers.id = confirmations.raw_offer_id;

create or replace function priceai_track_offer_confirmation_streak()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  raw_offer raw_offers%rowtype;
  is_valid boolean := false;
begin
  select * into raw_offer
  from raw_offers
  where id = new.raw_offer_id;

  is_valid :=
    found
    and raw_offer.hidden = false
    and raw_offer.canonical_product_id is not null
    and raw_offer.canonical_product_id is not distinct from new.canonical_product_id
    and raw_offer.price is not distinct from new.price
    and raw_offer.price > 0
    and raw_offer.currency = 'CNY'
    and trim(raw_offer.url) <> ''
    and raw_offer.status in ('in_stock', 'low_stock')
    and raw_offer.source_status in ('in_stock', 'low_stock')
    and raw_offer.effective_status = 'available'
    and raw_offer.freshness_status = 'fresh'
    and (raw_offer.stock_count is null or raw_offer.stock_count > 0)
    and coalesce(raw_offer.min_order_quantity, 1) <= 1
    and not (
      coalesce(raw_offer.public_filter_tags, '{}'::text[])
        && array['shared_access', 'web_only_account', 'domestic_mirror_site']::text[]
    )
    and new.price > 0
    and new.source_status in ('in_stock', 'low_stock')
    and new.effective_status = 'available'
    and new.freshness_status = 'fresh'
    and (new.stock_count is null or new.stock_count > 0)
    and (new.expires_at is null or new.expires_at > greatest(new.confirmed_at, now()));

  if tg_op = 'UPDATE' and new.confirmed_at <= old.confirmed_at then
    new := old;
    if pg_trigger_depth() > 1 and not is_valid then
      new.consecutive_valid_confirmations := 0;
    end if;
    return new;
  end if;

  if not is_valid then
    new.consecutive_valid_confirmations := 0;
  elsif tg_op = 'INSERT' then
    new.consecutive_valid_confirmations := 1;
  elsif old.consecutive_valid_confirmations > 0
    and new.canonical_product_id is not distinct from old.canonical_product_id
    and new.price is not distinct from old.price
  then
    new.consecutive_valid_confirmations := least(old.consecutive_valid_confirmations + 1, 32767);
  else
    new.consecutive_valid_confirmations := 1;
  end if;

  return new;
end;
$$;

create or replace function priceai_reset_offer_confirmation_streak()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update raw_offer_confirmations
  set
    source_status = new.source_status,
    effective_status = new.effective_status,
    freshness_status = new.freshness_status,
    stock_count = new.stock_count,
    expires_at = new.expires_at,
    updated_at = now()
  where raw_offer_id = new.id;
  return new;
end;
$$;

drop trigger if exists raw_offer_confirmations_track_streak on raw_offer_confirmations;
create trigger raw_offer_confirmations_track_streak
before insert or update on raw_offer_confirmations
for each row execute function priceai_track_offer_confirmation_streak();

drop trigger if exists raw_offers_reset_confirmation_streak on raw_offers;
create trigger raw_offers_reset_confirmation_streak
after update of hidden, canonical_product_id, source_title, price, currency, status, source_status, url,
  tags, stock_count, min_order_quantity, effective_status,
  freshness_status, expires_at
on raw_offers
for each row execute function priceai_reset_offer_confirmation_streak();

revoke all on function priceai_track_offer_confirmation_streak() from public;
revoke all on function priceai_reset_offer_confirmation_streak() from public;

create index if not exists raw_offer_confirmations_product_streak_idx
  on raw_offer_confirmations(canonical_product_id, consecutive_valid_confirmations)
  where consecutive_valid_confirmations >= 2;

create table if not exists product_price_samples (
  product_id text not null references canonical_products(id) on delete cascade,
  bucket_start timestamptz not null,
  observed_at timestamptz not null,
  price numeric not null check (price > 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  offer_id text references raw_offers(id) on delete set null,
  source_id text references sources(id) on delete set null,
  eligible_offer_count integer not null check (eligible_offer_count > 0),
  sample_method text not null default 'lowest_valid_available_offer'
    check (sample_method = 'lowest_valid_available_offer'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, bucket_start)
);

comment on table product_price_samples is
  'Fifteen-minute observations of each standard product lowest eligible single-unit CNY offer.';

create index if not exists product_price_samples_product_observed_idx
  on product_price_samples(product_id, observed_at desc);
create index if not exists product_price_samples_observed_idx
  on product_price_samples(observed_at);

create table if not exists product_price_candles (
  product_id text not null references canonical_products(id) on delete cascade,
  candle_interval text not null check (candle_interval in ('1h', '1d')),
  bucket_start timestamptz not null,
  bucket_end timestamptz not null,
  open_price numeric not null check (open_price > 0),
  high_price numeric not null check (high_price > 0),
  low_price numeric not null check (low_price > 0),
  close_price numeric not null check (close_price > 0),
  currency text not null default 'CNY' check (currency = 'CNY'),
  sample_count integer not null check (sample_count > 0),
  eligible_offer_count integer not null check (eligible_offer_count > 0),
  first_sample_at timestamptz not null,
  last_sample_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, candle_interval, bucket_start),
  check (bucket_end > bucket_start),
  check (high_price >= greatest(open_price, close_price)),
  check (low_price <= least(open_price, close_price))
);

create index if not exists product_price_candles_interval_bucket_idx
  on product_price_candles(candle_interval, bucket_start desc, product_id);

alter table product_price_samples enable row level security;
alter table product_price_candles enable row level security;
revoke all on table product_price_samples from anon, authenticated, public;
revoke all on table product_price_candles from anon, authenticated, public;
grant select, insert, update, delete on table product_price_samples to service_role;
grant select, insert, update, delete on table product_price_candles to service_role;

drop trigger if exists product_price_samples_set_updated_at on product_price_samples;
create trigger product_price_samples_set_updated_at
before update on product_price_samples
for each row execute function set_updated_at();

drop trigger if exists product_price_candles_set_updated_at on product_price_candles;
create trigger product_price_candles_set_updated_at
before update on product_price_candles
for each row execute function set_updated_at();

create or replace view product_price_eligible_offers
with (security_invoker = true) as
select
  offers.id as offer_id,
  offers.source_id,
  offers.canonical_product_id as product_id,
  offers.price,
  offers.currency,
  coalesce(
    confirmations.verified_at,
    confirmations.last_seen_at,
    confirmations.captured_at,
    offers.verified_at,
    offers.captured_at,
    offers.source_updated_at
  ) as public_updated_at
from raw_offers offers
join raw_offer_confirmations confirmations
  on confirmations.raw_offer_id = offers.id
where offers.canonical_product_id is not null
  and confirmations.canonical_product_id = offers.canonical_product_id
  and confirmations.price = offers.price
  and confirmations.consecutive_valid_confirmations >= 2
  and offers.hidden = false
  and offers.price is not null
  and offers.price > 0
  and offers.currency = 'CNY'
  and trim(offers.url) <> ''
  and offers.status in ('in_stock', 'low_stock')
  and confirmations.source_status in ('in_stock', 'low_stock')
  and (confirmations.stock_count is null or confirmations.stock_count > 0)
  and confirmations.effective_status = 'available'
  and confirmations.freshness_status = 'fresh'
  and (confirmations.expires_at is null or confirmations.expires_at > now())
  and coalesce(offers.min_order_quantity, 1) <= 1
  and not (
    coalesce(offers.public_filter_tags, '{}'::text[])
      && array['shared_access', 'web_only_account', 'domestic_mirror_site']::text[]
  );

revoke all on table product_price_eligible_offers from anon, authenticated, public;
grant select on table product_price_eligible_offers to service_role;

create or replace function record_product_price_samples(
  p_product_ids text[] default null,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  observed_at_value timestamptz := coalesce(p_observed_at, now());
  sample_bucket timestamptz := to_timestamp(
    floor(extract(epoch from coalesce(p_observed_at, now())) / 900) * 900
  );
  target_product_count integer := 0;
  sampled_product_ids text[] := '{}'::text[];
  sampled_count integer := 0;
begin
  select count(*)
  into target_product_count
  from canonical_products products
  where products.is_active = true
    and (p_product_ids is null or products.id = any(p_product_ids));

  with active_products as (
    select products.id
    from canonical_products products
    where products.is_active = true
      and (p_product_ids is null or products.id = any(p_product_ids))
  ),
  ranked as (
    select
      eligible.*,
      count(*) over (partition by eligible.product_id) as eligible_offer_count,
      row_number() over (
        partition by eligible.product_id
        order by
          eligible.price asc,
          eligible.public_updated_at desc nulls last,
          eligible.offer_id asc
      ) as price_rank
    from product_price_eligible_offers eligible
    join active_products products on products.id = eligible.product_id
  ),
  inserted as (
    insert into product_price_samples (
      product_id,
      bucket_start,
      observed_at,
      price,
      currency,
      offer_id,
      source_id,
      eligible_offer_count,
      sample_method
    )
    select
      ranked.product_id,
      sample_bucket,
      observed_at_value,
      ranked.price,
      ranked.currency,
      ranked.offer_id,
      ranked.source_id,
      ranked.eligible_offer_count::integer,
      'lowest_valid_available_offer'
    from ranked
    where ranked.price_rank = 1
    on conflict (product_id, bucket_start) do update
    set
      observed_at = excluded.observed_at,
      price = excluded.price,
      currency = excluded.currency,
      offer_id = excluded.offer_id,
      source_id = excluded.source_id,
      eligible_offer_count = excluded.eligible_offer_count,
      sample_method = excluded.sample_method
    where product_price_samples.observed_at < excluded.observed_at
    returning product_id, bucket_start, observed_at
  )
  select coalesce(array_agg(inserted.product_id), '{}'::text[])
  into sampled_product_ids
  from inserted;

  sampled_count := coalesce(array_length(sampled_product_ids, 1), 0);

  if sampled_count > 0 then
    with affected_samples as (
      select distinct
        inserted.product_id,
        inserted.observed_at
      from (
        select samples.product_id, samples.observed_at
        from product_price_samples samples
        where samples.product_id = any(sampled_product_ids)
          and samples.bucket_start = sample_bucket
      ) inserted
    ),
    target_buckets as (
      select distinct
        affected_samples.product_id,
        intervals.candle_interval,
        case
          when intervals.candle_interval = '1d' then
            date_trunc('day', affected_samples.observed_at at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
          else date_trunc('hour', affected_samples.observed_at)
        end as bucket_start
      from affected_samples
      cross join (values ('1h'), ('1d')) as intervals(candle_interval)
    ),
    aggregated as (
      select
        target_buckets.product_id,
        target_buckets.candle_interval,
        target_buckets.bucket_start,
        target_buckets.bucket_start + case
          when target_buckets.candle_interval = '1d' then interval '1 day'
          else interval '1 hour'
        end as bucket_end,
        (array_agg(samples.price order by samples.observed_at asc))[1] as open_price,
        max(samples.price) as high_price,
        min(samples.price) as low_price,
        (array_agg(samples.price order by samples.observed_at desc))[1] as close_price,
        count(*)::integer as sample_count,
        (array_agg(samples.eligible_offer_count order by samples.observed_at desc))[1]
          as eligible_offer_count,
        min(samples.observed_at) as first_sample_at,
        max(samples.observed_at) as last_sample_at
      from target_buckets
      join product_price_samples samples
        on samples.product_id = target_buckets.product_id
        and samples.observed_at >= target_buckets.bucket_start
        and samples.observed_at < target_buckets.bucket_start + case
          when target_buckets.candle_interval = '1d' then interval '1 day'
          else interval '1 hour'
        end
      group by
        target_buckets.product_id,
        target_buckets.candle_interval,
        target_buckets.bucket_start
    )
    insert into product_price_candles (
      product_id,
      candle_interval,
      bucket_start,
      bucket_end,
      open_price,
      high_price,
      low_price,
      close_price,
      currency,
      sample_count,
      eligible_offer_count,
      first_sample_at,
      last_sample_at
    )
    select
      aggregated.product_id,
      aggregated.candle_interval,
      aggregated.bucket_start,
      aggregated.bucket_end,
      aggregated.open_price,
      aggregated.high_price,
      aggregated.low_price,
      aggregated.close_price,
      'CNY',
      aggregated.sample_count,
      aggregated.eligible_offer_count,
      aggregated.first_sample_at,
      aggregated.last_sample_at
    from aggregated
    on conflict (product_id, candle_interval, bucket_start) do update
    set
      bucket_end = excluded.bucket_end,
      open_price = excluded.open_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      close_price = excluded.close_price,
      currency = excluded.currency,
      sample_count = excluded.sample_count,
      eligible_offer_count = excluded.eligible_offer_count,
      first_sample_at = excluded.first_sample_at,
      last_sample_at = excluded.last_sample_at;
  end if;

  return jsonb_build_object(
    'productsProcessed', target_product_count,
    'samplesWritten', sampled_count,
    'productsWithoutPrice', greatest(target_product_count - sampled_count, 0),
    'observedAt', observed_at_value,
    'bucketStart', sample_bucket
  );
end;
$$;

revoke execute on function record_product_price_samples(text[], timestamptz)
  from anon, authenticated, public;
grant execute on function record_product_price_samples(text[], timestamptz)
  to service_role;

create or replace function list_product_price_current(p_product_ids text[])
returns table (
  product_id text,
  current_price numeric,
  currency text,
  eligible_offer_count integer,
  quoted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      eligible.*,
      count(*) over (partition by eligible.product_id) as offer_count,
      row_number() over (
        partition by eligible.product_id
        order by
          eligible.price asc,
          eligible.public_updated_at desc nulls last,
          eligible.offer_id asc
      ) as price_rank
    from product_price_eligible_offers eligible
    where eligible.product_id = any(coalesce(p_product_ids, '{}'::text[]))
  )
  select
    ranked.product_id,
    ranked.price,
    ranked.currency,
    ranked.offer_count::integer,
    ranked.public_updated_at
  from ranked
  where ranked.price_rank = 1
  order by ranked.product_id;
$$;

revoke execute on function list_product_price_current(text[])
  from anon, authenticated, public;
grant execute on function list_product_price_current(text[])
  to service_role;

create or replace function list_public_product_price_candles(
  p_product_ids text[],
  p_interval text default '1d',
  p_limit_per_product integer default 90,
  p_before timestamptz default null
)
returns table (
  product_id text,
  period_start timestamptz,
  open_price numeric,
  high_price numeric,
  low_price numeric,
  close_price numeric,
  currency text,
  sample_count integer,
  eligible_offer_count integer,
  first_sample_at timestamptz,
  last_sample_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      candles.*,
      row_number() over (
        partition by candles.product_id
        order by candles.bucket_start desc
      ) as recent_rank
    from product_price_candles candles
    where candles.product_id = any(coalesce(p_product_ids, '{}'::text[]))
      and candles.candle_interval = p_interval
      and p_interval in ('1h', '1d')
      and (p_before is null or candles.bucket_start < p_before)
  )
  select
    ranked.product_id,
    ranked.bucket_start,
    ranked.open_price,
    ranked.high_price,
    ranked.low_price,
    ranked.close_price,
    ranked.currency,
    ranked.sample_count,
    ranked.eligible_offer_count,
    ranked.first_sample_at,
    ranked.last_sample_at
  from ranked
  where ranked.recent_rank <= greatest(
    1,
    least(
      coalesce(p_limit_per_product, case when p_interval = '1h' then 168 else 90 end),
      case when p_interval = '1h' then 720 else 365 end
    )
  )
  order by ranked.product_id, ranked.bucket_start asc;
$$;

revoke execute on function list_public_product_price_candles(text[], text, integer, timestamptz)
  from anon, authenticated, public;
grant execute on function list_public_product_price_candles(text[], text, integer, timestamptz)
  to service_role;

create or replace function prune_product_price_history(
  p_batch_size integer default 5000,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_size_value integer := greatest(100, least(coalesce(p_batch_size, 5000), 20000));
  sample_candidates integer := 0;
  hourly_candidates integer := 0;
  deleted_samples integer := 0;
  deleted_hourly_candles integer := 0;
begin
  select count(*)
  into sample_candidates
  from (
    select samples.product_id, samples.bucket_start
    from product_price_samples samples
    where samples.observed_at < now() - interval '180 days'
      and exists (
        select 1
        from product_price_candles hourly
        where hourly.product_id = samples.product_id
          and hourly.candle_interval = '1h'
          and hourly.bucket_start = date_trunc('hour', samples.observed_at)
      )
      and exists (
        select 1
        from product_price_candles daily
        where daily.product_id = samples.product_id
          and daily.candle_interval = '1d'
          and daily.bucket_start =
            date_trunc('day', samples.observed_at at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
      )
    order by samples.observed_at
    limit batch_size_value
  ) candidates;

  select count(*)
  into hourly_candidates
  from (
    select candles.product_id, candles.bucket_start
    from product_price_candles candles
    where candles.candle_interval = '1h'
      and candles.bucket_start < now() - interval '365 days'
    order by candles.bucket_start
    limit batch_size_value
  ) candidates;

  if not p_dry_run then
    with expired as (
      select samples.product_id, samples.bucket_start
      from product_price_samples samples
      where samples.observed_at < now() - interval '180 days'
        and exists (
          select 1
          from product_price_candles hourly
          where hourly.product_id = samples.product_id
            and hourly.candle_interval = '1h'
            and hourly.bucket_start = date_trunc('hour', samples.observed_at)
        )
        and exists (
          select 1
          from product_price_candles daily
          where daily.product_id = samples.product_id
            and daily.candle_interval = '1d'
            and daily.bucket_start =
              date_trunc('day', samples.observed_at at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai'
        )
      order by samples.observed_at
      limit batch_size_value
    )
    delete from product_price_samples samples
    using expired
    where samples.product_id = expired.product_id
      and samples.bucket_start = expired.bucket_start;
    get diagnostics deleted_samples = row_count;

    with expired as (
      select candles.product_id, candles.candle_interval, candles.bucket_start
      from product_price_candles candles
      where candles.candle_interval = '1h'
        and candles.bucket_start < now() - interval '365 days'
      order by candles.bucket_start
      limit batch_size_value
    )
    delete from product_price_candles candles
    using expired
    where candles.product_id = expired.product_id
      and candles.candle_interval = expired.candle_interval
      and candles.bucket_start = expired.bucket_start;
    get diagnostics deleted_hourly_candles = row_count;
  end if;

  return jsonb_build_object(
    'dryRun', p_dry_run,
    'batchSize', batch_size_value,
    'sampleCandidates', sample_candidates,
    'hourlyCandleCandidates', hourly_candidates,
    'deletedSamples', deleted_samples,
    'deletedHourlyCandles', deleted_hourly_candles
  );
end;
$$;

revoke execute on function prune_product_price_history(integer, boolean)
  from anon, authenticated, public;
grant execute on function prune_product_price_history(integer, boolean)
  to service_role;
