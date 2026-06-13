const DEFAULT_BASE_URL = "https://cf.priceai.cc";

const baseUrl = normalizeBaseUrl(
  process.argv[2] || process.env.CLOUDFLARE_SMOKE_BASE_URL || DEFAULT_BASE_URL,
);

const checks = [
  { path: "/", status: 200, maxBytes: 350_000 },
  { path: "/api-models", status: 200, maxBytes: 280_000 },
  { path: "/guides/are-ai-subscription-card-shops-reliable", status: 200, maxBytes: 160_000 },
  { path: "/api/health", status: 200, maxBytes: 5_000 },
  { path: "/api/explorer", status: 200, maxBytes: 120_000, cache: true },
  { path: "/api/offers?limit=80", status: 200, maxBytes: 140_000, cache: true },
  { path: "/api/products/chatgpt-plus/offers?limit=80", status: 200, maxBytes: 140_000, cache: true },
  { path: "/api/cron/collect-prices", status: 401, maxBytes: 5_000 },
  { path: "/api/cron/official-prices", status: 401, maxBytes: 5_000 },
  { path: "/robots.txt", status: 200, maxBytes: 5_000 },
  { path: "/sitemap.xml", status: 200, maxBytes: 80_000 },
];

let failures = 0;
console.log(`Cloudflare smoke base: ${baseUrl}`);

for (const check of checks) {
  const url = new URL(check.path, baseUrl);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "PriceAI Cloudflare smoke check",
      },
    });
    const body = await response.arrayBuffer();
    const bytes = body.byteLength;
    const elapsed = Date.now() - startedAt;
    const cacheHeader =
      response.headers.get("cloudflare-cdn-cache-control") ||
      response.headers.get("cdn-cache-control") ||
      response.headers.get("cache-control") ||
      "";

    const statusOk = response.status === check.status;
    const sizeOk = bytes <= check.maxBytes;
    const cacheOk = !check.cache || /s-maxage|max-age/i.test(cacheHeader);
    const ok = statusOk && sizeOk && cacheOk;

    if (!ok) failures += 1;

    console.log(
      [
        ok ? "ok" : "fail",
        response.status,
        `${bytes}B`,
        `${elapsed}ms`,
        check.path,
        check.cache ? `cache=${cacheHeader || "missing"}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  } catch (error) {
    failures += 1;
    console.log(`fail error ${check.path} ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  console.error(`Cloudflare smoke check failed: ${failures} check(s).`);
  process.exitCode = 1;
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}
