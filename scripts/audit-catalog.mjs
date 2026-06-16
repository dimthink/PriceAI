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
    price: offer.price,
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
  const verificationProductIds = new Set([
    "openai-phone-verification",
    "google-phone-verification",
    "paypal-phone-verification",
    "phone-verification",
    "identity-verification",
  ]);
  const aiProductIds = new Set([
    "chatgpt-free-account",
    "chatgpt-plus",
    "chatgpt-plus-recharge",
    "chatgpt-go",
    "chatgpt-team-business",
    "chatgpt-pro-5x",
    "chatgpt-pro-20x",
    "claude-pro-month",
    "claude-team-standard",
    "claude-team-premium",
    "claude-max-5x",
    "claude-max-20x",
    "claude-account",
    "gemini-pro-year",
    "gemini-pro-recharge",
    "gemini-ultra",
    "super-grok",
    "grok-account",
  ]);
  const checks = [
    {
      key: "grok_super_maybe_account_infrastructure",
      label: "Super Grok 中疑似普号/SSO/邮箱/API 基础设施",
      expected: "grok-account",
      filter: (offer) =>
        offer.nextProductId === "super-grok" &&
        /(普号|free|sso|长效微软邮箱|账号\s*sso|取邮件\s*api|适合\s*super)/i.test(offer.normalizedTitle) &&
        !/(月卡|年卡|充值|直充|卡密|激活码|订阅|会员|heavy|3天号|三天号|体验卡|独享成品号)/i.test(offer.normalizedTitle),
    },
    {
      key: "plus_maybe_api_transit_or_credit",
      label: "Plus 中疑似中转/API/额度/号池",
      expected: "openai-api-cdk",
      filter: (offer) =>
        offer.nextProductId === "chatgpt-plus" &&
        /(中转\s*api|api\s*中转|中转站|中转余额|api.*额度|api.*余额|号池|总共\s*\d+\s*(刀|美元|美金)|老\s*plus\s*渠道|30天有效期)/i.test(offer.normalizedTitle) &&
        !/(账号|成品号|首登|直登|月卡|会员|正规充值|官方|ios|内购|pix)/i.test(offer.normalizedTitle),
    },
    {
      key: "other_maybe_chatgpt_go",
      label: "其他中疑似 ChatGPT Go",
      expected: "chatgpt-go",
      filter: (offer) =>
        offer.nextProductId === "other-product" &&
        /(?:chatgpt|gpt)\s*go/i.test(offer.normalizedTitle),
    },
    {
      key: "ai_product_maybe_standalone_verification",
      label: "订阅/账号中疑似独立接码服务",
      expected: "接码",
      filter: (offer) =>
        aiProductIds.has(offer.canonical_product_id) &&
        isStandaloneVerificationTitle(offer.normalizedTitle),
    },
    {
      key: "verification_maybe_account_bundle",
      label: "接码中疑似账号/邮箱/非 AI 商品",
      expected: "账号/邮箱/其他",
      filter: (offer) =>
        verificationProductIds.has(offer.canonical_product_id) &&
        isAccountBundleTitle(offer.normalizedTitle) &&
        !isStandaloneVerificationTitle(offer.normalizedTitle),
    },
    {
      key: "plus_maybe_team",
      label: "Plus 中疑似 Team / Business 商品",
      expected: "chatgpt-team-business",
      filter: (offer) =>
        offer.nextProductId === "chatgpt-plus" &&
        /(gpt\s*team|chatgpt\s*team|team\s*bug|bug\s*team|team\s*子号|team\s*账号|team\s*成品|team\s*席位|team\s*反代|business|busisness|团队|母号|自动拉|直拉|团队号|团队席位)/i.test(offer.normalizedTitle) &&
        !/(有\s*team\s*不能冲|非\s*team|不是\s*team|无\s*team|不含\s*team|要稳买我的\s*team)/i.test(offer.normalizedTitle),
    },
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
      key: "claude_personal_maybe_team",
      label: "Claude Pro / Max 中疑似 Team 商品",
      expected: "claude-team-standard/claude-team-premium",
      filter: (offer) =>
        ["claude-pro-month", "claude-max-5x", "claude-max-20x", "claude-account"].includes(offer.nextProductId) &&
        /claude|克劳德/i.test(offer.normalizedTitle) &&
        /(team|团队|席位|1\.25\s*x|1\.25\s*倍|6\.25\s*x|6\.25\s*倍)/i.test(offer.normalizedTitle),
    },
    {
      key: "claude_account_maybe_team_seat",
      label: "Claude 普号中疑似 Team Seat",
      expected: "claude-team-standard/claude-team-premium",
      filter: (offer) =>
        offer.nextProductId === "claude-account" &&
        /claude|克劳德/i.test(offer.normalizedTitle) &&
        /(standard\s*seat|premium\s*seat|team|团队|席位|seat|1\.25\s*x|1\.25\s*倍|6\.25\s*x|6\.25\s*倍)/i.test(offer.normalizedTitle),
    },
    {
      key: "claude_account_maybe_max",
      label: "Claude 普号中疑似 Max 商品",
      expected: "claude-max-5x/claude-max-20x",
      filter: (offer) =>
        offer.nextProductId === "claude-account" &&
        /claude|克劳德/i.test(offer.normalizedTitle) &&
        /max|20\s*[x✕✖×]|5\s*[x✕✖×]|20\s*倍|5\s*倍/.test(offer.normalizedTitle),
    },
    {
      key: "claude_account_maybe_verification",
      label: "Claude 普号中疑似 KYC / 真人验证",
      expected: "identity-verification",
      filter: (offer) =>
        offer.nextProductId === "claude-account" &&
        /claude|克劳德/i.test(offer.normalizedTitle) &&
        isStandaloneIdentityVerificationTitle(offer.normalizedTitle),
    },
    {
      key: "claude_account_maybe_recharge",
      label: "Claude 普号中疑似充值 / 订阅服务",
      expected: "claude-pro-month",
      filter: (offer) =>
        offer.nextProductId === "claude-account" &&
        /claude|克劳德/i.test(offer.normalizedTitle) &&
        /(充值|直充|代充|续费|订阅|月卡|卡密|激活码|cdk)/i.test(offer.normalizedTitle),
    },
    {
      key: "ultra_maybe_gemini_pro",
      label: "Ultra 中疑似 Gemini Pro",
      expected: "gemini-pro-year/gemini-pro-recharge",
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
        !/教程|登陆教程|登录教程|仅文字|仅图文|persona|cyber|镜像站|镜像/.test(offer.normalizedTitle) &&
        /(chatgpt|gpt|plus|pro\s*20|pro20|20x|x20|20×|pro\s*5|pro5|5x|x5|5×|business|busisness|team)/i.test(offer.normalizedTitle),
    },
    {
      key: "other_maybe_virtual_card",
      label: "其他中疑似虚拟卡",
      expected: "virtual-card",
      filter: (offer) =>
        offer.nextProductId === "other-product" &&
        /(虛擬卡|虚拟卡|visa|mastercard|paypal.*(美國|美国).*(虛擬|虚拟)|(^|[^\d])[01]\s*刀\s*卡(?!\d)|485954)/i.test(offer.normalizedTitle),
    },
    {
      key: "other_maybe_api",
      label: "其他中疑似 API / 中转",
      expected: "openai-api-cdk",
      filter: (offer) =>
        offer.nextProductId === "other-product" &&
        /(中转\s*api|中转api|api.*兑换码|\d+刀兑换码|codex\s*api.*\d+\s*刀\s*卡|api.*\d+\s*刀\s*卡|官方1:1|api\s*\|)/i.test(offer.normalizedTitle),
    },
    {
      key: "token_non_api_review",
      label: "Token/凭证 非 API 分类候选",
      expected: "人工确认：账号自带凭证或 API/额度",
      filter: (offer) =>
        offer.nextProductId !== "openai-api-cdk" &&
        /\btoken\b|access[_\s-]*token|refresh[_\s-]*token|令牌|凭证/i.test(offer.normalizedTitle),
    },
    {
      key: "rt_api_credential_review",
      label: "RT + API/sub2api/JSON 凭证候选",
      expected: "人工确认：账号交付格式或 API/凭证包",
      filter: (offer) =>
        /(^|[^a-z])rt([^a-z]|$)|带rt|含rt|rt号|rt\s*号|rt凭证|rt\s*凭证/i.test(offer.normalizedTitle) &&
        /(api|中转|额度|余额|号池|sub2api|sub2|cpa|json|兑换码|key|apikey)/i.test(offer.normalizedTitle),
    },
    {
      key: "host_or_site_review",
      label: "HOST/站点/镜像/中转站候选",
      expected: "人工确认：API 中转或其他站点服务",
      filter: (offer) =>
        /\bhost\b|host口|host号|host池|hostname|镜像站|中转站/i.test(offer.normalizedTitle),
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

function isStandaloneVerificationTitle(value) {
  if (isStandaloneIdentityVerificationTitle(value)) {
    return true;
  }

  if (/(接码\s*自助|接码自助|手机接码\s*自助|实卡接码|实体卡接码|单次接码|一次性接码|sms\s*接码|短信\s*接码)/i.test(value)) {
    return true;
  }

  if (/(codex|gpt|openai|google|gemini|claude)\s*接码/i.test(value) && !isAccountBundleTitle(value)) {
    return true;
  }

  if (/手机接码/.test(value) && /(可绑定|绑定\s*3\s*个|绑定3个|号码|质保1次成功接码)/.test(value)) {
    return true;
  }

  return false;
}

function isStandaloneIdentityVerificationTitle(value) {
  if (!/(kyc|人脸验证|真人认证|实名认证|(^|[^a-z])persona([^a-z]|$))/i.test(value)) return false;

  return !/(成品号|成品账号|账号|账户|子号|max|pro|team|plus|会员|订阅|月卡|年卡|已过\s*kyc|以过\s*kyc|免\s*过?\s*kyc|过\s*kyc|已完成\s*kyc)/i.test(value);
}

function isAccountBundleTitle(value) {
  return /(成品号|半成品|账号|账户|账密|普号|网页号|邮箱|plus|pro|team|business|会员|月卡|年卡|12个月|一年|whatsapp|未接码|已接码|自行接码|自己接码|带接码地址|带接码链接)/i.test(value);
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
  }).outputText.replace(/(["'])\.\/offer-filter-tags\1/g, "$1./offer-filter-tags.mjs$1");

  const offerFilterTagsPath = path.join(repoRoot, "src", "lib", "offer-filter-tags.ts");
  const offerFilterTagsSource = await readFile(offerFilterTagsPath, "utf8");
  const offerFilterTagsOutput = ts.transpileModule(offerFilterTagsSource, {
    fileName: offerFilterTagsPath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      esModuleInterop: true,
    },
  }).outputText;

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "priceai-catalog-audit-"));
  const tempFile = path.join(tempDir, "catalog.mjs");
  const offerFilterTagsFile = path.join(tempDir, "offer-filter-tags.mjs");
  await writeFile(offerFilterTagsFile, offerFilterTagsOutput, "utf8");
  await writeFile(tempFile, output, "utf8");

  try {
    return await import(`${pathToFileURL(tempFile).href}?ts=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
