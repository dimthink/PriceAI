#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFile, rm, writeFile } from "node:fs/promises";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const SAMPLE_LIMIT = Number.parseInt(readArg("--limit") || "12", 10);
const jsonMode = process.argv.includes("--json");

loadEnv(path.join(repoRoot, ".env.local"));

const catalog = await loadCatalogModule();
const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const offers = await listVisibleOffers();
const products = new Map(catalog.canonicalCatalog.map((product) => [product.id, product.displayName]));
const analyzedOffers = offers.map((offer) => ({
  ...offer,
  nextProductId: catalog.classifyOffer(offer.source_title || "", {
    tags: offer.tags,
    categorySlug: offer.category_slug,
  }).id,
  normalizedTitle: String(offer.source_title || "").toLowerCase(),
}));

const distribution = countBy(analyzedOffers, (offer) => offer.nextProductId)
  .map(([id, count]) => ({ id, name: productName(id), count }));
const reclassifyChanges = analyzedOffers.filter((offer) => offer.canonical_product_id !== offer.nextProductId);
const suspiciousChecks = buildSuspiciousChecks(analyzedOffers);

const report = {
  generatedAt: new Date().toISOString(),
  totalVisibleOffers: offers.length,
  currentRuleDistribution: distribution,
  pendingReclassify: {
    count: reclassifyChanges.length,
    topPairs: countBy(reclassifyChanges, (offer) => `${offer.canonical_product_id || "(null)"} => ${offer.nextProductId}`)
      .slice(0, 30)
      .map(([pair, count]) => ({ pair, count })),
    samples: reclassifyChanges.slice(0, SAMPLE_LIMIT).map(toSample),
  },
  suspiciousChecks,
};

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}

async function listVisibleOffers() {
  const rows = [];
  const pageSize = 1000;
  const select = [
    "id",
    "source_name",
    "source_store_name",
    "source_title",
    "price",
    "status",
    "tags",
    "category_slug",
    "canonical_product_id",
  ].join(",");

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("raw_offers")
      .select(select)
      .eq("hidden", false)
      .order("captured_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

function buildSuspiciousChecks(items) {
  const checks = [
    {
      key: "team_maybe_plus",
      label: "Team 中疑似 Plus 商品",
      expected: "chatgpt-plus",
      filter: (offer) =>
        offer.nextProductId === "chatgpt-team-business" &&
        /plus/.test(offer.normalizedTitle) &&
        /(plus.*(充值|cdk|自助|首登)|有team不能冲|要稳买我的team)/i.test(offer.normalizedTitle),
    },
    {
      key: "ultra_maybe_gemini_pro",
      label: "Ultra 中疑似 Gemini Pro",
      expected: "gemini-pro-year",
      filter: (offer) =>
        offer.nextProductId === "gemini-ultra" &&
        /gemini\s*pro/.test(offer.normalizedTitle) &&
        !/ultra|250\s*(美元|美金|刀)|45k|25k/.test(offer.normalizedTitle),
    },
    {
      key: "email_maybe_chatgpt",
      label: "邮箱中疑似 ChatGPT 账号或会员",
      expected: "chatgpt-free-account/chatgpt-plus",
      filter: (offer) =>
        ["gmail-account", "outlook-account", "email-account"].includes(offer.nextProductId) &&
        /(gptplus|chatgpt|gpt账号|gpt.*free|gpt.*白号|plus.*会员|pro12个月)/i.test(offer.normalizedTitle),
    },
    {
      key: "other_maybe_chatgpt",
      label: "其他中疑似 ChatGPT 标准商品",
      expected: "chatgpt-*",
      filter: (offer) =>
        offer.nextProductId === "other-product" &&
        !/教程|登陆教程|登录教程|仅文字|仅图文|persona|cyber/.test(offer.normalizedTitle) &&
        /(chatgpt|gpt|plus|pro\s*20|pro20|20x|x20|20×|pro\s*5|pro5|5x|x5|5×|business|busisness|team)/i.test(offer.normalizedTitle),
    },
    {
      key: "other_maybe_virtual_card",
      label: "其他中疑似虚拟卡",
      expected: "virtual-card",
      filter: (offer) =>
        offer.nextProductId === "other-product" &&
        /(虛擬卡|虚拟卡|visa|mastercard|paypal.*(美國|美国).*(虛擬|虚拟)|0刀卡|1刀卡|485954)/i.test(offer.normalizedTitle),
    },
    {
      key: "other_maybe_api",
      label: "其他中疑似 API / 中转",
      expected: "openai-api-cdk",
      filter: (offer) =>
        offer.nextProductId === "other-product" &&
        /(中转\s*api|中转api|api.*兑换码|\d+刀兑换码|官方1:1|api\s*\|)/i.test(offer.normalizedTitle),
    },
  ];

  return checks.map((check) => {
    const hits = items.filter(check.filter);
    return {
      key: check.key,
      label: check.label,
      expected: check.expected,
      count: hits.length,
      samples: hits.slice(0, SAMPLE_LIMIT).map(toSample),
    };
  });
}

function toSample(offer) {
  return {
    id: offer.id,
    source: offer.source_store_name || offer.source_name,
    title: offer.source_title,
    price: offer.price,
    status: offer.status,
    current: productName(offer.canonical_product_id),
    next: productName(offer.nextProductId),
  };
}

function printHumanReport(report) {
  console.log(`Catalog audit @ ${report.generatedAt}`);
  console.log(`Visible offers: ${report.totalVisibleOffers}`);
  console.log(`Pending reclassify changes: ${report.pendingReclassify.count}`);

  console.log("\nDistribution");
  for (const item of report.currentRuleDistribution.slice(0, 30)) {
    console.log(`- ${item.name} (${item.id}): ${item.count}`);
  }

  console.log("\nTop reclassify pairs");
  for (const item of report.pendingReclassify.topPairs) {
    console.log(`- ${item.pair}: ${item.count}`);
  }

  console.log("\nSuspicious checks");
  for (const check of report.suspiciousChecks) {
    console.log(`- ${check.label}: ${check.count}`);
    for (const sample of check.samples.slice(0, 3)) {
      console.log(`  · [${sample.source}] ${sample.title} (${sample.current} -> ${sample.next})`);
    }
  }
}

function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function productName(id) {
  if (!id) return "(null)";
  return products.get(id) || id;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Check .env.local or deployment env.`);
  return value;
}

function loadEnv(filePath) {
  let text = "";
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] ||= value;
  }
}

async function loadCatalogModule() {
  const sourcePath = path.join(repoRoot, "src", "lib", "catalog.ts");
  const source = (await readFile(sourcePath, "utf8")).replace(/import type \{[^}]+\} from "\.\/types";\n?/, "");
  const output = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      esModuleInterop: true,
    },
  }).outputText;

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "priceai-catalog-audit-"));
  const tempFile = path.join(tempDir, "catalog.mjs");
  await writeFile(tempFile, output, "utf8");

  try {
    return await import(`${pathToFileURL(tempFile).href}?ts=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
