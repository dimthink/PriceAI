do $migration$
declare
  current_definition text;
  next_definition text;
  old_proxy_block constant text := $old$if text_value !~ '(仅支持?网页|只能网页|仅网页|网页号|不支持codex|无法使用codex|不能使用codex|不能直接登录codex|无法直接登录codex|无法codex|codex不售后|不可反代|无法反代|不能反代|不支持反代)'
    and text_value ~ '(可反代|支持反代|反代\+?codex|可用codex|支持codex|直接登录codex|sub2|cpa|api格式|json格式|json文件|sub格式|cpa格式)'
  then
    output := array_append(output, 'proxy_supported');
  end if;$old$;
  new_proxy_block constant text := $new$if text_value !~ '(仅支持?网页|只能网页|仅网页|网页号|不支持codex|无法使用codex|不能使用codex|不能直接登录codex|无法直接登录codex|无法codex|codex不售后|不可反代|无法反代|不能反代|不支持反代)'
    and text_value ~ '(可反代|支持反代|反代\+?codex|可用codex|支持codex|直接登录codex|sub2|cpa|api格式|json格式|json文件|sub格式|cpa格式)'
    and text_value ~ '(chatgpt|gpt|openai|codex)'
    and text_value ~ '(plus|team|business|free|普号|普通号|白号|账号|成品号|网页号|半成品|独享|母号|邀请|k12|bug|首登|已接码|未接码|已接|未接)'
    and text_value !~ '(gemini|claude|grok|kiro|cursor|perplexity|suno|dreamina|api|中转|余额|额度|号池|token|倍率|openrouter|nvidia)'
  then
    output := array_append(output, 'proxy_supported');
  end if;$new$;
begin
  select pg_get_functiondef('public.priceai_public_offer_filter_tags(text, text[])'::regprocedure)
  into current_definition;

  if position('openrouter|nvidia' in current_definition) > 0 then
    raise notice 'priceai_public_offer_filter_tags already scopes proxy_supported to ChatGPT account products';
  else
    if position(old_proxy_block in current_definition) = 0 then
      raise exception 'Expected proxy_supported filter tag block was not found';
    end if;

    next_definition := replace(current_definition, old_proxy_block, new_proxy_block);
    execute next_definition;
  end if;
end;
$migration$;

do $refresh_public_filter_tags$
declare
  refreshed_rows integer := 0;
begin
  loop
    with stale_offers as (
      select id
      from raw_offers
      where coalesce(public_filter_tags, '{}'::text[]) is distinct from priceai_public_offer_filter_tags(source_title, tags)
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
    'reason', 'migration scope proxy_supported filter tag and hide API/CDK public catalog',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
    'affectedProductIds', jsonb_build_array(
      'chatgpt-free-account',
      'chatgpt-plus',
      'chatgpt-team-business',
      'chatgpt-go',
      'chatgpt-pro-5x',
      'chatgpt-pro-20x',
      'claude-pro-month',
      'claude-max-5x',
      'claude-max-20x',
      'claude-account',
      'gemini-pro-year',
      'gemini-pro-recharge',
      'gemini-ultra',
      'grok-account',
      'super-grok',
      'super-grok-heavy',
      'openai-api-cdk'
    ),
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
