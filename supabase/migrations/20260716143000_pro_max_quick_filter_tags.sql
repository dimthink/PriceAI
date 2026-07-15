do $migration$
declare
  current_definition text;
  next_definition text;
  old_recharge_block constant text := $old$if text_value ~ '(菲区|菲律宾|菲律宾区|philippines|ph区)'
    and text_value ~ '(卡充|卡冲|卡付|卡密|cdk|官方充值|充值|代充|直充)'
  then
    output := array_append(output, 'chatgpt_plus_recharge_ph_card');
  elsif text_value ~ '(美区|美国|美国区|us区|usa|u\.s\.)'
    and text_value ~ '(ios|appstore|app-store|内购|苹果内购)'
  then
    output := array_append(output, 'chatgpt_plus_recharge_us_ios');
  elsif text_value ~ '(官方直充|官方充值|官方代充|官方订阅|正价代充|正规充值|正规官方|官网直充|官网代充|人工直充|自动直充|带账单|质保订阅)' then
    output := array_append(output, 'chatgpt_plus_recharge_official_direct');
  end if;$old$;
  new_recharge_block constant text := $new$if text_value ~ '(菲区|菲律宾|菲律宾区|philippines|ph区)'
    and text_value ~ '(卡充|卡冲|卡付|卡密|cdk|官方充值|充值|代充|直充)'
  then
    output := array_append(output, 'chatgpt_plus_recharge_ph_card');
  elsif text_value ~ '(美区|美国|美国区|us区|usa|u\.s\.)'
    and text_value ~ '(ios|appstore|app-store|内购|苹果内购)'
  then
    output := array_append(output, 'chatgpt_plus_recharge_us_ios');
  elsif text_value ~ '(官方直充|官方充值|官方代充|官方订阅|正价代充|正规充值|正规官方|官网直充|官网代充|人工直充|自动直充|带账单|质保订阅)' then
    output := array_append(output, 'chatgpt_plus_recharge_official_direct');
  end if;

  if text_value ~ '(速刷|短期|日抛|天抛|周抛|低价体验|体验号|库存号|临时号|临时会员|必死|只保激活|仅保激活|保激活|只保开通|仅保开通|无.{0,4}质保|没.{0,4}质保|不质保|不保|不售后|无售后|一律不售后|(^|[^0-9])([1-9]|10)天(号|会员|体验)?|[一二三四五六七八九十]天(号|会员|体验)?|[1-9]-10天|2到10天|2至10天|3-7天|7-10天|周会员|一周会员|体验卡|短期体验|质保([1-9]|1[0-4]|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天|([1-9]|1[0-4])天质保|7天售后|七天售后|质保(24|48|72)小时|只质保开通|仅质保开通|质保激活|保首登|质保首登|保上车|质保上车)' then
    output := array_append(output, 'pro_max_short_term');
  elsif text_value ~ '(官方直充|官方充值|官方代充|官方订阅|正价代充|正规充值|正规官方|官网直充|官网代充|人工直充|自动直充|带账单|质保订阅|正价|官方|官网|正规|原价|标准价|真实付费|可续费)'
    or (
      text_value ~ '(直充|代充|充值|续费|代开|内购|订阅)'
      and text_value !~ '(cdk|卡密|兑换码|激活码)'
    )
  then
    output := array_append(output, 'pro_max_official_recharge');
  end if;

  if text_value ~ '(美区|美国|美国区|us区|usa|u\.s\.)'
    and text_value ~ '(ios|appstore|app-store|内购|苹果内购)'
  then
    output := array_append(output, 'pro_max_us_ios');
  end if;$new$;
begin
  select pg_get_functiondef('public.priceai_public_offer_filter_tags(text, text[])'::regprocedure)
  into current_definition;

  if position('pro_max_official_recharge' in current_definition) > 0 then
    raise notice 'priceai_public_offer_filter_tags already emits Pro/Max quick tags';
  else
    if position(old_recharge_block in current_definition) = 0 then
      raise exception 'Expected ChatGPT Plus recharge filter tag block was not found';
    end if;

    next_definition := replace(current_definition, old_recharge_block, new_recharge_block);
    execute next_definition;
  end if;
end;
$migration$;

create or replace function list_public_product_offer_filter_facets(
  p_product_id text
)
returns table (
  tag_id text,
  offer_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with product as (
    select id
    from canonical_products
    where is_active = true
      and (canonical_products.id = p_product_id or canonical_products.slug = p_product_id)
    limit 1
  ),
  tag_rows as (
    select distinct
      priceai_public_offer_dedupe_key(
        raw_offers.canonical_product_id,
        raw_offers.url,
        raw_offers.source_title,
        raw_offers.price
      ) as offer_key,
      unnest(raw_offers.public_filter_tags) as tag_id
    from raw_offers
    join product on product.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
      and coalesce(array_length(raw_offers.public_filter_tags, 1), 0) > 0
  )
  select
    tag_rows.tag_id,
    count(*) as offer_count
  from tag_rows
  where tag_rows.tag_id is not null
    and tag_rows.tag_id <> ''
  group by tag_rows.tag_id
  order by array_position(
    array[
      'shared_access',
      'domestic_mirror_site',
      'delivery_recharge',
      'delivery_account',
      'gemini_12_month_link',
      'gemini_12_month_card_binding',
      'gemini_18_month_link',
      'chatgpt_plus_brazil_pix',
      'chatgpt_plus_netherlands_ideal',
      'chatgpt_plus_india_upi',
      'chatgpt_plus_europe_channel',
      'chatgpt_plus_recharge_ph_card',
      'chatgpt_plus_recharge_us_ios',
      'chatgpt_plus_recharge_official_direct',
      'pro_max_official_recharge',
      'pro_max_short_term',
      'pro_max_us_ios',
      'team_k12',
      'team_bug',
      'team_official',
      'duration_trial',
      'duration_month',
      'duration_quarter',
      'duration_half_year',
      'duration_year',
      'verification_single',
      'verification_short',
      'verification_long',
      'verification_monthly',
      'telegram_region_us',
      'telegram_region_india',
      'telegram_premium_quarter',
      'telegram_premium_half_year',
      'telegram_premium_year',
      'telegram_stars',
      'proxy_supported',
      'gemini_antigravity_gcp',
      'gemini_phone_required',
      'gemini_appeal_required',
      'warranty_long'
    ]::text[],
    tag_rows.tag_id
  ),
  tag_rows.tag_id;
$$;

do $refresh_public_filter_tags$
declare
  refreshed_rows integer := 0;
begin
  loop
    with stale_offers as (
      select id
      from raw_offers
      where canonical_product_id in ('chatgpt-pro-5x', 'chatgpt-pro-20x', 'claude-max-5x', 'claude-max-20x')
        and coalesce(public_filter_tags, '{}'::text[]) is distinct from priceai_public_offer_filter_tags(source_title, tags)
      order by id
      limit 500
      for update skip locked
    )
    update raw_offers
    set updated_at = now()
    from stale_offers
    where raw_offers.id = stale_offers.id;

    get diagnostics refreshed_rows = row_count;
    exit when refreshed_rows = 0;
  end loop;
end;
$refresh_public_filter_tags$;

delete from public_api_snapshots
where kind in ('explorer', 'offers', 'product_offers', 'merchants');

insert into public_api_snapshots (
  kind,
  cache_key,
  schema_version,
  payload,
  generated_at,
  updated_at
)
values (
  'refresh_state',
  'public-prices',
  1,
  jsonb_build_object(
    'dirty', true,
    'dirtyAt', now(),
    'reason', 'migration add Pro/Max quick filter tags',
    'refreshIntervalSeconds', 60,
    'globalDirty', false,
    'fullRefreshRequired', false,
    'affectedProductIds', jsonb_build_array('chatgpt-pro-5x', 'chatgpt-pro-20x', 'claude-max-5x', 'claude-max-20x'),
    'affectedOfferIds', jsonb_build_array(),
    'affectedSourceIds', jsonb_build_array()
  ),
  now(),
  now()
)
on conflict (kind, cache_key) do update set
  schema_version = excluded.schema_version,
  payload = public_api_snapshots.payload || excluded.payload,
  generated_at = excluded.generated_at,
  updated_at = excluded.updated_at;

revoke execute on function priceai_public_offer_filter_tags(text, text[]) from anon, public;
revoke execute on function list_public_product_offer_filter_facets(text) from anon, authenticated, public;
grant execute on function priceai_public_offer_filter_tags(text, text[]) to service_role;
grant execute on function list_public_product_offer_filter_facets(text) to service_role;
