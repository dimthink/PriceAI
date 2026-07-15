import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { buildCloudflarePublicCacheKeyUrl } from "@/lib/cloudflare-cache-key";

type CloudflareCacheStorage = {
  default?: Cache;
};

export async function withCloudflarePublicCache(
  request: Request,
  input: {
    namespace: string;
    ttlSeconds: number;
    cacheKeySearchParams?: URLSearchParams;
    load: () => Promise<Response>;
  },
): Promise<Response> {
  if (request.method !== "GET" || request.headers.has("authorization")) {
    return withEdgeCacheHeader(await input.load(), "BYPASS");
  }

  const cache = (globalThis as typeof globalThis & { caches?: CloudflareCacheStorage }).caches?.default;
  if (!cache) return withEdgeCacheHeader(await input.load(), "RUNTIME-BYPASS");

  const cacheKey = buildCacheKey(request, input.namespace, input.cacheKeySearchParams);
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return restoreCachedResponse(cached, "HIT");
  } catch {
    return withEdgeCacheHeader(await input.load(), "READ-BYPASS");
  }

  const response = await input.load();
  if (!isCacheableResponse(response)) return withEdgeCacheHeader(response, "BYPASS");

  const stored = response.clone();
  const storedHeaders = new Headers(stored.headers);
  storedHeaders.set("X-PriceAI-Origin-Cache-Control", storedHeaders.get("Cache-Control") || "");
  storedHeaders.set("Cache-Control", `public, max-age=${boundedTtl(input.ttlSeconds)}`);
  storedHeaders.delete("Set-Cookie");
  const cacheResponse = new Response(stored.body, {
    status: stored.status,
    statusText: stored.statusText,
    headers: storedHeaders,
  });

  try {
    const context = await getCloudflareContext({ async: true });
    context.ctx.waitUntil(cache.put(cacheKey, cacheResponse));
  } catch {
    await cache.put(cacheKey, cacheResponse).catch(() => undefined);
  }

  return withEdgeCacheHeader(response, "MISS");
}

function buildCacheKey(
  request: Request,
  namespace: string,
  searchParams?: URLSearchParams,
): Request {
  return new Request(buildCloudflarePublicCacheKeyUrl({
    requestUrl: request.url,
    namespace,
    searchParams,
  }), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
}

function isCacheableResponse(response: Response): boolean {
  if (response.status !== 200 || response.headers.has("Set-Cookie")) return false;
  const cacheControl = response.headers.get("Cache-Control") || "";
  return !/private|no-store/i.test(cacheControl);
}

function restoreCachedResponse(response: Response, state: string): Response {
  const headers = new Headers(response.headers);
  const originalCacheControl = headers.get("X-PriceAI-Origin-Cache-Control");
  if (originalCacheControl) headers.set("Cache-Control", originalCacheControl);
  headers.delete("X-PriceAI-Origin-Cache-Control");
  headers.set("X-PriceAI-Edge-Cache", state);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withEdgeCacheHeader(response: Response, state: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-PriceAI-Edge-Cache", state);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function boundedTtl(value: number): number {
  return Math.max(5, Math.min(Math.floor(value), 3600));
}
