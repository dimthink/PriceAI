do $$
declare
  current_definition text;
  next_definition text;
  target_clause constant text := 'where offers.is_public_available = true
      and offers.public_offer_filter_tags @> array[''warranty_long'']::text[]';
  replacement_clause constant text := 'where offers.is_public_available = true
      and offers.public_offer_filter_tags @> array[''warranty_long'']::text[]
      and not (offers.public_offer_filter_tags @> array[''shared_access'']::text[])';
begin
  select pg_get_functiondef('public.list_public_product_summaries()'::regprocedure)
  into current_definition;

  if position(replacement_clause in current_definition) > 0 then
    raise notice 'list_public_product_summaries already excludes shared-access warranty lowest offers';
  else
    if position(target_clause in current_definition) = 0 then
      raise exception 'Expected warranty lowest clause was not found in list_public_product_summaries';
    end if;

    next_definition := replace(current_definition, target_clause, replacement_clause);
    execute next_definition;
  end if;
end;
$$;
