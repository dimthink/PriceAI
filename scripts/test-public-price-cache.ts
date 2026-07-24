import { priceDataCacheHeadersForResult } from "../src/lib/cache-headers.js";
import {
  priceDataCacheTtlMsForProduct,
  priceDataEdgeSecondsForProduct,
} from "../src/lib/public-cache-policy.js";

const healthy = new Headers(priceDataCacheHeadersForResult({ degraded: false }));
assertEqual(healthy.get("CDN-Cache-Control"), "public, s-maxage=300");
assertEqual(healthy.get("Cloudflare-CDN-Cache-Control"), "public, s-maxage=300");

const degraded = new Headers(priceDataCacheHeadersForResult({ degraded: true }));
assertEqual(degraded.get("Cache-Control"), "public, max-age=0, must-revalidate");
assertEqual(degraded.get("CDN-Cache-Control"), "public, s-maxage=60");
assertEqual(degraded.get("Cloudflare-CDN-Cache-Control"), "public, s-maxage=60");
assertEqual(degraded.get("Vercel-CDN-Cache-Control"), "public, s-maxage=60, stale-while-revalidate=0");

for (const value of degraded.values()) {
  if (/no-store/i.test(value)) throw new Error(`Degraded price response must remain cacheable: ${value}`);
}

const hotProduct = new Headers(priceDataCacheHeadersForResult(
  { degraded: false },
  { edgeSeconds: priceDataEdgeSecondsForProduct("chatgpt-plus"), staleSeconds: 300 },
));
assertEqual(hotProduct.get("CDN-Cache-Control"), "public, s-maxage=60");
assertEqual(hotProduct.get("Cloudflare-CDN-Cache-Control"), "public, s-maxage=60");
assertEqual(priceDataCacheTtlMsForProduct("chatgpt-team-business"), 60_000);
assertEqual(priceDataCacheTtlMsForProduct("super-grok"), 300_000);

console.log("public price cache policy test passed");

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}.`);
  }
}
