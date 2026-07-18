alter table raw_offers
  drop constraint if exists raw_offers_price_basis_check;

alter table raw_offers
  add constraint raw_offers_price_basis_check
  check (price_basis is null or price_basis in ('settled', 'modeled', 'listed', 'listed_fallback'));
