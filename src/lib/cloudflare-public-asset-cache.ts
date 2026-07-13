const publicAssetCacheStatusHeader = "X-PriceAI-Asset-Cache";

type CloudflareCacheStorage = CacheStorage & {
  default?: Cache;
};

export function createPublicAssetCacheKey(request: Request, reference: string): Request {
  const url = new URL(request.url);
  url.search = "";
  url.searchParams.set("ref", reference);
  return new Request(url, { method: "GET" });
}

export async function readPublicAssetCache(cacheKey: Request): Promise<Response | null> {
  const cache = getDefaultCache();
  if (!cache) return null;

  try {
    const response = await cache.match(cacheKey);
    return response ? withCacheStatus(response, "HIT") : null;
  } catch {
    return null;
  }
}

export async function writePublicAssetCache(cacheKey: Request, response: Response): Promise<Response> {
  const cache = getDefaultCache();
  const responseWithStatus = withCacheStatus(response, "MISS");
  if (!cache) return responseWithStatus;

  try {
    await cache.put(cacheKey, responseWithStatus.clone());
  } catch {
    // Asset delivery must continue when a regional cache write is unavailable.
  }

  return responseWithStatus;
}

function getDefaultCache(): Cache | null {
  const cacheStorage = globalThis.caches as CloudflareCacheStorage | undefined;
  return cacheStorage?.default || null;
}

function withCacheStatus(response: Response, status: "HIT" | "MISS"): Response {
  const headers = new Headers(response.headers);
  headers.set(publicAssetCacheStatusHeader, status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
