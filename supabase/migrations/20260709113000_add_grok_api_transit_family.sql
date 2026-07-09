alter table api_transit_offers
  drop constraint if exists api_transit_offers_family_check;

alter table api_transit_offers
  add constraint api_transit_offers_family_check
  check (family in ('gpt', 'claude', 'gemini', 'grok', 'glm', 'deepseek', 'image', 'video'));

alter table api_transit_multiplier_history
  drop constraint if exists api_transit_multiplier_history_family_check;

alter table api_transit_multiplier_history
  add constraint api_transit_multiplier_history_family_check
  check (family in ('gpt', 'claude', 'gemini', 'grok', 'glm', 'deepseek', 'image', 'video'));
