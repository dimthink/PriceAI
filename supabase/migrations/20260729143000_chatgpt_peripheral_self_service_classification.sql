update canonical_products
set
  display_name = 'Codex / ChatGPT 周边与自助服务',
  product_type = '辅助服务',
  spec = '提链 · 扫码 · 自助充值 · 额度重置',
  summary = 'Codex 或 ChatGPT 使用过程中的提链、支付二维码处理、扫码对接、自助充值、额度重置和其他辅助服务。不含成品账号、独立接码服务、API 额度或人工正价代充。',
  aliases = array['codex 重置额度', '重置额度', '长链提取', '链接提取', '提链', '扫码对接', '自助充值', '服务包', '周边服务'],
  updated_at = now()
where id = 'chatgpt-codex-service';

do $migration$
declare
  current_definition text;
  next_definition text;
  insertion_point constant text := $old$  if text_value ~ '(未接码|未完成接码|没接码|未绑手机|未绑定手机|没绑手机|没绑定手机|未绑手机号|未绑定手机号|无手机绑定|无绑手机|自行接码|自己接码|需自行接码|需自己接码|需要自行接码|需要自己接码|需要接码|需接码|要接码|接码登录codex|codex.{0,12}(需|要|需要|自行|自己)接码)' then$old$;
  service_blocks constant text := $new$  if text_value ~ '(提链|提炼|链接提取|提取链接|长链提取|长链接提取|支付链接提取|提取支付链接)' then
    output := array_append(output, 'chatgpt_service_link');
  end if;

  if text_value !~ '(不包括扫码|不含扫码|无需扫码|不用扫码|非扫码服务)'
    and text_value ~ '(扫码对接|代付代扫|代扫服务|支付二维码生成|二维码生成率|提取支付二维码|支付二维码提取)'
  then
    output := array_append(output, 'chatgpt_service_scan');
  end if;

  if text_value ~ '(自助充值|自助开通|自助卡密|卡密自助|自助激活|自动充值|自动开通|自动激活|全自动充值|全自动开通|全自动激活)' then
    output := array_append(output, 'chatgpt_service_self_recharge');
  end if;

  if text_value ~ '(未接码|未完成接码|没接码|未绑手机|未绑定手机|没绑手机|没绑定手机|未绑手机号|未绑定手机号|无手机绑定|无绑手机|自行接码|自己接码|需自行接码|需自己接码|需要自行接码|需要自己接码|需要接码|需接码|要接码|接码登录codex|codex.{0,12}(需|要|需要|自行|自己)接码)' then$new$;
begin
  select pg_get_functiondef('public.priceai_public_offer_filter_tags(text, text[])'::regprocedure)
  into current_definition;

  if position('chatgpt_service_self_recharge' in current_definition) > 0 then
    raise notice 'priceai_public_offer_filter_tags already emits ChatGPT peripheral service tags';
  else
    if position(insertion_point in current_definition) = 0 then
      raise exception 'Expected account-state filter block was not found';
    end if;
    next_definition := replace(current_definition, insertion_point, service_blocks);
    execute next_definition;
  end if;
end;
$migration$;

do $migration$
declare
  function_name regprocedure;
  current_definition text;
  next_definition text;
begin
  foreach function_name in array array[
    'public.list_public_product_offer_filter_facets(text)'::regprocedure,
    'public.build_source_quality_price_benchmark_rows()'::regprocedure
  ]
  loop
    select pg_get_functiondef(function_name) into current_definition;
    next_definition := replace(
      current_definition,
      '''delivery_recharge'',
      ''delivery_account'',',
      '''delivery_recharge'',
      ''chatgpt_service_link'',
      ''chatgpt_service_scan'',
      ''chatgpt_service_self_recharge'',
      ''delivery_account'','
    );
    next_definition := replace(
      next_definition,
      '(''delivery_recharge'', ''充值'', ''delivery_recharge'', false),
      (''delivery_account'', ''成品号'', ''delivery_account'', false),',
      '(''delivery_recharge'', ''充值'', ''delivery_recharge'', false),
      (''chatgpt_service_link'', ''提链'', ''chatgpt_service_link'', false),
      (''chatgpt_service_scan'', ''扫码'', ''chatgpt_service_scan'', false),
      (''chatgpt_service_self_recharge'', ''自助充值'', ''chatgpt_service_self_recharge'', false),
      (''delivery_account'', ''成品号'', ''delivery_account'', false),'
    );
    if next_definition <> current_definition then
      execute next_definition;
    end if;
  end loop;
end;
$migration$;

with peripheral_candidates as (
  select raw_offers.id
  from raw_offers
  where raw_offers.canonical_product_id in ('chatgpt-plus', 'chatgpt-plus-recharge', 'other-product', 'chatgpt-codex-service')
    and lower(coalesce(raw_offers.source_title, '')) !~ '(gemini|google[[:space:]]*ai|claude|grok|perplexity|telegram|twitter|x[[:space:]]*premium)'
    and lower(coalesce(raw_offers.source_title, '')) !~ '(api|中转|余额|token|openrouter|接码|验证码|短信验证|手机号验证)'
    and lower(coalesce(raw_offers.source_title, '')) !~ '(chatgpt[[:space:]]*go|gpt[[:space:]]*go|gpt[[:space:]]*team|chatgpt[[:space:]]*team|gptbusiness|gpt[[:space:]]*business|business.{0,3}team|pro.{0,8}(5x|20x|5倍|20倍)|(^|[^a-z])pro([^a-z]|$))'
    and (
      (
        lower(coalesce(raw_offers.source_title, '')) ~ '(chatgpt|gpt|openai|(^|[^a-z])plus([^a-z]|$)|kakao)'
        and lower(coalesce(raw_offers.source_title, '')) ~ '(自助充值|自助开通|自助卡密|卡密自助|自助激活|自动充值|自动开通|自动激活|全自动充值|全自动开通|全自动激活)'
        and (
          lower(coalesce(raw_offers.source_title, '')) !~ '(成品号|成品账号|成品帐号|独享账号|独享账户|账密|首登|直登)'
          or lower(coalesce(raw_offers.source_title, '')) ~ '(非成品|自备账号|自备号|自己账号|自己的账号|自己号|到自己账号|冲自己号|充值自己号|给自己号|任何账号可充|kakao自助充值)'
        )
      )
      or (
        lower(coalesce(raw_offers.source_title, '')) ~ '(chatgpt|gpt|openai|codex|(^|[^a-z])plus([^a-z]|$)|(^|[^a-z])upi([^a-z]|$)|(^|[^a-z])pix([^a-z]|$)|ideal|paypal)'
        and lower(coalesce(raw_offers.source_title, '')) ~ '(提链|提炼|链接提取|提取链接|长链提取|长链接提取|支付链接提取|扫码对接|代付代扫|代扫服务|支付二维码生成|二维码生成率|提取支付二维码|支付二维码提取|重置额度|额度重置|刷新额度|恢复额度)'
        and (
          lower(coalesce(raw_offers.source_title, '')) ~ '(代付代扫|代付服务|代扫服务)'
          or lower(coalesce(raw_offers.source_title, '')) !~ '(成品号|账号|账户|账密|月卡|会员|直充|代充)'
        )
      )
    )
)
update raw_offers
set
  canonical_product_id = 'chatgpt-codex-service',
  category_slug = 'ChatGPT',
  updated_at = now()
from peripheral_candidates
where raw_offers.id = peripheral_candidates.id;

set statement_timeout = '5min';

do $refresh_public_filter_tags$
declare
  refreshed_rows integer := 0;
begin
  loop
    with stale_offers as (
      select id
      from raw_offers
      where canonical_product_id in ('chatgpt-plus', 'chatgpt-plus-recharge', 'chatgpt-codex-service')
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

reset statement_timeout;

refresh materialized view source_quality_price_benchmarks;

delete from public_api_snapshots
where kind in ('explorer', 'product_offers', 'product_summaries');

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
    'reason', 'migration classify ChatGPT peripheral self-service offers',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
    'affectedProductIds', jsonb_build_array('chatgpt-plus', 'chatgpt-plus-recharge', 'chatgpt-codex-service'),
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
revoke execute on function build_source_quality_price_benchmark_rows() from anon, authenticated, public;

grant execute on function priceai_public_offer_filter_tags(text, text[]) to service_role;
grant execute on function list_public_product_offer_filter_facets(text) to service_role;
grant execute on function build_source_quality_price_benchmark_rows() to service_role;
