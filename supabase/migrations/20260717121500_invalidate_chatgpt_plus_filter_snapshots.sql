delete from public_api_snapshots
where kind = 'explorer'
  or (
    kind = 'product_offers'
    and (
      cache_key like 'v5-plus-account-state-tags:%:chatgpt-plus:limit:30'
      or cache_key like 'v5-plus-account-state-tags:%:chatgpt-plus-recharge:limit:30'
      or cache_key like 'v4-ai-subscription-tags:%:chatgpt-plus:limit:30'
      or cache_key like 'v4-ai-subscription-tags:%:chatgpt-plus-recharge:limit:30'
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
    'reason', 'migration invalidate ChatGPT Plus filter snapshots',
    'refreshIntervalSeconds', 60,
    'globalDirty', false,
    'fullRefreshRequired', false,
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
