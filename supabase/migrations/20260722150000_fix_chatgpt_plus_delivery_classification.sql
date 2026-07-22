do $migration$
declare
  current_definition text;
  next_definition text;
  old_official_signal constant text := '(官方直充|官方充值|官方代充|官方订阅|正价代充|正规充值|正规官方|官网直充|官网代充|人工直充|自动直充|带账单|质保订阅)';
  new_official_signal constant text := '(官方直充|官方充值|官方代充|官方订阅|正价代充|正价充值|正规充值|正规官方|正规卡付|正规卡冲|官网直充|官网直冲|官网代充|人工直充|自动直充|带账单|质保订阅|保订阅|(google|谷歌).{0,8}(内购|正价)|(内购|正价).{0,8}(google|谷歌))';
begin
  select pg_get_functiondef('public.priceai_public_offer_filter_tags(text, text[])'::regprocedure)
  into current_definition;

  if position(new_official_signal in current_definition) > 0 then
    raise notice 'priceai_public_offer_filter_tags already recognizes complete ChatGPT Plus recharge signals';
  else
    if position(old_official_signal in current_definition) = 0 then
      raise exception 'Expected ChatGPT Plus official recharge signal was not found';
    end if;

    next_definition := replace(current_definition, old_official_signal, new_official_signal);
    execute next_definition;
  end if;
end;
$migration$;

with account_delivery_offers as (
  select raw_offers.id
  from raw_offers
  where raw_offers.canonical_product_id = 'chatgpt-plus-recharge'
    and lower(coalesce(raw_offers.source_title, '')) ~ '(chatgpt[[:space:]]*plus|gpt[[:space:]]*plus|(^|[^a-z])plus([^a-z]|$))'
    and lower(coalesce(raw_offers.source_title, '')) !~ '(自备账号|自备号|自己账号|自己的账号|自己号|自己的号|到自己账号|充值到自己账号|充自己号|给自己号|任何账号可充)'
    and (
      lower(coalesce(raw_offers.source_title, '')) ~ '(成品号|成品账号|成品帐号|独享账号|独享账户|账密|首登|直登|未接码|已接码|网页号|半成品|母号邮箱|邮箱随机发货|拿到后立刻改密码|拿到后改密码|修改密码|改密码|支持登录[[:space:]]*codex|直接登录[[:space:]]*codex|登录[[:space:]]*codex|带[[:space:]]*2fa|2fa|二验)'
      or (
        lower(coalesce(raw_offers.source_title, '')) ~ '(gmail[[:space:]]*邮箱|icloud[[:space:]]*邮箱|outlook[[:space:]]*邮箱|微软邮箱|谷歌邮箱)'
        and lower(coalesce(raw_offers.source_title, '')) ~ '(支持登录|可以登录|可登录|登录[[:space:]]*codex|可网页|动态家宽注册|2fa|二验)'
      )
    )
)
update raw_offers
set
  canonical_product_id = 'chatgpt-plus',
  category_slug = 'ChatGPT',
  updated_at = now()
from account_delivery_offers
where raw_offers.id = account_delivery_offers.id;

with recharge_delivery_offers as (
  select raw_offers.id
  from raw_offers
  where raw_offers.canonical_product_id = 'chatgpt-plus'
    and raw_offers.price >= 50
    and lower(coalesce(raw_offers.source_title, '')) ~ '(chatgpt[[:space:]]*plus|gpt[[:space:]]*plus|(^|[^a-z])plus([^a-z]|$))'
    and not (
      lower(coalesce(raw_offers.source_title, '')) !~ '(自备账号|自备号|自己账号|自己的账号|自己号|自己的号|到自己账号|充值到自己账号|充自己号|给自己号|任何账号可充)'
      and (
        lower(coalesce(raw_offers.source_title, '')) ~ '(成品号|成品账号|成品帐号|独享账号|独享账户|账密|首登|直登|未接码|已接码|网页号|半成品|母号邮箱|邮箱随机发货|拿到后立刻改密码|拿到后改密码|修改密码|改密码|支持登录[[:space:]]*codex|直接登录[[:space:]]*codex|登录[[:space:]]*codex|带[[:space:]]*2fa|2fa|二验)'
        or (
          lower(coalesce(raw_offers.source_title, '')) ~ '(gmail[[:space:]]*邮箱|icloud[[:space:]]*邮箱|outlook[[:space:]]*邮箱|微软邮箱|谷歌邮箱)'
          and lower(coalesce(raw_offers.source_title, '')) ~ '(支持登录|可以登录|可登录|登录[[:space:]]*codex|可网页|动态家宽注册|2fa|二验)'
        )
      )
    )
    and not (
      lower(coalesce(raw_offers.source_title, '')) ~ '(pix|巴西渠道)'
      and lower(coalesce(raw_offers.source_title, '')) ~ '(试用|新号|老号|不包二验|未接码|已接码|首登|质保48小时|质保两天|质保首登)'
    )
    and (
      lower(coalesce(raw_offers.source_title, '')) ~ '(官方直充|官方充值|官方代充|官方订阅|正价代充|正价充值|正规充值|正规官方|正规卡付|正规卡冲|官网直充|官网直冲|官网代充|人工直充|自动直充|带账单|质保订阅|保订阅|(google|谷歌).{0,8}(内购|正价)|(内购|正价).{0,8}(google|谷歌))'
      or lower(coalesce(raw_offers.source_title, '')) ~ '(ios土区|土区[[:space:]]*ios|ios[[:space:]]*土区|土耳其|土耳其区|土区)'
      or (
        lower(coalesce(raw_offers.source_title, '')) ~ '(菲律宾|菲律宾区|菲区|非区|ph区|巴西|巴西区|br区|埃及|埃及区|eg区|巴基斯坦|巴基斯坦区|pk区|加拿大|加拿大区|ca区|日本|日本区|日区|jp区|越南|越南区|vn区|韩国|韩国区|kr区|尼日利亚|尼区|ng区|美区|美国区|us区)'
        and lower(coalesce(raw_offers.source_title, '')) ~ '(充值|秒冲|代充|直充|直冲|续费|卡密|cdk|兑换码|自助卡密|月卡批发|批发|卡冲|卡充|卡付|官方订阅|正规充值|正规官方|正规卡付|正规卡冲|内购|带账单|正规账单|充自己号|自己的账号|自备账号)'
      )
      or (
        lower(coalesce(raw_offers.source_title, '')) ~ '(ios|app[[:space:]]*store|appstore|内购|苹果内购)'
        and lower(coalesce(raw_offers.source_title, '')) ~ '(充值|秒冲|代充|直充|直冲|续费|卡密|cdk|兑换码|自助卡密|卡冲|卡充|卡付|官方订阅)'
      )
    )
)
update raw_offers
set
  canonical_product_id = 'chatgpt-plus-recharge',
  category_slug = 'ChatGPT',
  updated_at = now()
from recharge_delivery_offers
where raw_offers.id = recharge_delivery_offers.id;

do $refresh_public_filter_tags$
declare
  refreshed_rows integer := 0;
begin
  loop
    with stale_offers as (
      select id
      from raw_offers
      where canonical_product_id in ('chatgpt-plus', 'chatgpt-plus-recharge')
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
    'reason', 'migration fix ChatGPT Plus delivery classification',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
    'affectedProductIds', jsonb_build_array('chatgpt-plus', 'chatgpt-plus-recharge'),
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
grant execute on function priceai_public_offer_filter_tags(text, text[]) to service_role;
