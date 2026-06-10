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
  ["PLUS-成品-已接码rt-微软邮箱-支持登录网页端，支持直接登录codex-质保首登", "chatgpt-plus"],
  ["谷歌邮箱gptplus月卡会员质保首登成品号带2fa（不可反代）", "chatgpt-plus"],
  ["ChatGPT ios土区正规自助卡密", "chatgpt-plus-recharge"],
  ["GPT续费一个月卡密（IOS 内购渠道）【质保订阅不管封号】", "chatgpt-plus-recharge"],
  ["PLUS月卡批发(IOS土区)", "chatgpt-plus-recharge"],
  ["ChatGPT自助卡密（ios土区）", "chatgpt-plus-recharge"],
  ["ChatGPT Pro 20倍 官方充值", "chatgpt-pro-20x"],
  ["Pro 20×正规卡充【带账单】", "chatgpt-pro-20x"],
  ["chatGPT PRO 200美金档 代充 人工交付", "chatgpt-pro-20x"],
  ["ChatGPT Pro 5倍 官方充值", "chatgpt-pro-5x"],
  ["PRO 5× 充值卡密(iOS美区质保)", "chatgpt-pro-5x"],
  ["ChatGPT Pro 100 美金 成品号/账号代充", "chatgpt-pro-5x"],
  ["ChatGPT 推理强 ChatGPT Pro 5X 月卡｜官方卡充｜1个月｜支持续费｜正规充值 【20X-200刀款】 自助充值卡密", "chatgpt-pro-5x"],
  ["ChatGPT PRO 5X/20X", "other-product"],
  ["GPT PRO 特价代充卡密(质保订阅)", "other-product"],
  ["ChatGPT Team 团队席位 邀请", "chatgpt-team-business"],
  ["ChatGPT Business 母号 自动拉", "chatgpt-team-business"],
  ["GPT Busisness 席位月卡 质保首登", "chatgpt-team-business"],
  ["#plus直营店#--全新Team RT 凭证，购卡一小时内质保首登", "chatgpt-team-business"],
  ["gpt Team bug 子号 最低200刀（无质保，拿着卡密去兑换地址下载JSON文件）", "chatgpt-team-business"],
  ["GPT team bug 子号 (质保首登，JSON格式)", "chatgpt-team-business"],
  ["codex-api 100刀/1000刀不限时 PRO plus号池 非team free / 规格3", "openai-api-cdk"],
  ["麦门Codex API 不限时 Plus和Pro号池 非Free和Team / 50$余额兑换码", "openai-api-cdk"],
  ["渠道7 Chatgpt Plus(质保首登) （较稳定款）目前不知道能活多久 要稳买我的team，不保codex接码", "chatgpt-plus"],
  ["ChatGPT Plus 拼车｜专属席位｜月付", "chatgpt-plus"],
  ["ChatGPT Go 激活码 月会员自助充值｜iOS 正规充值｜自动发货", "other-product"],
  ["Steam白号", "other-product"],
  ["Super Grok 激活码 月卡", "super-grok"],
  ["Grok 普号 体验号", "grok-account"],
  ["Claude Pro 月卡 直充", "claude-pro-month"],
  ["Claude Team 1.25x 30天质保订阅", "claude-team-standard"],
  ["claude pro team标准席位 全程质保，不怕封号,额度是pro的1.25倍，目前官方翻倍随便用", "claude-team-standard"],
  ["claude team（封号也质保2次）", "claude-team-standard"],
  ["Claude Team 6.25x 30天质保订阅", "claude-team-premium"],
  ["claude pro team高级席位 全程质保，不怕封号 额度为pro的6.25倍左右", "claude-team-premium"],
  ["🥨Claude 6.25X【质保订阅】", "claude-team-premium"],
  ["Claude Max 5X直充月卡", "claude-max-5x"],
  ["Claude Max 20X 成品号", "claude-max-20x"],
  ["【20x质保一次掉订阅】cluade 20x成品", "claude-max-20x"],
  ["Gemini Pro 一年 12个月", "gemini-pro-year"],
  ["【反重力GCP可用】Gemini Pro 12个月成品【质保首登丨官方订阅】", "gemini-pro-year"],
  ["提取12个月优惠链接 一次 gemin pro（不会用别买不退不换，小白别买）", "gemini-pro-recharge"],
  ["Google AI Ultra 250美元 Flow 积分", "gemini-ultra"],
  ["Gmail 老号 Google 账号", "gmail-account"],
  ["Outlook OAuth2 微软邮箱", "outlook-account"],
  ["教育邮箱 .edu", "education-email"],
  ["域名邮箱 企业邮箱", "email-account"],
  ["长效【微软邮箱交付】GPT账号（白号）FREE普通号含access_token", "chatgpt-free-account"],
  ["OpenAI ChatGPT 手机接码", "openai-phone-verification"],
  ["ChatGPT Codex-日本 接码自助卡密", "openai-phone-verification"],
  ["OpenAI Codex 手机接码 自助卡密 美国+1 号码", "openai-phone-verification"],
  ["#plus成品号#--Codex接码（美区）单次接码（接码三次的号码可二验）", "openai-phone-verification"],
  ["【长效接码链接】GPT Codex 接码（7.5号到期）", "openai-phone-verification"],
  ["OpenAI Codex接码，如需接码，找客服", "openai-phone-verification"],
  ["OpenAI Codex 手机接码（可绑定 3 个 Codex 账户）", "openai-phone-verification"],
  ["Claude SMS 接码-泰国 接码自助卡密", "phone-verification"],
  ["【长效接码链接】Google / Gemini 接码（90天左右）", "google-phone-verification"],
  ["普拉斯 成品号，未接码（pix黑哥版）", "chatgpt-plus"],
  ["Cursor 美国实卡接码 - 最多可绑3个账号", "phone-verification"],
  ["【有概率需要手机号接收验证码 手势验证、介意勿拍、拍了不退】谷歌账号/邮箱 随机地区 | 09-24年 | 带YouTube频道", "gmail-account"],
  ["网页号,半成品,无法反代,不能直接登录codex.如需使用自行接码", "chatgpt-free-account"],
  ["Codex普号|账密直登+RT|支持Codex官方端登录|Codex已经过手机接码解锁✅|长效邮箱|带邮件接码地址 / 规格1", "chatgpt-free-account"],
  ["Claude普通账号（雅虎邮箱，imap登录，网易邮箱大师接码）", "claude-account"],
  ["短效接码 antigravity 验证使用gmail 验证使用claude 等产品都可使用 不售后", "google-phone-verification"],
  ["【Google个人邮箱】随机地区 22-24年老号邮箱 耐用 2FA 版本 原始接码链接 100个=480R", "gmail-account"],
  ["【随机地区2022-2024年gmail邮箱带2fa 】 带电话接码链接（接码链接有效期十几天）", "gmail-account"],
  ["微软邮箱(长效) 不需要手机验证", "outlook-account"],
  ["𝗧𝘄𝗶𝘁𝘁𝗲𝗿(𝗫)推特 三绑-手机验证 | 2019-2024年 | hotmail邮箱可用 | 2fa/token登录", "x-twitter-account"],
  ["Max5X 成品号(质保掉订阅)", "claude-max-5x"],
  ["Max20X 成品号(质保掉订阅)人工交付", "claude-max-20x"],
  ["成品｜Pro12个月｜支持GCP/CLI｜美区20-24年高权重老邮箱", "gemini-pro-year"],
  ["美区 2-4 年谷歌邮箱 跑gemini pro 失败的号（85%带gcp）", "gmail-account"],
  ["余额充值：100刀【不限时间,可用claude、gemini、gpt】", "openai-api-cdk"],
  ["AI 平台 直充 10000美元额度 -Claude Opus 4.7 / Codex / Gemini", "openai-api-cdk"],
  ["codex api 10刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["codex api 50刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["codex api 100刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["codex api 200刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["Gemini pro 一年CDK充值订阅 10次卡（一张卡10次额度）", "gemini-pro-recharge"],
  ["Gemini 3.1pro 12个月pixel成品号带长效接码链接（包反重力）", "gemini-pro-year"],
  ["Gemini Pro一年会员自动开通CDK 包绑卡订阅 1次", "gemini-pro-recharge"],
  ["1年GeminiPro自助充值CDK", "gemini-pro-recharge"],
  ["提取12个月优惠链接 一次 gemin pro（懂的买 无教程）小白勿拍", "gemini-pro-recharge"],
  ["Gemini登陆教程（仅文字教程，不含账号）", "other-product"],
  ["内部教程_Gemini3.1Pro如何开启家庭组？（仅图文教程，不含其他使用指导）", "other-product"],
  ["谷歌短效手机号 适用于过Gemini人机风控情况 不过可自助换号", "google-phone-verification"],
  ["gemini 2.5 pro 官网apikey", "openai-api-cdk"],
  ["Gemini AI Pro UItra会员", "gemini-pro-year"],
  ["美国 VISA 虚拟卡 0刀卡", "virtual-card"],
  ["PayPal 美國虛擬卡*僅用來註冊一次性GPT", "virtual-card"],
  ["CR.Ai 中转Api | 支持Claude ChatGPT Gemini 官方1:1 |300刀兑换码 使用请看教程", "openai-api-cdk"],
  ["chatGPT API中转 充值余额100刀 8折", "openai-api-cdk"],
  ["Cursor Pro 成品号", "cursor-account"],
  ["GitHub Copilot 账号", "other-product"],
  ["OpenClaw SaaS 工具账号", "other-product"],
  ["Kiro注册机源码", "other-product"],
  ["Kiro 注册机生成器", "other-product"],
  ["Kiro Power 200$成品号一万积分 - 使用 Claude Opus4.6", "kiro-account"],
  ["Kiro 积分 成品号", "kiro-account"],
  ["Apple ID 美区成品账号 质保首登", "apple-id-account"],
  ["苹果ID 土区账号 可改密", "apple-id-account"],
  ["美区ID 独享账号 自动发货", "apple-id-account"],
  ["X-Twitter Premium自助卡密", "x-twitter-account"],
  ["推特 Premium 会员直充卡密", "x-twitter-account"],
];

for (const [title, expected] of cases) {
  assert.equal(classifyOffer(title).id, expected, `${title} should classify as ${expected}`);
}

const priceCases = [
  ["GPT PRO 特价代充 5x", 99, "other-product"],
  ["GPT PRO 特价代充 5x", 100, "chatgpt-pro-5x"],
  ["ChatGPT Pro 20x 官方充值", 199, "other-product"],
  ["ChatGPT Pro 20x 官方充值", 200, "chatgpt-pro-20x"],
  ["Claude Max 5X直充月卡", 99, "other-product"],
  ["Claude Max 5X直充月卡", 100, "claude-max-5x"],
  ["Claude Max 20X 成品号", 199, "other-product"],
  ["Claude Max 20X 成品号", 200, "claude-max-20x"],
  ["Claude Team 1.25x 30天质保订阅", 99, "other-product"],
  ["Claude Team 1.25x 30天质保订阅", 100, "claude-team-standard"],
  ["Claude Team 6.25x 30天质保订阅", 199, "other-product"],
  ["Claude Team 6.25x 30天质保订阅", 200, "claude-team-premium"],
  ["Google AI Ultra 250美元 Flow 积分", 49, "other-product"],
  ["Google AI Ultra 250美元 Flow 积分", 50, "gemini-ultra"],
  ["ChatGPT自助卡密（ios土区）", 49, "other-product"],
  ["ChatGPT自助卡密（ios土区）", 50, "chatgpt-plus-recharge"],
  ["Claude Pro 月卡 直充", 39, "other-product"],
  ["Claude Pro 月卡 直充", 40, "claude-pro-month"],
  ["ChatGPT Plus 直充 卡密自助", 3, "chatgpt-plus"],
  ["GPT Team成品 rt子号 | 质保首次登录 发json cpa格式", 0.3, "chatgpt-team-business"],
  ["Gemini Pro 一年 12个月", 1, "gemini-pro-year"],
  ["Super Grok 成品号-3天（质保）-带sso", 1, "super-grok"],
];

for (const [title, price, expected] of priceCases) {
  assert.equal(
    classifyOffer(title, { price }).id,
    expected,
    `${title} at ¥${price} should classify as ${expected}`,
  );
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
  makeOffer({ id: "out-only", title: "ChatGPT Pro 20倍 官方充值", price: 200, status: "out_of_stock" }),
]);
const pro20Group = outOnlyGroups.find((group) => group.id === "chatgpt-pro-20x");
assert.ok(pro20Group, "ChatGPT Pro 20x group should exist.");
assert.equal(pro20Group.lowestOffer, null, "All out-of-stock products should not expose a lowest offer.");
assert.equal(pro20Group.lowestPrice, null, "All out-of-stock products should not expose a lowest price.");
assert.equal(pro20Group.lowestPriceLabel, "暂无有货价", "All out-of-stock products should use the no-available-price label.");

const priceFloorGroups = buildProductGroups([
  makeOffer({ id: "too-cheap-pro", title: "ChatGPT Pro 20x 官方充值", price: 199, status: "in_stock" }),
  makeOffer({ id: "valid-pro", title: "ChatGPT Pro 20x 官方充值", price: 200, status: "in_stock" }),
]);
assert.ok(
  priceFloorGroups.find((group) => group.id === "other-product")?.offers.some((offer) => offer.id === "too-cheap-pro"),
  "Price-floor-blocked offers should remain in Other instead of falling back to stored product ids.",
);
assert.ok(
  priceFloorGroups.find((group) => group.id === "chatgpt-pro-20x")?.offers.some((offer) => offer.id === "valid-pro"),
  "Offers at the floor should stay in the target product.",
);

const mixedTierGroups = buildProductGroups([
  makeOffer({
    id: "mixed-pro-tier",
    title: "ChatGPT 推理强 ChatGPT Pro 5X 月卡｜官方卡充｜1个月｜支持续费｜正规充值 【20X-200刀款】 自助充值卡密",
    price: 350,
    status: "in_stock",
    canonicalProductId: "chatgpt-pro-20x",
  }),
]);
assert.ok(
  mixedTierGroups.find((group) => group.id === "chatgpt-pro-5x")?.offers.some((offer) => offer.id === "mixed-pro-tier"),
  "Primary ChatGPT Pro 5x titles should classify as Pro 5x even if the description mentions 20x.",
);
assert.equal(
  mixedTierGroups.find((group) => group.id === "chatgpt-pro-20x"),
  undefined,
  "Primary ChatGPT Pro 5x titles should be removed from the stored Pro 20x group.",
);

console.log(`catalog test passed cases=${cases.length + priceCases.length}`);

function makeOffer({
  id,
  title,
  price,
  status,
  hidden = false,
  effectiveStatus = null,
  canonicalProductId = null,
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
    canonicalProductId,
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
