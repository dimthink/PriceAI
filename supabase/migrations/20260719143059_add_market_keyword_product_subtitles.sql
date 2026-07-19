update canonical_products
set
  display_name = 'ChatGPT Plus 试用订阅',
  spec = '日抛 · 成品号 · 网页号 · 已/未接码',
  summary = 'ChatGPT Plus 试用订阅主要指短期体验或首登质保的成品号；这里归集日抛、短期成品号、网页号、已接码/未接码成品号，以及 Pix/iDEAL/UPI/欧洲渠道报价。购买前重点核对接码状态、可用端和售后限制。',
  aliases = array(
    select distinct alias
    from unnest(aliases || array['plus 试用订阅']::text[]) as new_alias(alias)
    where alias is not null
      and alias <> ''
  ),
  updated_at = now()
where id = 'chatgpt-plus';

update canonical_products
set
  spec = '官方地区价 · iOS 内购 · 直充/续费',
  updated_at = now()
where id = 'chatgpt-plus-recharge';

update canonical_products
set
  spec = 'K12 · Bug Team · 母号/子号 · 邀请/自动拉',
  aliases = array(
    select distinct alias
    from unnest(aliases || array['bug team', 'team bug', '子号']::text[]) as new_alias(alias)
    where alias is not null
      and alias <> ''
  ),
  updated_at = now()
where id = 'chatgpt-team-business';

delete from public_api_snapshots
where kind = 'explorer'
  or (
    kind = 'product_offers'
    and (
      cache_key like '%:chatgpt-plus:%'
      or cache_key like '%:chatgpt-plus-recharge:%'
      or cache_key like '%:chatgpt-team-business:%'
    )
  );

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
    'reason', 'migration add market keyword product subtitles',
    'refreshIntervalSeconds', 60,
    'globalDirty', false,
    'fullRefreshRequired', false,
    'affectedProductIds', jsonb_build_array('chatgpt-plus', 'chatgpt-plus-recharge', 'chatgpt-team-business'),
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
