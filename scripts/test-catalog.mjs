#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const { buildProductGroups, classifyOffer, isSharedAccessOffer } = await loadCatalogModule();

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
  ["【质保-菲区卡冲】GPT Plus官方直充月卡【可开发票】", "chatgpt-plus-recharge"],
  ["菲律宾区 ChatGPT Plus 官方充值 月卡", "chatgpt-plus-recharge"],
  ["巴西区 GPT Plus App Store 内购续费", "chatgpt-plus-recharge"],
  ["埃及区 ChatGPT Plus 正规卡付带账单", "chatgpt-plus-recharge"],
  ["日本区 GPT Plus 官方订阅直充", "chatgpt-plus-recharge"],
  ["加拿大区 ChatGPT Plus 官方代充", "chatgpt-plus-recharge"],
  ["巴基斯坦区 Plus 正规充值", "chatgpt-plus-recharge"],
  ["GPT（ios土区直冲）【自营】", "chatgpt-plus-recharge"],
  ["GPT Plus【自营渠道，土区可查，凭证充足】", "chatgpt-plus-recharge"],
  ["GPT plus土区", "chatgpt-plus-recharge"],
  ["1个月PLUS会员 土区订阅质保掉订阅 基本秒冲", "chatgpt-plus-recharge"],
  ["GPT Plus 一个月会员 -卡密自助 Pix渠道【仅支持新号或老号有试用】【无质保】【巴西老哥人工充值】", "chatgpt-plus"],
  ["GPT Plus试用pix充值【巴西渠道】【官方试用】", "chatgpt-plus"],
  ["ChatGPT PLUS 自助充值卡密 (巴西Pix渠道）", "chatgpt-plus"],
  ["gptplus质保48小时未接码(巴西渠道更稳）", "chatgpt-plus"],
  ["GPT PLUS镜像站(天卡)", "other-product"],
  ["GPTPLUS镜像站【周卡】", "other-product"],
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
  ["ChatGPT 蜗的AI-中转-官方plus号池-100$", "openai-api-cdk"],
  ["1天订阅 每天额度100刀 Codex plus号池 非team free", "openai-api-cdk"],
  ["渠道7 Chatgpt Plus(质保首登) （较稳定款）目前不知道能活多久 要稳买我的team，不保codex接码", "chatgpt-plus"],
  ["ChatGPT Plus 拼车｜专属席位｜月付", "chatgpt-plus"],
  ["ChatGPT Go 激活码 月会员自助充值｜iOS 正规充值｜自动发货", "chatgpt-go"],
  ["【质保定阅】GPT GO直充｜印区内购", "chatgpt-go"],
  ["【30天质保】ChatGPT GO CDK", "chatgpt-go"],
  ["ChatGPT Go-独享-年卡", "chatgpt-go"],
  ["Steam白号", "other-product"],
  ["Super Grok 激活码 月卡", "super-grok"],
  ["Grok 普号 体验号", "grok-account"],
  ["【普号 SSO】 Grok AI > 长效微软邮箱 > 账号 SSO > 适合Super(30刀)，API等各类业务 > 取邮件API", "grok-account"],
  ["Claude Pro 月卡 直充", "claude-pro-month"],
  ["Claude Team 1.25x 30天质保订阅", "claude-team-standard"],
  ["claude pro team标准席位 全程质保，不怕封号,额度是pro的1.25倍，目前官方翻倍随便用", "claude-team-standard"],
  ["claude team（封号也质保2次）", "claude-team-standard"],
  ["Claude Team 6.25x 30天质保订阅", "claude-team-premium"],
  ["claude pro team高级席位 全程质保，不怕封号 额度为pro的6.25倍左右", "claude-team-premium"],
  ["🥨Claude 6.25X【质保订阅】", "claude-team-premium"],
  ["Claude Standard Seat | 25USD | 31天质保 | 官方订阅", "claude-team-standard"],
  ["Claude Premium Seat | 125USD | 31天质保 | 官方订阅", "claude-team-premium"],
  ["Claude Max 5X直充月卡", "claude-max-5x"],
  ["Claude Max 20X 成品号", "claude-max-20x"],
  ["【20x质保一次掉订阅】cluade 20x成品", "claude-max-20x"],
  ["Claude 20✖️Max成品号 无质保", "claude-max-20x"],
  ["Claude max💲100订阅人工交付", "claude-max-5x"],
  ["Claude max💲200订阅人工交付", "claude-max-20x"],
  ["Claude 充值", "claude-pro-month"],
  ["claude max 5X 独享成品号已过KYC", "claude-max-5x"],
  ["claude 20x成品号（免kyc验证）", "claude-max-20x"],
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
  ["Claude KYC认证", "identity-verification"],
  ["Claude KYC 认证服务【秒封不收费】", "identity-verification"],
  ["【欧美版】Claude Persona 人脸验证KYC", "identity-verification"],
  ["Claude真人认证", "identity-verification"],
  ["手工发货 Office 365 子号 Microsoft 365 Personal 个人版订阅", "other-product"],
  ["【长效接码链接】Google / Gemini 接码（90天左右）", "google-phone-verification"],
  ["Google/反重力可用/Claude", "google-phone-verification"],
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
  ["【24小时有效期】每天100刀claude code", "openai-api-cdk"],
  ["【总共50刀】30天有效期-老Plus渠道", "openai-api-cdk"],
  ["【总共100刀】30天有效期-老Plus渠道", "openai-api-cdk"],
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
  ["Telegram成品号 / 规格5", "telegram-account"],
  ["TG电报高权重老号", "telegram-account"],
  ["Telegram-星星 1000 stars", "telegram-account"],
  ["飞机大厨自动充值金币宝石燃油 Airplane Chefs Top up", "other-product"],
  ["接pixel代订阅谷歌gemini一年（下单后联系TG客服）", "gemini-pro-year"],
  ["港区礼品卡Apple Gift Card(App store) / 50HKD面额", "gift-card"],
  ["Netflix礼品卡 / 美国区100USD", "gift-card"],
  ["Spotify官方礼品卡 / 日本区1个月会员礼品卡", "gift-card"],
  ["Claude Pro 订阅，正规代充，封号无质保（非礼品卡）", "claude-pro-month"],
];

for (const [title, expected] of cases) {
  assert.equal(classifyOffer(title).id, expected, `${title} should classify as ${expected}`);
}

const contextCases = [
  [
    "【美国+1】 1~2年 精养老号 | 高权重 | 抗风控强",
    { tags: ["TG/电报/飞机/ Telegram 账号", "卡密", "自动发货"] },
    "telegram-account",
  ],
  [
    "英国原装 GG 电子卡 (eSIM)（高净值账号专用 / 零月租）",
    { tags: ["电报/飞机/ Telegram 账号/X/Grok", "卡密", "自动发货"] },
    "other-product",
  ],
  [
    "tg电报api接码登录，带邮箱登录选项",
    {},
    "phone-verification",
  ],
];

for (const [title, context, expected] of contextCases) {
  assert.equal(classifyOffer(title, context).id, expected, `${title} should classify as ${expected}`);
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
  ["【质保-菲区卡冲】GPT Plus官方直充月卡【可开发票】", 49, "other-product"],
  ["【质保-菲区卡冲】GPT Plus官方直充月卡【可开发票】", 50, "chatgpt-plus-recharge"],
  ["GPT Plus 一个月会员 -卡密自助 Pix渠道【仅支持新号或老号有试用】【无质保】【巴西老哥人工充值】", 5, "chatgpt-plus"],
  ["Claude Pro 月卡 直充", 39, "other-product"],
  ["Claude Pro 月卡 直充", 40, "claude-pro-month"],
  ["ChatGPT Plus 直充 卡密自助", 3, "chatgpt-plus"],
  ["GPT PLUS镜像站(天卡)", 3, "other-product"],
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

const warrantyGroups = buildProductGroups([
  makeOffer({ id: "cheap-no-warranty", title: "ChatGPT Plus 月卡 无质保", price: 45, status: "in_stock" }),
  makeOffer({ id: "short-warranty", title: "ChatGPT Plus 月卡 7天质保", price: 55, status: "in_stock" }),
  makeOffer({ id: "long-warranty", title: "ChatGPT Plus 月卡 30天质保", price: 80, status: "in_stock" }),
  makeOffer({ id: "cheap-long-unavailable", title: "ChatGPT Plus 月卡 30天质保", price: 10, status: "in_stock", effectiveStatus: "unavailable" }),
  makeOffer({ id: "cheap-long-shared", title: "ChatGPT Plus 月卡 拼车套餐[3人车] 质保不掉订阅", price: 60, status: "in_stock" }),
]);
const warrantyPlusGroup = warrantyGroups.find((group) => group.id === "chatgpt-plus");
assert.ok(warrantyPlusGroup, "ChatGPT Plus warranty group should exist.");
assert.equal(warrantyPlusGroup.lowestOffer?.id, "cheap-no-warranty", "Regular lowest price may come from a non-warranty offer.");
assert.equal(warrantyPlusGroup.warrantyLowestOffer?.id, "long-warranty", "Warranty lowest price should use the cheapest available non-shared long-warranty offer.");
assert.equal(warrantyPlusGroup.warrantyLowestPrice, 80, "Warranty lowest price should be tracked separately.");
assert.equal(warrantyPlusGroup.warrantyOfferCount, 2, "Available long-warranty offers should be counted even when shared-access offers do not drive the displayed warranty price.");

const sharedAccessGroups = buildProductGroups([
  makeOffer({ id: "cheap-people-car", title: "Claude Pro-三人车", price: 50, status: "in_stock" }),
  makeOffer({ id: "regular-claude", title: "Claude Pro 月卡 直充", price: 129, status: "in_stock" }),
  makeOffer({ id: "plus-shared-dedicated", title: "ChatGPT Plus 拼车｜GPT会话独享 或者 codex额度独享｜月付", price: 76, status: "in_stock" }),
  makeOffer({ id: "exclusive-plus", title: "ChatGPT Plus 成品号 独享账号", price: 88, status: "in_stock" }),
  makeOffer({ id: "grok-people-car", title: "SuperGrok-三人车", price: 70, status: "in_stock" }),
  makeOffer({ id: "shared-double-car", title: "Claude Max 5X 双人车", price: 388, status: "in_stock" }),
  makeOffer({ id: "team-boarding", title: "GPT Team 月卡Business 席位x1【质保上车】", price: 55, status: "in_stock" }),
]);
const sharedClaudeGroup = sharedAccessGroups.find((group) => group.id === "claude-pro-month");
assert.ok(sharedClaudeGroup, "Claude Pro group should exist for shared-access sorting.");
assert.equal(sharedClaudeGroup.lowestOffer?.id, "regular-claude", "People-car offers must not drive the displayed lowest price.");
assert.equal(sharedClaudeGroup.offers.at(-1)?.id, "cheap-people-car", "Available shared-access offers should sort behind regular available offers.");
assert.ok(isSharedAccessOffer(sharedClaudeGroup.offers.find((offer) => offer.id === "cheap-people-car")), "三人车 should be tagged as shared access.");
assert.ok(
  isSharedAccessOffer(sharedAccessGroups.flatMap((group) => group.offers).find((offer) => offer.id === "plus-shared-dedicated")),
  "Explicit 拼车 titles should stay shared even when a dedicated session or quota is mentioned.",
);
assert.ok(
  !isSharedAccessOffer(sharedAccessGroups.flatMap((group) => group.offers).find((offer) => offer.id === "exclusive-plus")),
  "Plain 独享 account titles should not be tagged as shared access.",
);
assert.ok(
  isSharedAccessOffer(sharedAccessGroups.flatMap((group) => group.offers).find((offer) => offer.id === "grok-people-car")),
  "Other product 人车 titles should also be tagged as shared access.",
);
assert.ok(
  isSharedAccessOffer(sharedAccessGroups.flatMap((group) => group.offers).find((offer) => offer.id === "shared-double-car")),
  "双人车 should be tagged as shared access.",
);
assert.ok(
  !isSharedAccessOffer(sharedAccessGroups.flatMap((group) => group.offers).find((offer) => offer.id === "team-boarding")),
  "Generic 质保上车 wording should not mark a Team seat as shared access.",
);

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

console.log(`catalog test passed cases=${cases.length + contextCases.length + priceCases.length}`);

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

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-catalog-test-"));
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

async function mkdtemp(prefix) {
  const { mkdtemp: makeTempDir } = await import("node:fs/promises");
  return makeTempDir(prefix);
}
