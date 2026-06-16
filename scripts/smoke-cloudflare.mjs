const DEFAULT_BASE_URL = "https://priceai.cc";

const baseUrl = normalizeBaseUrl(
  process.argv[2] || process.env.CLOUDFLARE_SMOKE_BASE_URL || DEFAULT_BASE_URL,
);

const fallbackHtmlMarkers = [
  "当前使用内置演示数据",
  "配置 Supabase",
  "01/01 08:00",
  "2026-01-01T00:00:00.000Z",
  '"configured":false',
  '\\"configured\\":false',
  '"offerTotal":10',
  '\\"offerTotal\\":10',
];

const staticDatasetMarkers = [
  '"source":"static"',
  '\\"source\\":\\"static\\"',
  "数据源：静态样本",
];

const checks = [
  {
    path: "/",
    status: 200,
    text: {
      forbidden: fallbackHtmlMarkers,
      requiredAny: [
        { label: "homepage-title", patterns: ["先看清价格从哪里来"] },
        { label: "purchase-paths", patterns: ["先回答一个问题：你现在要买什么"] },
        { label: "sponsor-contact", patterns: ["https://t.me/dimthink"] },
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
    path: "/api-models",
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
    json: validateExplorerJson,
  },
  {
    path: "/api/offers?limit=80",
    status: 200,
    maxBytes: 140_000,
    cache: true,
    json: validateOffersJson,
  },
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
    const text = check.text || check.json ? new TextDecoder().decode(body) : "";
    const elapsed = Date.now() - startedAt;
    const cacheHeader =
      response.headers.get("cloudflare-cdn-cache-control") ||
      response.headers.get("cdn-cache-control") ||
      response.headers.get("cache-control") ||
      "";

    const statusOk = response.status === check.status;
    const maxBytes = Number.isFinite(check.maxBytes) ? check.maxBytes : null;
    const sizeOk = maxBytes === null || bytes <= maxBytes;
    const cacheOk = !check.cache || /s-maxage|max-age/i.test(cacheHeader);
    const textFailures = check.text ? validateText(text, check.text) : [];
    const jsonFailures = check.json ? validateJson(text, check.json) : [];
    const contentOk = textFailures.length === 0 && jsonFailures.length === 0;
    const ok = statusOk && sizeOk && cacheOk && contentOk;

    if (!ok) failures += 1;

    console.log(
      [
        ok ? "ok" : "fail",
        response.status,
        `${bytes}B`,
        `${elapsed}ms`,
        check.path,
        check.cache ? `cache=${cacheHeader || "missing"}` : "",
        !sizeOk && maxBytes !== null ? `size>${maxBytes}B` : "",
        textFailures.length ? `text=${textFailures.join(";")}` : "",
        jsonFailures.length ? `json=${jsonFailures.join(";")}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  } catch (error) {
    failures += 1;
    console.log(`fail error ${check.path} ${error instanceof Error ? error.message : String(error)}`);
  }
}

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
    if (text.includes(marker)) {
      failures.push(`forbidden:${marker}`);
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

function validateJson(text, validator) {
  try {
    return validator(JSON.parse(text));
  } catch (error) {
    return [`invalid-json:${error instanceof Error ? error.message : String(error)}`];
  }
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
  if (data?.degraded !== false) failures.push("degraded!=false");
  if (!Number.isFinite(data?.offerTotal) || data.offerTotal < 100) failures.push("offerTotal<100");
  return failures;
}

function validateOffersJson(data) {
  const failures = [];
  if (data?.degraded !== false) failures.push("degraded!=false");
  if (!Number.isFinite(data?.total) || data.total < 100) failures.push("total<100");
  return failures;
}

async function validateNextStaticAssets(baseUrl) {
  const pageUrl = new URL("/", baseUrl);
  const startedAt = Date.now();
  const strictCache = !isLocalhostBaseUrl(baseUrl);

  try {
    const response = await fetch(pageUrl, {
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
        const assetResponse = await fetch(assetUrl, {
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
