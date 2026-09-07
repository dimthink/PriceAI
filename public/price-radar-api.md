# PriceAI Price Radar API

PriceAI Price Radar is a read-only public snapshot feed for agents, scripts, and developers. Use it instead of crawling PriceAI HTML pages or internal `/api/` routes.

## Start

1. Fetch `https://data.priceai.cc/latest.json`.
2. Read `snapshot_url` from the response.
3. Find a product by `id` or `slug` for its minimum price and current Top 5 offers.
4. Read that product's `presets` for common filtered Top 5 rankings.

Each new source generation uses one immutable snapshot object plus the small `latest.json` pointer. Retries of the same generation skip R2 writes. This keeps the public feed inexpensive to publish and cache while avoiding request-time database work.

The feed follows PriceAI's existing snapshot cadence. It is not a request-time price query and does not guarantee that a third-party offer remains available.

## Contract

- Schema: `https://priceai.cc/price-radar-v1.schema.json`
- Discovery: `https://priceai.cc/.well-known/price-radar.json`
- Authentication: none for the public snapshot feed
- Methods: `GET` and `HEAD`
- Refresh cadence: approximately 5 minutes
- Ranking: available offers first; shared access, mirror sites, web-only accounts, and Telegram Stars do not displace ordinary purchasable offers in the default ranking
- Presets: only existing exact single-tag snapshots are published; a missing preset never triggers a request-time database query
- Freshness: each product and preset carries its own generation timestamp; presets older than 2 hours are omitted and `stale` becomes true when any default product snapshot is older than 2 hours

Arbitrary searches, combined filters, price ranges, raw-offer exports, and deep pagination are intentionally unavailable from the anonymous feed. A separate API Key tier may provide advanced queries later.

## Usage

Cache responses and respect `ETag`, `Last-Modified`, and `Cache-Control`. Poll `latest.json` no more often than once per minute. The pointer intentionally sits outside the `/v1/` immutable Cache Rule so Cloudflare Free does not stretch its five-minute freshness window to four hours. Download `snapshot_url` only when `snapshot_id` changes; immutable snapshot URLs can be cached indefinitely.

PriceAI is an information and comparison service. Verify final price, stock, delivery, warranty, and after-sales terms with the original source before purchase.
