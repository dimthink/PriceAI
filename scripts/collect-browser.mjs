#!/usr/bin/env node

import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright-core";

const args = parseArgs(process.argv.slice(2));
const targetUrl = args.url;

if (!targetUrl) {
  console.error("Usage: npm run collect:browser -- --url https://example.com --password admin-password --post");
  process.exit(1);
}

const sourceName = args.name || sourceNameFromUrl(targetUrl);
const endpoint = args.endpoint || "http://localhost:3000";
const password = args.password || process.env.CRON_SECRET || null;
const browserPath = args.browser || process.env.BROWSER_PATH || findBrowserPath();

if (args.post && !password) {
  console.error("--post 写回后台需要 --password 或 CRON_SECRET。");
  process.exit(1);
}

if (!browserPath) {
  console.error("没有找到可控制的本机浏览器。请安装 Chrome/Edge/Brave，或使用 --browser /path/to/browser 指定。");
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: browserPath,
  headless: false,
  args: ["--disable-blink-features=AutomationControlled"],
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 980 },
});

console.log(`Opening ${targetUrl}`);
await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(2500);

const rl = createInterface({ input, output });
await rl.question(
  "如果页面需要验证/登录/手动切换分类，请在浏览器里处理好后按回车继续采集。直接回车会采集当前页面。\n",
);
rl.close();

await page.waitForTimeout(800);
const offers = await page.evaluate(extractOffersInPage);
await browser.close();

const normalizedOffers = offers.map((offer) => ({
  ...offer,
  sourceName,
  sourceUrl: targetUrl,
  sourceStoreName: offer.sourceStoreName || sourceName,
  currency: "CNY",
}));

console.log(JSON.stringify(normalizedOffers, null, 2));

if (args.post) {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/api/admin/crawl-log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${password}`,
    },
    body: JSON.stringify({
      sourceName,
      sourceUrl: targetUrl,
      mode: "browser",
      status: normalizedOffers.length ? "success" : "failed",
      message: normalizedOffers.length
        ? `本机浏览器采集 ${normalizedOffers.length} 条候选报价。`
        : "本机浏览器未提取到候选报价。",
      offers: normalizedOffers,
      details: {
        collectorNode: collectorNodeDetails(args),
        collector: "browser",
        browserPath,
        url: targetUrl,
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    console.error(payload?.message || `Post failed with HTTP ${response.status}`);
    process.exit(1);
  }

  console.log(`Posted ${payload.successCount} offers to ${endpoint}.`);
}

function extractOffersInPage() {
  const pricePattern = /(?:[¥￥]\s*|(?:^|\s))(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?:\s*元)?/;
  const currencyPricePattern = /[¥￥]\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g;
  const stockPattern = /库存[:：]?\s*(\d+)/;
  const selectors = [
    "article",
    "li",
    "a",
    "button",
    "[class*='product']",
    "[class*='goods']",
    "[class*='item']",
    "[class*='card']",
    "[class*='shop']",
  ];
  const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
  const seen = new Set();
  const results = [];

  for (const node of nodes) {
    const text = (node.innerText || node.textContent || "")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 8 || text.length > 520) continue;
    if (!pricePattern.test(text)) continue;

    const priceMatch = text.match(pricePattern);
    const price = priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null;
    if (!Number.isFinite(price)) continue;

    const linkNode = node.closest("a") || node.querySelector?.("a");
    const url = linkNode?.href || window.location.href;
    const key = `${text}|${url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const stockMatch = text.match(stockPattern);
    const stockCount = stockMatch ? Number(stockMatch[1]) : null;
    const status = text.includes("库存：0") || text.includes("库存:0") || text.includes("缺货") || text.includes("售罄")
      ? "out_of_stock"
      : stockCount !== null && stockCount <= 3
        ? "low_stock"
        : "in_stock";

    const title = text
      .replace(/库存[:：]?\s*\d+/g, "")
      .replace(currencyPricePattern, "")
      .replace(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\s*元/g, "")
      .replace(/\d+(?:\.\d{1,2})?\s*元/g, "")
      .replace(/下单|购买|自动发货|人工处理/g, "")
      .trim()
      .slice(0, 180);

    if (!title || title.length < 4) continue;

    const tags = [];
    if (text.includes("无质保")) tags.push("无质保");
    if (text.includes("自动发货")) tags.push("自动发货");
    if (text.includes("人工处理")) tags.push("人工处理");

    results.push({
      sourceTitle: title,
      price,
      status,
      url,
      tags,
      stockCount,
    });
  }

  return results.slice(0, 120);
}

function sourceNameFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function collectorNodeDetails(options = {}) {
  const id =
    options.collectorNodeId ||
    options["collector-node-id"] ||
    process.env.PRICEAI_COLLECTOR_NODE_ID ||
    defaultCollectorNodeId();
  const name =
    options.collectorNodeName ||
    options["collector-node-name"] ||
    process.env.PRICEAI_COLLECTOR_NODE_NAME ||
    defaultCollectorNodeName(id);
  const type =
    options.collectorNodeType ||
    options["collector-node-type"] ||
    process.env.PRICEAI_COLLECTOR_NODE_TYPE ||
    defaultCollectorNodeType();
  const runtime =
    options.collectorNodeRuntime ||
    options["collector-node-runtime"] ||
    process.env.PRICEAI_COLLECTOR_NODE_RUNTIME ||
    defaultCollectorNodeRuntime();
  const region =
    options.collectorNodeRegion ||
    options["collector-node-region"] ||
    process.env.PRICEAI_COLLECTOR_NODE_REGION ||
    null;

  return compactObject({
    id,
    name,
    type,
    runtime,
    region,
  });
}

function defaultCollectorNodeId() {
  return "local-browser";
}

function defaultCollectorNodeName(id) {
  return id === "local-browser" ? "本机浏览器" : "未知节点";
}

function defaultCollectorNodeType() {
  return "local";
}

function defaultCollectorNodeRuntime() {
  return "browser";
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""),
  );
}

function findBrowserPath() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  return candidates.find((path) => existsSync(path)) || null;
}

function parseArgs(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;

    const key = item.slice(2);
    const next = values[index + 1];

    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }

  return result;
}
