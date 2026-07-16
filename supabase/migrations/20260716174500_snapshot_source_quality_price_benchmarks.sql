create or replace function build_source_quality_price_benchmark_rows()
returns table (
  source_id text,
  competitive_scope_count bigint,
  priced_offer_count bigint,
  benchmark_offer_count bigint,
  lowest_hit_count bigint,
  top5_hit_count bigint,
  within_10pct_count bigint,
  within_20pct_count bigint,
  high_gap_count bigint,
  high_gap_share numeric,
  median_gap_to_min numeric,
  median_gap_to_top5 numeric,
  avg_gap_to_min numeric,
  sample_scopes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with scope_definitions(scope_key, scope_label, tag_id, exclude_shared_mirror) as (
    values
      ('default', '默认最低', null::text, true),
      ('warranty_long', '质保最低', 'warranty_long', true),
      ('shared_access', '拼车/团购', 'shared_access', false),
      ('domestic_mirror_site', '国内镜像站', 'domestic_mirror_site', false),
      ('delivery_recharge', '充值', 'delivery_recharge', false),
      ('delivery_account', '成品号', 'delivery_account', false),
      ('gemini_12_month_link', '12个月提链', 'gemini_12_month_link', false),
      ('gemini_12_month_card_binding', '12个月含绑卡', 'gemini_12_month_card_binding', false),
      ('gemini_18_month_link', '18个月链接', 'gemini_18_month_link', false),
      ('chatgpt_plus_brazil_pix', '巴西 Pix', 'chatgpt_plus_brazil_pix', false),
      ('chatgpt_plus_netherlands_ideal', '荷兰 iDEAL', 'chatgpt_plus_netherlands_ideal', false),
      ('chatgpt_plus_india_upi', '印度 UPI', 'chatgpt_plus_india_upi', false),
      ('chatgpt_plus_europe_channel', '欧洲渠道', 'chatgpt_plus_europe_channel', false),
      ('chatgpt_plus_recharge_ph_card', '菲区卡充', 'chatgpt_plus_recharge_ph_card', false),
      ('chatgpt_plus_recharge_us_ios', '美区 iOS', 'chatgpt_plus_recharge_us_ios', false),
      ('chatgpt_plus_recharge_official_direct', '官方直充', 'chatgpt_plus_recharge_official_direct', false),
      ('pro_max_official_recharge', '正价代充', 'pro_max_official_recharge', false),
      ('pro_max_short_term', '速刷/短期', 'pro_max_short_term', false),
      ('pro_max_us_ios', 'iOS/美区', 'pro_max_us_ios', false),
      ('team_k12', 'K12', 'team_k12', false),
      ('team_bug', 'Bug Team', 'team_bug', false),
      ('team_official', '正价/官方 Team', 'team_official', false),
      ('duration_trial', '短体验', 'duration_trial', false),
      ('duration_month', '月卡', 'duration_month', false),
      ('duration_quarter', '3个月', 'duration_quarter', false),
      ('duration_half_year', '6个月', 'duration_half_year', false),
      ('duration_year', '年卡', 'duration_year', false),
      ('verification_single', '单次', 'verification_single', false),
      ('verification_short', '短效', 'verification_short', false),
      ('verification_long', '长效链接', 'verification_long', false),
      ('verification_monthly', '月租/包月', 'verification_monthly', false),
      ('telegram_region_us', '美区 +1', 'telegram_region_us', false),
      ('telegram_region_india', '印度 +91', 'telegram_region_india', false),
      ('telegram_premium_quarter', 'Premium 3个月', 'telegram_premium_quarter', false),
      ('telegram_premium_half_year', 'Premium 6个月', 'telegram_premium_half_year', false),
      ('telegram_premium_year', 'Premium 年费', 'telegram_premium_year', false),
      ('telegram_stars', 'Telegram Stars', 'telegram_stars', false),
      ('proxy_supported', '可反代', 'proxy_supported', false),
      ('gemini_antigravity_gcp', 'Antigravity/GCP', 'gemini_antigravity_gcp', false),
      ('gemini_phone_required', '需手机验证', 'gemini_phone_required', false),
      ('gemini_appeal_required', '需申诉', 'gemini_appeal_required', false)
  ),
  products as (
    select id, display_name
    from canonical_products
    where is_active = true
  ),
  base_offers as (
    select
      raw_offers.id,
      raw_offers.source_id,
      raw_offers.source_name,
      raw_offers.source_store_name,
      raw_offers.source_title,
      raw_offers.price,
      raw_offers.currency,
      raw_offers.url,
      raw_offers.canonical_product_id as product_id,
      products.display_name as product_name,
      coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags), '{}'::text[]) as public_offer_filter_tags,
      coalesce(raw_offers.verified_at, raw_offers.last_seen_at, raw_offers.captured_at, raw_offers.source_updated_at) as public_updated_at,
      coalesce(raw_offers.source_store_name, raw_offers.source_name, '') as public_source_label,
      raw_offers.source_priority,
      raw_offers.confidence,
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as public_dedupe_key
    from raw_offer_public_state raw_offers
    join products on products.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
      and raw_offers.source_id is not null
      and raw_offers.status <> 'out_of_stock'
      and raw_offers.price is not null
      and raw_offers.price >= 0
      and coalesce(raw_offers.url, '') <> ''
      and coalesce(raw_offers.effective_status, '') not in ('unavailable', 'stale', 'failed')
      and coalesce(raw_offers.freshness_status, '') not in ('expired', 'failed')
      and (raw_offers.expires_at is null or raw_offers.expires_at > now())
  ),
  deduped as (
    select *
    from (
      select
        base_offers.*,
        row_number() over (
          partition by base_offers.public_dedupe_key
          order by
            base_offers.source_priority desc nulls last,
            base_offers.confidence desc nulls last,
            base_offers.public_updated_at desc nulls last,
            base_offers.public_source_label asc,
            base_offers.source_title asc,
            base_offers.url asc,
            base_offers.id asc
        ) as dedupe_rank
      from base_offers
    ) ranked_dedupe
    where ranked_dedupe.dedupe_rank = 1
  ),
  scope_offers as (
    select
      deduped.*,
      matched_scope.scope_key,
      matched_scope.scope_label
    from deduped
    join lateral (
      select
        scope_definitions.scope_key,
        scope_definitions.scope_label
      from scope_definitions
      where scope_definitions.scope_key = 'default'
        and not (deduped.public_offer_filter_tags @> array['shared_access']::text[])
        and not (deduped.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
      union all
      select
        scope_definitions.scope_key,
        scope_definitions.scope_label
      from scope_definitions
      where scope_definitions.tag_id is not null
        and scope_definitions.tag_id = any(deduped.public_offer_filter_tags)
        and (
          scope_definitions.exclude_shared_mirror = false
          or (
            not (deduped.public_offer_filter_tags @> array['shared_access']::text[])
            and not (deduped.public_offer_filter_tags @> array['domestic_mirror_site']::text[])
          )
        )
    ) matched_scope on true
  ),
  scope_stats as (
    select
      scope_offers.product_id,
      scope_offers.product_name,
      scope_offers.scope_key,
      scope_offers.scope_label,
      count(*) as scope_offer_count,
      count(distinct scope_offers.source_id) as scope_source_count,
      min(scope_offers.price) as min_price
    from scope_offers
    group by
      scope_offers.product_id,
      scope_offers.product_name,
      scope_offers.scope_key,
      scope_offers.scope_label
    having count(*) >= 3
      and count(distinct scope_offers.source_id) >= 2
  ),
  ranked_scope_offers as (
    select
      scope_offers.*,
      scope_stats.scope_offer_count,
      scope_stats.scope_source_count,
      scope_stats.min_price,
      row_number() over (
        partition by scope_offers.product_id, scope_offers.scope_key
        order by
          scope_offers.price asc,
          scope_offers.public_updated_at desc nulls last,
          scope_offers.public_source_label asc,
          scope_offers.source_title asc,
          scope_offers.url asc,
          scope_offers.id asc
      ) as price_rank
    from scope_offers
    join scope_stats
      on scope_stats.product_id = scope_offers.product_id
      and scope_stats.scope_key = scope_offers.scope_key
  ),
  top5_stats as (
    select
      ranked_scope_offers.product_id,
      ranked_scope_offers.scope_key,
      max(ranked_scope_offers.price) filter (where ranked_scope_offers.price_rank <= 5) as top5_price
    from ranked_scope_offers
    group by ranked_scope_offers.product_id, ranked_scope_offers.scope_key
  ),
  offer_metrics as (
    select
      ranked_scope_offers.*,
      top5_stats.top5_price,
      case
        when ranked_scope_offers.min_price > 0
        then greatest(0::numeric, (ranked_scope_offers.price - ranked_scope_offers.min_price) / ranked_scope_offers.min_price)
        else null
      end as gap_to_min,
      case
        when top5_stats.top5_price > 0
        then greatest(0::numeric, (ranked_scope_offers.price - top5_stats.top5_price) / top5_stats.top5_price)
        else null
      end as gap_to_top5
    from ranked_scope_offers
    join top5_stats
      on top5_stats.product_id = ranked_scope_offers.product_id
      and top5_stats.scope_key = ranked_scope_offers.scope_key
  ),
  sampled_metrics as (
    select
      offer_metrics.*,
      row_number() over (
        partition by offer_metrics.source_id
        order by
          case
            when offer_metrics.price = offer_metrics.min_price then 0
            when offer_metrics.price_rank <= 5 then 1
            when offer_metrics.gap_to_min is not null and offer_metrics.gap_to_min >= 0.5 and offer_metrics.price > offer_metrics.top5_price then 2
            when offer_metrics.gap_to_min is not null and offer_metrics.gap_to_min <= 0.2 then 3
            else 4
          end,
          offer_metrics.gap_to_min desc nulls last,
          offer_metrics.price_rank asc,
          offer_metrics.public_updated_at desc nulls last
      ) as sample_rank
    from offer_metrics
  ),
  source_aggregates as (
    select
      offer_metrics.source_id,
      count(distinct offer_metrics.product_id || '|' || offer_metrics.scope_key) as competitive_scope_count,
      count(distinct offer_metrics.id) as priced_offer_count,
      count(*) as benchmark_offer_count,
      count(*) filter (where offer_metrics.price = offer_metrics.min_price) as lowest_hit_count,
      count(*) filter (where offer_metrics.price_rank <= 5) as top5_hit_count,
      count(*) filter (
        where case
          when offer_metrics.min_price > 0 then offer_metrics.price <= offer_metrics.min_price * 1.1
          else offer_metrics.price = offer_metrics.min_price
        end
      ) as within_10pct_count,
      count(*) filter (
        where case
          when offer_metrics.min_price > 0 then offer_metrics.price <= offer_metrics.min_price * 1.2
          else offer_metrics.price = offer_metrics.min_price
        end
      ) as within_20pct_count,
      count(*) filter (
        where offer_metrics.gap_to_min is not null
          and offer_metrics.gap_to_min >= 0.5
          and offer_metrics.price > offer_metrics.top5_price
      ) as high_gap_count,
      case
        when count(*) > 0
        then round(
          count(*) filter (
            where offer_metrics.gap_to_min is not null
              and offer_metrics.gap_to_min >= 0.5
              and offer_metrics.price > offer_metrics.top5_price
          )::numeric / count(*)::numeric,
          4
        )
        else 0
      end as high_gap_share,
      percentile_disc(0.5) within group (order by offer_metrics.gap_to_min)
        filter (where offer_metrics.gap_to_min is not null) as median_gap_to_min,
      percentile_disc(0.5) within group (order by offer_metrics.gap_to_top5)
        filter (where offer_metrics.gap_to_top5 is not null) as median_gap_to_top5,
      avg(offer_metrics.gap_to_min) filter (where offer_metrics.gap_to_min is not null) as avg_gap_to_min
    from offer_metrics
    group by offer_metrics.source_id
  ),
  source_samples as (
    select
      sampled_metrics.source_id,
      jsonb_agg(
        jsonb_build_object(
          'productId', sampled_metrics.product_id,
          'productName', sampled_metrics.product_name,
          'scopeKey', sampled_metrics.scope_key,
          'scopeLabel', sampled_metrics.scope_label,
          'offerTitle', sampled_metrics.source_title,
          'price', sampled_metrics.price,
          'minPrice', sampled_metrics.min_price,
          'top5Price', sampled_metrics.top5_price,
          'rank', sampled_metrics.price_rank,
          'gapToMin', case when sampled_metrics.gap_to_min is null then null else round(sampled_metrics.gap_to_min, 4) end,
          'gapToTop5', case when sampled_metrics.gap_to_top5 is null then null else round(sampled_metrics.gap_to_top5, 4) end
        )
        order by sampled_metrics.sample_rank
      ) as sample_scopes
    from sampled_metrics
    where sampled_metrics.sample_rank <= 5
    group by sampled_metrics.source_id
  )
  select
    source_aggregates.source_id,
    source_aggregates.competitive_scope_count,
    source_aggregates.priced_offer_count,
    source_aggregates.benchmark_offer_count,
    source_aggregates.lowest_hit_count,
    source_aggregates.top5_hit_count,
    source_aggregates.within_10pct_count,
    source_aggregates.within_20pct_count,
    source_aggregates.high_gap_count,
    source_aggregates.high_gap_share,
    source_aggregates.median_gap_to_min,
    source_aggregates.median_gap_to_top5,
    source_aggregates.avg_gap_to_min,
    coalesce(source_samples.sample_scopes, '[]'::jsonb) as sample_scopes
  from source_aggregates
  left join source_samples on source_samples.source_id = source_aggregates.source_id
  order by
    source_aggregates.lowest_hit_count desc,
    source_aggregates.top5_hit_count desc,
    source_aggregates.benchmark_offer_count desc,
    source_aggregates.source_id asc;
$$;

revoke execute on function build_source_quality_price_benchmark_rows() from anon, authenticated, public;
grant execute on function build_source_quality_price_benchmark_rows() to service_role;

drop materialized view if exists source_quality_price_benchmarks;

create materialized view source_quality_price_benchmarks as
select
  build_source_quality_price_benchmark_rows.source_id,
  build_source_quality_price_benchmark_rows.competitive_scope_count,
  build_source_quality_price_benchmark_rows.priced_offer_count,
  build_source_quality_price_benchmark_rows.benchmark_offer_count,
  build_source_quality_price_benchmark_rows.lowest_hit_count,
  build_source_quality_price_benchmark_rows.top5_hit_count,
  build_source_quality_price_benchmark_rows.within_10pct_count,
  build_source_quality_price_benchmark_rows.within_20pct_count,
  build_source_quality_price_benchmark_rows.high_gap_count,
  build_source_quality_price_benchmark_rows.high_gap_share,
  build_source_quality_price_benchmark_rows.median_gap_to_min,
  build_source_quality_price_benchmark_rows.median_gap_to_top5,
  build_source_quality_price_benchmark_rows.avg_gap_to_min,
  build_source_quality_price_benchmark_rows.sample_scopes,
  now() as computed_at
from build_source_quality_price_benchmark_rows();

create unique index source_quality_price_benchmarks_source_id_idx
  on source_quality_price_benchmarks(source_id);

revoke all on table source_quality_price_benchmarks from anon, authenticated, public;
grant select on table source_quality_price_benchmarks to service_role;

create or replace function refresh_source_quality_price_benchmarks()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  refreshed_count bigint;
begin
  refresh materialized view source_quality_price_benchmarks;

  select count(*)
  into refreshed_count
  from source_quality_price_benchmarks;

  return refreshed_count;
end;
$$;

revoke execute on function refresh_source_quality_price_benchmarks() from anon, authenticated, public;
grant execute on function refresh_source_quality_price_benchmarks() to service_role;

create or replace function list_source_quality_price_benchmarks()
returns table (
  source_id text,
  competitive_scope_count bigint,
  priced_offer_count bigint,
  benchmark_offer_count bigint,
  lowest_hit_count bigint,
  top5_hit_count bigint,
  within_10pct_count bigint,
  within_20pct_count bigint,
  high_gap_count bigint,
  high_gap_share numeric,
  median_gap_to_min numeric,
  median_gap_to_top5 numeric,
  avg_gap_to_min numeric,
  sample_scopes jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    source_quality_price_benchmarks.source_id,
    source_quality_price_benchmarks.competitive_scope_count,
    source_quality_price_benchmarks.priced_offer_count,
    source_quality_price_benchmarks.benchmark_offer_count,
    source_quality_price_benchmarks.lowest_hit_count,
    source_quality_price_benchmarks.top5_hit_count,
    source_quality_price_benchmarks.within_10pct_count,
    source_quality_price_benchmarks.within_20pct_count,
    source_quality_price_benchmarks.high_gap_count,
    source_quality_price_benchmarks.high_gap_share,
    source_quality_price_benchmarks.median_gap_to_min,
    source_quality_price_benchmarks.median_gap_to_top5,
    source_quality_price_benchmarks.avg_gap_to_min,
    source_quality_price_benchmarks.sample_scopes
  from source_quality_price_benchmarks
  order by
    source_quality_price_benchmarks.lowest_hit_count desc,
    source_quality_price_benchmarks.top5_hit_count desc,
    source_quality_price_benchmarks.benchmark_offer_count desc,
    source_quality_price_benchmarks.source_id asc;
$$;

revoke execute on function list_source_quality_price_benchmarks() from anon, authenticated, public;
grant execute on function list_source_quality_price_benchmarks() to service_role;
