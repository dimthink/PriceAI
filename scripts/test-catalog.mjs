#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const { buildProductGroups, classifyOffer } = await loadCatalogModule();

const cases = [
  ["ChatGPT Plus 直充 卡密自助", "chatgpt-plus"],
  ["ChatGPT Plus 成品号 独享账号", "chatgpt-plus"],
  ["【推荐】GPT Plus充值CDK - pix 自动充值渠道非成品需自备账号，自己账号有team不能冲", "chatgpt-plus"],
  ["ChatGPT Plus成品会员账号｜提供邮箱账密，带RT 可直接导入中转站｜自动发货", "chatgpt-plus"],
  ["谷歌邮箱gptplus月卡会员质保首登成品号带2fa（不可反代）", "chatgpt-plus"],
  ["ChatGPT ios土区正规自助卡密", "chatgpt-plus"],
  ["GPT续费一个月卡密（IOS 内购渠道）【质保订阅不管封号】", "chatgpt-plus"],
  ["ChatGPT Pro 20倍 官方充值", "chatgpt-pro-20x"],
  ["Pro 20×正规卡充【带账单】", "chatgpt-pro-20x"],
  ["chatGPT PRO 200美金档 代充 人工交付", "chatgpt-pro-20x"],
  ["ChatGPT Pro 5倍 官方充值", "chatgpt-pro-5x"],
  ["PRO 5× 充值卡密(iOS美区质保)", "chatgpt-pro-5x"],
  ["ChatGPT Pro 100 美金 成品号/账号代充", "chatgpt-pro-5x"],
  ["GPT PRO 特价代充卡密(质保订阅)", "other-product"],
  ["ChatGPT Team 团队席位 邀请", "chatgpt-team-business"],
  ["ChatGPT Business 母号 自动拉", "chatgpt-team-business"],
  ["GPT Busisness 席位月卡 质保首登", "chatgpt-team-business"],
  ["Steam白号", "other-product"],
  ["Super Grok 激活码 月卡", "super-grok"],
  ["Grok 普号 体验号", "grok-account"],
  ["Gemini Pro 一年 12个月", "gemini-pro-year"],
  ["【反重力GCP可用】Gemini Pro 12个月成品【质保首登丨官方订阅】", "gemini-pro-year"],
  ["提取12个月优惠链接 一次 gemin pro（不会用别买不退不换，小白别买）", "gemini-pro-year"],
  ["Google AI Ultra 250美元 Flow 积分", "gemini-ultra"],
  ["Gmail 老号 Google 账号", "gmail-account"],
  ["Outlook OAuth2 微软邮箱", "outlook-account"],
  ["长效【微软邮箱交付】GPT账号（白号）FREE普通号含access_token", "chatgpt-free-account"],
  ["OpenAI ChatGPT 手机接码", "openai-phone-verification"],
  ["美国 VISA 虚拟卡 0刀卡", "virtual-card"],
  ["PayPal 美國虛擬卡*僅用來註冊一次性GPT", "virtual-card"],
  ["CR.Ai 中转Api | 支持Claude ChatGPT Gemini 官方1:1 |300刀兑换码 使用请看教程", "openai-api-cdk"],
  ["chatGPT API中转 充值余额100刀 8折", "openai-api-cdk"],
  ["Cursor Pro 成品号", "cursor-account"],
  ["Kiro 积分 成品号", "kiro-account"],
];

for (const [title, expected] of cases) {
  assert.equal(classifyOffer(title).id, expected, `${title} should classify as ${expected}`);
}

const groups = buildProductGroups([
  makeOffer({ id: "available", title: "ChatGPT Plus 直充", price: 100, status: "in_stock" }),
  makeOffer({ id: "cheap-out", title: "ChatGPT Plus 直充", price: 1, status: "out_of_stock" }),
  makeOffer({ id: "unavailable", title: "ChatGPT Plus 直充", price: 2, status: "in_stock", effectiveStatus: "unavailable" }),
  makeOffer({ id: "hidden", title: "ChatGPT Plus 直充", price: 0, status: "in_stock", hidden: true }),
]);

const plusGroup = groups.find((group) => group.id === "chatgpt-plus");
assert.ok(plusGroup, "ChatGPT Plus group should exist.");
assert.equal(plusGroup.lowestOffer?.id, "available", "Only available offers should participate in lowest price.");
assert.equal(plusGroup.lowestPrice, 100, "Out-of-stock or unavailable low prices must not become the displayed lowest price.");
assert.equal(plusGroup.inStockCount, 1, "Only one offer is publicly available.");
assert.equal(plusGroup.outOfStockCount, 2, "Hidden offers are removed before stock counting.");
assert.equal(plusGroup.offerCount, 3, "Hidden offers should not be counted.");
assert.equal(plusGroup.lowestPriceLabel, "有货", "Available lowest offer should be labelled as in stock.");

const outOnlyGroups = buildProductGroups([
  makeOffer({ id: "out-only", title: "ChatGPT Pro 20倍 官方充值", price: 20, status: "out_of_stock" }),
]);
const pro20Group = outOnlyGroups.find((group) => group.id === "chatgpt-pro-20x");
assert.ok(pro20Group, "ChatGPT Pro 20x group should exist.");
assert.equal(pro20Group.lowestOffer, null, "All out-of-stock products should not expose a lowest offer.");
assert.equal(pro20Group.lowestPrice, null, "All out-of-stock products should not expose a lowest price.");
assert.equal(pro20Group.lowestPriceLabel, "暂无有货价", "All out-of-stock products should use the no-available-price label.");

console.log(`catalog test passed cases=${cases.length}`);

function makeOffer({
  id,
  title,
  price,
  status,
  hidden = false,
  effectiveStatus = null,
}) {
  return {
    id,
    sourceId: "test-source",
    sourceName: "测试渠道",
    sourceStoreName: "测试店铺",
    sourceTitle: title,
    price,
    currency: "CNY",
    status,
    url: `https://example.com/${id}`,
    tags: [],
    stockCount: status === "out_of_stock" ? 0 : 10,
    hidden,
    canonicalProductId: null,
    categorySlug: null,
    capturedAt: "2026-06-06T00:00:00.000Z",
    sourceUpdatedAt: "2026-06-06T00:00:00.000Z",
    lastSeenAt: "2026-06-06T00:00:00.000Z",
    verifiedAt: "2026-06-06T00:00:00.000Z",
    expiresAt: null,
    sourcePriority: null,
    confidence: null,
    effectiveStatus,
    freshnessStatus: "fresh",
    lastFailedAt: null,
    failureReason: null,
  };
}

async function loadCatalogModule() {
  const sourcePath = path.join(repoRoot, "src", "lib", "catalog.ts");
  const source = await readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      esModuleInterop: true,
    },
  }).outputText;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-catalog-test-"));
  const tempFile = path.join(tempDir, "catalog.mjs");
  await writeFile(tempFile, output, "utf8");

  try {
    return await import(`${pathToFileURL(tempFile).href}?ts=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function mkdtemp(prefix) {
  const { mkdtemp: makeTempDir } = await import("node:fs/promises");
  return makeTempDir(prefix);
}
