import type { CanonicalProduct, ProductGroup, RawOffer } from "./types";
import { offerMatchesFilterTags } from "./offer-filter-tags";
import { API_CDK_PLATFORM, isPublicCatalogProduct } from "./trust-risk";

export const allPlatformOptions = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  API_CDK_PLATFORM,
  "邮箱",
  "接码",
  "其他",
] as const;

export const platformOptions = allPlatformOptions.filter((platform) => platform !== API_CDK_PLATFORM);

const platformSortRank = new Map<string, number>(
  allPlatformOptions.map((platform, index) => [platform, index]),
);

export function comparePlatformOrder(a: string, b: string): number {
  const rankA = platformSortRank.get(a) ?? platformOptions.length;
  const rankB = platformSortRank.get(b) ?? platformOptions.length;
  if (rankA !== rankB) return rankA - rankB;

  return a.localeCompare(b, "zh-CN");
}

const otherProductDisplayRank = new Map<string, number>([
  ["cursor-account", 10],
  ["kiro-account", 20],
  ["kiro-pro-account", 30],
  ["windsurf-account", 40],
  ["perplexity-account", 50],
  ["suno-account", 60],
  ["dreamina-account", 70],
  ["apple-id-account", 80],
  ["x-twitter-account", 90],
  ["x-twitter-premium", 100],
  ["telegram-account", 110],
  ["telegram-premium", 120],
  ["virtual-card", 130],
  ["gift-card", 140],
  ["other-product", 900],
  ["openai-api-cdk", 990],
]);

export function compareProductDisplayOrder(
  a: Pick<CanonicalProduct, "id" | "platform" | "displayName">,
  b: Pick<CanonicalProduct, "id" | "platform" | "displayName">,
): number {
  const platformDelta = comparePlatformOrder(a.platform, b.platform);
  if (platformDelta !== 0) return platformDelta;

  if (a.platform === "其他" && b.platform === "其他") {
    const rankA = otherProductDisplayRank.get(a.id) ?? 500;
    const rankB = otherProductDisplayRank.get(b.id) ?? 500;
    if (rankA !== rankB) return rankA - rankB;
  }

  return 0;
}

export const productTypeOptions = [
  "订阅/会员",
  "成品账号",
  "邮箱/账号",
  "辅助服务",
  "API额度",
  "接码/验证",
  "虚拟卡",
  "工具账号",
  "礼品卡",
  "其他",
] as const;

export const canonicalCatalog: CanonicalProduct[] = [
  {
    id: "chatgpt-free-account",
    slug: "chatgpt-free-account",
    displayName: "ChatGPT 普号",
    platform: "ChatGPT",
    productType: "成品账号",
    spec: "普通账号",
    summary: "ChatGPT 普号、Free 号、白号或 OpenAI 普通账号。",
    aliases: ["chatgpt free", "gpt 普号", "openai 普号", "白号", "普通号", "普通账号"],
  },
  {
    id: "chatgpt-plus",
    slug: "chatgpt-plus",
    displayName: "ChatGPT Plus",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Plus",
    summary: "ChatGPT Plus 月卡、成品号、自助充值、普通直充、卡密/CDK、荷兰 iDEAL、欧洲、印度 UPI 或 Pix 渠道报价。",
    aliases: [
      "gpt plus",
      "chatgpt plus",
      "plus 月卡",
      "plus 一个月",
      "plus 卡密",
      "plus 直充",
      "plus 成品号",
      "plus 独享账号",
      "plus 账号",
      "plus 日抛",
      "puls",
      "pulus",
    ],
  },
  {
    id: "chatgpt-plus-recharge",
    slug: "chatgpt-plus-recharge",
    displayName: "ChatGPT Plus 充值代充",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Plus / 地区充值代充",
    summary: "ChatGPT Plus 官方地区价相关的 App Store 内购、卡冲、直充、代充、续费或月卡批发渠道。",
    aliases: [
      "ios土区",
      "土区 ios",
      "ios 土区",
      "土耳其 plus",
      "菲律宾 plus",
      "菲区 plus",
      "巴西 plus",
      "埃及 plus",
      "日区 plus",
      "plus 土区",
      "plus 充值代充",
      "plus 代充",
      "plus 直充",
      "plus 卡冲",
      "plus 官方充值",
      "plus 内购",
      "月卡批发",
    ],
  },
  {
    id: "chatgpt-go",
    slug: "chatgpt-go",
    displayName: "ChatGPT Go",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Go",
    summary: "ChatGPT Go 月卡、年卡、激活码、内购直充或成品权益。",
    aliases: ["chatgpt go", "gpt go", "go 月卡", "go 年卡", "go 激活码", "go 直充"],
  },
  {
    id: "chatgpt-team-business",
    slug: "chatgpt-team-business",
    displayName: "ChatGPT Team / Business",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Team / Business",
    summary: "ChatGPT Team、Business、K12、Bug Team、团队号、母号、邀请、自动拉或 Team 成品号。",
    aliases: ["team", "business", "t5", "t5倍", "k12", "k12 子号", "母号", "自动拉", "直拉", "邀请", "团队号"],
  },
  {
    id: "chatgpt-pro-5x",
    slug: "chatgpt-pro-5x",
    displayName: "ChatGPT Pro 5x",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Pro / 5x",
    summary: "ChatGPT Pro 5x 充值、代开或卡密。",
    aliases: ["pro 5x", "pro x5", "5倍", "100刀", "100 美元", "100美元"],
  },
  {
    id: "chatgpt-pro-20x",
    slug: "chatgpt-pro-20x",
    displayName: "ChatGPT Pro 20x",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Pro / 20x",
    summary: "ChatGPT Pro 20x 充值、代开或卡密。",
    aliases: ["pro 20x", "pro x20", "20倍", "200刀", "200 美元", "200美元"],
  },
  {
    id: "openai-api-cdk",
    slug: "openai-api-cdk",
    displayName: "API / CDK / 额度",
    platform: "其他",
    productType: "API额度",
    spec: "API 额度 / CDK",
    summary: "通用 API、中转、余额、额度、Codex API 或 OpenAI API 商品。",
    aliases: ["api cdk", "codexapi", "codex api", "token", "中转", "余额", "额度"],
  },
  {
    id: "chatgpt-codex-service",
    slug: "chatgpt-codex-service",
    displayName: "Codex / ChatGPT 周边服务",
    platform: "ChatGPT",
    productType: "辅助服务",
    spec: "Codex / ChatGPT 辅助",
    summary: "Codex 或 ChatGPT 的额度重置、链接提取、服务包等周边辅助服务，不含 API 额度、接码或账号会员。",
    aliases: ["codex 重置额度", "重置额度", "长链提取", "链接提取", "服务包", "周边服务"],
  },
  {
    id: "claude-pro-month",
    slug: "claude-pro-month",
    displayName: "Claude Pro",
    platform: "Claude",
    productType: "订阅/会员",
    spec: "Pro",
    summary: "Claude Pro 订阅、直充或卡密。",
    aliases: ["claude pro", "pro 尼区", "claude 月卡"],
  },
  {
    id: "claude-team-standard",
    slug: "claude-team-standard",
    displayName: "Claude Team Standard",
    platform: "Claude",
    productType: "订阅/会员",
    spec: "Team Standard / 1.25x",
    summary: "Claude Team 标准席位、Standard seat 或 1.25x 团队订阅。",
    aliases: ["claude team standard", "team standard", "标准席位", "1.25x", "1.25倍"],
  },
  {
    id: "claude-team-premium",
    slug: "claude-team-premium",
    displayName: "Claude Team Premium",
    platform: "Claude",
    productType: "订阅/会员",
    spec: "Team Premium / 6.25x",
    summary: "Claude Team 高级席位、Premium seat 或 6.25x 团队订阅。",
    aliases: ["claude team premium", "team premium", "高级席位", "6.25x", "6.25倍"],
  },
  {
    id: "claude-max-5x",
    slug: "claude-max-5x",
    displayName: "Claude Max 5x",
    platform: "Claude",
    productType: "订阅/会员",
    spec: "Max / 5x",
    summary: "Claude Max 5x 官方套餐、账号或代开。",
    aliases: ["claude max x5", "max 5x"],
  },
  {
    id: "claude-max-20x",
    slug: "claude-max-20x",
    displayName: "Claude Max 20x",
    platform: "Claude",
    productType: "订阅/会员",
    spec: "Max / 20x",
    summary: "Claude Max 20x 官方套餐、账号或代开。",
    aliases: ["claude max x20", "max 20x"],
  },
  {
    id: "claude-account",
    slug: "claude-account",
    displayName: "Claude 普号 / 兑换号",
    platform: "Claude",
    productType: "成品账号",
    spec: "普通账号",
    summary: "Claude 普号、free 号、礼品卡兑换专用号。",
    aliases: ["claude free", "claude 普通账号", "claude 普号"],
  },
  {
    id: "gemini-pro-year",
    slug: "gemini-pro-year",
    displayName: "Gemini Pro 成品号",
    platform: "Gemini",
    productType: "成品账号",
    spec: "Pro / 成品号",
    summary: "Gemini Pro、Google AI Pro、Pixel 渠道、Gmail 老号或家庭组等成品账号。",
    aliases: ["gemini pro 成品号", "gemini 一年成品号", "gemini 12个月成品号", "pixel gemini", "google ai pro 成品号"],
  },
  {
    id: "gemini-pro-recharge",
    slug: "gemini-pro-recharge",
    displayName: "Gemini Pro 充值/开通",
    platform: "Gemini",
    productType: "订阅/会员",
    spec: "Pro / 充值开通",
    summary: "Gemini Pro、Google AI Pro 的 CDK、自助充值、优惠链接、绑卡、激活链接或代开通服务。",
    aliases: ["gemini pro 充值", "gemini cdk", "gemini 优惠链接", "google ai pro 充值", "gemini 自助开通"],
  },
  {
    id: "gemini-ultra",
    slug: "gemini-ultra",
    displayName: "Google AI Ultra / Gemini Ultra",
    platform: "Gemini",
    productType: "订阅/会员",
    spec: "Ultra",
    summary: "Gemini Ultra、Google AI Ultra、企业 Ultra、反重力或 Flow 积分。",
    aliases: ["ai ultra", "gemini ultra", "250美元", "反重力", "flow"],
  },
  {
    id: "super-grok",
    slug: "super-grok",
    displayName: "Super Grok",
    platform: "Grok",
    productType: "订阅/会员",
    spec: "Super",
    summary: "Super Grok 成品号、卡密、直充、激活码、月卡或年卡。",
    aliases: ["super grok", "supergrok", "grok super", "grok 激活码"],
  },
  {
    id: "super-grok-heavy",
    slug: "super-grok-heavy",
    displayName: "SuperGrok Heavy / Grok Heavy",
    platform: "Grok",
    productType: "订阅/会员",
    spec: "Heavy",
    summary: "SuperGrok Heavy、Grok Heavy 高阶订阅、代充、成品号、月卡或年卡。",
    aliases: ["super grok heavy", "supergrok heavy", "grok heavy", "heavy grok", "grok super heavy", "grok heavy 会员"],
  },
  {
    id: "grok-account",
    slug: "grok-account",
    displayName: "Grok 普号 / 体验号",
    platform: "Grok",
    productType: "成品账号",
    spec: "普通账号 / 体验",
    summary: "Grok 普号、体验卡、短期成品号。",
    aliases: ["grok 普号", "grok 体验", "直登成品"],
  },
  {
    id: "gmail-account",
    slug: "gmail-account",
    displayName: "Gmail / Google 邮箱",
    platform: "邮箱",
    productType: "邮箱/账号",
    spec: "Gmail / Google",
    summary: "纯 Gmail、Google 邮箱、谷歌邮箱、Google 账号等邮箱商品。",
    aliases: ["gmail", "google 邮箱", "谷歌邮箱", "google 账号", "谷歌账号", "gmail 邮箱"],
  },
  {
    id: "outlook-account",
    slug: "outlook-account",
    displayName: "Outlook / Hotmail 邮箱",
    platform: "邮箱",
    productType: "邮箱/账号",
    spec: "Outlook / Hotmail / Microsoft",
    summary: "纯 Outlook、Hotmail、Microsoft、微软邮箱、OAuth2 邮箱商品。",
    aliases: ["outlook", "hotmail", "微软邮箱", "microsoft 邮箱", "oauth2", "graph 令牌"],
  },
  {
    id: "education-email",
    slug: "education-email",
    displayName: "教育邮箱",
    platform: "邮箱",
    productType: "邮箱/账号",
    spec: "Edu",
    summary: "教育邮箱、学校邮箱、edu 邮箱等商品。",
    aliases: ["教育邮箱", "edu 邮箱", "学校邮箱", "edu mail", ".edu"],
  },
  {
    id: "email-account",
    slug: "email-account",
    displayName: "其他邮箱",
    platform: "邮箱",
    productType: "邮箱/账号",
    spec: "其他邮箱",
    summary: "域名邮箱、自建邮箱、无法进一步确认类型的纯邮箱商品。",
    aliases: ["邮箱账号", "域名邮箱", "企业邮箱", "其他邮箱"],
  },
  {
    id: "icloud-email",
    slug: "icloud-email",
    displayName: "iCloud 邮箱",
    platform: "邮箱",
    productType: "邮箱/账号",
    spec: "iCloud",
    summary: "纯 iCloud 邮箱、iCloud 隐私邮箱、iCloud 邮箱母号或取码邮箱商品。",
    aliases: ["icloud", "icloud 邮箱", "icloud邮箱", "icoud", "icoud 邮箱", "icoud邮箱", "icloud 隐私邮箱", "icloud 母号", "icloud 子号"],
  },
  {
    id: "virtual-card",
    slug: "virtual-card",
    displayName: "虚拟卡",
    platform: "其他",
    productType: "虚拟卡",
    spec: "VISA / MasterCard",
    summary: "VISA、MasterCard、0刀卡、1刀卡、BIN 卡或虚拟信用卡。",
    aliases: ["visa", "mastercard", "虚拟卡", "虚拟信用卡", "0刀卡", "1刀卡", "bin 卡", "485954", "paypal 虚拟卡"],
  },
  {
    id: "openai-phone-verification",
    slug: "openai-phone-verification",
    displayName: "OpenAI / ChatGPT 接码",
    platform: "接码",
    productType: "接码/验证",
    spec: "OpenAI / ChatGPT",
    summary: "OpenAI、ChatGPT、Codex、GPT 注册或登录相关手机接码服务。",
    aliases: ["openai 接码", "chatgpt 接码", "gpt 接码", "codex 接码"],
  },
  {
    id: "google-phone-verification",
    slug: "google-phone-verification",
    displayName: "Google / Gemini 接码",
    platform: "接码",
    productType: "接码/验证",
    spec: "Google / Gemini",
    summary: "Google、Gmail、Gemini、Pixel 等 Google 相关手机接码服务。",
    aliases: ["google 接码", "gmail 接码", "gemini 接码", "谷歌接码"],
  },
  {
    id: "paypal-phone-verification",
    slug: "paypal-phone-verification",
    displayName: "PayPal 接码",
    platform: "接码",
    productType: "接码/验证",
    spec: "PayPal",
    summary: "PayPal 注册或验证相关手机接码服务。",
    aliases: ["paypal 接码", "paypal 验证", "paypal 手机验证"],
  },
  {
    id: "phone-verification",
    slug: "phone-verification",
    displayName: "通用接码",
    platform: "接码",
    productType: "接码/验证",
    spec: "短信 / 手机号验证",
    summary: "无法确认具体平台的手机接码、短信验证码、一次性验证、注册辅助验证等服务。",
    aliases: ["接码", "手机接码", "短信验证", "验证码", "一次性接码", "手机号验证", "通用接码"],
  },
  {
    id: "identity-verification",
    slug: "identity-verification",
    displayName: "真人 / KYC 验证",
    platform: "接码",
    productType: "接码/验证",
    spec: "KYC / 真人验证",
    summary: "Claude、ChatGPT 或其他平台的人脸、实名、Persona、KYC 等人工验证服务。",
    aliases: ["kyc", "真人认证", "实名认证", "人脸验证", "persona"],
  },
  {
    id: "cursor-account",
    slug: "cursor-account",
    displayName: "Cursor 账号",
    platform: "其他",
    productType: "工具账号",
    spec: "Cursor",
    summary: "Cursor Pro、Cursor 账号、Cursor 成品号或相关权益。",
    aliases: ["cursor", "cursor pro", "cursor 账号", "cursor 成品号"],
  },
  {
    id: "kiro-account",
    slug: "kiro-account",
    displayName: "Kiro 普号 / Free",
    platform: "其他",
    productType: "工具账号",
    spec: "Free / 普号",
    summary: "Kiro 普号、Free 账号、固定 50 额度或 kirors 导入格式的基础账号。",
    aliases: ["kiro", "kiro 普号", "kiro free", "固定50额度", "kirors", "kiro rs"],
  },
  {
    id: "kiro-pro-account",
    slug: "kiro-pro-account",
    displayName: "Kiro Pro / 额度号",
    platform: "其他",
    productType: "工具账号",
    spec: "Pro / 额度",
    summary: "Kiro Pro、Pro+、Pro Max、Power、额度号或可超额相关权益。",
    aliases: ["kiro pro", "kiro pro+", "kiro promax", "kiro power", "kiro 积分", "kiro 额度"],
  },
  {
    id: "windsurf-account",
    slug: "windsurf-account",
    displayName: "Windsurf 账号",
    platform: "其他",
    productType: "工具账号",
    spec: "Windsurf",
    summary: "Windsurf 账号、Windsurf 会员或相关权益。",
    aliases: ["windsurf", "wind surf", "windsurf 账号"],
  },
  {
    id: "perplexity-account",
    slug: "perplexity-account",
    displayName: "Perplexity 账号",
    platform: "其他",
    productType: "工具账号",
    spec: "Perplexity",
    summary: "Perplexity Pro、Perplexity 账号或相关权益。",
    aliases: ["perplexity", "perplexity pro", "perplexity 账号"],
  },
  {
    id: "suno-account",
    slug: "suno-account",
    displayName: "Suno 账号",
    platform: "其他",
    productType: "工具账号",
    spec: "Suno",
    summary: "Suno Pro、Suno 账号或相关权益。",
    aliases: ["suno", "suno pro", "suno 账号"],
  },
  {
    id: "dreamina-account",
    slug: "dreamina-account",
    displayName: "Dreamina / 即梦",
    platform: "其他",
    productType: "工具账号",
    spec: "Basic / Seedance 2.0",
    summary: "Dreamina 海外版即梦、Seedance 2.0 视频生成相关成品账号、积分或 Basic 权益。",
    aliases: [
      "dreamina",
      "dreamina ai",
      "即梦",
      "即梦 ai",
      "吉梦",
      "jimeng",
      "jimeng ai",
      "海外即梦",
      "海外版即梦",
      "seedance",
      "seedance 2.0",
      "seedance2.0",
      "seedance2",
      "c档 2.0",
      "c档2.0",
      "c 档 2.0",
      "c 档2.0",
      "dreamina basic",
      "即梦 basic",
    ],
  },
  {
    id: "apple-id-account",
    slug: "apple-id-account",
    displayName: "Apple ID / 苹果账号",
    platform: "其他",
    productType: "工具账号",
    spec: "Apple ID",
    summary: "Apple ID、苹果 ID、美区 ID、土区 ID 等地区账号或相关权益。",
    aliases: ["apple id", "苹果 id", "苹果账号", "美区 id", "土区 id", "apple 账号"],
  },
  {
    id: "x-twitter-account",
    slug: "x-twitter-account",
    displayName: "X / 推特账号",
    platform: "其他",
    productType: "工具账号",
    spec: "X / Twitter",
    summary: "X、Twitter、推特普通账号、老号、三绑、2FA 或 token 登录账号。",
    aliases: ["twitter", "推特", "推特账号", "x 账号", "x账号", "推特老号", "x/twitter", "x-twitter"],
  },
  {
    id: "x-twitter-premium",
    slug: "x-twitter-premium",
    displayName: "X Premium / 推特会员",
    platform: "其他",
    productType: "订阅/会员",
    spec: "Premium / Premium+",
    summary: "X Premium、Twitter Premium、推特蓝标、蓝 V、会员月卡、年卡、CDK、直充或代开。",
    aliases: ["x premium", "twitter premium", "推特 premium", "推特会员", "推特蓝标", "推特蓝v", "蓝 v", "蓝标", "premium+"],
  },
  {
    id: "telegram-account",
    slug: "telegram-account",
    displayName: "Telegram 账号",
    platform: "其他",
    productType: "工具账号",
    spec: "成品账号 / 地区号",
    summary: "Telegram、TG、电报、飞机号成品账号、老号、精养号、地区号、API 链接或直登账号。",
    aliases: ["telegram", "tg", "电报", "飞机号", "telegram 账号", "tg 账号", "电报账号", "telegram 老号"],
  },
  {
    id: "telegram-premium",
    slug: "telegram-premium",
    displayName: "Telegram Premium / Pro 会员",
    platform: "其他",
    productType: "订阅/会员",
    spec: "Premium / Stars",
    summary: "Telegram Premium、Pro 会员、3/6/12 个月会员、会员兑换码、代开、用户名赠送会员或 Telegram Stars 星星增值功能。",
    aliases: ["telegram premium", "telegram pro", "tg premium", "tg pro", "telegram 会员", "tg 会员", "telegram 星星", "telegram stars", "星星代充"],
  },
  {
    id: "gift-card",
    slug: "gift-card",
    displayName: "礼品卡",
    platform: "其他",
    productType: "礼品卡",
    spec: "Apple / 通用礼品卡",
    summary: "Apple Gift Card、App Store、iTunes、Netflix、Spotify 等礼品卡或充值卡商品。",
    aliases: ["礼品卡", "gift card", "giftcard", "apple gift card", "app store 卡", "itunes 卡"],
  },
  {
    id: "other-product",
    slug: "other-product",
    displayName: "其他商品",
    platform: "其他",
    productType: "其他",
    spec: "其他",
    summary: "教程、代理、社交账号、流量服务、资料、无法识别商品等。",
    aliases: ["other", "教程", "代理", "社交账号", "资料"],
  },
];

const catalogById = new Map(canonicalCatalog.map((item) => [item.id, item]));
const legacyCanonicalIdMap: Record<string, string> = {
  "chatgpt-plus-month": "chatgpt-plus",
  "chatgpt-plus-account": "chatgpt-plus",
  "email-account": "email-account",
  "phone-verification": "phone-verification",
  "other-tool-account": "other-product",
};

type OfferClassificationContext = {
  tags?: string[] | string | null;
  categorySlug?: string | null;
  price?: number | null;
};

const priceFloorByProductId = new Map<string, number>([
  ["chatgpt-plus-recharge", 50],
  ["chatgpt-pro-5x", 100],
  ["chatgpt-pro-20x", 100],
  ["claude-pro-month", 40],
  ["claude-team-standard", 100],
  ["claude-team-premium", 100],
  ["claude-max-5x", 100],
  ["claude-max-20x", 200],
  ["gemini-ultra", 50],
]);

export function getCanonicalProduct(id: string): CanonicalProduct {
  return catalogById.get(legacyCanonicalIdMap[id] || id) ?? catalogById.get("other-product")!;
}

export function resolveOfferProduct(
  offer: RawOffer,
  canonicalProducts: CanonicalProduct[] = canonicalCatalog,
): CanonicalProduct {
  const canonicalMap = new Map(canonicalProducts.map((product) => [product.id, product]));
  const context = { tags: offer.tags, categorySlug: offer.categorySlug };
  const titleClassified = classifyOfferByTitle(offer.sourceTitle, context);
  const classified = applyPriceFloor(titleClassified, offer.price);
  const mappedId = offer.canonicalProductId ? legacyCanonicalIdMap[offer.canonicalProductId] || offer.canonicalProductId : null;

  if (classified.id !== "other-product") return classified;
  if (titleClassified.id !== "other-product") return classified;
  if (shouldBlockStoredProductFallback(offer.sourceTitle)) return classified;
  if (mappedId && catalogById.has(mappedId)) return getCanonicalProduct(mappedId);
  if (mappedId && canonicalMap.has(mappedId)) return canonicalMap.get(mappedId)!;

  return classified;
}

export function classifyOffer(
  title: string,
  context: OfferClassificationContext = {},
): CanonicalProduct {
  return applyPriceFloor(classifyOfferByTitle(title, context), context.price);
}

function classifyOfferByTitle(
  title: string,
  context: OfferClassificationContext = {},
): CanonicalProduct {
  const value = normalizeTitle(title);
  const contextValue = normalizeTitle([normalizeTags(context.tags), context.categorySlug].filter(Boolean).join(" "));

  if (isCodexPhoneVerification(value)) {
    return getCanonicalProduct("openai-phone-verification");
  }

  if (isVerificationService(value)) {
    return getCanonicalProduct(classifyVerificationService(value));
  }

  if (isGooglePlayOrPixelRechargeProduct(value)) {
    return getCanonicalProduct("gemini-pro-recharge");
  }

  if (isVirtualCardProduct(value)) {
    return getCanonicalProduct("virtual-card");
  }

  if (isToolSourceCodeProduct(value)) {
    return getCanonicalProduct("other-product");
  }

  if (isMirrorSiteProduct(value)) {
    return getCanonicalProduct(classifyMirrorSiteProduct(value));
  }

  if (isGiftCardProduct(value)) {
    return getCanonicalProduct("gift-card");
  }

  if (isDreaminaProduct(value)) {
    return getCanonicalProduct("dreamina-account");
  }

  if (isXTwitterEngagementService(value)) {
    return getCanonicalProduct("other-product");
  }

  if (isGrokHeavyProduct(value)) {
    return getCanonicalProduct("super-grok-heavy");
  }

  if (isSuperGrokBundleProduct(value)) {
    return getCanonicalProduct("super-grok");
  }

  if (isXTwitterPremiumProduct(value)) {
    return getCanonicalProduct("x-twitter-premium");
  }

  if (isXTwitterAccount(value)) {
    return getCanonicalProduct("x-twitter-account");
  }

  if (isTelegramPremiumProduct(value, contextValue)) {
    return getCanonicalProduct("telegram-premium");
  }

  if (isTelegramProduct(value, contextValue)) {
    return getCanonicalProduct("telegram-account");
  }

  if (isOtherTool(value)) {
    return getCanonicalProduct(classifyOtherTool(value));
  }

  if (isChatGptPeripheralService(value)) {
    return getCanonicalProduct("chatgpt-codex-service");
  }

  if (isApiProduct(value)) {
    return getCanonicalProduct("openai-api-cdk");
  }

  if (isSupportService(value)) {
    return getCanonicalProduct("other-product");
  }

  if (isGeminiProduct(value)) {
    if (isGeminiUltraProduct(value)) {
      return getCanonicalProduct("gemini-ultra");
    }

    if (isGeminiProRecharge(value)) {
      return getCanonicalProduct("gemini-pro-recharge");
    }

    return getCanonicalProduct("gemini-pro-year");
  }

  if (isEmailAccountWithVerificationNote(value)) {
    return getCanonicalProduct(classifyPureEmail(value));
  }

  if (isPureEmail(value)) {
    return getCanonicalProduct(classifyPureEmail(value));
  }

  if (isClaudeProduct(value)) {
    if (isClaudeTeamPremium(value)) {
      return getCanonicalProduct("claude-team-premium");
    }

    if (isClaudeTeamStandard(value)) {
      return getCanonicalProduct("claude-team-standard");
    }

    if (isClaudeMax20Product(value)) {
      return getCanonicalProduct("claude-max-20x");
    }

    if (isClaudeMax5Product(value)) {
      return getCanonicalProduct("claude-max-5x");
    }

    if (matches(value, ["pro", "尼区", "月卡", "直充", "代充", "充值", "续费", "订阅", "激活码", "卡密"])) {
      return getCanonicalProduct("claude-pro-month");
    }

    return getCanonicalProduct("claude-account");
  }

  if (isGrokProduct(value)) {
    if (isGrokFitForSuperInfrastructure(value)) {
      return getCanonicalProduct("grok-account");
    }

    if (isGrokHeavyProduct(value)) {
      return getCanonicalProduct("super-grok-heavy");
    }

    if (matches(value, ["super", "supergrok", "月卡", "年卡", "激活码", "卡密", "直充", "充值"])) {
      return getCanonicalProduct("super-grok");
    }

    return getCanonicalProduct("grok-account");
  }

  if (isClaudeMax20Product(value)) {
    return getCanonicalProduct("claude-max-20x");
  }

  if (isClaudeMax5Product(value)) {
    return getCanonicalProduct("claude-max-5x");
  }

  if (isMixedChatGptProTier(value)) {
    return getCanonicalProduct("other-product");
  }

  if (isChatGptPro20(value)) {
    return getCanonicalProduct("chatgpt-pro-20x");
  }

  if (isChatGptPro5(value)) {
    return getCanonicalProduct("chatgpt-pro-5x");
  }

  if (isAmbiguousPlusPackage(value)) {
    return getCanonicalProduct("other-product");
  }

  if (isChatGptProduct(value)) {
    if (isChatGptPro20(value)) {
      return getCanonicalProduct("chatgpt-pro-20x");
    }

    if (isChatGptPro5(value)) {
      return getCanonicalProduct("chatgpt-pro-5x");
    }

    if (isChatGptFreeAccount(value) || isNegatedPlus(value)) {
      return getCanonicalProduct("chatgpt-free-account");
    }

    if (isMixedChatGptProTier(value)) {
      return getCanonicalProduct("other-product");
    }

    if (isChatGptGoProduct(value)) {
      return getCanonicalProduct("chatgpt-go");
    }

    if (isChatGptTeamDominant(value)) {
      return getCanonicalProduct("chatgpt-team-business");
    }

    if (isChatGptPlusRecharge(value) && !isChatGptTeamDominant(value)) {
      return getCanonicalProduct("chatgpt-plus-recharge");
    }

    if (isChatGptPlus(value) && !isChatGptTeamDominant(value)) {
      return getCanonicalProduct("chatgpt-plus");
    }

    if (isChatGptTeam(value)) {
      return getCanonicalProduct("chatgpt-team-business");
    }

    if (isChatGptPlus(value)) {
      return getCanonicalProduct("chatgpt-plus");
    }

    if (isChatGptAccountTitle(value)) {
      return getCanonicalProduct("chatgpt-free-account");
    }
  }

  if (isBundledVerificationAccount(value)) {
    return getCanonicalProduct("other-product");
  }

  if (isChatGptPeripheralService(value)) {
    return getCanonicalProduct("chatgpt-codex-service");
  }

  if (matches(value, ["gmail", "google 邮箱", "谷歌邮箱", "hotmail", "outlook", "微软邮箱", "邮箱"])) {
    return getCanonicalProduct(classifyPureEmail(value));
  }

  if (
    matches(value, ["codex", "api", "cdk", "token", "中转"]) ||
    (matches(value, ["额度", "余额"]) && !hasAccountOrSubscriptionDeliverySignal(value))
  ) {
    return getCanonicalProduct("openai-api-cdk");
  }

  if (contextValue && matches(contextValue, ["chatgpt", "openai"]) && matches(value, ["plus"])) {
    if (isChatGptPlusRecharge(value)) return getCanonicalProduct("chatgpt-plus-recharge");
    return getCanonicalProduct("chatgpt-plus");
  }

  return getCanonicalProduct("other-product");
}

function applyPriceFloor(product: CanonicalProduct, price: number | null | undefined): CanonicalProduct {
  const floor = priceFloorByProductId.get(product.id);
  if (floor === undefined) return product;
  if (typeof price !== "number" || !Number.isFinite(price)) return product;

  return price < floor ? getCanonicalProduct("other-product") : product;
}

function shouldBlockStoredProductFallback(title: string): boolean {
  const value = normalizeTitle(title);

  return isMixedChatGptProTier(value) || isTelegramLanguagePack(value);
}

export function buildProductGroups(
  offers: RawOffer[],
  canonicalProducts: CanonicalProduct[] = canonicalCatalog,
): ProductGroup[] {
  const map = new Map<string, ProductGroup>();

  for (const offer of offers.filter((item) => !item.hidden)) {
    const product = resolveOfferProduct(offer, canonicalProducts);

    const current =
      map.get(product.id) ||
      ({
        ...product,
        offers: [],
        offerCount: 0,
        inStockCount: 0,
        outOfStockCount: 0,
        lowestPrice: null,
        lowestPriceLabel: "暂无价格",
        lowestPriceTone: "muted",
        lowestOffer: null,
        warrantyLowestPrice: null,
        warrantyLowestOffer: null,
        warrantyOfferCount: 0,
        latestSeenAt: null,
        anomalyFlags: [],
      } satisfies ProductGroup);

    current.offers.push(offer);
    map.set(product.id, current);
  }

  for (const product of map.values()) {
    product.offers.sort(compareOffers);
    product.offerCount = product.offers.length;
    product.inStockCount = product.offers.filter(isAvailable).length;
    product.outOfStockCount = Math.max(0, product.offers.length - product.inStockCount);
    const excludeTelegramStars = product.id === "telegram-premium";
    const lowestOfferOptions = { excludeSharedAccess: true, excludeDomesticMirrorSite: true, excludeTelegramStars };
    const displayLowestOffer = getDisplayLowestOffer(product.offers, lowestOfferOptions);
    const warrantyLowestOffer = getDisplayLowestOffer(product.offers.filter(isLongWarrantyOffer), lowestOfferOptions);
    const priceMeta = getOfferPriceMeta(displayLowestOffer);

    product.lowestOffer = displayLowestOffer;
    product.lowestPrice = displayLowestOffer?.price ?? null;
    product.lowestPriceLabel = priceMeta.label;
    product.lowestPriceTone = priceMeta.tone;
    product.warrantyLowestOffer = warrantyLowestOffer;
    product.warrantyLowestPrice = warrantyLowestOffer?.price ?? null;
    product.warrantyOfferCount = product.offers.filter((offer) => isAvailable(offer) && isLongWarrantyOffer(offer)).length;
    product.latestSeenAt = latestDate(
      product.offers.map((offer) => offer.verifiedAt || offer.lastSeenAt || offer.capturedAt || offer.sourceUpdatedAt),
    );
    product.anomalyFlags = collectProductFlags(product);
  }

  return Array.from(map.values()).sort((a, b) => {
    const displayOrderDelta = compareProductDisplayOrder(a, b);
    if (displayOrderDelta !== 0) return displayOrderDelta;

    const stockDelta = Number(b.inStockCount > 0) - Number(a.inStockCount > 0);
    if (stockDelta !== 0) return stockDelta;

    return (a.lowestPrice ?? Number.MAX_SAFE_INTEGER) - (b.lowestPrice ?? Number.MAX_SAFE_INTEGER);
  });
}

export function publicCatalogProducts(
  products: CanonicalProduct[] = canonicalCatalog,
  options: { showApiCdk?: boolean } = {},
): CanonicalProduct[] {
  return products.filter((product) => isPublicCatalogProduct(product, options));
}

export function compareOffers(a: RawOffer, b: RawOffer): number {
  const availableDelta = Number(isAvailable(b)) - Number(isAvailable(a));
  if (availableDelta !== 0) return availableDelta;

  const sharedAccessDelta = Number(isSharedAccessOffer(a)) - Number(isSharedAccessOffer(b));
  if (isAvailable(a) && isAvailable(b) && sharedAccessDelta !== 0) return sharedAccessDelta;

  const mirrorSiteDelta = Number(isDomesticMirrorSiteOffer(a)) - Number(isDomesticMirrorSiteOffer(b));
  if (isAvailable(a) && isAvailable(b) && mirrorSiteDelta !== 0) return mirrorSiteDelta;

  const telegramStarsDelta = Number(isTelegramStarsOffer(a)) - Number(isTelegramStarsOffer(b));
  if (isAvailable(a) && isAvailable(b) && telegramStarsDelta !== 0) return telegramStarsDelta;

  const priceDelta =
    (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
  if (priceDelta !== 0) return priceDelta;

  const seenB = b.verifiedAt || b.lastSeenAt || b.capturedAt || b.sourceUpdatedAt || "";
  const seenA = a.verifiedAt || a.lastSeenAt || a.capturedAt || a.sourceUpdatedAt || "";
  return seenB.localeCompare(seenA);
}

export function isAvailable(offer: RawOffer): boolean {
  if (offer.status === "out_of_stock") return false;
  if (!hasUsablePrice(offer)) return false;
  if (!offer.url) return false;
  if (offer.effectiveStatus && ["unavailable", "stale", "failed"].includes(offer.effectiveStatus)) return false;
  if (offer.freshnessStatus && ["expired", "failed"].includes(offer.freshnessStatus)) return false;
  if (isExpired(offer.expiresAt)) return false;

  return true;
}

export function getOfferPriceMeta(
  offer: RawOffer | null | undefined,
): { label: string; tone: ProductGroup["lowestPriceTone"] } {
  if (!offer || !hasUsablePrice(offer)) return { label: "暂无有货价", tone: "muted" };

  if (!isAvailable(offer)) {
    return { label: "缺货", tone: "danger" };
  }

  return { label: "有货", tone: "good" };
}

function getDisplayLowestOffer(
  offers: RawOffer[],
  options: { excludeSharedAccess?: boolean; excludeDomesticMirrorSite?: boolean; excludeTelegramStars?: boolean } = {},
): RawOffer | null {
  const displayPool = offers.filter((offer) => {
    if (!hasUsablePrice(offer) || !isAvailable(offer)) return false;
    if (options.excludeSharedAccess && isSharedAccessOffer(offer)) return false;
    if (options.excludeDomesticMirrorSite && isDomesticMirrorSiteOffer(offer)) return false;
    if (options.excludeTelegramStars && isTelegramStarsOffer(offer)) return false;
    return true;
  });
  if (!displayPool.length) return null;

  return [...displayPool].sort((a, b) => {
    const priceDelta = (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
    if (priceDelta !== 0) return priceDelta;

    return compareOffers(a, b);
  })[0] ?? null;
}

function isLongWarrantyOffer(offer: RawOffer): boolean {
  return offerMatchesFilterTags(offer, ["warranty_long"]);
}

export function isSharedAccessOffer(offer: RawOffer): boolean {
  return offerMatchesFilterTags(offer, ["shared_access"]);
}

export function isTelegramStarsOffer(offer: RawOffer): boolean {
  return offerMatchesFilterTags(offer, ["telegram_stars"]);
}

export function isDomesticMirrorSiteOffer(offer: RawOffer): boolean {
  return offerMatchesFilterTags(offer, ["domestic_mirror_site"]);
}

function hasUsablePrice(offer: RawOffer): offer is RawOffer & { price: number } {
  return typeof offer.price === "number" && Number.isFinite(offer.price);
}

export function collectOfferFlags(offer: RawOffer): string[] {
  const flags = new Set<string>();

  if (!isAvailable(offer)) flags.add("缺货");
  if (isSharedAccessOffer(offer)) flags.add("拼车/团购");
  if (offer.tags.some((tag) => tag.includes("无质保"))) flags.add("无质保");

  return Array.from(flags);
}

function collectProductFlags(product: ProductGroup): string[] {
  const flags = new Set<string>();
  for (const offer of product.offers) {
    collectOfferFlags(offer).forEach((flag) => flags.add(flag));
  }

  if (product.inStockCount === 0) flags.add("全部缺货");

  return Array.from(flags);
}

function latestDate(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function matches(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle.toLowerCase()));
}

function isExpired(value: string | null | undefined): boolean {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/美國/g, "美国")
    .replace(/虛擬/g, "虚拟")
    .replace(/[×✕✖✘]/g, "x")
    .replace(/[\ufe0e\ufe0f]/g, "")
    .replace(/[｜|/【】[\]()（）,，:：\-_/–—]+/g, " ")
    .replace(/gptplus/g, "gpt plus")
    .replace(/plus月卡/g, "plus 月卡")
    .replace(/普拉斯/g, "plus")
    .replace(/\bpuls\b/g, "plus")
    .replace(/\bpulus\b/g, "plus")
    .replace(/\bgemin\b/g, "gemini")
    .replace(/\bgtp\b/g, "gpt")
    .replace(/\bcoedx\b/g, "codex")
    .replace(/\bcluade\b/g, "claude")
    .replace(/\bbusisness\b/g, "business")
    .replace(/chat\s*gpt/g, "chatgpt")
    .replace(/claude\s*code/g, "claude code")
    .replace(/supergrok/g, "super grok")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(tags: string[] | string | null | undefined): string {
  if (!tags) return "";
  if (Array.isArray(tags)) return tags.join(" ");
  return tags;
}

function isSupportService(value: string): boolean {
  if (isApiProduct(value)) {
    return false;
  }

  if (hasNegatedTutorialMention(value) && isAiSubscriptionOrAccountTitle(value)) {
    return false;
  }

  if (matches(value, ["教程", "电话卡", "手机套餐", "代理服务", "并发数", "安装版", "安装教程", "登陆教程", "登录教程"])) {
    return true;
  }

  return false;
}

function hasNegatedTutorialMention(value: string): boolean {
  return matches(value, ["无教程", "无 教程", "没有教程", "不含教程", "不带教程"]);
}

function isToolSourceCodeProduct(value: string): boolean {
  if (matches(value, ["源码", "源代码", "脚本源码", "注册机源码"])) return true;

  if (matches(value, ["注册机", "生成器", "工具包"])) {
    return !matches(value, ["成品号", "账号", "账户", "积分", "额度", "power", "pro", "会员", "订阅", "月卡", "年卡"]);
  }

  return false;
}

function isMirrorSiteProduct(value: string): boolean {
  if (!matches(value, ["镜像站", "镜像", "mirror"])) return false;

  return matches(value, ["chatgpt", "gpt", "openai", "plus", "claude", "gemini", "grok"]);
}

function classifyMirrorSiteProduct(value: string): string {
  if (isGrokProduct(value)) return isGrokHeavyProduct(value) ? "super-grok-heavy" : "super-grok";
  if (isGeminiProduct(value)) return isGeminiUltraProduct(value) ? "gemini-ultra" : "gemini-pro-year";
  if (isClaudeProduct(value)) {
    if (isClaudeMax20Product(value)) return "claude-max-20x";
    if (isClaudeMax5Product(value)) return "claude-max-5x";
    if (isClaudeTeamPremium(value)) return "claude-team-premium";
    if (isClaudeTeamStandard(value)) return "claude-team-standard";
    return "claude-pro-month";
  }
  if (isChatGptPro20(value)) return "chatgpt-pro-20x";
  if (isChatGptPro5(value)) return "chatgpt-pro-5x";
  if (isChatGptGoProduct(value)) return "chatgpt-go";
  if (isChatGptTeamDominant(value) || isChatGptTeam(value)) return "chatgpt-team-business";
  if (isChatGptProduct(value)) return "chatgpt-plus";

  return "other-product";
}

function isGiftCardProduct(value: string): boolean {
  if (matches(value, ["非礼品卡", "不是礼品卡", "不含礼品卡", "无礼品卡"])) return false;

  if (matches(value, ["礼品卡", "gift card", "giftcard", "itunes 卡", "itunes卡", "app store 卡", "appstore 卡"])) {
    return true;
  }

  if (matches(value, ["苹果卡", "礼卡"]) && matches(value, ["面额", "usd", "hkd", "try", "充值卡"])) {
    return true;
  }

  return false;
}

function isVerificationService(value: string): boolean {
  if (isStandaloneVerificationService(value)) return true;

  if (isEmailAccountWithVerificationNote(value)) {
    return false;
  }

  if (isXTwitterAccountWithLoginBundle(value)) {
    return false;
  }

  if (isBundledVerificationAccount(value)) {
    return false;
  }

  if (isAiSubscriptionOrAccountTitle(value)) {
    return false;
  }

  if (matches(value, ["接码", "收码", "短信验证", "验证码", "手机号验证", "手机验证", "一次性验证", "单次接码"])) {
    return true;
  }

  return matches(value, ["验证"]) && matches(value, ["手机号", "手机号码", "短信", "接码"]);
}

function isBundledVerificationAccount(value: string): boolean {
  if (hasAccountBundleSignal(value) && matches(value, ["接码", "收码", "验证码", "手机号", "手机号码", "手机验证"])) {
    return true;
  }

  return matches(value, [
    "已接码",
    "已经接码",
    "已完成接码",
    "已手机接码",
    "已接码验证",
    "已手机接码验证",
    "未接码",
    "没接码",
    "自行接码",
    "自己接码",
    "需要自己接码",
    "需要自行接码",
    "codex自己接码",
    "需接码",
    "需使用自行接码",
    "不需要手机验证接码",
    "不需要手机验证",
    "无需手机验证",
    "带接码地址",
    "带接码链接",
    "带电话接码链接",
    "原始接码链接",
    "接码链接",
    "长效接码链接",
    "包含长效接码",
  ]);
}

function isStandaloneVerificationService(value: string): boolean {
  if (isIdentityVerificationService(value)) {
    return true;
  }

  if (matches(value, ["接码自助", "接码 自助", "接码自助卡密", "手机接码自助", "手机接码 自助"])) {
    return true;
  }

  if (matches(value, ["sms 接码", "短信接码", "短信 接码", "实卡接码", "实体卡接码", "短效接码", "短效 接码", "收码"])) {
    return true;
  }

  if (matches(value, ["单次接码", "一次性接码", "一次性验证"])) {
    return true;
  }

  if (matches(value, ["手机接码", "手机号验证", "手机验证"]) && matches(value, ["号码", "实卡", "自助卡密", "质保1次成功接码"])) {
    return true;
  }

  if (matches(value, ["手机接码"]) && matches(value, ["可绑定", "绑定 3 个", "绑定3个"])) {
    return true;
  }

  if (
    matches(value, ["短效手机号", "短效 手机号", "手机号"]) &&
    matches(value, ["google", "谷歌", "gmail", "gemini", "pixel"]) &&
    matches(value, ["风控", "人机", "验证", "过gemini", "过 gemini"]) &&
    !hasAccountBundleSignal(value)
  ) {
    return true;
  }

  if (
    matches(value, [
      "google 反重力可用 claude",
      "codex接码",
      "codex 接码",
      "codex接🐎",
      "codex 接🐎",
      "codex接马",
      "codex 接马",
      "gpt codex 接码",
      "gpt codex接码",
      "openai codex 接码",
      "openai codex接码",
      "google gemini 接码",
      "google gemini接码",
      "gemini 接码",
      "claude 接码",
      "google接码",
      "google 接码",
      "谷歌接码",
      "谷歌邮箱接码",
      "gmail接码",
      "gmail 接码",
      "专用gmail接码",
      "专用 gmail 接码",
    ]) &&
    !hasAccountBundleSignal(value)
  ) {
    return true;
  }

  if (matches(value, ["反重力可用"]) && matches(value, ["google", "claude"]) && !hasAccountBundleSignal(value)) {
    return true;
  }

  return false;
}

function isIdentityVerificationService(value: string): boolean {
  if (!hasIdentityVerificationSignal(value)) return false;
  return !hasIdentityVerificationBundleSignal(value);
}

function hasIdentityVerificationSignal(value: string): boolean {
  return matches(value, ["kyc", "人脸验证", "真人认证", "实名认证"]) || /(^|[^a-z])persona([^a-z]|$)/.test(value);
}

function hasIdentityVerificationBundleSignal(value: string): boolean {
  return matches(value, [
    "成品号",
    "成品账号",
    "账号",
    "账户",
    "子号",
    "max",
    "pro",
    "team",
    "plus",
    "会员",
    "订阅",
    "月卡",
    "年卡",
    "已过kyc",
    "已过 kyc",
    "以过kyc",
    "以过 kyc",
    "免kyc",
    "免 kyc",
    "免过kyc",
    "免过 kyc",
    "过kyc",
    "过 kyc",
    "已完成kyc",
    "已完成 kyc",
  ]);
}

function hasAccountBundleSignal(value: string): boolean {
  return matches(value, [
    "成品号",
    "半成品",
    "账号",
    "账户",
    "账密",
    "plus",
    "pro",
    "team",
    "business",
    "月卡",
    "年卡",
    "12个月",
    "一年",
    "会员",
    "订阅",
  ]);
}

function hasEmailSignal(value: string): boolean {
  return matches(value, [
    "gmail",
    "icloud邮箱",
    "icloud 邮箱",
    "icoud",
    "icoud邮箱",
    "icoud 邮箱",
    "mail邮箱",
    "邮箱",
    "谷歌邮箱",
    "google 邮箱",
    "google邮箱",
    "google个人邮箱",
    "google 个人邮箱",
    "谷歌账号",
    "google 账号",
    "hotmail",
    "outlook",
    "微软邮箱",
    "microsoft 邮箱",
    "教育邮箱",
    "edu 邮箱",
    "学校邮箱",
    "域名邮箱",
    "企业邮箱",
  ]);
}

function isEmailAccountWithVerificationNote(value: string): boolean {
  if (!hasEmailSignal(value)) return false;
  if (isAiSubscriptionOrAccountTitle(value)) return false;
  if (/\b(tg|telegram)\b/.test(value) || matches(value, ["电报"])) return false;
  if (matches(value, ["接码自助", "手机接码自助", "sms 接码", "短信接码", "实卡接码", "实体卡接码", "单次接码", "一次性接码"])) {
    return false;
  }

  if (matches(value, ["短效接码", "专用gmail接码", "专用 gmail 接码", "google 接码", "google接码", "谷歌接码", "谷歌邮箱接码", "gmail接码", "gmail 接码"])) {
    return false;
  }

  return matches(value, [
    "老号邮箱",
    "高权重老邮箱",
    "随机地区",
    "带2fa",
    "带 2fa",
    "邮箱带2fa",
    "原始接码链接",
    "带电话接码链接",
    "电话接码链接",
    "不需要手机验证",
    "无需手机验证",
    "会接码的买",
    "登陆需要接码验证",
    "登录需要接码验证",
  ]);
}

function classifyVerificationService(value: string): string {
  if (isIdentityVerificationService(value)) return "identity-verification";
  if (matches(value, ["paypal"])) return "paypal-phone-verification";
  if (matches(value, ["google", "谷歌", "gmail", "gemini", "pixel"])) return "google-phone-verification";
  if (matches(value, ["openai", "chatgpt", "gpt", "codex"])) return "openai-phone-verification";

  return "phone-verification";
}

function isOtherTool(value: string): boolean {
  if (isDreaminaProduct(value)) return true;
  if (isTelegramPremiumProduct(value)) return true;
  if (isTelegramProduct(value)) return true;
  if (isXTwitterEngagementService(value)) return true;
  if (isXTwitterAccount(value)) return true;
  if (isAppleIdAccount(value)) return true;

  return matches(value, [
    "suno",
    "cursor",
    "kiro",
    "windsurf",
    "wind surf",
    "openclaw",
    "open claw",
    "perplexity",
    "dreamina",
    "jimeng",
    "即梦",
    "吉梦",
    "seedance",
    "c档2.0",
    "c档 2.0",
    "c 档2.0",
    "c 档 2.0",
    "telegram",
    "facebook",
    "苹果 id",
    "苹果id",
    "apple id",
    "appleid",
    "苹果账号",
    "apple 账号",
    "美区 id",
    "美区id",
    "土区 id",
    "土区id",
    "日区 id",
    "日区id",
    "港区 id",
    "港区id",
    "外区 id",
    "外区id",
  ]);
}

function classifyOtherTool(value: string): string {
  if (isDreaminaProduct(value)) return "dreamina-account";
  if (isXTwitterEngagementService(value)) return "other-product";
  if (isXTwitterPremiumProduct(value)) return "x-twitter-premium";
  if (isXTwitterAccount(value)) return "x-twitter-account";
  if (isTelegramPremiumProduct(value)) return "telegram-premium";
  if (isTelegramProduct(value)) return "telegram-account";
  if (matches(value, ["cursor"])) return "cursor-account";
  if (isKiroApiCreditProduct(value)) return "openai-api-cdk";
  if (isKiroProProduct(value)) return "kiro-pro-account";
  if (matches(value, ["kiro"])) return "kiro-account";
  if (matches(value, ["windsurf", "wind surf"])) return "windsurf-account";
  if (matches(value, ["perplexity"])) return "perplexity-account";
  if (matches(value, ["suno"])) return "suno-account";
  if (isAppleIdAccount(value)) return "apple-id-account";

  return "other-product";
}

function isDreaminaProduct(value: string): boolean {
  return matches(value, ["dreamina", "jimeng", "即梦", "吉梦", "seedance", "c档2.0", "c档 2.0", "c 档2.0", "c 档 2.0"]);
}

function isTelegramProduct(value: string, contextValue = ""): boolean {
  if (matches(value, ["飞机大厨", "airplane chefs"])) return false;
  if (isTelegramContactOnly(value)) return false;
  if (isTelegramLanguagePack(value)) return false;
  if (isNonTelegramAccountProduct(value)) return false;
  if (matches(value, ["grok", "supergrok", "super grok"])) return false;
  if (isTelegramPremiumProduct(value, contextValue)) return false;
  if (hasTelegramSignal(value)) return true;
  if (hasTelegramRegionAccountSignal(value)) return true;
  if (!contextValue || !hasTelegramSignal(contextValue)) return false;
  if (matches(value, ["esim", "e sim", "电子卡", "实体卡", "电话卡", "手机卡", "sim 卡"])) return false;

  return matches(value, ["成品号", "账号", "账户", "老号", "白号", "精养", "高权重", "星星"]);
}

function hasTelegramSignal(value: string): boolean {
  return /\b(tg|telegram)\b/.test(value) || matches(value, ["电报", "飞机号", "飞机账号", "飞机成品", "telegram 星星"]);
}

function isTelegramLanguagePack(value: string): boolean {
  return hasTelegramSignal(value) && matches(value, ["中文包", "语言包", "汉化包", "官方中文包"]);
}

function hasTelegramRegionAccountSignal(value: string): boolean {
  if (
    matches(value, [
      "esim",
      "e sim",
      "电子卡",
      "实体卡",
      "电话卡",
      "手机卡",
      "sim 卡",
      "手机号",
      "号码",
      "接码",
      "upi",
      "邮箱",
      "mail",
      "hotmail",
      "outlook",
      "gcp",
      "apple id",
      "appid",
      "app id",
      "id 独享",
      "id账号",
      "id 账号",
    ])
  ) {
    return false;
  }

  if (isKnownNonTelegramPlatformAccount(value)) return false;

  const hasRegion = /(?:^|[^0-9])(?:\+|➕)1(?:[^0-9]|$)|(?:\+|➕)91|区号91/.test(value);
  if (!hasRegion) return false;

  return matches(value, ["成品号", "账号", "账户", "老号", "白号", "精养", "高权重", "抗风控", "满月", "新号"]);
}

function isTelegramPremiumProduct(value: string, contextValue = ""): boolean {
  if (isTelegramContactOnly(value)) return false;
  if (matches(value, ["飞机大厨", "airplane chefs"])) return false;
  if (hasTelegramStarsSignal(value)) return true;

  const hasTelegram = hasTelegramSignal(value) || Boolean(contextValue && hasTelegramSignal(contextValue));
  if (!hasTelegram) return false;

  return matches(value, [
    "telegram premium",
    "tg premium",
    "电报 premium",
    "telegram pro",
    "tg pro",
    "premium会员",
    "premium 会员",
    "会员代开",
    "会员兑换码",
    "会员 3个月",
    "会员 6个月",
    "会员 12个月",
    "用户名赠送会员",
    "电报三月会员",
    "电报六月会员",
    "电报一年会员",
    "三个月订阅",
    "六个月订阅",
    "一年订阅",
  ]);
}

function hasTelegramStarsSignal(value: string): boolean {
  return (hasTelegramSignal(value) && /星星|stars?/.test(value)) || matches(value, ["telegram stars", "telegram 星星", "星星兑换码", "星星代充"]);
}

function isNonTelegramAccountProduct(value: string): boolean {
  return matches(value, [
    "linkedin",
    "领英",
    "instagram",
    "tiktok",
    "tik tok",
    "facebook",
    "figma",
    "whatsapp",
    "line账号",
    "全地区tiktok",
  ]);
}

function isKnownNonTelegramPlatformAccount(value: string): boolean {
  return matches(value, [
    "chatgpt",
    "openai",
    "gpt",
    "claude",
    "gemini",
    "google",
    "gmail",
    "icloud",
    "apple",
    "grok",
    "cursor",
    "kiro",
    "windsurf",
    "perplexity",
    "suno",
    "midjourney",
    "discord",
    "github",
    "spotify",
    "netflix",
    "youtube",
  ]);
}

function isTelegramContactOnly(value: string): boolean {
  if (!matches(value, ["tg客服", "tg 客服", "telegram客服", "telegram 客服", "联系tg", "联系 tg", "联系telegram", "联系 telegram"])) {
    return false;
  }

  return !matches(value, ["telegram账号", "telegram 账号", "tg账号", "tg 账号", "电报账号", "飞机号", "成品号"]);
}

function isXTwitterAccount(value: string): boolean {
  if (!hasXTwitterSignal(value)) return false;
  if (matches(value, ["twitter", "推特", "x 推特", "x/twitter", "x-twitter"])) return true;
  if (isClaudeProduct(value) || isGeminiProduct(value) || isGrokProduct(value) || isChatGptProduct(value)) return false;

  return true;
}

function hasXTwitterSignal(value: string): boolean {
  if (matches(value, ["twitter", "推特", "x premium", "x账号", "x 账号", "x 推特", "x/twitter", "x-twitter"])) {
    return true;
  }

  return /\bx\s*(premium|account|账号|会员|推特)\b/.test(value);
}

function isXTwitterPremiumProduct(value: string): boolean {
  if (!hasXTwitterSignal(value)) return false;

  return matches(value, [
    "x premium",
    "twitter premium",
    "推特 premium",
    "premium+",
    "premium plus",
    "推特会员",
    "x 会员",
    "蓝标",
    "蓝v",
    "蓝 v",
    "会员直充",
    "会员代开",
    "会员卡密",
    "月卡",
    "年卡",
    "年度会员",
    "自助卡密",
    "激活码",
    "cdk",
    "ios充值",
    "ios 充值",
  ]);
}

function isXTwitterEngagementService(value: string): boolean {
  if (!hasXTwitterSignal(value)) return false;
  if (isXTwitterPremiumProduct(value)) return false;
  if (matches(value, ["账号", "账户", "老号", "新号", "三绑", "双绑", "2fa", "token", "登录", "登陆", "邮箱绑定", "手机验证"])) {
    return false;
  }

  return matches(value, ["涨粉", "粉丝", "关注", "转发", "点赞", "评论", "浏览", "互动"]);
}

function isXTwitterAccountWithLoginBundle(value: string): boolean {
  if (!isXTwitterAccount(value)) return false;

  return matches(value, ["账号", "账户", "三绑", "token", "登录", "登陆", "2fa", "premium", "会员", "hotmail邮箱可用"]);
}

function isAppleIdAccount(value: string): boolean {
  if (matches(value, ["apple id", "appleid", "苹果 id", "苹果id", "苹果账号", "apple 账号"])) return true;
  if (matches(value, ["美区id", "美区 id", "土区id", "土区 id", "日区id", "日区 id", "港区id", "港区 id", "外区id", "外区 id"])) return true;
  if (
    /(?:台湾|香港|菲律宾|美国|日本|韩国|土耳其|土区|美区|日区|港区|台区|菲区|外区)\s*id/.test(value) &&
    matches(value, ["icloud", "icoud", "app", "账号", "账户", "独享", "老号", "成品", "可转区"])
  ) {
    return true;
  }

  return matches(value, ["id"]) && matches(value, ["苹果", "apple"]) && matches(value, ["账号", "账户", "成品号", "地区"]);
}

function isNegatedPlus(value: string): boolean {
  if (/不是\s*plus\s*的/.test(value)) return false;
  return matches(value, ["非plus", "非 plus", "不是plus", "不是 plus", "不含plus", "不含 plus", "无plus", "无 plus"]);
}

function isApiProduct(value: string): boolean {
  if (isCodexPhoneVerification(value)) return false;
  if (isChatGptPeripheralService(value)) return false;
  if (isGooglePlayOrPixelRechargeProduct(value)) return false;

  if (hasExplicitApiProductSignal(value)) return true;

  if (isChatGptAccountOrSubscriptionDominant(value)) return false;
  if (isChatGptTeam(value)) return false;
  if (isClaudeProduct(value) && matches(value, ["team", "席位", "标准席位", "高级席位", "1.25x", "1.25倍", "6.25x", "6.25倍"])) return false;
  if (matches(value, ["gemini pro", "google ai pro"]) && matches(value, ["一年", "订阅", "cdk"])) return false;

  if (isChatGptTransitOrApiCreditProduct(value)) return true;
  if (isKiroApiCreditProduct(value)) return true;
  if (isModelApiCreditProduct(value)) return true;
  if (isModelPoolCreditProduct(value)) return true;
  if (isClaudeCodeCreditProduct(value)) return true;
  if (matches(value, ["额度"]) && matches(value, ["claude", "gemini", "gpt", "codex", "openai", "ai 平台"])) return true;

  return false;
}

function hasExplicitApiProductSignal(value: string): boolean {
  if (matches(value, ["apikey", "api key", "api-key"])) return true;
  if (matches(value, ["claude/gpt/gemini中转站", "中转余额", "中转 gpt", "api中转", "api 中转"])) return true;
  if (
    matches(value, ["中转"]) &&
    (matches(value, ["号池", "余额", "api", "额度"]) || hasMoneyAmount(value)) &&
    !hasAccountOrSubscriptionDeliverySignal(value)
  ) {
    return true;
  }
  if (matches(value, ["中转站"]) && !hasAccountOrSubscriptionDeliverySignal(value)) return true;
  if (matches(value, ["号池"]) && (matches(value, ["api", "codex", "额度", "余额", "中转"]) || hasMoneyAmount(value))) return true;
  if (
    /(?:总共|共)\s*\d+\s*(?:刀|美元|美金)/.test(value) &&
    matches(value, ["plus渠道", "plus 渠道", "plus号池", "plus 号池", "老plus渠道", "老 plus 渠道", "30天有效期"])
  ) {
    return true;
  }
  if (matches(value, ["中转api", "中转 api"])) return true;
  if (matches(value, ["兑换码"]) && matches(value, ["api", "额度", "100刀", "200刀", "300刀", "1000刀", "2100刀", "官方1:1"])) return true;
  if (matches(value, ["codexapi", "codex api", "codex 授权", "codex 授權"])) return true;
  if (matches(value, ["gpt api", "openai api", "geminiapi", "gemini api"])) return true;
  if (matches(value, ["api 额度", "api额度", "api 100刀", "api 50刀", "api 300刀"])) return true;
  if (matches(value, ["余额兑换", "余额 兑换", "倍率"])) return true;
  if (matches(value, ["余额充值", "充值余额", "美元额度", "美金额度", "刀额度"])) return true;

  return false;
}

function isKiroApiCreditProduct(value: string): boolean {
  if (!matches(value, ["kiro"])) return false;
  if (matches(value, ["注册机", "生成器", "源码"])) return false;

  if (matches(value, ["号池"])) return true;
  if (matches(value, ["claude code"]) && hasMoneyAmount(value)) return true;
  if (matches(value, ["刀额度", "美元额度", "美金额度"])) return true;

  return /(?:\d+\s*(?:刀|美元|美金)|\d+\s*\$)\s*额度/.test(value);
}

function hasAccountOrSubscriptionDeliverySignal(value: string): boolean {
  return matches(value, [
    "成品号",
    "库存号",
    "账号",
    "账户",
    "账密",
    "首登",
    "直登",
    "质保首登",
    "老邮箱",
    "已验证",
    "月卡",
    "年卡",
    "会员",
    "订阅",
    "直充",
    "代充",
    "卡密",
    "自助开通",
    "自动发货",
    "接码",
    "带rt",
    "带 rt",
    "导入中转站",
    "直接导入",
  ]);
}

function isCodexPhoneVerification(value: string): boolean {
  if (!matches(value, ["codex"])) return false;
  if (isAiSubscriptionOrAccountTitle(value)) return false;
  if (hasAccountBundleSignal(value)) return false;
  return matches(value, ["接码", "接🦆", "接鸭", "验证码", "短信", "手机号", "手机", "号码", "2fa", "二验", "验证"]);
}

function isGooglePlayOrPixelRechargeProduct(value: string): boolean {
  const hasGoogleOrPixel = matches(value, ["pixel", "google", "谷歌", "play", "google play"]);
  if (!hasGoogleOrPixel) return false;
  if (hasExplicitNonGeminiProductSignal(value)) return false;
  return matches(value, ["cdk", "cdkey", "兑换", "充值", "礼品卡", "提取链接", "优惠链接", "绑卡"]);
}

function hasExplicitNonGeminiProductSignal(value: string): boolean {
  if (isClaudeProduct(value)) return true;
  if (isGrokProduct(value)) return true;
  if (isChatGptProduct(value)) return true;

  return false;
}

function isChatGptTransitOrApiCreditProduct(value: string): boolean {
  if (!matches(value, ["chatgpt", "gpt", "openai", "codex", "plus"])) return false;

  if (
    matches(value, ["倍率"]) &&
    matches(value, ["plus", "pro", "gpt", "chatgpt", "openai", "codex"]) &&
    /(?:\d+\s*(?:刀|美元|美金)|\d+\s*\$)/.test(value)
  ) {
    return true;
  }

  if (
    matches(value, ["中转api", "中转 api", "api中转", "api 中转", "中转余额", "中转站额度"]) ||
    /(api|codex)\s*(\d+\s*)?(刀|美元|美金).*(额度|余额|兑换码|刀卡)/.test(value)
  ) {
    return true;
  }

  if (matches(value, ["号池"]) && matches(value, ["api", "codex", "额度", "余额", "刀", "美元", "美金", "中转"])) {
    return true;
  }

  if (
    /(?:总共|共)\s*\d+\s*(?:刀|美元|美金)/.test(value) &&
    matches(value, ["plus渠道", "plus 渠道", "plus号池", "plus 号池", "老plus渠道", "老 plus 渠道", "30天有效期"])
  ) {
    return true;
  }

  return false;
}

function isModelPoolCreditProduct(value: string): boolean {
  if (!matches(value, ["池", "号池", "pool"])) return false;
  if (!matches(value, ["claude", "gemini", "gpt", "chatgpt", "codex", "openai"])) return false;
  if (matches(value, ["team", "团队", "席位", "seat"])) return false;

  if (
    isClaudeProduct(value) &&
    matches(value, ["max", "pro"]) &&
    !matches(value, ["月卡", "月会员", "年卡", "订阅", "成品号", "账号", "直充", "代充"])
  ) {
    return true;
  }

  const hasStrongCreditSignal = matches(value, ["额度", "中转", "api", "刀", "美元", "美金", "余额"]);
  if (hasStrongCreditSignal) return true;

  if (matches(value, ["月会员", "会员兑换码", "月卡", "年卡", "订阅"])) return false;

  return matches(value, ["兑换码", "token"]);
}

function isClaudeCodeCreditProduct(value: string): boolean {
  if (!matches(value, ["claude code"])) return false;

  return matches(value, ["每天", "有效期", "额度", "不限量额度"]) && hasMoneyAmount(value);
}

function isModelApiCreditProduct(value: string): boolean {
  if (!matches(value, ["codex api", "openai api", "chatgpt api", "gpt api"])) return false;
  if (matches(value, ["余额兑换码", "余额 兑换码", "兑换码", "额度", "刀卡", "美元额度", "美金额度"])) return true;

  return /\d+\s*\$\s*余额/.test(value) || /\d+\s*\$\s*余额兑换码/.test(value);
}

function hasMoneyAmount(value: string): boolean {
  return matches(value, ["刀", "美元", "美金"]) || /\d+\s*\$/.test(value);
}

function isVirtualCardProduct(value: string): boolean {
  if (matches(value, ["paypal接码", "paypal 接码"])) return false;

  if (matches(value, ["visa", "mastercard", "虚拟卡", "虚拟信用卡", "bin 卡", "485954", "美国虚拟卡", "paypal 美国虚拟卡"])) {
    return true;
  }

  if (isZeroOrOneDollarCard(value)) return true;

  return matches(value, ["美国卡", "卡头"]) && !matches(value, ["chatgpt", "claude", "gemini", "grok"]);
}

function isZeroOrOneDollarCard(value: string): boolean {
  return /(^|[^\d])[01]\s*刀\s*卡(?!\d)/.test(value);
}

function isPureEmail(value: string): boolean {
  const explicitEmail = isICloudPureEmailProduct(value) || matches(value, [
    "gmail",
    "icloud邮箱",
    "icloud 邮箱",
    "icoud邮箱",
    "icoud 邮箱",
    "谷歌邮箱",
    "google 邮箱",
    "google邮箱",
    "google个人邮箱",
    "google 个人邮箱",
    "谷歌账号",
    "google 账号",
    "hotmail",
    "outlook",
    "微软邮箱",
    "microsoft 邮箱",
    "教育邮箱",
    "edu 邮箱",
    "学校邮箱",
    "域名邮箱",
    "企业邮箱",
    "邮箱账号",
    ".edu",
  ]);
  if (!explicitEmail) return false;
  if (isEmailOnlyForAiAccountSetup(value)) return true;
  if (isICloudBackedAiAccountProduct(value)) return false;
  if (isEmailBackedAiAccountProduct(value)) return false;
  if (matches(value, ["跑gemini", "跑 gemini", "失败的号", "包gcp", "带gcp"])) return true;
  if (
    matches(value, [
      "plus 成品",
      "plus成品",
      "plus 独享成品",
      "plus独享成品",
      "plus 会员",
      "plus会员",
      "plus 账号",
      "plus账号",
      "plus 已接码",
      "plus已接码",
      "直接登录codex",
    ]) &&
    !isICloudStandaloneEmailProduct(value)
  ) {
    return false;
  }

  return !matches(value, [
    "chatgpt",
    "gpt free",
    "gpt 普号",
    "gpt 白号",
    "gpt 普通",
    "gpt plus",
    "openai 普号",
    "claude",
    "gemini pro",
    "gemini ultra",
    "grok",
    "gpt 账号",
    "gpt账号",
    "gpt 白号",
    "gpt白号",
    "gpt专用",
    "gpt 专用",
    "gptplus",
  ]);
}

function isEmailBackedAiAccountProduct(value: string): boolean {
  if (!hasEmailSignal(value)) return false;
  if (isICloudStandaloneEmailProduct(value)) return false;
  if (isEmailOnlyForAiAccountSetup(value)) return false;

  const hasChatGptSignal = matches(value, ["chatgpt", "gpt", "openai", "codex"]);
  if (isChatGptTeamDominant(value)) return true;
  if (isChatGptPlus(value)) return true;
  if (hasChatGptSignal && isExplicitEmailBackedChatGptFreeAccount(value)) return true;
  if (hasChatGptSignal && isChatGptAccountTitle(value)) return true;

  if (!hasChatGptSignal) return false;
  if (matches(value, ["注册gpt专用", "注册 gpt 专用", "适用于gpt", "适用于 gpt", "接收邮件", "可开gpt", "可开 gpt", "可开chatgpt", "可开 chatgpt", "可注册gpt", "可注册 gpt"])) return false;

  return matches(value, [
    "成品号",
    "成品账号",
    "成品",
    "账号",
    "账户",
    "账密",
    "rt",
    "凭证",
    "json",
    "cpa",
    "反代",
    "sub2api",
    "access token",
    "access_token",
    "质保首登",
    "首登",
    "未接码",
    "已接码",
    "at发货",
  ]);
}

function isEmailOnlyForAiAccountSetup(value: string): boolean {
  if (!hasEmailSignal(value)) return false;
  if (!matches(value, ["plus", "chatgpt", "gpt", "openai"])) return false;

  const setupUsageSignal = matches(value, [
    "配合plus",
    "配合 plus",
    "plus自助充值使用",
    "plus 自助充值使用",
    "plus使用",
    "plus 使用",
    "自助充值使用",
    "充值使用",
    "注册gpt专用",
    "注册 gpt 专用",
    "适用于gpt",
    "适用于 gpt",
    "可开gpt",
    "可开 gpt",
    "可注册gpt",
    "可注册 gpt",
  ]);
  if (!setupUsageSignal) return false;

  return !matches(value, [
    "plus 成品",
    "plus成品",
    "plus 独享成品",
    "plus独享成品",
    "plus 会员",
    "plus会员",
    "plus 账号",
    "plus账号",
    "成品号",
    "成品账号",
    "成品会员",
    "独享账号",
    "独享成品",
    "会员",
    "月卡",
    "年卡",
    "订阅",
    "首登",
    "直登",
    "账密",
    "rt",
    "凭证",
    "json",
    "cpa",
    "直充",
    "代充",
    "卡密",
    "自助开通",
    "自动发货",
  ]);
}

function isExplicitEmailBackedChatGptFreeAccount(value: string): boolean {
  if (matches(value, ["free", "普号", "白号", "普通号", "普通账号", "空白账号"])) return true;

  return matches(value, ["rt", "access token", "access_token", "token", "已绑定手机", "已绑手机", "手机已验证"]) &&
    matches(value, ["chatgpt", "gpt", "openai", "codex"]);
}

function classifyPureEmail(value: string): string {
  if (matches(value, ["教育邮箱", "edu 邮箱", "学校邮箱", ".edu"])) return "education-email";
  if (matches(value, ["outlook", "hotmail", "微软邮箱", "microsoft 邮箱", "oauth2", "graph"])) return "outlook-account";
  if (matches(value, ["gmail", "谷歌邮箱", "google 邮箱", "google邮箱", "google个人邮箱", "google 个人邮箱", "谷歌账号", "google 账号"])) return "gmail-account";
  if (isICloudPureEmailProduct(value)) return "icloud-email";

  return "email-account";
}

function isICloudStandaloneEmailProduct(value: string): boolean {
  if (!matches(value, ["icloud", "icloud邮箱", "icloud 邮箱", "icoud", "icoud邮箱", "icoud 邮箱"])) return false;

  return matches(value, ["隐私邮箱", "发货形式为邮箱", "开plus", "开 plus", "绑定专用", "取码url", "取码 url", "plus源头", "plus 源头"]);
}

function isICloudPureEmailProduct(value: string): boolean {
  if (!matches(value, ["icloud", "icoud", "icloud邮箱", "icloud 邮箱", "icoud邮箱", "icoud 邮箱"])) return false;
  if (isAppleIdAccount(value)) return false;
  if (isICloudBackedAiAccountProduct(value)) return false;

  return matches(value, [
    "icloud邮箱",
    "icloud 邮箱",
    "icoud邮箱",
    "icoud 邮箱",
    "icloud隐私邮箱",
    "icloud 隐私邮箱",
    "icoud隐私邮箱",
    "icoud 隐私邮箱",
    "隐私邮箱",
    "母号",
    "子号",
    "子邮箱",
    "取码url",
    "取码 url",
    "取码链接",
    "发货形式为邮箱",
    "绑定专用",
  ]);
}

function isICloudBackedAiAccountProduct(value: string): boolean {
  if (!matches(value, ["icloud", "icoud", "icloud邮箱", "icloud 邮箱", "icoud邮箱", "icoud 邮箱"])) return false;
  if (isICloudStandaloneEmailProduct(value)) return false;
  if (!matches(value, ["chatgpt", "gpt", "openai", "codex", "gptplus", "gpt plus", "plus"])) return false;

  return matches(value, [
    "成品号",
    "成品账号",
    "成品",
    "账号",
    "账户",
    "月卡",
    "会员",
    "rt",
    "凭证",
    "质保首登",
    "未接码",
    "已接码",
    "2fa",
    "稳定成品",
    "发货格式",
  ]);
}

function isChatGptPeripheralService(value: string): boolean {
  const hasPaymentLinkExtractionSignal = isChatGptPaymentLinkExtractionService(value);
  if (!hasPaymentLinkExtractionSignal && !matches(value, ["codex", "chatgpt", "gpt", "openai", "plus"])) return false;
  if (hasPaymentLinkExtractionSignal) {
    if (isCodexPhoneVerification(value)) return false;
    if (matches(value, ["成品号", "账号", "账户", "账密", "月卡", "会员", "直充", "代充"])) return false;

    return true;
  }

  const hasPeripheralSignal =
    matches(value, ["重置额度", "额度重置", "刷新额度", "恢复额度"]) ||
    (matches(value, ["重置"]) && matches(value, ["plus", "pro", "额度"])) ||
    matches(value, ["长链提取", "长链接提取", "链接提取", "提取服务", "提取服务包", "长链服务包"]) ||
    (matches(value, ["服务包"]) && matches(value, ["长链", "提取", "codex", "chatgpt", "gpt", "plus"]));
  if (!hasPeripheralSignal) return false;
  if (isCodexPhoneVerification(value)) return false;
  if (isApiProductCoreSignal(value)) return false;
  if (matches(value, ["成品号", "账号", "账户", "账密", "月卡", "会员", "直充", "代充", "卡密", "cdk"])) {
    return false;
  }

  return true;
}

function isChatGptPaymentLinkExtractionService(value: string): boolean {
  const hasPaymentMethodSignal = matches(value, ["upi", "ideal", "i deal", "ide al", "paypal", "荷兰渠道"]);
  const hasChatGptSubscriptionSignal = matches(value, ["chatgpt", "gpt", "openai", "plus"]);
  if (!hasPaymentMethodSignal && !hasChatGptSubscriptionSignal) return false;

  return matches(value, [
    "提链",
    "扫码对接",
    "提取upi支付二维码",
    "提取 upi 支付二维码",
    "提取支付二维码",
    "支付二维码",
    "二维码生成率",
    "支付链接",
    "提链服务",
  ]);
}

function isApiProductCoreSignal(value: string): boolean {
  return matches(value, [
    "apikey",
    "api key",
    "api-key",
    "codex api",
    "openai api",
    "chatgpt api",
    "gpt api",
    "中转api",
    "中转 api",
    "api中转",
    "api 中转",
    "中转余额",
    "中转站额度",
    "余额兑换码",
    "api 额度",
    "api额度",
    "api 100刀",
    "api 50刀",
    "api 300刀",
  ]);
}

function isClaudeProduct(value: string): boolean {
  return matches(value, ["claude", "克劳德"]);
}

function isClaudeMax20Product(value: string): boolean {
  if (matches(value, ["chatgpt", "gpt", "openai", "gemini", "grok"])) return false;
  const hasClaudeSignal = isClaudeProduct(value);
  const hasMaxSignal = matches(value, ["max"]);
  if (!hasClaudeSignal && !hasMaxSignal) return false;

  if (matches(value, ["max20", "max 20", "20x", "x20", "20倍", "20 max", "20x max", "20xmax"])) return true;
  return hasMaxSignal && /(?:max.*200|200\s*(?:usd|刀|美金|美元|订阅))/.test(value);
}

function isClaudeMax5Product(value: string): boolean {
  if (matches(value, ["chatgpt", "gpt", "openai", "gemini", "grok"])) return false;
  const hasClaudeSignal = isClaudeProduct(value);
  const hasMaxSignal = matches(value, ["max"]);
  if (!hasClaudeSignal && !hasMaxSignal) return false;
  if (isClaudeMax20Product(value)) return false;

  if (matches(value, ["max5", "max 5", "5x", "x5", "5倍", "5 max", "5x max", "5xmax"])) return true;
  return hasMaxSignal && /(?:max.*100|100\s*(?:usd|刀|美金|美元|订阅))/.test(value);
}

function isClaudeTeamProduct(value: string): boolean {
  return isClaudeProduct(value) && matches(value, ["team", "团队", "席位", "seat"]);
}

function isClaudeTeamPremium(value: string): boolean {
  if (!isClaudeProduct(value)) return false;

  const hasPremiumSignal = matches(value, [
    "premium",
    "高级席位",
    "高级",
    "6.25x",
    "6.25 x",
    "6.25倍",
    "6.25 倍",
  ]);

  if (!hasPremiumSignal) return false;
  return isClaudeTeamProduct(value) || matches(value, ["6.25x", "6.25 x", "6.25倍", "6.25 倍"]);
}

function isClaudeTeamStandard(value: string): boolean {
  if (!isClaudeTeamProduct(value)) return false;
  if (isClaudeTeamPremium(value)) return false;

  return matches(value, ["team", "团队", "席位", "seat", "standard", "标准", "1.25x", "1.25 x", "1.25倍", "1.25 倍"]);
}

function isGeminiProduct(value: string): boolean {
  if (matches(value, ["失败的号", "失败号", "跑gemini pro 失败", "跑 gemini pro 失败"])) return false;

  if (matches(value, ["gcp", "反重力"]) && matches(value, ["pro12个月", "pro 12个月", "12个月", "一年"])) {
    return true;
  }

  return matches(value, ["gemini", "google ai", "ai ultra"]) || (matches(value, ["pixel"]) && matches(value, ["pro", "订阅"]));
}

function isGeminiUltraProduct(value: string): boolean {
  if (isGeminiProUltraMixedTitle(value)) return false;
  if (matches(value, ["google ai ultra", "gemini ultra", "ai ultra", "企业 ultra", "企业ultra"])) return true;
  if (matches(value, ["250美元", "250 美元", "250美金", "250 美金", "250刀", "45k", "25k"]) && matches(value, ["gemini", "google ai", "ultra", "flow"])) return true;

  return matches(value, ["flow"]) && matches(value, ["gemini", "google ai", "ultra"]);
}

function isGeminiProUltraMixedTitle(value: string): boolean {
  return matches(value, ["pro ultra", "pro uitra", "ai pro ultra", "ai pro uitra", "gemini ai pro ultra", "gemini ai pro uitra"]);
}

function isGeminiProRecharge(value: string): boolean {
  if (!isGeminiProduct(value)) return false;
  if (isGeminiUltraProduct(value)) return false;

  const hasRechargeSignal = matches(value, [
    "自助充值",
    "自助开通",
    "充值",
    "代充",
    "直充",
    "开通",
    "cdk",
    "卡密",
    "兑换码",
    "优惠链接",
    "提取",
    "激活链接",
    "激活码",
    "一次卡",
    "绑卡",
    "订阅",
    "充自己号",
    "自备账号",
    "自己号",
  ]);

  if (!hasRechargeSignal) return false;

  if (isGeminiProAccount(value) && !isGeminiSelfAccountRecharge(value)) {
    return false;
  }

  return true;
}

function isGeminiSelfAccountRecharge(value: string): boolean {
  return matches(value, [
    "自备账号",
    "自备 账号",
    "自己号",
    "自己的号",
    "充自己号",
    "给自己号",
    "自助充值",
    "自助开通",
    "代充",
    "直充",
    "cdk",
    "优惠链接",
    "提取",
    "激活链接",
    "一次卡",
    "绑卡",
  ]);
}

function isGeminiProAccount(value: string): boolean {
  return matches(value, [
    "成品号",
    "成品",
    "账号",
    "账户",
    "个人账号",
    "邮箱",
    "gmail",
    "google 账号",
    "谷歌账号",
    "pixel",
    "首登",
    "直登",
    "独享",
    "家庭组",
    "随机地区",
    "美区",
    "老邮箱",
    "老号",
    "带2fa",
    "带 2fa",
    "长效接码",
  ]);
}

function isGrokProduct(value: string): boolean {
  return matches(value, ["grok", "supergrok"]);
}

function isGrokHeavyProduct(value: string): boolean {
  if (!isGrokProduct(value)) return false;
  if (matches(value, ["非heavy", "非 heavy", "不是heavy", "不是 heavy", "不含heavy", "不含 heavy", "not heavy"])) return false;

  return matches(value, ["heavy", "grok heavy", "heavy grok", "grok super heavy", "super grok heavy", "supergrok heavy"]);
}

function isSuperGrokBundleProduct(value: string): boolean {
  if (!isGrokProduct(value)) return false;
  if (isGrokHeavyProduct(value)) return false;
  if (matches(value, ["非 super grok", "非supergrok", "不是 super grok", "不是supergrok", "不含 super grok", "不含supergrok"])) return false;

  return matches(value, [
    "super grok",
    "supergrok",
    "grok super",
    "自带super grok",
    "自带 super grok",
    "带supergrok",
    "带 supergrok",
    "带super grok",
    "带 super grok",
    "赠送super grok",
    "赠送 super grok",
    "x premium super grok",
    "x premium supergrok",
    "x premium+ super grok",
    "x premium+ supergrok",
  ]);
}

function isGrokFitForSuperInfrastructure(value: string): boolean {
  if (!isGrokProduct(value)) return false;
  if (matches(value, ["super grok", "supergrok", "3天", "三天", "7天", "七天", "月卡", "月会员", "会员号"])) return false;
  if (!matches(value, ["适合super", "适合 super", "取邮件api", "取邮件 api", "长效微软邮箱", "账号 sso"])) return false;

  return matches(value, ["普号", "free", "sso", "邮箱", "取邮件"]);
}

function isKiroProProduct(value: string): boolean {
  if (!matches(value, ["kiro"])) return false;
  if (
    matches(value, ["普号", "free", "固定50", "50额度", "kirors", "kiro rs"]) &&
    !matches(value, ["kiro pro", "kiro pro+", "power", "promax", "1000", "2000", "5000", "1w", "10000", "100刀", "200刀", "500刀", "100$", "200$", "500$"])
  ) {
    return false;
  }

  return matches(value, [
    "kiro pro",
    "kiro pro+",
    "kiro pro max",
    "kiro promax",
    "pro+",
    "promax",
    "power",
    "积分",
    "额度号",
    "额度",
    "可超额",
    "1000",
    "2000",
    "5000",
    "1w",
    "10000",
    "100刀",
    "200刀",
    "500刀",
    "100$",
    "200$",
    "500$",
  ]);
}

function isChatGptProduct(value: string): boolean {
  if (matches(value, ["gemini", "claude", "grok"])) return false;
  if (matches(value, ["steam"])) return false;
  if (isChatGptPro20(value) || isChatGptPro5(value)) return true;
  if (isChatGptGoProduct(value)) return true;
  if (isLikelyChatGptFreeAccountTitle(value)) return true;
  return matches(value, ["chatgpt", "gpt", "openai", "codex", "plus", "team", "business", "t5", "k12"]);
}

function isAiSubscriptionOrAccountTitle(value: string): boolean {
  if (!matches(value, ["chatgpt", "gpt", "openai", "codex", "claude", "gemini", "grok", "plus", "team", "business"])) {
    return false;
  }

  return matches(value, [
    "plus",
    "pro",
    "team",
    "business",
    "free",
    "普号",
    "白号",
    "普通号",
    "普通账号",
    "成品号",
    "账号",
    "兑换号",
    "cdk",
    "直充",
    "充值",
    "卡密",
    "月卡",
    "会员",
  ]);
}

function isChatGptFreeAccount(value: string): boolean {
  if (isLikelyChatGptFreeAccountTitle(value)) return true;

  if (matches(value, ["free", "普号", "白号", "普通号", "普通账号", "空白账号"])) {
    return true;
  }

  return matches(value, ["长效"]) && !matches(value, ["plus", "pro", "team", "business"]);
}

function isLikelyChatGptFreeAccountTitle(value: string): boolean {
  if (!matches(value, ["free", "普号", "普通号", "普通账号", "白号"])) return false;
  if (matches(value, ["google", "gmail", "谷歌", "pixel", "tiktok", "tik tok", "facebook", "instagram", "telegram", "twitter", "推特", "steam", "苹果", "apple"])) return false;
  if (matches(value, ["chatgpt", "gpt", "openai", "codex"])) return true;

  return matches(value, ["rt", "json", "cpa", "sub2api", "已接码", "已经接码", "质保首登", "高额度", "高端", "优质", "成品号", "直登"]);
}

function isChatGptGoProduct(value: string): boolean {
  if (matches(value, ["opencode", "open code"])) return false;
  const hasChatGptSignal = matches(value, ["chatgpt", "gpt", "openai"]);
  const hasStandaloneGoSignal = /\bgo\b/.test(value) &&
    matches(value, ["月卡", "年卡", "直充", "充值", "激活", "会员", "订阅", "独享", "自助", "卡密", "成品号"]);
  if (!hasChatGptSignal && !hasStandaloneGoSignal) return false;
  if (matches(value, ["google", "gojek", "gopay"])) return false;

  return /\bgo\b/.test(value) || /\bgo(?=\d|月|年|直充|充值|激活|会员|订阅|独享)/.test(value);
}

function isAmbiguousPlusPackage(value: string): boolean {
  if (!matches(value, ["plus"])) return false;
  if (matches(value, [
    "chatgpt plus",
    "gpt plus",
    "plus 月卡",
    "plus 一个月",
    "plus 账号",
    "plus 成品号",
    "plus 日抛",
    "plus 直充",
    "plus 代充",
    "plus 卡密",
    "plus 自助",
    "网页版plus",
    "网页端",
    "icloud邮箱plus",
    "保首登",
    "福利号",
    "特价plus",
  ])) {
    return false;
  }

  if (/plus\s*\d+\s*(刀|美元|美金|万)/.test(value)) return true;
  if (/纯\s*plus/.test(value) && /\d+\s*(刀|美元|美金|万)/.test(value)) return true;
  if (matches(value, ["限时体验版本", "不限时"]) && value.includes("plus")) return true;

  return false;
}

function isChatGptPlus(value: string): boolean {
  if (isEmailOnlyForAiAccountSetup(value)) return false;
  const hasChatGptSignal = matches(value, ["chatgpt", "gpt", "openai"]);
  const hasPlusSignal = matches(value, ["plus"]);
  if (!hasChatGptSignal && !hasPlusSignal) return false;
  if (matches(value, ["pro"]) && !matches(value, ["plus"])) return false;
  if (matches(value, ["go", "go月卡", "go 年卡", "go-"])) return false;
  if (hasChatGptSignal && hasPlusSignal) return true;

  if (hasPlusSignal && !hasChatGptSignal) {
    return matches(value, [
      "plus 成品",
      "plus成品",
      "plus 独享成品",
      "plus独享成品",
      "plus 会员",
      "plus会员",
      "plus 账号",
      "plus账号",
      "plus 月卡",
      "plus月卡",
      "plus 一个月",
      "plus一个月",
      "plus 直充",
      "plus直充",
      "plus 代充",
      "plus代充",
      "plus 卡密",
      "plus卡密",
      "plus 自助",
      "plus自助",
      "gpt plus",
      "成品 plus",
      "成品号",
      "独享账号",
      "账号",
      "账密",
      "首登",
      "直登",
      "质保首登",
      "rt",
      "凭证",
      "已接码",
      "会员",
      "月卡",
      "订阅",
      "直充",
      "充值",
      "卡密",
      "cc 渠道",
      "谷歌正规付款",
    ]);
  }

  return matches(value, [
    "ios土区",
    "土区 ios",
    "土区",
    "自助卡密",
    "续费一个月",
    "一个月卡密",
    "一个月 成品号",
    "一个月",
    "月卡",
    "订阅",
    "直充",
    "充值",
    "卡密",
    "cc 渠道",
    "谷歌正规付款",
  ]);
}

function isChatGptPlusRecharge(value: string): boolean {
  if (!isChatGptPlus(value)) return false;
  if (isChatGptAccountTitle(value)) return false;
  if (matches(value, ["成品号", "独享账号", "账密", "首登", "直登", "普通号", "白号"])) return false;
  if (isChatGptPlusPixTrial(value)) return false;

  const hasTurkeyRegionSignal = hasChatGptPlusTurkeyRegionSignal(value);
  const hasRegionSignal = hasTurkeyRegionSignal || hasChatGptPlusRegionSignal(value);
  const hasAppleBillingSignal = matches(value, ["ios", "app store", "appstore", "内购", "苹果内购"]);
  const hasRechargeSignal = hasChatGptPlusRechargeSignal(value);

  if (matches(value, ["月卡批发"]) && matches(value, ["plus", "chatgpt", "gpt", "openai"])) return true;
  if (hasTurkeyRegionSignal && matches(value, ["plus", "chatgpt", "gpt", "openai"])) return true;
  if (hasRegionSignal && hasAppleBillingSignal && matches(value, ["plus", "chatgpt", "gpt", "openai"])) return true;
  if (hasRegionSignal && hasRechargeSignal && matches(value, ["plus", "chatgpt", "gpt", "openai"])) return true;

  return hasAppleBillingSignal && hasRechargeSignal && matches(value, ["plus", "chatgpt", "gpt", "openai"]);
}

function isChatGptPlusPixTrial(value: string): boolean {
  const trialSignals = [
    "试用",
    "新号",
    "老号",
    "不包二验",
    "未接码",
    "已接码",
    "首登",
    "质保48小时",
    "质保两天",
    "质保首登",
  ];

  if (matches(value, ["pix"])) {
    if (matches(value, ["巴西", "巴西渠道"])) return true;

    return matches(value, [
      ...trialSignals,
      "巴西老哥",
      "巴西渠道",
    ]);
  }

  return matches(value, ["巴西渠道"]) && matches(value, trialSignals);
}

function hasChatGptPlusTurkeyRegionSignal(value: string): boolean {
  return matches(value, [
    "ios土区",
    "土区 ios",
    "ios 土区",
    "土耳其",
    "土区",
    "土耳其区",
  ]);
}

function hasChatGptPlusRegionSignal(value: string): boolean {
  return matches(value, [
    "菲律宾",
    "菲律宾区",
    "菲区",
    "非区",
    "ph区",
    "ph 区",
    "巴西",
    "巴西区",
    "br区",
    "br 区",
    "埃及",
    "埃及区",
    "eg区",
    "eg 区",
    "巴基斯坦",
    "巴基斯坦区",
    "pk区",
    "pk 区",
    "加拿大",
    "加拿大区",
    "ca区",
    "ca 区",
    "日本",
    "日本区",
    "日区",
    "jp区",
    "jp 区",
    "越南",
    "越南区",
    "vn区",
    "vn 区",
    "韩国",
    "韩国区",
    "kr区",
    "kr 区",
    "尼日利亚",
    "尼区",
    "ng区",
    "ng 区",
    "美区",
    "美国区",
    "us区",
    "us 区",
  ]);
}

function hasChatGptPlusRechargeSignal(value: string): boolean {
  return matches(value, [
    "充值",
    "冲",
    "秒冲",
    "代充",
    "直充",
    "直冲",
    "续费",
    "卡密",
    "自助卡密",
    "月卡批发",
    "批发",
    "卡冲",
    "卡充",
    "卡付",
    "官方充值",
    "官方直充",
    "官网直冲",
    "官方代充",
    "官方渠道",
    "官方订阅",
    "正规充值",
    "正规官方",
    "正规卡付",
    "正规卡冲",
    "app store",
    "appstore",
    "内购",
    "苹果内购",
    "带账单",
    "正规账单",
    "渠道",
    "凭证",
    "可查",
    "充自己号",
    "自己的账号",
    "自备账号",
  ]);
}

function isChatGptAccountTitle(value: string): boolean {
  if (!matches(value, ["chatgpt", "gpt", "openai", "codex"])) return false;
  if (matches(value, ["plus", "pro", "team", "business", "t5"])) return false;

  return matches(value, ["成品号", "账号", "独享号", "直登", "日抛", "网页号", "半成品"]);
}

function isChatGptAccountOrSubscriptionDominant(value: string): boolean {
  if (!matches(value, ["chatgpt", "gpt", "openai", "plus"])) return false;
  if (matches(value, ["codex api", "api cdk", "api 额度", "api额度", "api中转", "api 中转", "充值余额", "余额充值", "中转余额", "美元额度", "美金额度", "刀额度"])) return false;

  return isChatGptPlus(value) || isChatGptPro20(value) || isChatGptPro5(value) || isChatGptFreeAccount(value) || isChatGptAccountTitle(value);
}

function isChatGptPro20(value: string): boolean {
  if (matches(value, ["gemini", "claude"])) return false;
  if (isPrimaryChatGptPro5Tier(value)) return false;
  if (isMixedChatGptProTier(value)) return false;

  return matches(value, ["pro", "gpt pro", "chatgpt pro"]) && hasChatGptPro20Signal(value);
}

function isChatGptPro5(value: string): boolean {
  if (matches(value, ["gemini", "claude"])) return false;
  if (isMixedChatGptProTier(value)) return false;

  return matches(value, ["pro", "gpt pro", "chatgpt pro"]) && hasChatGptPro5Signal(value);
}

function isMixedChatGptProTier(value: string): boolean {
  if (matches(value, ["gemini", "claude"])) return false;
  if (!matches(value, ["pro", "gpt pro", "chatgpt pro"])) return false;
  if (isPrimaryChatGptPro5Tier(value)) return false;

  return hasChatGptPro5Signal(value) && hasChatGptPro20Signal(value);
}

function isPrimaryChatGptPro5Tier(value: string): boolean {
  return /\b(?:chatgpt\s*)?(?:gpt\s*)?pro\s*5x\s*(?:月卡|套餐|官方|充值|卡充|直充|代充)/.test(value) ||
    /\b(?:chatgpt\s*)?(?:gpt\s*)?pro\s*5\s*倍\s*(?:月卡|套餐|官方|充值|卡充|直充|代充)/.test(value);
}

function hasChatGptPro20Signal(value: string): boolean {
  return matches(value, ["20x", "x20", "20倍", "200刀", "200 美元", "200美元", "200美金", "200 美金"]) ||
    /200\s*\$/.test(value) ||
    /\bpro\s*20\b/.test(value);
}

function hasChatGptPro5Signal(value: string): boolean {
  return matches(value, ["5x", "x5", "5倍", "100刀", "100 美元", "100美元", "100美金", "100 美金"]) ||
    /100\s*\$/.test(value) ||
    /\bpro\s*5\b/.test(value);
}

function isChatGptTeam(value: string): boolean {
  if (matches(value, ["gemini", "claude", "grok"])) return false;
  if (isChatGptTeamExclusion(value)) return false;

  return isChatGptTeamDominant(value) || matches(value, ["team", "t5", "t5倍", "k12"]);
}

function isChatGptTeamDominant(value: string): boolean {
  if (matches(value, ["gemini", "claude", "grok"])) return false;
  if (isChatGptTeamExclusion(value)) return false;
  if (isChatGptPlusCarpool(value)) return false;
  if (isChatGptPlusAccountWithParentEmail(value)) return false;

  return matches(value, [
    "gpt team",
    "chatgpt team",
    "k12",
    "k12 子号",
    "team bug",
    "bug team",
    "team子号",
    "team 子号",
    "team账号",
    "team 账号",
    "team成品",
    "team 成品",
    "team席位",
    "team 席位",
    "team反代",
    "team 反代",
    "team月卡",
    "team 月卡",
    "team rt",
    "team凭证",
    "team 凭证",
    "chatgpt business",
    "gpt business",
    "gptbusiness",
    "business(team)",
    "business team",
    "busisness team",
    "business子号",
    "business 子号",
    "团队",
    "母号",
    "自动拉",
    "直拉",
    "拼车位",
    "车位",
    "邀请",
    "团队号",
    "团队席位",
    "席位",
  ]);
}

function isChatGptPlusAccountWithParentEmail(value: string): boolean {
  if (!matches(value, ["plus"])) return false;
  if (!matches(value, ["成品号", "独享成品号", "独享成品"])) return false;
  if (!matches(value, ["母号邮箱", "母号 邮箱"])) return false;

  return matches(value, ["icloud", "gmail", "邮箱", "google", "outlook", "hotmail"]);
}

function isChatGptPlusCarpool(value: string): boolean {
  if (!matches(value, ["plus", "chatgpt plus", "gpt plus"])) return false;
  if (!matches(value, ["拼车"])) return false;

  return !matches(value, ["team", "business", "t5", "团队", "母号", "自动拉", "直拉"]);
}

function isChatGptTeamExclusion(value: string): boolean {
  return matches(value, [
    "有team不能冲",
    "有 team 不能冲",
    "非team",
    "非 team",
    "不是team",
    "不是 team",
    "无team",
    "无 team",
    "不含team",
    "不含 team",
    "要稳买我的team",
    "要稳买我的 team",
  ]);
}
