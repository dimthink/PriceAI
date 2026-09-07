#!/usr/bin/env node

const baseUrl = process.env.CLOUDFLARE_SMOKE_BASE_URL || "https://priceai.cc";
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error("CRON_SECRET is required to revalidate deployment cache.");
  process.exit(1);
}

const url = new URL("/api/cron/deployment-revalidate", baseUrl);
const response = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${cronSecret}` },
  signal: AbortSignal.timeout(30_000),
});
const text = await response.text();
let payload = null;
try {
  payload = text ? JSON.parse(text) : null;
} catch {
  payload = null;
}

if (!response.ok || payload?.ok !== true || payload?.revalidated !== true) {
  console.error(payload?.message || text || `Deployment cache revalidation failed with HTTP ${response.status}.`);
  process.exit(1);
}

console.log(`Deployment cache revalidated at ${url.origin}.`);
