with plus_assist_email_offers as (
  select
    id,
    case
      when source_title ~* '(outlook|hotmail|微软邮箱|microsoft[[:space:]]*邮箱)' then 'outlook-account'
      when source_title ~* '(gmail|谷歌邮箱|google[[:space:]]*邮箱|google邮箱|谷歌账号|google[[:space:]]*账号)' then 'gmail-account'
      else 'email-account'
    end as target_product_id
  from raw_offers
  where canonical_product_id = 'chatgpt-plus'
    and source_title ~* '(gmail|谷歌邮箱|google[[:space:]]*邮箱|google邮箱|谷歌账号|google[[:space:]]*账号|outlook|hotmail|微软邮箱|microsoft[[:space:]]*邮箱|邮箱)'
    and lower(source_title) ~ '(配合[[:space:]]*plus|plus[[:space:]]*自助充值[[:space:]]*使用|plus[[:space:]]*使用|自助充值[[:space:]]*使用|充值[[:space:]]*使用|注册[[:space:]]*gpt[[:space:]]*专用|适用于[[:space:]]*gpt|可开[[:space:]]*gpt|可注册[[:space:]]*gpt)'
    and lower(source_title) !~ '(plus[[:space:]]*(成品|独享成品|会员|账号|月卡|一年|直充|代充|卡密)|成品号|成品账号|成品会员|独享账号|独享成品|会员|月卡|年卡|订阅|首登|直登|账密|rt|凭证|json|cpa|直充|代充|卡密|自助开通|自动发货)'
)
update raw_offers
set
  canonical_product_id = plus_assist_email_offers.target_product_id,
  category_slug = '邮箱',
  updated_at = now()
from plus_assist_email_offers
where raw_offers.id = plus_assist_email_offers.id
  and (
    raw_offers.canonical_product_id is distinct from plus_assist_email_offers.target_product_id
    or raw_offers.category_slug is distinct from '邮箱'
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
    'reason', 'migration move Plus-assist email offers back to email products',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
    'affectedProductIds', jsonb_build_array('chatgpt-plus', 'gmail-account', 'outlook-account', 'email-account'),
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
