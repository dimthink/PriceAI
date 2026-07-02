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
    'x-twitter-account',
    'x-twitter-account',
    'X / 推特账号',
    '其他',
    '工具账号',
    'X / Twitter',
    'X、Twitter、推特普通账号、老号、三绑、2FA 或 token 登录账号。',
    array['twitter', '推特', '推特账号', 'x 账号', 'x账号', '推特老号', 'x/twitter', 'x-twitter'],
    true
  ),
  (
    'x-twitter-premium',
    'x-twitter-premium',
    'X Premium / 推特会员',
    '其他',
    '订阅/会员',
    'Premium / Premium+',
    'X Premium、Twitter Premium、推特蓝标、蓝 V、会员月卡、年卡、CDK、直充或代开。',
    array['x premium', 'twitter premium', '推特 premium', '推特会员', '推特蓝标', '推特蓝v', '蓝 v', '蓝标', 'premium+'],
    true
  ),
  (
    'icloud-email',
    'icloud-email',
    'iCloud 邮箱',
    '邮箱',
    '邮箱/账号',
    'iCloud',
    '纯 iCloud 邮箱、iCloud 隐私邮箱、iCloud 邮箱母号或取码邮箱商品。',
    array['icloud', 'icloud 邮箱', 'icloud邮箱', 'icoud', 'icoud 邮箱', 'icoud邮箱', 'icloud 隐私邮箱', 'icloud 母号', 'icloud 子号'],
    true
  ),
  (
    'kiro-account',
    'kiro-account',
    'Kiro 普号 / Free',
    '其他',
    '工具账号',
    'Free / 普号',
    'Kiro 普号、Free 账号、固定 50 额度或 kirors 导入格式的基础账号。',
    array['kiro', 'kiro 普号', 'kiro free', '固定50额度', 'kirors', 'kiro rs'],
    true
  ),
  (
    'kiro-pro-account',
    'kiro-pro-account',
    'Kiro Pro / 额度号',
    '其他',
    '工具账号',
    'Pro / 额度',
    'Kiro Pro、Pro+、Pro Max、Power、额度号、号池或可超额相关权益。',
    array['kiro pro', 'kiro pro+', 'kiro promax', 'kiro power', 'kiro 积分', 'kiro 额度', 'kiro 号池'],
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

update canonical_products
set
  summary = '域名邮箱、自建邮箱、无法进一步确认类型的纯邮箱商品。',
  aliases = array['邮箱账号', '域名邮箱', '企业邮箱', '其他邮箱'],
  updated_at = now()
where id = 'email-account';

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
set canonical_product_id = 'other-product', updated_at = now()
where hidden = false
  and canonical_product_id = 'x-twitter-account'
  and lower(source_title) ~ '(twitter|推特|x-twitter|x twitter)'
  and lower(source_title) !~ '(账号|账户|老号|新号|三绑|双绑|2fa|token|登录|登陆|邮箱绑定|手机验证|premium|会员|蓝标|蓝v|蓝 v|月卡|年卡|年度|cdk|卡密|直充|代开|激活码|ios)'
  and lower(source_title) ~ '(涨粉|粉丝|关注|转发|点赞|评论|浏览|互动)';

update raw_offers
set canonical_product_id = 'x-twitter-premium', updated_at = now()
where hidden = false
  and canonical_product_id = 'x-twitter-account'
  and lower(source_title) ~ '(x premium|twitter premium|推特 premium|premium\+|推特会员|x 会员|蓝标|蓝v|蓝 v|会员直充|会员代开|会员卡密|月卡|年卡|年度会员|自助卡密|激活码|cdk|ios充值|ios 充值)'
  and lower(source_title) ~ '(twitter|推特|x-twitter|x twitter|x premium)';

update raw_offers
set canonical_product_id = 'apple-id-account', updated_at = now()
where hidden = false
  and canonical_product_id in ('email-account', 'other-product')
  and lower(source_title) ~ '(apple id|appleid|苹果 id|苹果id|苹果账号|apple 账号|美区id|美区 id|土区id|土区 id|日区id|日区 id|港区id|港区 id|外区id|外区 id|台湾id|台湾 id|香港id|香港 id|菲律宾id|菲律宾 id|美国id|美国 id|日本id|日本 id)'
  and lower(source_title) ~ '(icloud|icoud|app|账号|账户|独享|老号|成品|可转区)';

update raw_offers
set canonical_product_id = 'chatgpt-plus', updated_at = now()
where hidden = false
  and canonical_product_id = 'email-account'
  and lower(source_title) ~ '(icloud|icloud邮箱|icloud 邮箱|icoud|icoud邮箱|icoud 邮箱)'
  and lower(source_title) !~ '(隐私邮箱|发货形式为邮箱|开plus|开 plus|绑定专用|取码url|取码 url|plus源头|plus 源头)'
  and lower(source_title) ~ '(chatgpt|gpt|openai|codex|gptplus|gpt plus|plus)'
  and lower(source_title) ~ '(成品号|成品账号|成品|账号|账户|月卡|会员|rt|凭证|质保首登|未接码|已接码|2fa|稳定成品|发货格式)';

update raw_offers
set canonical_product_id = 'icloud-email', updated_at = now()
where hidden = false
  and canonical_product_id = 'email-account'
  and lower(source_title) ~ '(icloud|icloud邮箱|icloud 邮箱|icoud|icoud邮箱|icoud 邮箱|icloud隐私邮箱|icloud 隐私邮箱)'
  and lower(source_title) !~ '(apple id|appleid|苹果 id|苹果id|苹果账号|apple 账号|美区id|美区 id|土区id|土区 id|日区id|日区 id|港区id|港区 id|外区id|外区 id|台湾id|台湾 id|香港id|香港 id|菲律宾id|菲律宾 id|美国id|美国 id|日本id|日本 id)'
  and lower(source_title) ~ '(icloud邮箱|icloud 邮箱|icoud邮箱|icoud 邮箱|icloud隐私邮箱|icloud 隐私邮箱|icoud隐私邮箱|icoud 隐私邮箱|隐私邮箱|母号|子号|子邮箱|取码url|取码 url|取码链接|发货形式为邮箱|绑定专用)'
  and not (
    lower(source_title) !~ '(隐私邮箱|发货形式为邮箱|开plus|开 plus|绑定专用|取码url|取码 url|plus源头|plus 源头)'
    and lower(source_title) ~ '(chatgpt|gpt|openai|codex|gptplus|gpt plus|plus)'
    and lower(source_title) ~ '(成品号|成品账号|成品|账号|账户|月卡|会员|rt|凭证|质保首登|未接码|已接码|2fa|稳定成品|发货格式)'
  );

update raw_offers
set canonical_product_id = 'dreamina-account', updated_at = now()
where hidden = false
  and canonical_product_id in ('grok-account', 'other-product')
  and lower(source_title) ~ '(dreamina|jimeng|即梦|吉梦|seedance|c档2.0|c档 2.0|c 档2.0|c 档 2.0)';

update raw_offers
set canonical_product_id = 'super-grok', updated_at = now()
where hidden = false
  and canonical_product_id = 'grok-account'
  and lower(source_title) ~ '(supergrok|super grok|grok.*super|super.*grok)'
  and lower(source_title) !~ '(适合super|适合 super|取邮件api|取邮件 api)'
  and lower(source_title) ~ '(3天|三天|7天|七天|月卡|月会员|会员|成品|独享|直充|卡密|激活码|heavy)';

update raw_offers
set canonical_product_id = 'kiro-pro-account', updated_at = now()
where hidden = false
  and canonical_product_id = 'kiro-account'
  and not (
    lower(source_title) ~ '(普号|free|固定50|50额度|kirors|kiro rs)'
    and lower(source_title) !~ '(kiro pro|kiro pro\+|power|promax|1000|2000|5000|1w|10000|100刀|200刀|500刀|100\$|200\$|500\$)'
  )
  and lower(source_title) ~ '(kiro pro|kiro pro\+|kiro pro max|kiro promax|pro\+|promax|power|积分|额度号|额度|号池|可超额|1000|2000|5000|1w|10000|100刀|200刀|500刀|100\$|200\$|500\$)';

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
    'reason', 'migration refine other platform products and filter tags',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
    'affectedProductIds', jsonb_build_array('x-twitter-account', 'x-twitter-premium', 'other-product', 'icloud-email', 'email-account', 'chatgpt-plus', 'chatgpt-free-account', 'apple-id-account', 'kiro-account', 'kiro-pro-account', 'grok-account', 'super-grok', 'dreamina-account', 'phone-verification', 'openai-phone-verification', 'google-phone-verification'),
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
