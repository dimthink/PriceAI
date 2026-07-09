#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const {
  buildProductGroups,
  classifyOffer,
  compareProductDisplayOrder,
  isDomesticMirrorSiteOffer,
  isSharedAccessOffer,
  isTelegramStarsOffer,
} = await loadCatalogModule();
const {
  buildOfferFilterFacets,
  deriveOfferFilterTags,
  filterOfferFilterFacetsForProduct,
  parseOfferFilterTagsForProduct,
} = await loadOfferFilterTagsModule();

const cases = [
  ["ChatGPT Plus 直充 卡密自助", "chatgpt-plus"],
  ["ChatGPT Plus 成品号 独享账号", "chatgpt-plus"],
  ["UPI渠道-PLUS成品号30天（iCloud高权重母号邮箱）", "chatgpt-plus"],
  ["UPI渠道-PLUS独享成品号30天（iCloud高权重母号邮箱）", "chatgpt-plus"],
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
  ["GPT PLUS镜像站(天卡)", "chatgpt-plus"],
  ["GPTPLUS镜像站【周卡】", "chatgpt-plus"],
  ["【质保一个月】ChatGPT Plus网页镜像", "chatgpt-plus"],
  ["【质保一个月】Super Grok网页镜像", "super-grok"],
  ["【质保一个月】Gemini Pro网页镜像", "gemini-pro-year"],
  ["ChatGPT Pro 20倍 官方充值", "chatgpt-pro-20x"],
  ["Pro 20×正规卡充【带账单】", "chatgpt-pro-20x"],
  ["chatGPT PRO 200美金档 代充 人工交付", "chatgpt-pro-20x"],
  ["ChatGPT Pro 20x无任何质保 库存号 质保首登 额度包补", "chatgpt-pro-20x"],
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
  ["【反代-JSON】k12 子号 成品", "chatgpt-team-business"],
  ["GPT K12 team 只支持谷歌邮箱 gmail", "chatgpt-team-business"],
  ["谷歌邮箱 GPT Team K12 成品 JSON 反代 发cpa 质保首登", "chatgpt-team-business"],
  ["谷歌邮箱 GPT Team K12 成品 cpa格式 质保首登", "chatgpt-team-business"],
  ["k12 json 格式 质保首登 gmail", "chatgpt-team-business"],
  ["codex-api 100刀/1000刀不限时 PRO plus号池 非team free / 规格3", "openai-api-cdk"],
  ["麦门Codex API 不限时 Plus和Pro号池 非Free和Team / 50$余额兑换码", "openai-api-cdk"],
  ["ChatGPT 蜗的AI-中转-官方plus号池-100$", "openai-api-cdk"],
  ["纯plus＋pro—10刀—1倍率", "openai-api-cdk"],
  ["1天订阅 每天额度100刀 Codex plus号池 非team free", "openai-api-cdk"],
  ["渠道7 Chatgpt Plus(质保首登) （较稳定款）目前不知道能活多久 要稳买我的team，不保codex接码", "chatgpt-plus"],
  ["ChatGPT Plus 拼车｜专属席位｜月付", "chatgpt-plus"],
  ["ChatGPT Go 激活码 月会员自助充值｜iOS 正规充值｜自动发货", "chatgpt-go"],
  ["GTP GO六个月成品号，全网最稳的号源，质保一个月", "chatgpt-go"],
  ["GO 自助充值卡密-月卡（卡密自助）", "chatgpt-go"],
  ["【质保定阅】GPT GO直充｜印区内购", "chatgpt-go"],
  ["【30天质保】ChatGPT GO CDK", "chatgpt-go"],
  ["ChatGPT Go-独享-年卡", "chatgpt-go"],
  ["Steam白号", "other-product"],
  ["Super Grok 激活码 月卡", "super-grok"],
  ["Grok Heavy 官方订阅月卡", "super-grok-heavy"],
  ["Grok Super Heavy 年卡 高阶会员", "super-grok-heavy"],
  ["X Premium+SuperGrok Heavy 一个月会员", "super-grok-heavy"],
  ["Grok 普号 体验号", "grok-account"],
  ["Grok白号账号密码Token", "grok-account"],
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
  ["【正品谷歌内购超稳CDK】claude code MAX20 CDK 代充到自己账号 质保订阅30天 不质保封号", "claude-max-20x"],
  ["Claude Max 20x 会员充值｜Google 渠道｜无需上号", "claude-max-20x"],
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
  ["iCloud邮箱---iCloud隐私邮箱，发货形式为邮箱----取码url---plus源头", "icloud-email"],
  ["icoud 邮箱 Free 已开通2fa", "icloud-email"],
  ["iCloud邮箱plus成品号，质保首登，支持登录网页，支持登录codex", "chatgpt-plus"],
  ["icloud邮箱plus，RT凭证，质保首登", "chatgpt-plus"],
  ["Plus月卡★成品号【质保3天】（荷兰货 + icloud邮箱 + 2FA）", "chatgpt-plus"],
  ["长效【微软邮箱交付】GPT账号（白号）FREE普通号含access_token", "chatgpt-free-account"],
  ["OpenAI ChatGPT 手机接码", "openai-phone-verification"],
  ["ChatGPT Codex-日本 接码自助卡密", "openai-phone-verification"],
  ["OpenAI Codex 手机接码 自助卡密 美国+1 号码", "openai-phone-verification"],
  ["#plus成品号#--Codex接码（美区）单次接码（接码三次的号码可二验）", "openai-phone-verification"],
  ["【长效接码链接】GPT Codex 接码（7.5号到期）", "openai-phone-verification"],
  ["OpenAI Codex接码，如需接码，找客服", "openai-phone-verification"],
  ["OpenAI Codex 手机接码（可绑定 3 个 Codex 账户）", "openai-phone-verification"],
  ["codex接🦆 美区成功率99.99", "openai-phone-verification"],
  ["渠道1 可以优先尝试这个 codex接🦆 美区成功率99.99", "openai-phone-verification"],
  ["渠道1 可以优先尝试这个 codex接🐎 美区成功率99.99", "openai-phone-verification"],
  ["Claude SMS 接码-泰国 接码自助卡密", "phone-verification"],
  ["Claude KYC认证", "identity-verification"],
  ["Claude KYC 认证服务【秒封不收费】", "identity-verification"],
  ["【欧美版】Claude Persona 人脸验证KYC", "identity-verification"],
  ["Claude真人认证", "identity-verification"],
  ["手工发货 Office 365 子号 Microsoft 365 Personal 个人版订阅", "other-product"],
  ["手工发货 Microsoft 365 Business Basic Nonprofit 300+ users", "other-product"],
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
  ["谷歌邮箱 Gmail API-Chatgpt专用 可分裂", "gmail-account"],
  ["【随机地区2022-2024年gmail邮箱带2fa 】 带电话接码链接（接码链接有效期十几天）", "gmail-account"],
  ["Gmail谷歌邮箱【注册gpt专用】", "gmail-account"],
  ["Gmail谷歌邮箱 - API接收邮件(适用于GPT)", "gmail-account"],
  ["outlook/hotmail邮箱配合plus自助充值使用", "outlook-account"],
  ["Gmail---URL Chatgpt专用接码 可分裂", "google-phone-verification"],
  ["微软邮箱(长效) 不需要手机验证", "outlook-account"],
  ["𝗧𝘄𝗶𝘁𝘁𝗲𝗿(𝗫)推特 三绑-手机验证 | 2019-2024年 | hotmail邮箱可用 | 2fa/token登录", "x-twitter-account"],
  ["Max5X 成品号(质保掉订阅)", "claude-max-5x"],
  ["Max20X 成品号(质保掉订阅)人工交付", "claude-max-20x"],
  ["成品｜Pro12个月｜支持GCP/CLI｜美区20-24年高权重老邮箱", "gemini-pro-year"],
  ["美区 2-4 年谷歌邮箱 跑gemini pro 失败的号（85%带gcp）", "gmail-account"],
  ["余额充值：100刀【不限时间,可用claude、gemini、gpt】", "openai-api-cdk"],
  ["AI 平台 直充 10000美元额度 -Claude Opus 4.7 / Codex / Gemini", "openai-api-cdk"],
  ["直供实验室庞大稳定 Claude Max / Pro 池", "openai-api-cdk"],
  ["codex重置额度服务plus pro可用", "chatgpt-codex-service"],
  ["plus pro重置（联系wx客服）", "chatgpt-codex-service"],
  ["GPT-Plus订阅PayPal长链提取服务-10次套餐包", "chatgpt-codex-service"],
  ["GPT–Plus 荷兰 IDEAL 提链（CDK）", "chatgpt-codex-service"],
  ["GPT-Plus 提链（CDK）", "chatgpt-codex-service"],
  ["荷兰渠道提链CDK", "chatgpt-codex-service"],
  ["【24小时有效期】每天100刀claude code", "openai-api-cdk"],
  ["【总共50刀】30天有效期-老Plus渠道", "openai-api-cdk"],
  ["【总共100刀】30天有效期-老Plus渠道", "openai-api-cdk"],
  ["【总共50刀】Kiro号池-不限时间-高稳定性", "openai-api-cdk"],
  ["【总共100刀】 Kiro号池-不限时间-高稳定性", "openai-api-cdk"],
  ["kiro混合版PRO-ClaudeCode-200刀-30天有效", "openai-api-cdk"],
  ["Claude Kiro渠道 50刀额度日卡", "openai-api-cdk"],
  ["codex api 10刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["codex api 50刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["codex api 100刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["codex api 200刀卡(支持image2.0)（无free号）", "openai-api-cdk"],
  ["印度 UPI | 荷兰 iDEAL 提链 | 10次卡 | 无质保", "chatgpt-codex-service"],
  ["UPI 提取UPI支付二维码 卡密", "chatgpt-codex-service"],
  ["【印尼upi渠道】提链服务", "chatgpt-codex-service"],
  ["GPT-Plus印度UPI扫码对接（CDK）保持高二维码生成率", "chatgpt-codex-service"],
  ["GPT-Plus印度UPI扫码对接（CDK）10次", "chatgpt-codex-service"],
  ["印度 upi 渠道 成品号 短效码 质保首登", "other-product"],
  ["Gemini pro 一年CDK充值订阅 10次卡（一张卡10次额度）", "gemini-pro-recharge"],
  ["Gemini 3.1pro 12个月pixel成品号带长效接码链接（包反重力）", "gemini-pro-year"],
  ["2-4年老邮箱 gemini pro 一年 包反重力（已经过验证 带JS格式 带RT 部分带长效接码）直接导入中转站", "gemini-pro-year"],
  ["Gemini Pro一年会员自动开通CDK 包绑卡订阅 1次", "gemini-pro-recharge"],
  ["1年GeminiPro自助充值CDK", "gemini-pro-recharge"],
  ["pixel cdkey（1次）不包绑卡，只提取链接", "gemini-pro-recharge"],
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
  ["中转站额度58刀余额卡密", "openai-api-cdk"],
  ["Cursor Pro 成品号", "cursor-account"],
  ["GitHub Copilot 账号", "other-product"],
  ["OpenClaw SaaS 工具账号", "other-product"],
  ["Dreamina 海外版即梦 Basic 成品账号", "dreamina-account"],
  ["海外版即梦 Basic 成品", "dreamina-account"],
  ["Dreamina Basic 海外即梦｜成品账号7天（900-1200积分）质保1天--替代grok可用", "dreamina-account"],
  ["Seedance 2.0 视频生成账号 Basic 积分", "dreamina-account"],
  ["吉梦 AI 视频生成会员", "dreamina-account"],
  ["Jimeng AI 视频生成账号", "dreamina-account"],
  ["C档2.0 视频生成 Basic 成品号", "dreamina-account"],
  ["Kiro注册机源码", "other-product"],
  ["Kiro 注册机生成器", "other-product"],
  ["【KIRO】 KIRO 普号 -固定50额度 -kirors导入格式", "kiro-account"],
  ["Kiro Power 200$成品号一万积分 - 使用 Claude Opus4.6", "kiro-pro-account"],
  ["Kiro Pro 1000额度 可超额", "kiro-pro-account"],
  ["Kiro 积分 成品号", "kiro-pro-account"],
  ["Apple ID 美区成品账号 质保首登", "apple-id-account"],
  ["苹果ID 土区账号 可改密", "apple-id-account"],
  ["美区ID 独享账号 自动发货", "apple-id-account"],
  ["香港ID (未激活iCloud 可下载APP)独享稳定老号", "apple-id-account"],
  ["推特 | 高质量月份号 | 可关注转发点赞 | 邮箱绑定 | token/2fa登录", "x-twitter-account"],
  ["Twitter涨粉 - 加密货币相关粉丝｜0-1H｜500/天｜无售后 1000=¥48", "other-product"],
  ["X-Twitter Premium自助卡密", "x-twitter-premium"],
  ["X（Twitter） Premium会员直充卡密", "x-twitter-premium"],
  ["推特 Premium 会员直充卡密", "x-twitter-premium"],
  ["3个月-X-推特 Premium（自带Super Grok）", "super-grok"],
  ["X(推特)超级会员+SuperGrok CDK 3个月", "super-grok"],
  ["【Super grok 三个月会员】X Premium+代开-1个月/3个月/6个月/12个月--质保", "super-grok"],
  ["X Premium+代开 | 3个月 | 带SuperGrok", "super-grok"],
  ["X (Twitter) Premium会员直充卡密", "x-twitter-premium"],
  ["X Premium会员代开", "x-twitter-premium"],
  ["Telegram成品号 / 规格5", "telegram-account"],
  ["TG电报高权重老号", "telegram-account"],
  ["TG官方中文包", "other-product"],
  ["Telegram账号|+1美国|1月注册", "telegram-account"],
  ["【印度+91】1~3年 精养老号 | 高权重 | 抗风控强", "telegram-account"],
  ["Telegram Premium会员兑换码 3个月", "telegram-premium"],
  ["Telegram Premium会员代开（6个月）", "telegram-premium"],
  ["Telegram Premium 会员 1年", "telegram-premium"],
  ["TG用户名赠送会员3个月", "telegram-premium"],
  ["Telegram 星星兑换码 50颗", "telegram-premium"],
  ["Telegram-星星 1000 stars", "telegram-premium"],
  ["Figma教育版成品号 一年会员", "other-product"],
  ["领英Linkedin-白号-随机IP注册(2FA)", "other-product"],
  ["全地区TikTok满月账号（满月白号）", "other-product"],
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
  ["ChatGPT Pro 20x 官方充值", 99, "other-product"],
  ["ChatGPT Pro 20x 官方充值", 100, "chatgpt-pro-20x"],
  ["Claude Max 5X直充月卡", 99, "other-product"],
  ["Claude Max 5X直充月卡", 100, "claude-max-5x"],
  ["Claude Max 20X 成品号", 199, "other-product"],
  ["Claude Max 20X 成品号", 200, "claude-max-20x"],
  ["Claude Team 1.25x 30天质保订阅", 99, "other-product"],
  ["Claude Team 1.25x 30天质保订阅", 100, "claude-team-standard"],
  ["Claude Team 6.25x 30天质保订阅", 99, "other-product"],
  ["Claude Team 6.25x 30天质保订阅", 100, "claude-team-premium"],
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
  ["GPT PLUS镜像站(天卡)", 3, "chatgpt-plus"],
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
  makeOffer({ id: "boarding-warranty", title: "GPT Team 月卡Business 席位x1【质保上车】", price: 58, status: "in_stock" }),
  makeOffer({ id: "long-warranty", title: "ChatGPT Plus 月卡 30天质保", price: 80, status: "in_stock" }),
  makeOffer({ id: "cheap-long-unavailable", title: "ChatGPT Plus 月卡 30天质保", price: 10, status: "in_stock", effectiveStatus: "unavailable" }),
  makeOffer({ id: "cheap-long-shared", title: "ChatGPT Plus 月卡 拼车套餐[3人车] 质保不掉订阅", price: 60, status: "in_stock" }),
  makeOffer({ id: "lifetime-warranty", title: "Claude Team 官方订阅 全程质保", price: 200, status: "in_stock" }),
]);
const warrantyPlusGroup = warrantyGroups.find((group) => group.id === "chatgpt-plus");
assert.ok(warrantyPlusGroup, "ChatGPT Plus warranty group should exist.");
assert.equal(warrantyPlusGroup.lowestOffer?.id, "cheap-no-warranty", "Regular lowest price may come from a non-warranty offer.");
assert.equal(warrantyPlusGroup.warrantyLowestOffer?.id, "long-warranty", "Warranty lowest price should use the cheapest available non-shared long-warranty offer.");
assert.equal(warrantyPlusGroup.warrantyLowestPrice, 80, "Warranty lowest price should be tracked separately.");
assert.equal(warrantyPlusGroup.warrantyOfferCount, 1, "Only explicit long-duration or full-course warranty offers should be counted.");
assert.ok(
  !warrantyPlusGroup.offers.find((offer) => offer.id === "boarding-warranty"),
  "Team boarding warranty should not leak into the Plus warranty group.",
);
const warrantyTeamGroup = warrantyGroups.find((group) => group.id === "chatgpt-team-business");
assert.ok(warrantyTeamGroup, "ChatGPT Team warranty group should exist.");
assert.equal(warrantyTeamGroup.warrantyOfferCount, 0, "质保上车 should not count as long warranty.");
const warrantyClaudeGroup = warrantyGroups.find((group) => group.id === "claude-team-standard");
assert.ok(warrantyClaudeGroup, "Claude Team warranty group should exist.");
assert.equal(warrantyClaudeGroup.warrantyOfferCount, 1, "全程质保 should still count as long warranty.");

const warrantyFilterCases = [
  ["【正品谷歌内购超稳CDK】claude code MAX20 CDK 代充到自己账号 质保订阅30天 不质保封号", true],
  ["GPT Plus【菲区】【质保订阅30天】【卡密自助】", true],
  ["Claude max 5X成品号（质保订阅1个月）", true],
  ["GPT PLUS 土区直冲1个月自助卡密～质保30天，封号不保", true],
  ["Claude MAX 20x 1个月订阅成品号【质保订阅/封号30天】【预定制】", true],
  ["claude Max 5x/20x成品账号（质保全程订阅）", true],
  ["Claude Team 官方订阅 全程质保", true],
  ["ChatGPT Plus 月卡 30天质保", true],
  ["GPT Pro 5X 月卡｜有质保｜官方卡充｜1个月｜支持续费", false],
  ["GPT Plus 官方代充 质保订阅", false],
  ["Claude code max 20x 代充（质保订阅，掉订阅补一次）", false],
  ["ChatGPT Plus 月卡 无质保", false],
  ["ChatGPT Plus 月卡 7天质保", false],
  ["GPT Team 月卡Business 席位x1【质保上车】", false],
  ["Gemini Pro 12个月个人账号充值【质保充值成功丨官方订阅】", false],
];

for (const [title, expected] of warrantyFilterCases) {
  assert.equal(
    deriveOfferFilterTags({ sourceTitle: title }).includes("warranty_long"),
    expected,
    `${title} warranty_long should be ${expected}.`,
  );
}

const tagCases = [
  ["Super Grok 独享成品号 3天会员", ["duration_trial"]],
  ["Super Grok 成品号-1个月（质保）", ["duration_month"]],
  ["Grok Heavy 官方订阅年卡", ["duration_year"]],
  ["3个月-X-推特 Premium（自带Super Grok）", ["duration_quarter"]],
  ["6个月-X-推特 Premium（自带Super Grok）", ["duration_half_year"]],
  ["12个月-X-推特 Premium（自带Super Grok）", ["duration_year"]],
  ["【X Premium+Super Grok 一个月会员号】代开/成品号-1个月/3个月/6个月/12个月--质保30天", ["duration_month", "duration_quarter", "duration_half_year", "duration_year"]],
  ["OpenAI Codex 单次接码 1次验证", ["verification_single"]],
  ["短效接码 antigravity 验证使用gmail", ["verification_short"]],
  ["【长效接码链接】GPT Codex 接码（7.5号到期）", ["verification_long"]],
  ["OpenAI 接码包月 月租号码", ["verification_monthly"]],
  ["Telegram账号|+1美国|1月注册", ["telegram_region_us"]],
  ["【印度+91】1~3年 精养老号 | 高权重 | 抗风控强", ["telegram_region_india"]],
  ["Telegram Premium会员兑换码 3个月", ["telegram_premium_quarter"]],
  ["Telegram Premium会员代开（6个月）", ["telegram_premium_half_year"]],
  ["Telegram Premium 会员 1年", ["telegram_premium_year"]],
  ["Telegram 星星兑换码 50颗", ["telegram_stars"]],
  ["Gemini Pro 一年成品号 包GCP", ["gemini_antigravity_gcp"]],
  ["美区 Gemini Pro 包反重力 12个月", ["gemini_antigravity_gcp"]],
  ["Gemini 3.1pro 12个月pixel成品号需要绑定手机", ["gemini_phone_required"]],
  ["Gemini pro 一年 pixel成品号（随机地区/美区人机号，22-24年账号）", ["gemini_phone_required"]],
  ["【首登需要申诉】Pixel - Gemini Pro一年成品号", ["gemini_appeal_required"]],
  ["【质保一个月】ChatGPT Plus网页镜像", ["domestic_mirror_site"]],
  ["【质保一个月】Super Grok网页镜像", ["domestic_mirror_site"]],
  ["ChatGPT Plus 直充 卡密自助", ["delivery_recharge"]],
  ["GPT Plus 一个月会员 -卡密自助 Pix渠道", ["delivery_recharge"]],
  ["【推荐】GPT Plus充值CDK - pix 自动充值渠道非成品需自备账号", ["delivery_recharge"]],
  ["ChatGPT Plus 成品号 独享账号", ["delivery_account"]],
  ["PLUS-成品-已接码rt-微软邮箱-支持登录网页端", ["delivery_account"]],
  ["GPT Team K12 成品 JSON 反代 发cpa", ["delivery_account", "team_k12"]],
  ["gpt Team bug 子号 最低200刀（无质保，拿着卡密去兑换地址下载JSON文件）", ["team_bug"]],
  ["首次激活码 正规官方gpt business（team） 全程质保订阅，可无限续费，可用pro模型额度比plus高", ["team_official"]],
  ["GPT Team 48个月长期席位（官方渠道按月续费） Team 邀请", ["team_official"]],
];

for (const [title, expectedTags] of tagCases) {
  const tags = deriveOfferFilterTags({ sourceTitle: title });
  for (const tag of expectedTags) {
    assert.ok(tags.includes(tag), `${title} should include ${tag}. actual=${tags.join(",")}`);
  }
}

const geminiConditionNegativeCases = [
  ["【低价】Gemini Pro 一年成品号，GCP已禁用", "gemini_antigravity_gcp"],
  ["Gemini Pro 一年 无需绑定手机", "gemini_phone_required"],
  ["Gemini Pro 一年 无需申诉", "gemini_appeal_required"],
];

for (const [title, unexpectedTag] of geminiConditionNegativeCases) {
  const tags = deriveOfferFilterTags({ sourceTitle: title });
  assert.ok(!tags.includes(unexpectedTag), `${title} should not include ${unexpectedTag}. actual=${tags.join(",")}`);
}

const deliveryNegativeCases = [
  ["【推荐】GPT Plus充值CDK - pix 自动充值渠道非成品需自备账号", "delivery_account"],
  ["Claude code MAX20 CDK 代充到自己账号 质保订阅30天", "delivery_account"],
  ["GPT Team Business 母号 自动拉", "delivery_recharge"],
  ["GPT PLUS自助开通（*仅免费试用资格新号） 新号都可以", "delivery_account"],
  ["GPT Plus 一个月会员 -卡密自助 欧洲渠道【仅支持新号或老号有试用】", "delivery_account"],
  ["GPTPLUS镜像站【周卡】", "delivery_account"],
  ["chatgptplus多人体验号无质保", "delivery_account"],
];

for (const [title, unexpectedTag] of deliveryNegativeCases) {
  const tags = deriveOfferFilterTags({ sourceTitle: title });
  assert.ok(!tags.includes(unexpectedTag), `${title} should not include ${unexpectedTag}. actual=${tags.join(",")}`);
}

const deliveryPollutionCases = [
  [
    {
      sourceTitle: "GPT PLUS自助开通（*仅免费试用资格新号） 新号都可以",
      tags: ["GPT成品号", "卡密", "自动发货"],
    },
    ["delivery_recharge"],
    ["delivery_account"],
  ],
  [
    {
      sourceTitle: "GPTPLUS镜像站【周卡】",
      tags: ["GPT-plus半成品号", "卡密", "自动发货"],
    },
    ["domestic_mirror_site"],
    ["delivery_account"],
  ],
  [
    {
      sourceTitle: "chatgptplus多人体验号无质保",
      tags: ["GPT成品号", "卡密", "自动发货"],
    },
    ["shared_access"],
    ["delivery_account"],
  ],
  [
    {
      sourceTitle: "GPT Plus 成品号 未接码（欧洲渠道）",
      tags: ["卡密", "自动发货"],
    },
    ["delivery_account"],
    [],
  ],
  [
    {
      sourceTitle: "GPT PLUS自助开通（*仅免费试用资格新号） 新号都可以",
      tags: ["自助开通", "卡密", "自动发货"],
    },
    ["delivery_recharge"],
    ["delivery_account"],
  ],
];

for (const [offer, expectedTags, unexpectedTags] of deliveryPollutionCases) {
  const tags = deriveOfferFilterTags(offer);
  for (const expectedTag of expectedTags) {
    assert.ok(tags.includes(expectedTag), `${offer.sourceTitle} should include ${expectedTag}. actual=${tags.join(",")}`);
  }
  for (const unexpectedTag of unexpectedTags) {
    assert.ok(!tags.includes(unexpectedTag), `${offer.sourceTitle} should not include ${unexpectedTag}. actual=${tags.join(",")}`);
  }
}

const productFacetCases = buildOfferFilterFacets([
  { sourceTitle: "ChatGPT Plus 月卡 30天质保 拼车" },
  { sourceTitle: "ChatGPT Plus 直充 卡密自助" },
  { sourceTitle: "ChatGPT Plus 成品号 独享账号" },
  { sourceTitle: "Super Grok 独享成品号 3天会员" },
  { sourceTitle: "Grok Heavy 官方订阅年卡" },
  { sourceTitle: "OpenAI Codex 单次接码 1次验证" },
  { sourceTitle: "Telegram账号|+1美国|1月注册" },
  { sourceTitle: "【印度+91】1~3年 精养老号 | 高权重 | 抗风控强" },
  { sourceTitle: "Telegram Premium会员兑换码 3个月" },
  { sourceTitle: "Telegram Premium会员代开（6个月）" },
  { sourceTitle: "Telegram Premium 会员 1年" },
  { sourceTitle: "Telegram 星星兑换码 50颗" },
  { sourceTitle: "Gemini Pro 一年成品号 包GCP" },
  { sourceTitle: "Gemini Pro 成品号需要绑定手机" },
  { sourceTitle: "Gemini Pro 首登需要申诉" },
  { sourceTitle: "GPT Team K12 成品 JSON 反代 发cpa" },
  { sourceTitle: "gpt Team bug 子号 最低200刀（无质保，拿着卡密去兑换地址下载JSON文件）" },
  { sourceTitle: "首次激活码 正规官方gpt business（team） 全程质保订阅，可无限续费，可用pro模型额度比plus高" },
]);
const chatGptFacetIds = filterOfferFilterFacetsForProduct("chatgpt-plus", productFacetCases).map((facet) => facet.id);
assert.ok(!chatGptFacetIds.includes("duration_month"), "ChatGPT Plus must not show duration filters.");
assert.ok(!chatGptFacetIds.includes("duration_trial"), "ChatGPT Plus must not show Grok trial filters.");
assert.ok(!chatGptFacetIds.includes("verification_single"), "ChatGPT Plus must not show verification filters.");
assert.ok(!chatGptFacetIds.includes("gemini_antigravity_gcp"), "ChatGPT Plus must not show Gemini condition filters.");
assert.ok(!chatGptFacetIds.includes("team_k12"), "ChatGPT Plus must not show Team type filters.");
assert.ok(chatGptFacetIds.includes("shared_access"), "ChatGPT Plus should keep shared-access filters.");
assert.ok(chatGptFacetIds.includes("delivery_recharge"), "ChatGPT Plus should show recharge filters.");
assert.ok(chatGptFacetIds.includes("delivery_account"), "ChatGPT Plus should show account-delivery filters.");
assert.ok(chatGptFacetIds.includes("warranty_long"), "ChatGPT Plus should keep warranty filters.");

const superGrokFacetIds = filterOfferFilterFacetsForProduct("super-grok", productFacetCases).map((facet) => facet.id);
assert.ok(superGrokFacetIds.includes("duration_trial"), "Super Grok should show duration filters.");
assert.ok(!superGrokFacetIds.includes("verification_single"), "Super Grok must not show verification filters.");
assert.ok(superGrokFacetIds.includes("delivery_account"), "Super Grok should show account-delivery filters.");

const superGrokHeavyFacetIds = filterOfferFilterFacetsForProduct("super-grok-heavy", productFacetCases).map((facet) => facet.id);
assert.ok(superGrokHeavyFacetIds.includes("duration_year"), "Super Grok Heavy should show duration filters.");
assert.ok(!superGrokHeavyFacetIds.includes("verification_single"), "Super Grok Heavy must not show verification filters.");

const xTwitterPremiumFacetIds = filterOfferFilterFacetsForProduct("x-twitter-premium", productFacetCases).map((facet) => facet.id);
assert.ok(xTwitterPremiumFacetIds.includes("duration_quarter"), "X/Twitter Premium should show duration filters.");
assert.ok(!xTwitterPremiumFacetIds.includes("verification_single"), "X/Twitter Premium must not show verification filters.");

const phoneFacetIds = filterOfferFilterFacetsForProduct("openai-phone-verification", productFacetCases).map((facet) => facet.id);
assert.ok(phoneFacetIds.includes("verification_single"), "OpenAI 接码 should show verification filters.");
assert.ok(!phoneFacetIds.includes("duration_trial"), "OpenAI 接码 must not show Grok duration filters.");
assert.ok(!phoneFacetIds.includes("gemini_phone_required"), "OpenAI 接码 must not show Gemini condition filters.");

const geminiFacetIds = filterOfferFilterFacetsForProduct("gemini-pro-year", productFacetCases).map((facet) => facet.id);
assert.ok(geminiFacetIds.includes("gemini_antigravity_gcp"), "Gemini Pro 成品号 should show GCP/反重力 filters.");
assert.ok(geminiFacetIds.includes("gemini_phone_required"), "Gemini Pro 成品号 should show phone-required filters.");
assert.ok(geminiFacetIds.includes("gemini_appeal_required"), "Gemini Pro 成品号 should show appeal-required filters.");
assert.ok(!geminiFacetIds.includes("verification_single"), "Gemini Pro 成品号 must not show phone verification filters.");
assert.ok(!geminiFacetIds.includes("team_k12"), "Gemini Pro 成品号 must not show Team type filters.");

const chatGptTeamFacetIds = filterOfferFilterFacetsForProduct("chatgpt-team-business", productFacetCases).map((facet) => facet.id);
assert.ok(chatGptTeamFacetIds.includes("team_k12"), "ChatGPT Team / Business should show K12 filters.");
assert.ok(chatGptTeamFacetIds.includes("team_bug"), "ChatGPT Team / Business should show Bug Team filters.");
assert.ok(chatGptTeamFacetIds.includes("team_official"), "ChatGPT Team / Business should show official Team filters.");
assert.ok(!chatGptTeamFacetIds.includes("gemini_antigravity_gcp"), "ChatGPT Team / Business must not show Gemini condition filters.");

assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-plus", "duration_month,verification_single,warranty_long"),
  ["warranty_long"],
  "Unsupported URL tags should be ignored on ChatGPT Plus.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("super-grok", "duration_month,warranty_long"),
  ["duration_month", "warranty_long"],
  "Super Grok should accept duration filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("super-grok-heavy", "duration_year,warranty_long"),
  ["duration_year", "warranty_long"],
  "Super Grok Heavy should accept duration filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("grok-account", "duration_trial"),
  ["duration_trial"],
  "Grok 普号 should accept duration filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("x-twitter-premium", "duration_quarter"),
  ["duration_quarter"],
  "X/Twitter Premium should accept duration filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("gemini-pro-year", "gemini_antigravity_gcp,gemini_phone_required,gemini_appeal_required"),
  ["gemini_antigravity_gcp", "gemini_phone_required", "gemini_appeal_required"],
  "Gemini Pro 成品号 should accept Gemini condition filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-plus", "gemini_antigravity_gcp,warranty_long"),
  ["warranty_long"],
  "ChatGPT Plus should ignore Gemini condition filters from the URL.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-plus", "delivery_recharge,delivery_account,warranty_long"),
  ["delivery_recharge", "delivery_account", "warranty_long"],
  "ChatGPT Plus should accept delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-team-business", "delivery_recharge,delivery_account,warranty_long"),
  ["delivery_account", "warranty_long"],
  "ChatGPT Team / Business should accept account-delivery filters but ignore recharge filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-team-business", "team_k12,team_bug,team_official,warranty_long"),
  ["team_k12", "team_bug", "team_official", "warranty_long"],
  "ChatGPT Team / Business should accept Team-specific filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-plus", "team_k12,team_bug,team_official,warranty_long"),
  ["warranty_long"],
  "ChatGPT Plus should ignore Team-specific filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-plus-recharge", "delivery_recharge,delivery_account,warranty_long"),
  ["warranty_long"],
  "Dedicated ChatGPT Plus recharge product should not show redundant delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-pro-5x", "delivery_recharge,delivery_account,warranty_long"),
  ["delivery_recharge", "delivery_account", "warranty_long"],
  "ChatGPT Pro 5x should accept recharge and account-delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-pro-20x", "delivery_recharge,delivery_account,warranty_long"),
  ["delivery_recharge", "delivery_account", "warranty_long"],
  "ChatGPT Pro 20x should accept recharge and account-delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("chatgpt-go", "delivery_recharge,delivery_account,warranty_long"),
  ["delivery_recharge", "delivery_account", "warranty_long"],
  "ChatGPT Go should accept recharge and account-delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("claude-pro-month", "delivery_recharge,delivery_account,warranty_long"),
  ["delivery_recharge", "delivery_account", "warranty_long"],
  "Claude Pro should accept recharge and account-delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("claude-max-20x", "delivery_recharge,delivery_account,warranty_long"),
  ["delivery_recharge", "delivery_account", "warranty_long"],
  "Claude Max 20x should accept recharge and account-delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("claude-account", "delivery_recharge,delivery_account,warranty_long"),
  ["warranty_long"],
  "Dedicated Claude account product should ignore redundant delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("super-grok", "delivery_recharge,delivery_account,duration_month,warranty_long"),
  ["delivery_recharge", "delivery_account", "duration_month", "warranty_long"],
  "Super Grok should accept recharge, account-delivery, and duration filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("super-grok-heavy", "delivery_recharge,delivery_account,duration_year,warranty_long"),
  ["delivery_recharge", "delivery_account", "duration_year", "warranty_long"],
  "Super Grok Heavy should accept recharge, account-delivery, and duration filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("grok-account", "delivery_recharge,delivery_account,duration_trial,warranty_long"),
  ["duration_trial", "warranty_long"],
  "Dedicated Grok account product should ignore redundant delivery filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("super-grok", "delivery_account,duration_month,warranty_long"),
  ["delivery_account", "duration_month", "warranty_long"],
  "Super Grok should keep account-delivery filters.",
);
const telegramAccountFacetIds = filterOfferFilterFacetsForProduct("telegram-account", productFacetCases).map((facet) => facet.id);
assert.ok(telegramAccountFacetIds.includes("telegram_region_us"), "Telegram account should show US region filters.");
assert.ok(telegramAccountFacetIds.includes("telegram_region_india"), "Telegram account should show India region filters.");
assert.ok(!telegramAccountFacetIds.includes("telegram_premium_quarter"), "Telegram account must not show Premium duration filters.");
assert.ok(!telegramAccountFacetIds.includes("telegram_stars"), "Telegram account must not show Stars filters.");

const telegramPremiumFacetIds = filterOfferFilterFacetsForProduct("telegram-premium", productFacetCases).map((facet) => facet.id);
assert.ok(telegramPremiumFacetIds.includes("telegram_premium_quarter"), "Telegram Premium should show 3-month filters.");
assert.ok(telegramPremiumFacetIds.includes("telegram_premium_half_year"), "Telegram Premium should show 6-month filters.");
assert.ok(telegramPremiumFacetIds.includes("telegram_premium_year"), "Telegram Premium should show 12-month filters.");
assert.ok(telegramPremiumFacetIds.includes("telegram_stars"), "Telegram Premium should show Stars value-added filters.");
assert.ok(!telegramPremiumFacetIds.includes("telegram_region_us"), "Telegram Premium must not show account region filters.");

assert.deepEqual(
  parseOfferFilterTagsForProduct("telegram-account", "telegram_region_us,telegram_premium_quarter,telegram_stars"),
  ["telegram_region_us"],
  "Telegram account should accept only account region filters.",
);
assert.deepEqual(
  parseOfferFilterTagsForProduct("telegram-premium", "telegram_region_us,telegram_premium_quarter,telegram_stars"),
  ["telegram_premium_quarter", "telegram_stars"],
  "Telegram Premium should accept only Premium/Stars filters.",
);

const sharedAccessGroups = buildProductGroups([
  makeOffer({ id: "cheap-people-car", title: "Claude Pro-三人车", price: 50, status: "in_stock" }),
  makeOffer({ id: "regular-claude", title: "Claude Pro 月卡 直充", price: 129, status: "in_stock" }),
  makeOffer({ id: "plus-shared-dedicated", title: "ChatGPT Plus 拼车｜GPT会话独享 或者 codex额度独享｜月付", price: 76, status: "in_stock" }),
  makeOffer({ id: "exclusive-plus", title: "ChatGPT Plus 成品号 独享账号", price: 88, status: "in_stock" }),
  makeOffer({ id: "grok-people-car", title: "SuperGrok-三人车", price: 70, status: "in_stock" }),
  makeOffer({ id: "shared-double-car", title: "Claude Max 5X 双人车", price: 388, status: "in_stock" }),
  makeOffer({ id: "plus-multi-trial", title: "chatgptplus多人体验号无质保", price: 5.92, status: "in_stock" }),
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
  isSharedAccessOffer(sharedAccessGroups.flatMap((group) => group.offers).find((offer) => offer.id === "plus-multi-trial")),
  "多人体验号 should be tagged as shared access.",
);
assert.ok(
  !isSharedAccessOffer(sharedAccessGroups.flatMap((group) => group.offers).find((offer) => offer.id === "team-boarding")),
  "Generic 质保上车 wording should not mark a Team seat as shared access.",
);

const telegramPremiumGroups = buildProductGroups([
  makeOffer({ id: "telegram-stars-cheap", title: "Telegram 星星兑换码 50颗", price: 8.76, status: "in_stock" }),
  makeOffer({ id: "telegram-premium-regular", title: "Telegram Premium会员代开（6个月）", price: 105, status: "in_stock" }),
]);
const telegramPremiumGroup = telegramPremiumGroups.find((group) => group.id === "telegram-premium");
assert.ok(telegramPremiumGroup, "Telegram Premium group should exist.");
assert.equal(
  telegramPremiumGroup.lowestOffer?.id,
  "telegram-premium-regular",
  "Stars/value-added offers must not drive Telegram Premium default lowest price.",
);
assert.equal(
  telegramPremiumGroup.offers.at(-1)?.id,
  "telegram-stars-cheap",
  "Stars/value-added offers should sort behind regular Telegram Premium offers.",
);
assert.ok(
  isTelegramStarsOffer(telegramPremiumGroup.offers.find((offer) => offer.id === "telegram-stars-cheap")),
  "Telegram Stars offers should remain identifiable for the Stars filter.",
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
  makeOffer({ id: "too-cheap-pro", title: "ChatGPT Pro 20x 官方充值", price: 99, status: "in_stock" }),
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

const domesticMirrorGroups = buildProductGroups([
  makeOffer({ id: "cheap-mirror", title: "GPT PLUS 镜像站(天卡)", price: 3, status: "in_stock" }),
  makeOffer({ id: "regular-plus", title: "ChatGPT Plus 成品号 独享账号", price: 88, status: "in_stock" }),
  makeOffer({ id: "warranty-mirror", title: "【质保一个月】ChatGPT Plus网页镜像", price: 51, status: "in_stock" }),
  makeOffer({ id: "warranty-regular", title: "ChatGPT Plus 月卡 30天质保", price: 99, status: "in_stock" }),
]);
const domesticMirrorPlusGroup = domesticMirrorGroups.find((group) => group.id === "chatgpt-plus");
assert.ok(domesticMirrorPlusGroup, "ChatGPT Plus group should include domestic mirror site offers.");
assert.equal(
  domesticMirrorPlusGroup.lowestOffer?.id,
  "regular-plus",
  "Domestic mirror site offers must not drive ChatGPT Plus default lowest price.",
);
assert.equal(
  domesticMirrorPlusGroup.warrantyLowestOffer?.id,
  "warranty-regular",
  "Domestic mirror site offers must not drive warranty lowest price.",
);
assert.equal(
  domesticMirrorPlusGroup.offers.at(-1)?.id,
  "warranty-mirror",
  "Available domestic mirror site offers should sort behind regular available offers.",
);
assert.ok(
  isDomesticMirrorSiteOffer(domesticMirrorPlusGroup.offers.find((offer) => offer.id === "cheap-mirror")),
  "Mirror site titles should remain identifiable for the domestic mirror site filter.",
);

const otherDisplayOrder = [
  classifyOffer("API 100刀 CDK 额度"),
  classifyOffer("Cursor Pro 账号"),
  classifyOffer("X Twitter Premium 会员月卡"),
  classifyOffer("Twitter 推特老号"),
  classifyOffer("Telegram Premium会员兑换码 3个月"),
  classifyOffer("Telegram 老号 成品账号"),
  classifyOffer("未知资料包"),
].sort(compareProductDisplayOrder).map((product) => product.id);
assert.deepEqual(
  otherDisplayOrder,
  [
    "cursor-account",
    "x-twitter-account",
    "x-twitter-premium",
    "telegram-account",
    "telegram-premium",
    "other-product",
    "openai-api-cdk",
  ],
  "Other platform products should use family display order and keep API/CDK last.",
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
  }).outputText
    .replace(/(["'])\.\/offer-filter-tags\1/g, "$1./offer-filter-tags.mjs$1")
    .replace(/(["'])\.\/trust-risk\1/g, "$1./trust-risk.mjs$1");

  const trustRiskPath = path.join(repoRoot, "src", "lib", "trust-risk.ts");
  const trustRiskSource = await readFile(trustRiskPath, "utf8");
  const trustRiskOutput = ts.transpileModule(trustRiskSource, {
    fileName: trustRiskPath,
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
  const trustRiskFile = path.join(tempDir, "trust-risk.mjs");
  await writeFile(offerFilterTagsFile, await transpileModule("src/lib/offer-filter-tags.ts"), "utf8");
  await writeFile(trustRiskFile, trustRiskOutput, "utf8");
  await writeFile(tempFile, output, "utf8");

  try {
    return await import(`${pathToFileURL(tempFile).href}?ts=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function loadOfferFilterTagsModule() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-offer-filter-tags-test-"));
  const tempFile = path.join(tempDir, "offer-filter-tags.mjs");
  await writeFile(tempFile, await transpileModule("src/lib/offer-filter-tags.ts"), "utf8");

  try {
    return await import(`${pathToFileURL(tempFile).href}?ts=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function transpileModule(relativePath) {
  const sourcePath = path.join(repoRoot, relativePath);
  const source = await readFile(sourcePath, "utf8");
  return ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      esModuleInterop: true,
    },
  }).outputText;
}

async function mkdtemp(prefix) {
  const { mkdtemp: makeTempDir } = await import("node:fs/promises");
  return makeTempDir(prefix);
}
