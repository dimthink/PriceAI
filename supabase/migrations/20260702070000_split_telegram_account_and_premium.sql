insert into canonical_products (
  id,
  slug,
  display_name,
  platform,
  product_type,
  spec,
  summary,
  aliases,
  is_active
)
values
  (
    'telegram-account',
    'telegram-account',
    'Telegram 账号',
    '其他',
    '工具账号',
    '成品账号 / 地区号',
    'Telegram、TG、电报、飞机号成品账号、老号、精养号、地区号、API 链接或直登账号。',
    array['telegram', 'tg', '电报', '飞机号', 'telegram 账号', 'tg 账号', '电报账号', 'telegram 老号'],
    true
  ),
  (
    'telegram-premium',
    'telegram-premium',
    'Telegram Premium / Pro 会员',
    '其他',
    '订阅/会员',
    'Premium / Stars',
    'Telegram Premium、Pro 会员、3/6/12 个月会员、会员兑换码、代开、用户名赠送会员或 Telegram Stars 星星增值功能。',
    array['telegram premium', 'telegram pro', 'tg premium', 'tg pro', 'telegram 会员', 'tg 会员', 'telegram 星星', 'telegram stars', '星星代充'],
    true
  )
on conflict (id) do update set
  slug = excluded.slug,
  display_name = excluded.display_name,
  platform = excluded.platform,
  product_type = excluded.product_type,
  spec = excluded.spec,
  summary = excluded.summary,
  aliases = excluded.aliases,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function priceai_public_offer_filter_tags(
  p_source_title text,
  p_tags text[] default '{}'
)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  text_value text := regexp_replace(
    lower(
      regexp_replace(
        coalesce(p_source_title, '') || ' ' || array_to_string(coalesce(p_tags, array[]::text[]), ' '),
        '[[:space:]]+',
        '',
        'g'
      )
    ),
    '[【】\[\]（）()]',
    ' ',
    'g'
  );
  global_warranty_text text;
  output text[] := array[]::text[];
begin
  global_warranty_text := regexp_replace(
    text_value,
    '(不质保(封号|封禁|被封|账号|账户)|封号(不质保|无质保|无售后|不保|不售后|不在售后范围)|封禁(不质保|无质保|无售后|不保|不售后|不在售后范围)|不保(封号|封禁|被封|账号|账户)|不管(封号|封禁|被封)|封号不管)',
    '',
    'g'
  );

  if text_value !~ '(非拼车|不是拼车|不拼车|无拼车|拒绝拼车|非团购|不是团购|不团购|非共享|不是共享|不共享|无共享|非合租|不是合租|不合租|非车位|不是车位)'
    and (
      text_value ~ '(拼车|团购|拼团|车位|多人共享|多人共用|(二|两|双|三|四|五|六|七|八|九|十|[2-9]|[1-9][0-9])人(车|共享|共用|位)|多人车|车友|车队|家庭车|团号|团购车|拼车位|共享车)'
      or (
        text_value !~ '(独享|独立|一人一号|一人一户|专享)'
        and text_value ~ '(共享|共用|合租|共享号)'
      )
    )
  then
    output := array_append(output, 'shared_access');
  end if;

  if text_value ~ '(12个月|十二个月|一年|1年|365天|三百六十五天|年卡|年度|全年)' then
    output := array_append(output, 'duration_year');
  elsif text_value ~ '(6个月|六个月|180天|一百八十天|半年|半年卡)' then
    output := array_append(output, 'duration_half_year');
  elsif text_value ~ '(3个月|三个月|90天|九十天|季度|季卡)' then
    output := array_append(output, 'duration_quarter');
  elsif text_value ~ '(月卡|月会员|一个月|1个月|30天|三十天|一月|单月)' then
    output := array_append(output, 'duration_month');
  elsif text_value ~ '((^|[^0-9])([1-9]|10)天(号|会员|体验)?|(二|两|三|四|五|六|七|八|九|十)天(号|会员|体验)?|[1-9]-10天|2到10天|2至10天|3-7天|7-10天|周会员|一周会员|体验卡|短期体验)' then
    output := array_append(output, 'duration_trial');
  end if;

  if text_value ~ '(月租|包月接码|接码包月|包月号码|长期租号|月付接码|30天接码|一个月接码|1个月接码)' then
    output := array_append(output, 'verification_monthly');
  elsif text_value ~ '(长效接码|长期接码|长效手机号|长期手机号|原始接码链接|电话接码链接|带电话接码链接|接码链接|取码url|取码链接|可续接|续接)' then
    output := array_append(output, 'verification_long');
  elsif text_value ~ '(短效接码|短效手机号|短期接码|短时接码|临时号码|短效号码|实卡接码|实体卡接码)' then
    output := array_append(output, 'verification_short');
  elsif text_value ~ '(单次接码|一次性接码|一次性验证|1次接码|1次验证|一次码|单号接码|接一次|质保1次成功接码|质保一次成功接码)' then
    output := array_append(output, 'verification_single');
  end if;

  if text_value ~ '((^|[^0-9])(\+|➕)1([^0-9]|$)|美区|美国|🇺🇸)' then
    output := array_append(output, 'telegram_region_us');
  elsif text_value ~ '((\+|➕)91|区号91|印度)' then
    output := array_append(output, 'telegram_region_india');
  end if;

  if text_value ~ '(telegram.{0,12}(星星|star|stars)|(星星|star|stars).{0,12}telegram|星星兑换码|星星代充)' then
    output := array_append(output, 'telegram_stars');
  elsif text_value ~ '(telegram.{0,16}(premium|会员|pro)|tg.{0,16}(premium|会员|pro)|电报.{0,16}(premium|会员|pro)|飞机.{0,16}(premium|会员|pro)|premium.{0,16}(telegram|tg)|会员.{0,16}(telegram|tg|电报))'
    and text_value ~ '(12个月|十二个月|一年|1年|年费|一年会员|12month|12months)'
  then
    output := array_append(output, 'telegram_premium_year');
  elsif text_value ~ '(telegram.{0,16}(premium|会员|pro)|tg.{0,16}(premium|会员|pro)|电报.{0,16}(premium|会员|pro)|飞机.{0,16}(premium|会员|pro)|premium.{0,16}(telegram|tg)|会员.{0,16}(telegram|tg|电报))'
    and text_value ~ '(6个月|六个月|六月|6月|半年|6month|6months)'
  then
    output := array_append(output, 'telegram_premium_half_year');
  elsif text_value ~ '(telegram.{0,16}(premium|会员|pro)|tg.{0,16}(premium|会员|pro)|电报.{0,16}(premium|会员|pro)|飞机.{0,16}(premium|会员|pro)|premium.{0,16}(telegram|tg)|会员.{0,16}(telegram|tg|电报))'
    and text_value ~ '(3个月|三个月|三月|3月|3month|3months)'
  then
    output := array_append(output, 'telegram_premium_quarter');
  end if;

  if text_value !~ '(仅支持?网页|只能网页|仅网页|网页号|不支持codex|无法使用codex|不能使用codex|不能直接登录codex|无法直接登录codex|无法codex|codex不售后|不可反代|无法反代|不能反代|不支持反代)'
    and text_value ~ '(可反代|支持反代|反代\+?codex|可用codex|支持codex|直接登录codex|sub2|cpa|api格式|json格式|json文件|sub格式|cpa格式)'
  then
    output := array_append(output, 'proxy_supported');
  end if;

  if global_warranty_text !~ '(无.{0,4}质保|没.{0,4}质保|不质保|不保|不售后|售后不管|一律不售后|无售后|不作售后条件|不做售后|不管售后)'
    and text_value !~ '(质保首登|保首登|包首登|首登质保|首次登录|首次登陆|质保首次|质保购买一小时内首登|质保[0-9]+h?内首登|质保(一|二|三|四|五|六|七|八|九|十)+小时内首登|质保上车|只质保上车|仅质保上车|包上车|保上车|上车质保|质保登上|质保登录|质保登陆|质保直登|质保首登成功)'
    and text_value !~ '(质保([1-9]|1[0-4]|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天|(^|[^0-9])([1-9]|1[0-4])天质保|(一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天质保|质保(一周|1周|两周|2周|二周)|(一周|1周|两周|2周|二周)质保|7天售后|七天售后|质保[0-9]{1,2}h|质保(24|48|72)小时|质保[0-9]+小时|[0-9]+h质保|[0-9]+小时质保|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次成功接码|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次接码|质保(1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次|质保额度|质保不来码|质保开通|仅质保开通|只质保开通|质保充值成功|质保激活成功|质保到手|质保上车|只质保上车|仅质保上车|包上车|保上车|上车质保)'
    and text_value ~ '(质保(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天|(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天质保|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[/丨·、,，和+&-]){1,6}(1[5-9]|[2-9][0-9]|[1-9][0-9]{2,})天|质保(十五|二十|二十五|二十八|三十|一百八十)天|(十五|二十|二十五|二十八|三十|一百八十)天质保|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[/丨·、,，和+&-]){1,6}(十五|二十|二十五|二十八|三十|一百八十)天|质保(半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|(半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)质保|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[/丨·、,，和+&-]){1,6}(半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|全程质保|全程保|质保全程(订阅|定阅|权益|会员)?|质保((订阅|定阅|稳定|权益|会员|掉会员|掉订阅)|[/丨·、,，和+&-]){1,6}全程|全程((订阅|定阅|稳定|权益|会员|掉会员|掉订阅)|[/丨·、,，和+&-]){1,6}质保|包月售后|包月质保|质保包月)'
  then
    output := array_append(output, 'warranty_long');
  end if;

  return output;
end;
$$;

update raw_offers
set canonical_product_id = 'telegram-premium', updated_at = now()
where hidden = false
  and canonical_product_id = 'telegram-account'
  and (
    lower(source_title) ~ '(telegram|tg|电报|飞机)'
    and lower(source_title) ~ '(premium|会员|pro|星星|stars?|用户名赠送会员|兑换码|代开|订阅)'
  );

update raw_offers
set canonical_product_id = 'other-product', updated_at = now()
where hidden = false
  and canonical_product_id = 'telegram-account'
  and lower(source_title) ~ '(linkedin|领英|instagram|tiktok|tik tok|facebook|figma|whatsapp|全地区tiktok)';

update raw_offers
set updated_at = now()
where hidden = false
  and canonical_product_id in ('telegram-account', 'telegram-premium');

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
      unnest(coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags))) as tag_id
    from raw_offers
    join product on product.id = raw_offers.canonical_product_id
    where raw_offers.hidden = false
  )
  select
    tag_rows.tag_id,
    count(*) as offer_count
  from tag_rows
  group by tag_rows.tag_id
  order by array_position(
    array[
      'shared_access',
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
      'warranty_long'
    ]::text[],
    tag_rows.tag_id
  );
$$;

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
    'reason', 'migration split telegram account and premium products',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
    'affectedProductIds', jsonb_build_array('telegram-account', 'telegram-premium', 'other-product'),
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
revoke execute on function list_public_product_offer_filter_facets(text) from anon, public;
grant execute on function priceai_public_offer_filter_tags(text, text[]) to service_role;
grant execute on function list_public_product_offer_filter_facets(text) to service_role;
