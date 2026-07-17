do $migration$
declare
  current_definition text;
  next_definition text;
  domestic_mirror_block constant text := $old$if text_value ~ '(国内镜像站|国内镜像|网页镜像|镜像站|镜像|mirror)' then
    output := array_append(output, 'domestic_mirror_site');
  end if;$old$;
  web_only_block constant text := $new$if text_value ~ '(国内镜像站|国内镜像|网页镜像|镜像站|镜像|mirror)' then
    output := array_append(output, 'domestic_mirror_site');
  end if;

  if text_value ~ '(网页号|仅限网页|仅支持?网页|只支持网页|只能网页|仅网页|只可网页|只能网页登录|仅网页登录)' then
    output := array_append(output, 'web_only_account');
  end if;$new$;
  delivery_recharge_tail constant text := $old$output := array_append(output, 'delivery_recharge');
  end if;

  if text_value !~ '(非成品|不是成品|非账号|不是账号|非账户|不是账户|不交付账号|不发账号|不提供账号|不含账号|无需账号|自备账号|自备号|自己账号|自己的账号|到自己账号|冲自己号|充值自己号|给自己号)'$old$;
  account_state_tail constant text := $new$output := array_append(output, 'delivery_recharge');
  end if;

  if text_value ~ '(未接码|未完成接码|没接码|未绑手机|未绑定手机|没绑手机|没绑定手机|未绑手机号|未绑定手机号|无手机绑定|无绑手机|自行接码|自己接码|需自行接码|需自己接码|需要自行接码|需要自己接码|需要接码|需接码|要接码|接码登录codex|codex.{0,12}(需|要|需要|自行|自己)接码)' then
    output := array_append(output, 'account_unverified');
  elsif text_value ~ '(已接码|已完成接码|已经接码|已手机接码|已绑手机|已绑定手机|已经绑手机|已经绑定手机|已绑手机号|已绑定手机号|带2fa|带二验|可二验)' then
    output := array_append(output, 'account_verified');
  end if;

  if text_value !~ '(非成品|不是成品|非账号|不是账号|非账户|不是账户|不交付账号|不发账号|不提供账号|不含账号|无需账号|自备账号|自备号|自己账号|自己的账号|到自己账号|冲自己号|充值自己号|给自己号)'$new$;
begin
  select pg_get_functiondef('public.priceai_public_offer_filter_tags(text, text[])'::regprocedure)
  into current_definition;

  if position('web_only_account' in current_definition) > 0 then
    raise notice 'priceai_public_offer_filter_tags already emits ChatGPT Plus account-state tags';
  else
    if position(domestic_mirror_block in current_definition) = 0 then
      raise exception 'Expected domestic mirror filter tag block was not found';
    end if;
    if position(delivery_recharge_tail in current_definition) = 0 then
      raise exception 'Expected delivery recharge filter tag block was not found';
    end if;

    next_definition := replace(current_definition, domestic_mirror_block, web_only_block);
    next_definition := replace(next_definition, delivery_recharge_tail, account_state_tail);
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
    'public.list_public_product_offers_page(text, integer, integer)'::regprocedure,
    'public.list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer)'::regprocedure,
    'public.list_public_offers_page(text, text, text, text, text, numeric, numeric, integer, integer)'::regprocedure,
    'public.list_public_product_offer_filter_facets(text)'::regprocedure,
    'public.list_public_product_summaries()'::regprocedure,
    'public.get_public_product_summary(text)'::regprocedure,
    'public.list_source_quality_price_benchmarks()'::regprocedure
  ]
  loop
    select pg_get_functiondef(function_name) into current_definition;
    next_definition := current_definition;

    next_definition := replace(
      next_definition,
      'array[''shared_access'', ''domestic_mirror_site'']::text[]',
      'array[''shared_access'', ''web_only_account'', ''domestic_mirror_site'']::text[]'
    );
    next_definition := replace(
      next_definition,
      'coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags)) @> array[''shared_access'']::text[]',
      'coalesce(raw_offers.public_filter_tags, priceai_public_offer_filter_tags(raw_offers.source_title, raw_offers.tags)) && array[''shared_access'', ''web_only_account'', ''domestic_mirror_site'']::text[]'
    );
    next_definition := replace(
      next_definition,
      '''shared_access'',
      ''domestic_mirror_site'',',
      '''shared_access'',
      ''web_only_account'',
      ''domestic_mirror_site'','
    );
    next_definition := replace(
      next_definition,
      '''delivery_account'',
      ''gemini_12_month_link'',',
      '''delivery_account'',
      ''account_verified'',
      ''account_unverified'',
      ''gemini_12_month_link'','
    );
    next_definition := replace(
      next_definition,
      'and not (offers.public_offer_filter_tags @> array[''shared_access'']::text[])
      and not (offers.public_offer_filter_tags @> array[''domestic_mirror_site'']::text[])',
      'and not (offers.public_offer_filter_tags @> array[''shared_access'']::text[])
      and not (offers.public_offer_filter_tags @> array[''web_only_account'']::text[])
      and not (offers.public_offer_filter_tags @> array[''domestic_mirror_site'']::text[])'
    );
    next_definition := replace(
      next_definition,
      'and not (deduped.public_offer_filter_tags @> array[''shared_access'']::text[])
      and not (deduped.public_offer_filter_tags @> array[''domestic_mirror_site'']::text[])',
      'and not (deduped.public_offer_filter_tags @> array[''shared_access'']::text[])
      and not (deduped.public_offer_filter_tags @> array[''web_only_account'']::text[])
      and not (deduped.public_offer_filter_tags @> array[''domestic_mirror_site'']::text[])'
    );
    next_definition := replace(
      next_definition,
      '(''shared_access'', ''拼车/团购'', ''shared_access'', false),
      (''domestic_mirror_site'', ''国内镜像站'', ''domestic_mirror_site'', false),',
      '(''shared_access'', ''拼车/团购'', ''shared_access'', false),
      (''web_only_account'', ''网页号'', ''web_only_account'', false),
      (''domestic_mirror_site'', ''国内镜像站'', ''domestic_mirror_site'', false),'
    );
    next_definition := replace(
      next_definition,
      '(''delivery_account'', ''成品号'', ''delivery_account'', false),
      (''gemini_12_month_link'', ''12个月提链'', ''gemini_12_month_link'', false),',
      '(''delivery_account'', ''成品号'', ''delivery_account'', false),
      (''account_verified'', ''已接码成品号'', ''account_verified'', false),
      (''account_unverified'', ''未接码成品号'', ''account_unverified'', false),
      (''gemini_12_month_link'', ''12个月提链'', ''gemini_12_month_link'', false),'
    );

    if next_definition <> current_definition then
      execute next_definition;
    end if;
  end loop;
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
      where (
          canonical_product_id = 'chatgpt-plus'
          or regexp_replace(lower(coalesce(source_title, '') || ' ' || array_to_string(coalesce(tags, array[]::text[]), ' ')), '[[:space:]]+', '', 'g')
            ~ '(网页号|仅限网页|仅支持?网页|只支持网页|只能网页|仅网页|只可网页|只能网页登录|仅网页登录|未接码|已接码|未绑手机|已绑手机|未绑定手机|已绑定手机|自行接码|自己接码|需自行接码|需要自行接码|需要接码|需接码)'
        )
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
where kind = 'explorer'
  or (
    kind = 'product_offers'
    and cache_key like 'v4-ai-subscription-tags:%'
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
    'reason', 'migration refine ChatGPT Plus account filters',
    'refreshIntervalSeconds', 60,
    'globalDirty', false,
    'fullRefreshRequired', false,
    'affectedProductIds', jsonb_build_array('chatgpt-plus'),
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
revoke execute on function list_public_product_offers_page(text, integer, integer) from anon, authenticated, public;
revoke execute on function list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer) from anon, authenticated, public;
revoke execute on function list_public_offers_page(text, text, text, text, text, numeric, numeric, integer, integer) from anon, authenticated, public;
revoke execute on function list_public_product_offer_filter_facets(text) from anon, authenticated, public;
revoke execute on function list_public_product_summaries() from anon, authenticated, public;
revoke execute on function get_public_product_summary(text) from anon, authenticated, public;
revoke execute on function list_source_quality_price_benchmarks() from anon, authenticated, public;

grant execute on function priceai_public_offer_filter_tags(text, text[]) to service_role;
grant execute on function list_public_product_offers_page(text, integer, integer) to service_role;
grant execute on function list_public_product_offers_page_v2(text, text[], text, text, text, numeric, numeric, integer, integer) to service_role;
grant execute on function list_public_offers_page(text, text, text, text, text, numeric, numeric, integer, integer) to service_role;
grant execute on function list_public_product_offer_filter_facets(text) to service_role;
grant execute on function list_public_product_summaries() to service_role;
grant execute on function get_public_product_summary(text) to service_role;
grant execute on function list_source_quality_price_benchmarks() to service_role;
