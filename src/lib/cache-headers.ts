const DEFAULT_PUBLIC_DATA_EDGE_SECONDS = 300;
const DEFAULT_PUBLIC_DATA_STALE_SECONDS = 1800;
const PRICE_DATA_EDGE_SECONDS = 120;
const PRICE_DATA_STALE_SECONDS = 600;

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

export function priceDataCacheHeaders(): HeadersInit {
  return publicDataCacheHeaders({
    edgeSeconds: PRICE_DATA_EDGE_SECONDS,
    staleSeconds: PRICE_DATA_STALE_SECONDS,
  });
}
