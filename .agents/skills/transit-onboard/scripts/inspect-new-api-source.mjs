#!/usr/bin/env node

const options = parseArgs(process.argv.slice(2));
const root = normalizeRoot(options.url);
const timeoutMs = positiveInteger(options.timeout, 10000);

const candidates = [
  ["status", "/api/status"],
  ["pricing", "/api/pricing"],
  ["pricing_page", "/pricing"],
  ["pricing_legacy_page", "/pricing-legacy"],
  ["status_page", "/status"],
  ["model_status", "/api/model-status"],
  ["performance", "/api/perf-metrics/summary?period=24"],
  ["models", "/v1/models"],
  ["ai_transit_discovery", "/.well-known/ai-transit.json"],
  ["ai_transit_snapshot", "/api/public/transit/v1/snapshot"],
];

const checks = await Promise.all(
  candidates.map(async ([kind, pathname]) => inspect(kind, new URL(pathname, root), timeoutMs)),
);

const result = {
  input: options.url,
  origin: root.origin,
  checkedAt: new Date().toISOString(),
  likelyNewApi: inferNewApi(checks),
  likelyAiTransitSnapshot: checks.some(
    (item) => item.kind === "ai_transit_snapshot" && item.ok && item.summary?.schemaVersion,
  ),
  checks,
};

console.log(JSON.stringify(result, null, 2));

async function inspect(kind, url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        "user-agent": "PriceAI transit-onboard/1.0",
      },
    });
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();
    const json = parseJson(body);

    return {
      kind,
      url: url.href,
      finalUrl: response.url,
      status: response.status,
      ok: response.ok,
      contentType,
      bytes: Buffer.byteLength(body),
      summary: json ? summarizeJson(json) : summarizeHtml(body),
    };
  } catch (error) {
    return {
      kind,
      url: url.href,
      status: null,
      ok: false,
      error: error?.name === "AbortError" ? `timeout after ${timeout}ms` : String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function summarizeJson(value) {
  const data = value && typeof value === "object" && "data" in value ? value.data : value;
  const object = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const rootObject = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const arrays = findArrays(value, 2);

  return {
    type: "json",
    topLevelKeys: Object.keys(rootObject).slice(0, 30),
    dataKeys: Object.keys(object).slice(0, 40),
    primaryArrayCount: Array.isArray(data) ? data.length : null,
    objectCounts: summarizeObjectCounts(rootObject),
    arrays,
    systemName: firstString(object.system_name, object.systemName, object.name),
    serverAddress: firstString(object.server_address, object.serverAddress),
    schemaVersion: firstString(object.schema_version, object.schemaVersion),
    snapshotUrl: firstString(object.snapshot_url, object.snapshotUrl),
  };
}

function summarizeObjectCounts(value) {
  const keys = ["group_ratio", "usable_group", "vendors", "auto_groups"];
  return Object.fromEntries(
    keys
      .filter((key) => value[key] && typeof value[key] === "object")
      .map((key) => [key, Array.isArray(value[key]) ? value[key].length : Object.keys(value[key]).length]),
  );
}

function findArrays(value, depth, prefix = "") {
  if (depth < 0 || !value || typeof value !== "object") return [];
  const output = [];
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(item)) output.push({ path, count: item.length });
    else if (item && typeof item === "object") output.push(...findArrays(item, depth - 1, path));
    if (output.length >= 20) break;
  }
  return output.slice(0, 20);
}

function summarizeHtml(body) {
  const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
  return {
    type: "html",
    title,
    mentionsNewApi: /new[ -]?api/i.test(body),
  };
}

function inferNewApi(checks) {
  const status = checks.find((item) => item.kind === "status");
  const pricing = checks.find((item) => item.kind === "pricing");
  const pageSignals = checks.some(
    (item) => item.summary?.type === "html" && item.summary.mentionsNewApi,
  );
  return Boolean(
    pageSignals ||
      (status?.ok && (status.summary?.systemName || status.summary?.serverAddress)) ||
      (pricing?.ok && pricing.summary?.type === "json"),
  );
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || null;
}

function normalizeRoot(value) {
  if (!value) fail("Missing --url=<website-url>.");
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`Invalid URL: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") fail("Only HTTP(S) URLs are supported.");
  return new URL(`${url.protocol}//${url.host}/`);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: inspect-new-api-source.mjs --url=<website-url> [--timeout=10000]");
      process.exit(0);
    }
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    const next = args[index + 1];
    if (inlineValue !== undefined) parsed[key] = inlineValue;
    else if (next && !next.startsWith("--")) {
      parsed[key] = next;
      index += 1;
    } else parsed[key] = true;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
