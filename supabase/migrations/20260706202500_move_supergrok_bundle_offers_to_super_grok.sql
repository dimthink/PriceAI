with super_grok_bundle_offers as (
  select id
  from raw_offers
  where hidden = false
    and canonical_product_id = 'x-twitter-premium'
    and (
      source_title ~* '(super[[:space:]]*grok|supergrok|grok[[:space:]]*super)'
      or source_title ~* '(自带|带|赠送|包含|含)[[:space:]]*super[[:space:]]*grok'
      or source_title ~* '(自带|带|赠送|包含|含)[[:space:]]*supergrok'
    )
    and lower(source_title) !~ '(非[[:space:]]*super[[:space:]]*grok|不是[[:space:]]*super[[:space:]]*grok|不含[[:space:]]*super[[:space:]]*grok|非supergrok|不是supergrok|不含supergrok)'
    and lower(source_title) !~ '(super[[:space:]]*grok[[:space:]]*heavy|supergrok[[:space:]]*heavy|grok[[:space:]]*super[[:space:]]*heavy|grok[[:space:]]*heavy|heavy[[:space:]]*grok)'
)
update raw_offers
set
  canonical_product_id = 'super-grok',
  category_slug = 'Grok',
  updated_at = now()
from super_grok_bundle_offers
where raw_offers.id = super_grok_bundle_offers.id
  and (
    raw_offers.canonical_product_id is distinct from 'super-grok'
    or raw_offers.category_slug is distinct from 'Grok'
  );

delete from public_api_snapshots
where kind in ('explorer', 'offers', 'product_offers');

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
    'reason', 'migration move SuperGrok bundle offers to Super Grok',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
    'affectedProductIds', jsonb_build_array('x-twitter-premium', 'super-grok', 'super-grok-heavy'),
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
