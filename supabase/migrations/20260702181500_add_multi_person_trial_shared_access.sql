do $migration$
declare
  current_definition text;
  next_definition text;
  old_shared_signal constant text := $old$text_value ~ '(拼车|团购|拼团|车位|多人共享|多人共用|(二|两|双|三|四|五|六|七|八|九|十|[2-9]|[1-9][0-9])人(车|共享|共用|位)|多人车|车友|车队|家庭车|团号|团购车|拼车位|共享车)'$old$;
  new_shared_signal constant text := $new$text_value ~ '(拼车|团购|拼团|车位|多人共享|多人共用|(多人|二人|两人|双人|三人|四人|五人|六人|七人|八人|九人|十人|[2-9]人|[1-9][0-9]人)体验(号|账号|帐号)|(二|两|双|三|四|五|六|七|八|九|十|[2-9]|[1-9][0-9])人(车|共享|共用|位)|多人车|车友|车队|家庭车|团号|团购车|拼车位|共享车)'$new$;
begin
  select pg_get_functiondef('public.priceai_public_offer_filter_tags(text, text[])'::regprocedure)
  into current_definition;

  if position(new_shared_signal in current_definition) > 0 then
    raise notice 'priceai_public_offer_filter_tags already recognizes multi-person trial accounts as shared access';
  else
    if position(old_shared_signal in current_definition) = 0 then
      raise exception 'Expected shared access signal clause was not found';
    end if;

    next_definition := replace(current_definition, old_shared_signal, new_shared_signal);
    execute next_definition;
  end if;
end;
$migration$;

update raw_offers
set source_title = source_title
where coalesce(public_filter_tags, '{}'::text[]) is distinct from priceai_public_offer_filter_tags(source_title, tags);

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
    'reason', 'migration add multi-person trial accounts to shared access filter',
    'refreshIntervalSeconds', 60,
    'globalDirty', true,
    'fullRefreshRequired', true,
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
