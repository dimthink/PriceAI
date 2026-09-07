do $migration$
declare
  current_definition text;
  next_definition text;
  old_official_signal constant text := '(官方直充|官方充值|官方代充|官方订阅|正价代充|正价充值|正规充值|正规官方|正规卡付|正规卡冲|官网直充|官网直冲|官网代充|人工直充|自动直充|带账单|质保订阅|保订阅|(google|谷歌).{0,8}(内购|正价)|(内购|正价).{0,8}(google|谷歌))';
  new_official_signal constant text := '(官方直充|官方充值|官方代充|官方订阅|正价代充|正价充值|正规充值|正规官方|正规卡付|正规卡冲|官网直充|官网直冲|官网代充|人工直充|自动直充|带账单|质保订阅|保订阅|(google|谷歌).{0,8}(内购|正价)|(内购|正价).{0,8}(google|谷歌)|(google|谷歌)(pay)?渠道.{0,32}(充值|代充|直充|秒冲|cdk|卡密|订阅)|(充值|代充|直充|秒冲|cdk|卡密|订阅).{0,32}(google|谷歌)(pay)?渠道)';
begin
  select pg_get_functiondef('public.priceai_public_offer_filter_tags(text, text[])'::regprocedure)
  into current_definition;

  if position(new_official_signal in current_definition) > 0 then
    raise notice 'priceai_public_offer_filter_tags already recognizes Google channel recharge actions';
  else
    if position(old_official_signal in current_definition) = 0 then
      raise exception 'Expected ChatGPT Plus official recharge signal was not found';
    end if;

    next_definition := replace(current_definition, old_official_signal, new_official_signal);
    execute next_definition;
  end if;
end;
$migration$;

with google_recharge_offers as (
  select raw_offers.id
  from raw_offers
  where raw_offers.canonical_product_id = 'chatgpt-plus'
    and raw_offers.price >= 50
    and lower(coalesce(raw_offers.source_title, '')) ~ '(chatgpt[[:space:]]*plus|gpt[[:space:]]*plus|(^|[^a-z])plus([^a-z]|$))'
    and lower(coalesce(raw_offers.source_title, '')) ~ '((google|谷歌)(pay)?渠道.{0,32}(充值|代充|直充|秒冲|cdk|卡密|订阅)|(充值|代充|直充|秒冲|cdk|卡密|订阅).{0,32}(google|谷歌)(pay)?渠道)'
    and not (
      lower(coalesce(raw_offers.source_title, '')) !~ '(自备账号|自备号|自己账号|自己的账号|自己号|自己的号|到自己账号|充值到自己账号|充自己号|给自己号|任何账号可充)'
      and lower(coalesce(raw_offers.source_title, '')) ~ '(成品号|成品账号|成品帐号|独享账号|独享账户|账密|首登|直登|未接码|已接码|网页号|半成品|母号邮箱|邮箱随机发货|拿到后立刻改密码|拿到后改密码|修改密码|改密码|支持登录[[:space:]]*codex|直接登录[[:space:]]*codex|登录[[:space:]]*codex|带[[:space:]]*2fa|2fa|二验)'
    )
)
update raw_offers
set
  canonical_product_id = 'chatgpt-plus-recharge',
  category_slug = 'ChatGPT',
  updated_at = now()
from google_recharge_offers
where raw_offers.id = google_recharge_offers.id;

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
    'reason', 'migration refine ChatGPT Plus Google channel recharge',
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
