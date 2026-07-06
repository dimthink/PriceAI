create index if not exists raw_offers_public_dedupe_key_idx
  on raw_offers (
    priceai_public_offer_dedupe_key(
      canonical_product_id,
      url,
      source_title,
      price
    )
  )
  where hidden = false;
