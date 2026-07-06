create or replace function reap_expired_collection_jobs(
  p_worker text default 'collector-agent',
  p_limit integer default 50
)
returns setof collection_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 500));
begin
  return query
  with expired as (
    select id
    from collection_jobs
    where status = 'running'
      and locked_until is not null
      and locked_until < v_now
      and attempts >= max_attempts
    order by locked_until asc, created_at asc
    for update skip locked
    limit v_limit
  ),
  reaped as (
    update collection_jobs jobs
    set
      status = 'failed',
      finished_at = v_now,
      locked_by = null,
      locked_until = null,
      last_error = coalesce(
        jobs.last_error,
        '采集任务锁已过期，且重试次数已用尽；系统已自动收敛为失败。'
      ),
      result = coalesce(jobs.result, '{}'::jsonb) || jsonb_build_object(
        'reapedBy', coalesce(nullif(p_worker, ''), 'collector-agent'),
        'reapedAt', v_now,
        'reapReason', 'expired_lock_max_attempts'
      ),
      updated_at = v_now
    from expired
    where jobs.id = expired.id
    returning jobs.*
  ),
  feedback_updated as (
    update offer_feedback feedback
    set
      verification_status = 'failed',
      verification_result = 'blocked',
      verification_message = '自动重采任务锁已过期且重试次数已用尽；请人工复核或重新触发重采。',
      verification_checked_at = v_now,
      ai_review_result = coalesce(feedback.ai_review_result, '{}'::jsonb) || jsonb_build_object(
        'verificationStatus', 'failed',
        'verificationResult', 'blocked',
        'verificationMessage', '自动重采任务锁已过期且重试次数已用尽；请人工复核或重新触发重采。',
        'verifiedAt', v_now,
        'completedCollectionJobId', feedback.created_collection_job_id,
        'reapReason', 'expired_lock_max_attempts'
      )
    from reaped
    where feedback.created_collection_job_id = reaped.id
      and reaped.requested_by = 'feedback'
      and feedback.verification_status in ('pending', 'running', 'recollection_created')
    returning feedback.id
  )
  select * from reaped;
end;
$$;

revoke execute on function reap_expired_collection_jobs(text, integer) from anon, authenticated, public;
grant execute on function reap_expired_collection_jobs(text, integer) to service_role;
