drop index if exists channel_submissions_pending_root_key_uidx;

with preferred_roots as (
  select distinct on (canonical_channel_key)
    canonical_channel_key,
    id as preferred_id,
    coalesce(name, parsed_title, url) as preferred_name,
    url as preferred_url
  from channel_submissions
  where status = 'pending'
    and canonical_channel_key is not null
  order by
    canonical_channel_key,
    (case when contact is not null then 1 else 0 end
      + case when notes is not null then 1 else 0 end
      + case when name is not null then 1 else 0 end
      + case when parsed_title is not null then 1 else 0 end) desc,
    created_at desc,
    id asc
)
update channel_submissions submissions
set
  duplicate_of_submission_id = case
    when submissions.id = preferred_roots.preferred_id then null
    else preferred_roots.preferred_id
  end,
  parsed_meta = case
    when submissions.id = preferred_roots.preferred_id then submissions.parsed_meta
      - 'duplicate_pending_submission_id'
      - 'duplicate_pending_submission_name'
      - 'duplicate_pending_submission_url'
      - 'duplicate_pending_reason'
    else jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            submissions.parsed_meta,
            '{duplicate_pending_submission_id}',
            to_jsonb(preferred_roots.preferred_id),
            true
          ),
          '{duplicate_pending_submission_name}',
          to_jsonb(preferred_roots.preferred_name),
          true
        ),
        '{duplicate_pending_submission_url}',
        to_jsonb(preferred_roots.preferred_url),
        true
      ),
      '{duplicate_pending_reason}',
      '"same_canonical_source_url"'::jsonb,
      true
    )
  end
from preferred_roots
where submissions.status = 'pending'
  and submissions.canonical_channel_key = preferred_roots.canonical_channel_key;

update channel_submissions
set
  duplicate_of_submission_id = null,
  parsed_meta = parsed_meta
    - 'duplicate_pending_submission_id'
    - 'duplicate_pending_submission_name'
    - 'duplicate_pending_submission_url'
    - 'duplicate_pending_reason'
where status = 'pending'
  and canonical_channel_key is null
  and duplicate_of_submission_id is not null;

with classified as (
  select
    id,
    case
      when duplicate_of_submission_id is not null or coalesce(parsed_meta->>'existing_source_id', '') <> '' then 'duplicate'
      when parsed_meta->'probe_result'->>'status' in ('queued', 'running') then 'environment_issue'
      when parsed_meta->'probe_result'->>'status' = 'success'
        and coalesce((parsed_meta->'probe_result'->>'offerCount')::integer, 0) >= 8 then 'priority_approve'
      when parsed_meta->'probe_result'->>'status' = 'success' then 'valuable_lead'
      when parsed_meta->'probe_result'->>'status' = 'empty' then 'low_quality'
      when parsed_meta->'probe_result'->>'status' in ('failed', 'unsupported') then 'needs_review'
      when lower(coalesce(parsed_meta->>'suggested_collector_kind', '')) = 'shopapi' then 'environment_issue'
      else 'needs_review'
    end as kind
  from channel_submissions
  where status = 'pending'
)
update channel_submissions submissions
set
  preclassification_kind = classified.kind,
  preclassification = jsonb_build_object(
    'kind', classified.kind,
    'label', case classified.kind
      when 'duplicate' then '重复/已存在'
      when 'environment_issue' then case
        when submissions.parsed_meta->'probe_result'->>'status' = 'queued' then '已入队试采集'
        when submissions.parsed_meta->'probe_result'->>'status' = 'running' then '采集中'
        else '待低频试采集'
      end
      when 'priority_approve' then '优先通过'
      when 'valuable_lead' then '有价值线索'
      when 'low_quality' then '低质/无优势'
      else '观察/待复核'
    end,
    'tone', case classified.kind
      when 'priority_approve' then 'success'
      when 'valuable_lead' then 'info'
      when 'environment_issue' then 'info'
      when 'low_quality' then 'danger'
      when 'duplicate' then 'warn'
      else 'warn'
    end,
    'reasons', case classified.kind
      when 'duplicate' then jsonb_build_array('同渠道已有待审主记录', '请合并或忽略重复项')
      when 'environment_issue' then jsonb_build_array('等待低频采集节点提供运行证据', '等待期间不按低质处理')
      when 'priority_approve' then jsonb_build_array('试采集样本相对充足', '迁移后再次试采会补充完整价格基准')
      when 'valuable_lead' then jsonb_build_array('已获得有效试采集结果', '仍需人工确认价格与商品价值')
      when 'low_quality' then jsonb_build_array('试采集完成但没有可比价商品', '请确认空店、非目标商品或解析不足')
      else jsonb_build_array('已有基础解析，仍需人工复核')
    end,
    'version', '2026-07-18.migration-v2',
    'classifiedAt', now()
  ),
  classification_version = '2026-07-18.migration-v2',
  classified_at = now()
from classified
where submissions.id = classified.id;

alter table channel_submissions
  drop constraint if exists channel_submissions_duplicate_not_self;

alter table channel_submissions
  add constraint channel_submissions_duplicate_not_self
  check (duplicate_of_submission_id is null or duplicate_of_submission_id <> id);

create unique index channel_submissions_pending_root_key_uidx
  on channel_submissions(canonical_channel_key)
  where status = 'pending'
    and duplicate_of_submission_id is null
    and canonical_channel_key is not null;
