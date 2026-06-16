create or replace function priceai_hide_duplicate_public_offers_for_key(
  p_dedupe_key text,
  p_keeper_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  if coalesce(p_dedupe_key, '') = '' or coalesce(p_keeper_id, '') = '' then
    return 0;
  end if;

  with candidates as (
    select
      raw_offers.id,
      row_number() over (
        order by
          case
            when raw_offers.status <> 'out_of_stock'
              and raw_offers.price is not null
              and raw_offers.url <> ''
              and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
              and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
              and (raw_offers.expires_at is null or raw_offers.expires_at > now())
            then 1
            else 2
          end asc,
          raw_offers.source_priority desc nulls last,
          raw_offers.confidence desc nulls last,
          coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) desc nulls last,
          coalesce(raw_offers.source_store_name, raw_offers.source_name, '') asc,
          raw_offers.source_title asc,
          raw_offers.url asc,
          raw_offers.id asc
      ) as keep_rank
    from raw_offers
    where raw_offers.hidden = false
      and priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) = p_dedupe_key
  ),
  updated as (
    update raw_offers
    set
      hidden = true,
      effective_status = 'unavailable',
      freshness_status = 'fresh',
      last_failed_at = now(),
      failure_reason = '管理员手动下架：同一源站商品重复采集，已保留最新可信报价。',
      updated_at = now()
    from candidates
    where raw_offers.id = candidates.id
      and candidates.keep_rank > 1
      and raw_offers.hidden = false
    returning raw_offers.id
  )
  select count(*) into updated_count from updated;

  return coalesce(updated_count, 0);
end;
$$;

create or replace function priceai_raw_offers_hide_public_duplicates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.hidden = false then
    perform priceai_hide_duplicate_public_offers_for_key(
      priceai_public_offer_dedupe_key(
        new.canonical_product_id,
        new.url,
        new.source_title,
        new.price
      ),
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists raw_offers_hide_public_duplicates on raw_offers;
create trigger raw_offers_hide_public_duplicates
after insert or update of hidden, canonical_product_id, url, source_title, price, status, effective_status, freshness_status, expires_at, source_priority, confidence, verified_at, last_seen_at, captured_at, source_updated_at
on raw_offers
for each row
execute function priceai_raw_offers_hide_public_duplicates();

revoke execute on function priceai_hide_duplicate_public_offers_for_key(text, text) from anon, public;
revoke execute on function priceai_raw_offers_hide_public_duplicates() from anon, public;
grant execute on function priceai_hide_duplicate_public_offers_for_key(text, text) to service_role;
grant execute on function priceai_raw_offers_hide_public_duplicates() to service_role;
