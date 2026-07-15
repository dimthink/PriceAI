const DEFAULT_BASE_URL = "https://priceai.cc";
const SMOKE_FETCH_TIMEOUT_MS = Number(process.env.CLOUDFLARE_SMOKE_TIMEOUT_MS || 15_000);
const SMOKE_DATA_RETRY_ATTEMPTS = Number(process.env.CLOUDFLARE_SMOKE_DATA_RETRY_ATTEMPTS || 5);
const SMOKE_RETRY_DELAY_MS = Number(process.env.CLOUDFLARE_SMOKE_RETRY_DELAY_MS || 1_500);

const baseUrl = normalizeBaseUrl(
  process.argv[2] || process.env.CLOUDFLARE_SMOKE_BASE_URL || DEFAULT_BASE_URL,
);

const fallbackHtmlMarkers = [
  "当前使用内置演示数据",
  "配置 Supabase",
  "01/01 08:00",
  "2026-01-01T00:00:00.000Z",
  { pattern: '"configured":false', isAllowed: isSponsorSettingsDefaultMarker },
  { pattern: '\\"configured\\":false', isAllowed: isSponsorSettingsDefaultMarker },
  '"offerTotal":10',
  '\\"offerTotal\\":10',
];

const staticDatasetMarkers = [
  '"source":"static"',
  '\\"source\\":\\"static\\"',
  "数据源：静态样本",
];

const apiTransitDetailNotFoundMarkers = [
  "未找到 | PriceAI",
  "找不到这个页面",
  "This page could not be found",
];

const checks = [
  {
    path: "/",
    status: 200,
    text: {
      forbidden: fallbackHtmlMarkers,
      requiredAny: [
        { label: "homepage-title", patterns: ["AI 低价卡网订阅", "与中转 API 比价雷达"] },
        { label: "purchase-paths", patterns: ["先回答一个问题：你现在要买什么"] },
        { label: "sponsor-contact", patterns: ["https://t.me/priceaicc"] },
      ],
    },
  },
  {
    path: "/official-prices",
    status: 200,
    text: {
      forbidden: [...fallbackHtmlMarkers, ...staticDatasetMarkers],
      requiredAny: [{ label: "source=supabase", patterns: ['"source":"supabase"', '\\"source\\":\\"supabase\\"'] }],
    },
  },
  {
    path: "/official-api",
    status: 200,
    text: {
      forbidden: [...fallbackHtmlMarkers, ...staticDatasetMarkers],
      requiredAny: [{ label: "source=supabase", patterns: ['"source":"supabase"', '\\"source\\":\\"supabase\\"'] }],
    },
  },
  { path: "/guides/are-ai-subscription-card-shops-reliable", status: 200 },
  {
    path: "/api/health",
    status: 200,
    maxBytes: 5_000,
    json: validateHealthJson,
  },
  {
    path: "/api/explorer",
    status: 200,
    maxBytes: 120_000,
    cache: true,
    retries: SMOKE_DATA_RETRY_ATTEMPTS,
    json: validateExplorerJson,
  },
  {
    path: "/api/offers?limit=30",
    status: 200,
    maxBytes: 80_000,
    cache: true,
    retries: SMOKE_DATA_RETRY_ATTEMPTS,
    json: validateOffersJson,
  },
  {
    path: "/api/products/chatgpt-plus/offers?limit=30",
    status: 200,
    maxBytes: 80_000,
    cache: true,
    retries: SMOKE_DATA_RETRY_ATTEMPTS,
  },
  {
    path: "/api/merchants",
    status: 200,
    maxBytes: 100_000,
    cache: true,
    retries: SMOKE_DATA_RETRY_ATTEMPTS,
    json: validateMerchantsJson,
  },
  { path: "/api/cron/collect-prices", status: 405, maxBytes: 5_000 },
  { path: "/api/cron/collect-prices", method: "POST", status: 401, maxBytes: 5_000 },
  { path: "/api/cron/official-prices", status: 405, maxBytes: 5_000 },
  { path: "/api/cron/official-prices", method: "POST", status: 401, maxBytes: 5_000 },
  { path: "/robots.txt", status: 200, maxBytes: 5_000 },
  { path: "/sitemap.xml", status: 200, maxBytes: 80_000 },
];

let failures = 0;
console.log(`Cloudflare smoke base: ${baseUrl}`);

for (const check of checks) {
  const maxAttempts = Math.max(1, 1 + (Number.isFinite(check.retries) ? check.retries : 0));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runHttpCheck(check);
    const shouldRetry = !result.ok && attempt < maxAttempts;

    if (!shouldRetry) {
      if (!result.ok) failures += 1;
      console.log(formatHttpCheckResult(result));
      break;
    }

    console.log(`${formatHttpCheckResult(result, "retry")} attempt=${attempt}/${maxAttempts}`);
    await sleep(SMOKE_RETRY_DELAY_MS);
  }
}

await validateApiTransitDetailPages(baseUrl);
await validateNextStaticAssets(baseUrl);

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

function validateText(text, expectations) {
  const failures = [];

  for (const marker of expectations.forbidden || []) {
    const pattern = typeof marker === "string" ? marker : marker.pattern;
    const index = text.indexOf(pattern);
    if (index >= 0 && !(typeof marker === "object" && marker.isAllowed?.(text, index))) {
      failures.push(`forbidden:${pattern}`);
    }
  }

  for (const requirement of expectations.requiredAny || []) {
    const matched = requirement.patterns.some((pattern) => text.includes(pattern));
    if (!matched) {
      failures.push(`missing:${requirement.label}`);
    }
  }

  return failures;
}

function isSponsorSettingsDefaultMarker(text, index) {
  const before = text.slice(Math.max(0, index - 80), index);
  const after = text.slice(index, index + 700);
  const looksLikeSponsorSettings =
    before.includes('"sponsorSettings":{') ||
    before.includes('\\"sponsorSettings\\":{') ||
    before.includes('"settings":{') ||
    before.includes('\\"settings\\":{');

  return looksLikeSponsorSettings &&
    (after.includes('"tableReady":true') || after.includes('\\"tableReady\\":true')) &&
    after.includes("赞助位配置尚未保存") &&
    (after.includes('"placements":{') || after.includes('\\"placements\\":{'));
}

function validateJson(text, validator) {
  try {
    return validator(JSON.parse(text));
  } catch (error) {
    return [`invalid-json:${error instanceof Error ? error.message : String(error)}`];
  }
}

async function runHttpCheck(check) {
  const url = new URL(check.path, baseUrl);
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(url, {
      method: check.method || "GET",
      headers: {
        "user-agent": "PriceAI Cloudflare smoke check",
      },
    });
    const body = await response.arrayBuffer();
    const bytes = body.byteLength;
    const text = check.text || check.json ? new TextDecoder().decode(body) : "";
    const elapsed = Date.now() - startedAt;
    const expectedOrigin = new URL(baseUrl).origin;
    const finalOrigin = new URL(response.url).origin;
    const cacheHeader =
      response.headers.get("cloudflare-cdn-cache-control") ||
      response.headers.get("cdn-cache-control") ||
      response.headers.get("cache-control") ||
      "";

    const statusOk = response.status === check.status;
    const originOk = finalOrigin === expectedOrigin;
    const maxBytes = Number.isFinite(check.maxBytes) ? check.maxBytes : null;
    const sizeOk = maxBytes === null || bytes <= maxBytes;
    const cacheOk = !check.cache || /s-maxage|max-age/i.test(cacheHeader);
    const textFailures = check.text ? validateText(text, check.text) : [];
    const jsonFailures = check.json ? validateJson(text, check.json) : [];
    const contentOk = textFailures.length === 0 && jsonFailures.length === 0;
    const ok = statusOk && originOk && sizeOk && cacheOk && contentOk;

    return {
      ok,
      check,
      status: response.status,
      bytes,
      elapsed,
      finalOrigin,
      expectedOrigin,
      originOk,
      cacheHeader,
      maxBytes,
      sizeOk,
      textFailures,
      jsonFailures,
    };
  } catch (error) {
    return {
      ok: false,
      check,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatHttpCheckResult(result, label = result.ok ? "ok" : "fail") {
  const { check } = result;

  if (result.errorMessage) {
    return `${label} error ${check.path} ${result.errorMessage}`;
  }

  return [
    label,
    result.status,
    `${result.bytes}B`,
    `${result.elapsed}ms`,
    check.method ? `${check.method} ${check.path}` : check.path,
    check.cache ? `cache=${result.cacheHeader || "missing"}` : "",
    !result.originOk ? `redirected=${result.finalOrigin}` : "",
    !result.sizeOk && result.maxBytes !== null ? `size>${result.maxBytes}B` : "",
    result.textFailures.length ? `text=${result.textFailures.join(";")}` : "",
    result.jsonFailures.length ? `json=${result.jsonFailures.join(";")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function validateHealthJson(data) {
  const failures = [];
  if (data?.ok !== true) failures.push("ok!=true");
  if (data?.supabaseConfigured !== true) failures.push("supabaseConfigured!=true");
  if (data?.supabaseReachable !== true) failures.push("supabaseReachable!=true");
  return failures;
}

function validateExplorerJson(data) {
  const failures = [];
  if (data?.configured !== true) failures.push("configured!=true");
  if (data?.degraded === true) failures.push("degraded=true");
  if (!Number.isFinite(data?.offerTotal) || data.offerTotal < 100) failures.push("offerTotal<100");
  return failures;
}

function validateOffersJson(data) {
  const failures = [];
  if (data?.degraded === true) failures.push("degraded=true");
  if (!Number.isFinite(data?.total) || data.total < 100) failures.push("total<100");
  return failures;
}

function validateMerchantsJson(data) {
  const failures = [];
  if (data?.degraded === true) failures.push("degraded=true");
  if (!Array.isArray(data?.rows)) failures.push("rows!=array");
  if (!Number.isFinite(data?.total) || data.total < 1) failures.push("total<1");
  return failures;
}

async function validateApiTransitDetailPages(baseUrl) {
  const sitemapUrl = new URL("/sitemap.xml", baseUrl);
  const startedAt = Date.now();

  try {
    const sitemapResponse = await fetchWithTimeout(sitemapUrl, {
      headers: {
        "user-agent": "PriceAI Cloudflare smoke check",
      },
    });
    const sitemapXml = await sitemapResponse.text();
    const detailPaths = [
      ...new Set([
        ...extractApiTransitDetailPaths(sitemapXml),
        ...await readPublishedApiTransitDetailPathsFromSupabase(),
      ]),
    ].sort();

    if (sitemapResponse.status !== 200 || detailPaths.length === 0) {
      failures += 1;
      console.log(
        `fail api-transit-details sitemap status=${sitemapResponse.status} paths=${detailPaths.length} ${sitemapUrl.pathname}`,
      );
      return;
    }

    for (const path of detailPaths) {
      const detailStartedAt = Date.now();
      const detailUrl = new URL(path, baseUrl);
      const response = await fetchWithTimeout(detailUrl, {
        headers: {
          "user-agent": "PriceAI Cloudflare smoke check",
        },
      });
      const html = await response.text();
      const markerFailures = apiTransitDetailNotFoundMarkers
        .filter((marker) => html.includes(marker))
        .map((marker) => `forbidden:${marker}`);
      const contentFailures = html.includes("API 中转站详情") ? [] : ["missing:api-transit-detail-title"];
      const contentOk = markerFailures.length === 0 && contentFailures.length === 0;
      const ok = response.status === 200 && contentOk;

      if (!ok) failures += 1;

      console.log(
        [
          ok ? "ok" : "fail",
          "api-transit-detail",
          response.status,
          `${html.length}B`,
          `${Date.now() - detailStartedAt}ms`,
          detailUrl.pathname,
          response.headers.get("x-nextjs-cache") ? `next-cache=${response.headers.get("x-nextjs-cache")}` : "",
          response.headers.get("cf-cache-status") ? `cf-cache=${response.headers.get("cf-cache-status")}` : "",
          markerFailures.length ? `text=${markerFailures.join(";")}` : "",
          contentFailures.length ? `text=${contentFailures.join(";")}` : "",
        ].filter(Boolean).join(" "),
      );
    }

    console.log(`ok api-transit-details ${detailPaths.length} paths ${Date.now() - startedAt}ms`);
  } catch (error) {
    failures += 1;
    console.log(
      `fail api-transit-details error ${sitemapUrl.pathname} ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function extractApiTransitDetailPaths(sitemapXml) {
  const specialSegments = new Set(["detector", "models", "submit"]);
  const paths = new Set();

  for (const match of sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    let url;
    try {
      url = new URL(match[1]);
    } catch {
      continue;
    }

    const path = url.pathname.replace(/\/+$/, "");
    const detailMatch = path.match(/^\/api-transit\/([^/]+)$/);
    if (!detailMatch || specialSegments.has(detailMatch[1])) continue;
    paths.add(path);
  }

  return [...paths].sort();
}

async function readPublishedApiTransitDetailPathsFromSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) return [];

  const withRemovedFilter = await fetchPublishedApiTransitStationSlugs(supabaseUrl, key, true);
  const slugs = withRemovedFilter.ok
    ? withRemovedFilter.slugs
    : (await fetchPublishedApiTransitStationSlugs(supabaseUrl, key, false)).slugs;

  return slugs.map(apiTransitStationPath).filter(Boolean).sort();
}

async function fetchPublishedApiTransitStationSlugs(supabaseUrl, key, filterRemoved) {
  const url = new URL("/rest/v1/api_transit_stations", supabaseUrl);
  url.searchParams.set("select", "slug");
  url.searchParams.set("published", "eq.true");
  url.searchParams.set("order", "updated_at.desc");
  if (filterRemoved) url.searchParams.set("removed_at", "is.null");

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "user-agent": "PriceAI Cloudflare smoke check",
      },
    });
    if (!response.ok) return { ok: false, slugs: [] };
    const rows = await response.json();
    return {
      ok: true,
      slugs: Array.isArray(rows)
        ? rows.map((row) => (typeof row?.slug === "string" ? row.slug : "")).filter(Boolean)
        : [],
    };
  } catch {
    return { ok: false, slugs: [] };
  }
}

function apiTransitStationPath(slug) {
  const cleanSlug = typeof slug === "string" ? slug.trim() : "";
  if (!cleanSlug || cleanSlug.includes("/") || cleanSlug.includes("\\")) return null;
  return `/api-transit/${encodeURIComponent(cleanSlug)}`;
}

async function validateNextStaticAssets(baseUrl) {
  const pageUrl = new URL("/", baseUrl);
  const startedAt = Date.now();
  const strictCache = !isLocalhostBaseUrl(baseUrl);

  try {
    const response = await fetchWithTimeout(pageUrl, {
      headers: {
        "user-agent": "PriceAI Cloudflare smoke check",
      },
    });
    const html = await response.text();
    const assetGroups = [
      {
        label: "static-css",
        paths: [
          ...new Set(
            [...html.matchAll(/\/_next\/static\/css\/[^"'<>\\s]+\.css(?:\?[^"'<>\\s]*)?/g)].map((match) => match[0]),
          ),
        ],
      },
      {
        label: "static-js",
        paths: [
          ...new Set(
            [...html.matchAll(/\/_next\/static\/chunks\/[^"'<>\\s]+\.js(?:\?[^"'<>\\s]*)?/g)].map((match) => match[0]),
          ),
        ],
      },
    ];

    for (const group of assetGroups) {
      if (group.paths.length === 0) {
        failures += 1;
        console.log(`fail ${group.label} missing ${pageUrl.pathname}`);
        continue;
      }

      for (const assetPath of group.paths) {
        const assetUrl = new URL(assetPath, baseUrl);
        const assetStartedAt = Date.now();
        const assetResponse = await fetchWithTimeout(assetUrl, {
          headers: {
            "user-agent": "PriceAI Cloudflare smoke check",
          },
        });
        const body = await assetResponse.arrayBuffer();
        const cacheControl = assetResponse.headers.get("cache-control") || "";
        const cacheOk = !strictCache || (/\bmax-age=31536000\b/i.test(cacheControl) && /\bimmutable\b/i.test(cacheControl));
        const ok = assetResponse.status === 200 && cacheOk;

        if (!ok) failures += 1;

        console.log(
          [
            ok ? "ok" : "fail",
            group.label,
            assetResponse.status,
            `${body.byteLength}B`,
            `${Date.now() - assetStartedAt}ms`,
            assetUrl.pathname,
            `cache=${cacheControl || "missing"}`,
          ].join(" "),
        );
      }
    }

    console.log(`ok static-assets-page ${Date.now() - startedAt}ms ${pageUrl.pathname}`);
  } catch (error) {
    failures += 1;
    console.log(`fail static-assets error ${pageUrl.pathname} ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isLocalhostBaseUrl(baseUrl) {
  const { hostname } = new URL(baseUrl);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function fetchWithTimeout(input, init = {}) {
  return fetch(input, {
    ...init,
    signal: AbortSignal.timeout(SMOKE_FETCH_TIMEOUT_MS),
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
