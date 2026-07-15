alter table offer_feedback
  add column if not exists feedback_scope text not null default 'offer',
  add column if not exists public_status text not null default 'not_public',
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdraw_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offer_feedback_scope_check'
  ) then
    alter table offer_feedback
      add constraint offer_feedback_scope_check
      check (feedback_scope in ('offer', 'merchant'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'offer_feedback_public_status_check'
  ) then
    alter table offer_feedback
      add constraint offer_feedback_public_status_check
      check (public_status in ('not_public', 'pending_review', 'public', 'withdrawn'));
  end if;
end $$;

update offer_feedback
set public_status = 'pending_review'
where public_status = 'not_public'
  and status <> 'ignored'
  and ai_review_result -> 'riskPrecheck' is not null;

update offer_feedback
set public_status = 'not_public'
where status = 'ignored'
  and public_status <> 'withdrawn';

create index if not exists offer_feedback_scope_created_at_idx
  on offer_feedback(feedback_scope, created_at desc);

create index if not exists offer_feedback_public_status_idx
  on offer_feedback(public_status, created_at desc);

create index if not exists offer_feedback_user_public_status_idx
  on offer_feedback(user_id, public_status, created_at desc);
