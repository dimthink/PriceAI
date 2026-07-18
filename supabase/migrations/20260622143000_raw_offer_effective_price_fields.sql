alter table raw_offers add column if not exists listed_price numeric;
alter table raw_offers add column if not exists fee_amount numeric;
alter table raw_offers add column if not exists price_basis text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'raw_offers_price_basis_check'
      and conrelid = 'raw_offers'::regclass
  ) then
    alter table raw_offers
      add constraint raw_offers_price_basis_check
      check (price_basis is null or price_basis in ('settled', 'modeled', 'listed', 'listed_fallback'));
  end if;
end;
$$;
