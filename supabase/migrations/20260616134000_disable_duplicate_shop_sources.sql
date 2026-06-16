with duplicate_sources(id, canonical_id) as (
  values
    ('ldxp-gpt-gemini账号优惠ai', 'ldxp-ai小店'),
    ('ldxp-plus账号专卖', 'ldxp-ai小店'),
    ('nodebits-a34bbfba26e62843', 'ldxp-aiteam'),
    ('pay-ldxp-cn', 'ldxp-ikun666'),
    ('ldxp-极速ai', 'ldxp-启航ai')
)
update sources
set
  enabled = false,
  collector_lock_until = null,
  collector_lock_owner = null,
  collector_lock_started_at = null,
  notes = concat_ws(
    E'\n',
    nullif(sources.notes, ''),
    '已禁用：同一店铺入口重复来源，保留 canonical source ' || duplicate_sources.canonical_id || '。'
  ),
  updated_at = now()
from duplicate_sources
where sources.id = duplicate_sources.id;

with duplicate_sources(id, canonical_id) as (
  values
    ('ldxp-gpt-gemini账号优惠ai', 'ldxp-ai小店'),
    ('ldxp-plus账号专卖', 'ldxp-ai小店'),
    ('nodebits-a34bbfba26e62843', 'ldxp-aiteam'),
    ('pay-ldxp-cn', 'ldxp-ikun666'),
    ('ldxp-极速ai', 'ldxp-启航ai')
)
update raw_offers
set
  hidden = true,
  effective_status = 'unavailable',
  freshness_status = 'fresh',
  last_failed_at = now(),
  failure_reason = '管理员手动下架：同一店铺入口重复来源，已保留 canonical source。',
  updated_at = now()
from duplicate_sources
where raw_offers.source_id = duplicate_sources.id
  and raw_offers.hidden = false;
