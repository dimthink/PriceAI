import { PRICE_DATA_EDGE_SECONDS, PRICE_DATA_STALE_SECONDS } from "./public-cache-policy";

const DEFAULT_PUBLIC_DATA_EDGE_SECONDS = PRICE_DATA_EDGE_SECONDS;
const DEFAULT_PUBLIC_DATA_STALE_SECONDS = PRICE_DATA_STALE_SECONDS;

export function publicDataCacheHeaders({
  edgeSeconds = DEFAULT_PUBLIC_DATA_EDGE_SECONDS,
  staleSeconds = DEFAULT_PUBLIC_DATA_STALE_SECONDS,
}: {
  edgeSeconds?: number;
  staleSeconds?: number;
} = {}): HeadersInit {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": `public, s-maxage=${edgeSeconds}`,
    "Cloudflare-CDN-Cache-Control": `public, s-maxage=${edgeSeconds}`,
    "Vercel-CDN-Cache-Control": `public, s-maxage=${edgeSeconds}, stale-while-revalidate=${staleSeconds}`,
  };
}

export function noStoreCacheHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
}

export function priceDataCacheHeaders(): HeadersInit {
  if (PRICE_DATA_EDGE_SECONDS <= 0) {
    return noStoreCacheHeaders();
  }

  return publicDataCacheHeaders({
    edgeSeconds: PRICE_DATA_EDGE_SECONDS,
    staleSeconds: PRICE_DATA_STALE_SECONDS,
  });
}

export function priceDataCacheHeadersForResult(result: { degraded?: boolean | null } | null | undefined): HeadersInit {
  return result?.degraded ? noStoreCacheHeaders() : priceDataCacheHeaders();
}
