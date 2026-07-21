#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 32000 + (process.pid % 10000);
const baseUrl = `http://127.0.0.1:${port}`;
const node = path.join(repoRoot, "node_modules", "node", "bin", "node");
const next = path.join(repoRoot, "node_modules", "next", "dist", "bin", "next");
const log = [];
const server = spawn(node, [next, "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: repoRoot,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => rememberLog(chunk));
server.stderr.on("data", (chunk) => rememberLog(chunk));

try {
  await waitForServer();

  const oneHour = await getJson("/api/products/chatgpt-plus/price-candles?interval=1h&limit=720", 200);
  assert(oneHour.body.productId === "chatgpt-plus", "detail API did not normalize the product ID");
  assert(oneHour.body.interval === "1h", "detail API did not return 1h");
  assert(Array.isArray(oneHour.body.candles) && oneHour.body.candles.length === 0, "unconfigured detail API did not return empty history");
  assert(oneHour.body.current?.price === null, "unconfigured detail API returned a synthetic current price");
  assertCacheHeaders(oneHour.response);

  const oneDay = await getJson("/api/products/chatgpt-plus/price-candles?interval=1d&limit=365&before=2026-07-20T00%3A00%3A00Z", 200);
  assert(oneDay.body.interval === "1d", "detail API did not return 1d");
  assertCacheHeaders(oneDay.response);

  await getJson("/api/products/chatgpt-plus/price-candles?interval=4h", 400);
  await getJson("/api/products/chatgpt-plus/price-candles?interval=1h&limit=721", 400);
  await getJson("/api/products/chatgpt-plus/price-candles?interval=1d&before=2026-07-20", 400);
  await getJson("/api/products/not-a-product/price-candles?interval=1d", 404);

  const summaries1h = await getJson("/api/price-chart-summaries?interval=1h&points=24&platform=ChatGPT", 200);
  assert(summaries1h.body.interval === "1h" && summaries1h.body.points === 24, "summary API did not return 1h/24");
  assert(Array.isArray(summaries1h.body.products) && summaries1h.body.products.length > 1, "summary API did not return a product batch");
  assert(summaries1h.body.products.every((item) => item.candles.length === 0), "unconfigured summary API returned synthetic candles");
  assertCacheHeaders(summaries1h.response);

  const summaries1d = await getJson("/api/price-chart-summaries?interval=1d&points=30&productType=%E8%AE%A2%E9%98%85%2F%E4%BC%9A%E5%91%98", 200);
  assert(summaries1d.body.interval === "1d" && summaries1d.body.points === 30, "summary API did not return 1d/30");
  assert(!containsInternalField(summaries1d.body), "public price history API exposed internal quote fields");
  await getJson("/api/price-chart-summaries?interval=1d&points=25", 400);

  console.log("product price history API test passed");
} catch (error) {
  const suffix = log.length ? `\nNext dev output:\n${log.join("")}` : "";
  throw new Error(`${error instanceof Error ? error.message : String(error)}${suffix}`);
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Next dev exited with ${server.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/price-chart-summaries?interval=1d&points=30`);
      if (response.status === 200) return;
    } catch {
      // The dev server is still compiling.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Next dev did not become ready within 60 seconds");
}

async function getJson(pathname, expectedStatus) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const body = await response.json().catch(() => null);
  assert(response.status === expectedStatus, `${pathname} expected ${expectedStatus}, got ${response.status}: ${JSON.stringify(body)}`);
  return { response, body };
}

function assertCacheHeaders(response) {
  assert(response.headers.get("cdn-cache-control") === "public, s-maxage=300", "CDN cache TTL is not 300 seconds");
  assert(response.headers.get("cloudflare-cdn-cache-control") === "public, s-maxage=300", "Cloudflare cache TTL is not 300 seconds");
}

function containsInternalField(value) {
  const text = JSON.stringify(value);
  return /offer_id|source_id|confirmation|consecutive_valid/i.test(text);
}

function rememberLog(chunk) {
  log.push(String(chunk));
  while (log.join("").length > 12000) log.shift();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
