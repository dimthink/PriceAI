#!/usr/bin/env node

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(path.join(repoRoot, "supabase", "schema.sql"), "utf8");
const docker = commandPath("docker");
assert(docker, "未找到 docker，无法执行价格历史 PostgreSQL 集成测试。");

const image = process.env.PRICEAI_TEST_POSTGRES_IMAGE || "postgres:18-alpine";
const container = `priceai-price-history-${process.pid}-${Date.now()}`;
const password = crypto.randomBytes(18).toString("hex");

try {
  run(docker, ["run", "--rm", "--detach", "--name", container, "--env", `POSTGRES_PASSWORD=${password}`, image]);
  waitForPostgres(docker, container);
  runPsql(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  `);
  runPsql(schema);
  runPsql(testSql());
  console.log("product price history database test passed");
} finally {
  spawnSync(docker, ["rm", "--force", container], { stdio: "ignore" });
}

function runPsql(sql) {
  const result = spawnSync(
    docker,
    ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "ignore", "pipe"] },
  );
  if (result.status !== 0) throw new Error(result.stderr || "价格历史 PostgreSQL 集成测试失败。");
}

function waitForPostgres(command, name) {
  let consecutiveReady = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync(command, ["exec", name, "pg_isready", "-U", "postgres"], { stdio: "ignore" });
    consecutiveReady = probe.status === 0 ? consecutiveReady + 1 : 0;
    if (consecutiveReady >= 2) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error("隔离 PostgreSQL 在 30 秒内没有就绪。");
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${command} 执行失败。`);
}

function commandPath(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testSql() {
  return String.raw`
set timezone = 'UTC';

insert into canonical_products (id, slug, display_name, platform, product_type, spec, summary)
values
  ('p1', 'p1', 'Product One', 'ChatGPT', '订阅/会员', '', ''),
  ('p2', 'p2', 'Product Two', 'Claude', '订阅/会员', '', ''),
  ('p3', 'p3', 'Product Three', 'Gemini', '成品账号', '', '');

insert into sources (id, name, entry_url, enabled)
values ('s1', 'Source One', 'https://example.com', true);

insert into raw_offers (
  id, source_id, source_name, source_title, price, currency, status, source_status,
  effective_status, freshness_status, url, tags, stock_count, min_order_quantity,
  hidden, canonical_product_id, captured_at, last_seen_at, verified_at, expires_at
)
values
  ('valid-low', 's1', 'Source One', '独享账号', 10, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/low', '{}', 9, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('valid-high', 's1', 'Source One', '独享账号', 12, 'CNY', 'low_stock', 'low_stock', 'available', 'fresh', 'https://example.com/high', '{}', null, null, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('valid-p2', 's1', 'Source One', '独享账号', 33, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/p2', '{}', 2, 1, false, 'p2', now(), now(), now(), now() + interval '7 days'),
  ('invalid-hidden', 's1', 'Source One', '独享账号', 1, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/hidden', '{}', 1, 1, true, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-zero', 's1', 'Source One', '独享账号', 0, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/zero', '{}', 1, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-currency', 's1', 'Source One', '独享账号', 1, 'USD', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/usd', '{}', 1, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-url', 's1', 'Source One', '独享账号', 1, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', '', '{}', 1, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-status', 's1', 'Source One', '独享账号', 1, 'CNY', 'out_of_stock', 'out_of_stock', 'unavailable', 'fresh', 'https://example.com/status', '{}', 1, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-stock', 's1', 'Source One', '独享账号', 1, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/stock', '{}', 0, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-minimum', 's1', 'Source One', '独享账号', 1, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/minimum', '{}', 1, 2, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-shared', 's1', 'Source One', '多人共享拼车', 1, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/shared', '{}', 1, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-web', 's1', 'Source One', '仅限网页号', 1, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/web', '{}', 1, 1, false, 'p1', now(), now(), now(), now() + interval '7 days'),
  ('invalid-mirror', 's1', 'Source One', '国内镜像站', 1, 'CNY', 'in_stock', 'in_stock', 'available', 'fresh', 'https://example.com/mirror', '{}', 1, 1, false, 'p1', now(), now(), now(), now() + interval '7 days');

create function test_confirm(p_offer_id text, p_confirmed_at timestamptz)
returns void
language sql
as $$
  insert into raw_offer_confirmations (
    raw_offer_id, source_id, canonical_product_id, confirmed_at, captured_at,
    last_seen_at, verified_at, expires_at, source_status, effective_status,
    freshness_status, source_priority, confidence, price, stock_count, updated_at
  )
  select
    offers.id, offers.source_id, offers.canonical_product_id, p_confirmed_at,
    p_confirmed_at, p_confirmed_at, p_confirmed_at, now() + interval '7 days',
    offers.source_status, offers.effective_status, offers.freshness_status,
    offers.source_priority, offers.confidence, offers.price, offers.stock_count,
    p_confirmed_at
  from raw_offers offers
  where offers.id = p_offer_id
  on conflict (raw_offer_id) do update set
    source_id = excluded.source_id,
    canonical_product_id = excluded.canonical_product_id,
    confirmed_at = excluded.confirmed_at,
    captured_at = excluded.captured_at,
    last_seen_at = excluded.last_seen_at,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at,
    source_status = excluded.source_status,
    effective_status = excluded.effective_status,
    freshness_status = excluded.freshness_status,
    source_priority = excluded.source_priority,
    confidence = excluded.confidence,
    price = excluded.price,
    stock_count = excluded.stock_count,
    updated_at = excluded.updated_at;
$$;

select test_confirm(id, now()) from raw_offers;

do $$
begin
  if (select consecutive_valid_confirmations from raw_offer_confirmations where raw_offer_id = 'valid-low') <> 1 then
    raise exception 'first valid confirmation was not recorded as one';
  end if;
  if exists (select 1 from product_price_eligible_offers) then
    raise exception 'an offer became eligible before its second confirmation';
  end if;
end;
$$;

select test_confirm(id, now() + interval '1 minute') from raw_offers;

update raw_offer_confirmations
set
  confirmed_at = confirmed_at - interval '1 hour',
  effective_status = 'unavailable'
where raw_offer_id = 'valid-low';

do $$
begin
  if (select count(*) from product_price_eligible_offers) <> 3 then
    raise exception 'eligible offer filters or two-confirmation rule failed';
  end if;
  if exists (
    select 1 from raw_offer_confirmations
    where raw_offer_id like 'invalid-%' and consecutive_valid_confirmations <> 0
  ) then
    raise exception 'invalid offers retained a confirmation streak';
  end if;
  if (select consecutive_valid_confirmations from raw_offer_confirmations where raw_offer_id = 'valid-low') <> 2 then
    raise exception 'an out-of-order confirmation overwrote the latest streak';
  end if;
end;
$$;

update raw_offers
set source_status = 'out_of_stock'
where id = 'valid-high';

do $$
begin
  if (select consecutive_valid_confirmations from raw_offer_confirmations where raw_offer_id = 'valid-high') <> 0 then
    raise exception 'source-status-only unavailability did not reset the confirmation streak';
  end if;
end;
$$;

update raw_offers
set source_status = 'low_stock'
where id = 'valid-high';
select test_confirm('valid-high', now() + interval '2 minutes');

do $$
begin
  if (select consecutive_valid_confirmations from raw_offer_confirmations where raw_offer_id = 'valid-high') <> 1 then
    raise exception 'a restored offer skipped its first confirmation';
  end if;
end;
$$;

select test_confirm('valid-high', now() + interval '3 minutes');

do $$
begin
  if (select consecutive_valid_confirmations from raw_offer_confirmations where raw_offer_id = 'valid-high') <> 2 then
    raise exception 'a restored offer did not become eligible after two confirmations';
  end if;
end;
$$;

select record_product_price_samples(null, '2026-07-20T15:05:00Z');

do $$
begin
  if (select price from product_price_samples where product_id = 'p1') <> 10 then
    raise exception 'lowest eligible price was not sampled';
  end if;
  if (select price from product_price_samples where product_id = 'p2') <> 33 then
    raise exception 'product isolation failed';
  end if;
  if exists (select 1 from product_price_samples where product_id = 'p3') then
    raise exception 'product without an eligible price produced a sample';
  end if;
end;
$$;

update raw_offers set price = 11 where id = 'valid-low';
select test_confirm('valid-low', now() + interval '2 minutes');
select test_confirm('valid-low', now() + interval '3 minutes');
select record_product_price_samples(array['p1'], '2026-07-20T15:20:00Z');

update raw_offers set price = 9 where id = 'valid-low';
select test_confirm('valid-low', now() + interval '4 minutes');
select test_confirm('valid-low', now() + interval '5 minutes');
select record_product_price_samples(array['p1'], '2026-07-20T15:35:00Z');

update raw_offers set price = 12 where id = 'valid-low';
select test_confirm('valid-low', now() + interval '6 minutes');
select test_confirm('valid-low', now() + interval '7 minutes');
select record_product_price_samples(array['p1'], '2026-07-20T15:50:00Z');

update raw_offers set price = 8 where id = 'valid-low';
select test_confirm('valid-low', now() + interval '8 minutes');
select test_confirm('valid-low', now() + interval '9 minutes');
select record_product_price_samples(array['p1'], '2026-07-20T15:48:00Z');
select record_product_price_samples(array['p1'], '2026-07-20T15:50:00Z');

do $$
declare
  candle product_price_candles%rowtype;
begin
  select * into candle
  from product_price_candles
  where product_id = 'p1' and candle_interval = '1h' and bucket_start = '2026-07-20T15:00:00Z';
  if candle.open_price <> 10 or candle.high_price <> 12 or candle.low_price <> 9 or candle.close_price <> 12 or candle.sample_count <> 4 then
    raise exception 'hourly OHLC, ordering, or idempotency failed: %', row_to_json(candle);
  end if;
  if (select price from product_price_samples where product_id = 'p1' and bucket_start = '2026-07-20T15:45:00Z') <> 12 then
    raise exception 'out-of-order sampling overwrote a newer sample';
  end if;
  if not exists (
    select 1 from product_price_candles
    where product_id = 'p1' and candle_interval = '1d' and bucket_start = '2026-07-19T16:00:00Z'
  ) then
    raise exception 'Asia/Shanghai daily bucket was not created';
  end if;
end;
$$;

select record_product_price_samples(array['p1'], '2026-07-20T16:05:00Z');
select record_product_price_samples(array['p1'], '2026-07-20T18:05:00Z');

do $$
begin
  if (select count(*) from product_price_candles where product_id = 'p1' and candle_interval = '1d') <> 2 then
    raise exception 'Beijing day boundary did not create two daily candles';
  end if;
  if exists (
    select 1 from product_price_candles
    where product_id = 'p1' and candle_interval = '1h' and bucket_start = '2026-07-20T17:00:00Z'
  ) then
    raise exception 'a missing observation interval was filled artificially';
  end if;
  if exists (
    select 1 from product_price_candles
    where product_id = 'p1' and candle_interval = '1h'
      and sample_count = 1 and (open_price <> high_price or high_price <> low_price or low_price <> close_price)
  ) then
    raise exception 'single-sample candle was not flat';
  end if;
end;
$$;

update raw_offers set effective_status = 'unavailable' where id in ('valid-low', 'valid-high');

do $$
begin
  if exists (select 1 from list_product_price_current(array['p1'])) then
    raise exception 'current quote remained after all eligible offers disappeared';
  end if;
  if not exists (select 1 from list_public_product_price_candles(array['p1'], '1h', 24, null)) then
    raise exception 'historical candles disappeared with the current quote';
  end if;
end;
$$;

insert into product_price_samples (
  product_id, bucket_start, observed_at, price, currency, eligible_offer_count
)
values
  ('p2', '2024-01-01T00:00:00Z', '2024-01-01T00:05:00Z', 20, 'CNY', 1),
  ('p3', '2024-02-01T00:00:00Z', '2024-02-01T00:05:00Z', 30, 'CNY', 1);

insert into product_price_candles (
  product_id, candle_interval, bucket_start, bucket_end, open_price, high_price,
  low_price, close_price, currency, sample_count, eligible_offer_count,
  first_sample_at, last_sample_at
)
values
  ('p2', '1h', '2024-01-01T00:00:00Z', '2024-01-01T01:00:00Z', 20, 20, 20, 20, 'CNY', 1, 1, '2024-01-01T00:05:00Z', '2024-01-01T00:05:00Z'),
  ('p2', '1d', '2023-12-31T16:00:00Z', '2024-01-01T16:00:00Z', 20, 20, 20, 20, 'CNY', 1, 1, '2024-01-01T00:05:00Z', '2024-01-01T00:05:00Z');

do $$
declare
  result jsonb;
begin
  result := prune_product_price_history(100, true);
  if (result ->> 'sampleCandidates')::integer <> 1 then
    raise exception 'dry-run did not enforce aggregate coverage: %', result;
  end if;
  if not exists (select 1 from product_price_samples where product_id = 'p2' and bucket_start = '2024-01-01T00:00:00Z') then
    raise exception 'dry-run deleted a sample';
  end if;

  result := prune_product_price_history(100, false);
  if (result ->> 'deletedSamples')::integer <> 1 then
    raise exception 'bounded retention did not delete the covered sample: %', result;
  end if;
  if not exists (select 1 from product_price_samples where product_id = 'p3' and bucket_start = '2024-02-01T00:00:00Z') then
    raise exception 'retention deleted a sample without hourly and daily coverage';
  end if;
  if not exists (select 1 from product_price_candles where product_id = 'p2' and candle_interval = '1d') then
    raise exception 'daily retention was applied unexpectedly';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'product_price_samples', 'select')
    or has_table_privilege('authenticated', 'product_price_candles', 'select')
  then
    raise exception 'internal price history tables are publicly readable';
  end if;
  if has_function_privilege('anon', 'record_product_price_samples(text[],timestamptz)', 'execute') then
    raise exception 'sampling RPC is publicly executable';
  end if;
end;
$$;
`;
}
