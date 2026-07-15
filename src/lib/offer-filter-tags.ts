export const OFFER_FILTER_TAG_GROUPS = {
  access: "交付方式",
  geminiRecharge: "Gemini 开通",
  plusChannel: "Plus 渠道",
  plusRecharge: "Plus 代充",
  proMax: "Pro/Max 形态",
  team: "Team 类型",
  duration: "时长",
  gemini: "Gemini 条件",
  proxy: "反代能力",
  telegramAccount: "Telegram 地区",
  telegramPremium: "Telegram 权益",
  verification: "接码时效",
  warranty: "质保",
} as const;

export type OfferFilterTagGroup = keyof typeof OFFER_FILTER_TAG_GROUPS;

export type OfferFilterTagId =
  | "shared_access"
  | "domestic_mirror_site"
  | "delivery_recharge"
  | "delivery_account"
  | "gemini_12_month_link"
  | "gemini_12_month_card_binding"
  | "gemini_18_month_link"
  | "chatgpt_plus_brazil_pix"
  | "chatgpt_plus_netherlands_ideal"
  | "chatgpt_plus_india_upi"
  | "chatgpt_plus_europe_channel"
  | "chatgpt_plus_recharge_ph_card"
  | "chatgpt_plus_recharge_us_ios"
  | "chatgpt_plus_recharge_official_direct"
  | "pro_max_official_recharge"
  | "pro_max_short_term"
  | "pro_max_us_ios"
  | "team_k12"
  | "team_bug"
  | "team_official"
  | "duration_trial"
  | "duration_month"
  | "duration_quarter"
  | "duration_half_year"
  | "duration_year"
  | "verification_single"
  | "verification_short"
  | "verification_long"
  | "verification_monthly"
  | "telegram_region_us"
  | "telegram_region_india"
  | "telegram_premium_quarter"
  | "telegram_premium_half_year"
  | "telegram_premium_year"
  | "telegram_stars"
  | "proxy_supported"
  | "gemini_antigravity_gcp"
  | "gemini_phone_required"
  | "gemini_appeal_required"
  | "warranty_long";

export type OfferFilterTagDefinition = {
  id: OfferFilterTagId;
  label: string;
  group: OfferFilterTagGroup;
  description: string;
};

export type OfferFilterTagFacet = OfferFilterTagDefinition & {
  count: number;
};

export const OFFER_FILTER_TAGS: OfferFilterTagDefinition[] = [
  {
    id: "shared_access",
    label: "拼车/团购",
    group: "access",
    description: "多人共享、几人车、拼车、团购、车位或合租类报价。",
  },
  {
    id: "domestic_mirror_site",
    label: "国内镜像站",
    group: "access",
    description: "国内镜像、网页镜像、镜像站或 mirror 方式访问的报价。",
  },
  {
    id: "delivery_recharge",
    label: "充值",
    group: "access",
    description: "充值、直充、代充、自助开通、卡密、CDK 或兑换码类报价。",
  },
  {
    id: "delivery_account",
    label: "成品号",
    group: "access",
    description: "交付成品号、账号、账密、独享号、首登或接码状态明确的报价。",
  },
  {
    id: "gemini_12_month_link",
    label: "12个月提链",
    group: "geminiRecharge",
    description: "Gemini Pro 12 个月优惠链接、提取链接或自行操作类报价。",
  },
  {
    id: "gemini_12_month_card_binding",
    label: "12个月含绑卡",
    group: "geminiRecharge",
    description: "Gemini Pro / Pixel 12 个月含绑卡、包绑卡或代开通完成型报价。",
  },
  {
    id: "gemini_18_month_link",
    label: "18个月链接",
    group: "geminiRecharge",
    description: "Gemini Pro 18 个月、Jio、Google One 兑换链接或激活链接报价。",
  },
  {
    id: "chatgpt_plus_brazil_pix",
    label: "巴西 Pix",
    group: "plusChannel",
    description: "ChatGPT Plus 低价订阅里的巴西 Pix 渠道报价。",
  },
  {
    id: "chatgpt_plus_netherlands_ideal",
    label: "荷兰 iDEAL",
    group: "plusChannel",
    description: "ChatGPT Plus 低价订阅里的荷兰 iDEAL 渠道报价。",
  },
  {
    id: "chatgpt_plus_india_upi",
    label: "印度 UPI",
    group: "plusChannel",
    description: "ChatGPT Plus 低价订阅里的印度 UPI 渠道报价。",
  },
  {
    id: "chatgpt_plus_europe_channel",
    label: "欧洲渠道",
    group: "plusChannel",
    description: "ChatGPT Plus 低价订阅里的欧洲、欧区或 AT 未接码渠道报价。",
  },
  {
    id: "chatgpt_plus_recharge_ph_card",
    label: "菲区卡充",
    group: "plusRecharge",
    description: "ChatGPT Plus 正价代充里的菲律宾、菲区卡充或卡冲渠道报价。",
  },
  {
    id: "chatgpt_plus_recharge_us_ios",
    label: "美区 iOS",
    group: "plusRecharge",
    description: "ChatGPT Plus 正价代充里的美区 iOS、App Store 或内购渠道报价。",
  },
  {
    id: "chatgpt_plus_recharge_official_direct",
    label: "官方直充",
    group: "plusRecharge",
    description: "ChatGPT Plus 正价代充里的官方充值、正价代充或正规直充报价。",
  },
  {
    id: "pro_max_official_recharge",
    label: "正价代充",
    group: "proMax",
    description: "ChatGPT Pro / Claude Max 里的正价、官方、正规直充、代充或续费报价。",
  },
  {
    id: "pro_max_short_term",
    label: "速刷/短期",
    group: "proMax",
    description: "ChatGPT Pro / Claude Max 里的速刷、短期、日抛、无质保或只保激活类报价。",
  },
  {
    id: "pro_max_us_ios",
    label: "iOS/美区",
    group: "proMax",
    description: "ChatGPT Pro 里的美区 iOS、App Store 或内购渠道报价。",
  },
  {
    id: "team_k12",
    label: "K12",
    group: "team",
    description: "ChatGPT Team / Business 里的 K12、K12 子号或 K12 渠道报价。",
  },
  {
    id: "team_bug",
    label: "Bug Team",
    group: "team",
    description: "ChatGPT Team / Business 里的 Bug Team、Team Bug 或 Bug 号报价。",
  },
  {
    id: "team_official",
    label: "正价/官方 Team",
    group: "team",
    description: "正规官方 Team、Business、48 个月权益、激活码或续费码报价。",
  },
  {
    id: "duration_trial",
    label: "短体验",
    group: "duration",
    description: "2-10 天、3 天号、周会员或短期体验类报价。",
  },
  {
    id: "duration_month",
    label: "月卡",
    group: "duration",
    description: "一个月、30 天、月卡或月会员报价。",
  },
  {
    id: "duration_quarter",
    label: "3个月",
    group: "duration",
    description: "三个月、3 个月或 90 天报价。",
  },
  {
    id: "duration_half_year",
    label: "6个月",
    group: "duration",
    description: "六个月、6 个月或 180 天报价。",
  },
  {
    id: "duration_year",
    label: "年卡",
    group: "duration",
    description: "一年、12 个月、365 天、年度或年卡报价。",
  },
  {
    id: "verification_single",
    label: "单次",
    group: "verification",
    description: "单次接码、一次性接码、1 次验证或单号接码。",
  },
  {
    id: "verification_short",
    label: "短效",
    group: "verification",
    description: "短效手机号、短期接码或短时可用号码。",
  },
  {
    id: "verification_long",
    label: "长效链接",
    group: "verification",
    description: "长效接码、原始接码链接、电话接码链接或可续接链接。",
  },
  {
    id: "verification_monthly",
    label: "月租/包月",
    group: "verification",
    description: "月租号码、包月接码、长期租号或 30 天接码服务。",
  },
  {
    id: "telegram_region_us",
    label: "美区 +1",
    group: "telegramAccount",
    description: "美国 +1、美区或美国号码 Telegram 账号。",
  },
  {
    id: "telegram_region_india",
    label: "印度 +91",
    group: "telegramAccount",
    description: "印度 +91 或区号 91 的 Telegram 账号。",
  },
  {
    id: "telegram_premium_quarter",
    label: "3个月",
    group: "telegramPremium",
    description: "Telegram Premium 3 个月、三个月会员、兑换码或代开。",
  },
  {
    id: "telegram_premium_half_year",
    label: "6个月",
    group: "telegramPremium",
    description: "Telegram Premium 6 个月、六个月会员、兑换码或代开。",
  },
  {
    id: "telegram_premium_year",
    label: "12个月",
    group: "telegramPremium",
    description: "Telegram Premium 12 个月、一年会员、兑换码或代开。",
  },
  {
    id: "telegram_stars",
    label: "星星/增值功能",
    group: "telegramPremium",
    description: "Telegram Stars、星星兑换码、星星代充或其他增值功能。",
  },
  {
    id: "proxy_supported",
    label: "可反代",
    group: "proxy",
    description: "支持反代、Codex、sub2、cpa、json 或 API 格式。",
  },
  {
    id: "gemini_antigravity_gcp",
    label: "包反重力/GCP",
    group: "gemini",
    description: "包 GCP、支持 GCP、包反重力、支持反重力或可用 CLI 的 Gemini 报价。",
  },
  {
    id: "gemini_phone_required",
    label: "需绑手机",
    group: "gemini",
    description: "需要绑定手机、手机号接码或长效接码的 Gemini 报价。",
  },
  {
    id: "gemini_appeal_required",
    label: "需申诉",
    group: "gemini",
    description: "首登需要申诉、需申诉、需注册或要求未注册手机号的 Gemini 报价。",
  },
  {
    id: "warranty_long",
    label: "长期质保",
    group: "warranty",
    description: "15 天以上、一个月、整月、包月或全程质保。",
  },
];

export const OFFER_FILTER_TAG_BY_ID = new Map<OfferFilterTagId, OfferFilterTagDefinition>(
  OFFER_FILTER_TAGS.map((tag) => [tag.id, tag]),
);

const OFFER_FILTER_TAG_IDS = new Set<string>(OFFER_FILTER_TAGS.map((tag) => tag.id));
const DURATION_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "duration_trial",
  "duration_month",
  "duration_quarter",
  "duration_half_year",
  "duration_year",
]);
const VERIFICATION_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "verification_single",
  "verification_short",
  "verification_long",
  "verification_monthly",
]);
const TELEGRAM_ACCOUNT_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "telegram_region_us",
  "telegram_region_india",
]);
const TELEGRAM_PREMIUM_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "telegram_premium_quarter",
  "telegram_premium_half_year",
  "telegram_premium_year",
  "telegram_stars",
]);
const GEMINI_PRO_ACCOUNT_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "gemini_antigravity_gcp",
  "gemini_phone_required",
  "gemini_appeal_required",
]);
const GEMINI_PRO_RECHARGE_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "gemini_12_month_link",
  "gemini_12_month_card_binding",
  "gemini_18_month_link",
]);
const CHATGPT_PLUS_CHANNEL_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "chatgpt_plus_brazil_pix",
  "chatgpt_plus_netherlands_ideal",
  "chatgpt_plus_india_upi",
  "chatgpt_plus_europe_channel",
]);
const CHATGPT_PLUS_RECHARGE_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "chatgpt_plus_recharge_ph_card",
  "chatgpt_plus_recharge_us_ios",
  "chatgpt_plus_recharge_official_direct",
]);
const PRO_MAX_RECHARGE_MODE_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "pro_max_official_recharge",
  "pro_max_short_term",
]);
const CHATGPT_PRO_CHANNEL_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "pro_max_us_ios",
]);
const CHATGPT_TEAM_FILTER_TAG_IDS = new Set<OfferFilterTagId>([
  "team_k12",
  "team_bug",
  "team_official",
]);
const AI_SUBSCRIPTION_RECHARGE_FILTER_PRODUCT_IDS = new Set<string>([
  "chatgpt-plus",
  "chatgpt-go",
  "chatgpt-pro-5x",
  "chatgpt-pro-20x",
  "claude-pro-month",
  "claude-team-standard",
  "claude-team-premium",
  "claude-max-5x",
  "claude-max-20x",
  "super-grok",
  "super-grok-heavy",
]);
const AI_SUBSCRIPTION_ACCOUNT_DELIVERY_FILTER_PRODUCT_IDS = new Set<string>([
  "chatgpt-plus",
  "chatgpt-go",
  "chatgpt-pro-5x",
  "chatgpt-pro-20x",
  "chatgpt-team-business",
  "claude-pro-month",
  "claude-team-standard",
  "claude-team-premium",
  "claude-max-5x",
  "claude-max-20x",
  "super-grok",
  "super-grok-heavy",
]);
const DURATION_FILTER_PRODUCT_IDS = new Set<string>([
  "grok-account",
  "super-grok",
  "super-grok-heavy",
  "x-twitter-premium",
]);
const VERIFICATION_FILTER_PRODUCT_IDS = new Set<string>([
  "openai-phone-verification",
  "google-phone-verification",
  "paypal-phone-verification",
  "phone-verification",
]);
const PRO_MAX_FILTER_PRODUCT_IDS = new Set<string>([
  "chatgpt-pro-5x",
  "chatgpt-pro-20x",
  "claude-max-5x",
  "claude-max-20x",
]);
const CHATGPT_PRO_FILTER_PRODUCT_IDS = new Set<string>([
  "chatgpt-pro-5x",
  "chatgpt-pro-20x",
]);

export function parseOfferFilterTags(value: string | string[] | null | undefined): OfferFilterTagId[] {
  const parts = Array.isArray(value) ? value : String(value || "").split(/[,，\s]+/);
  const output: OfferFilterTagId[] = [];

  for (const part of parts) {
    const id = part.trim();
    if (!OFFER_FILTER_TAG_IDS.has(id)) continue;
    if (!output.includes(id as OfferFilterTagId)) output.push(id as OfferFilterTagId);
  }

  return OFFER_FILTER_TAGS
    .map((tag) => tag.id)
    .filter((id) => output.includes(id));
}

export function toggleOfferFilterTag(current: OfferFilterTagId[], id: OfferFilterTagId): OfferFilterTagId[] {
  if (current.includes(id)) return current.filter((item) => item !== id);
  return parseOfferFilterTags([...current, id]);
}

export function parseOfferFilterTagsForProduct(
  productId: string,
  value: string | string[] | null | undefined,
): OfferFilterTagId[] {
  return filterOfferFilterTagsForProduct(productId, parseOfferFilterTags(value));
}

export function filterOfferFilterTagsForProduct(productId: string, tags: OfferFilterTagId[]): OfferFilterTagId[] {
  return parseOfferFilterTags(tags).filter((tag) => offerFilterTagAppliesToProduct(productId, tag));
}

export function filterOfferFilterFacetsForProduct(productId: string, facets: OfferFilterTagFacet[]): OfferFilterTagFacet[] {
  return facets.filter((facet) => offerFilterTagAppliesToProduct(productId, facet.id));
}

export function offerFilterTagAppliesToProduct(productId: string, tagId: OfferFilterTagId): boolean {
  if (tagId === "delivery_recharge") return AI_SUBSCRIPTION_RECHARGE_FILTER_PRODUCT_IDS.has(productId);
  if (tagId === "delivery_account") return AI_SUBSCRIPTION_ACCOUNT_DELIVERY_FILTER_PRODUCT_IDS.has(productId);
  if (DURATION_FILTER_TAG_IDS.has(tagId)) return DURATION_FILTER_PRODUCT_IDS.has(productId);
  if (VERIFICATION_FILTER_TAG_IDS.has(tagId)) return VERIFICATION_FILTER_PRODUCT_IDS.has(productId);
  if (TELEGRAM_ACCOUNT_FILTER_TAG_IDS.has(tagId)) return productId === "telegram-account";
  if (TELEGRAM_PREMIUM_FILTER_TAG_IDS.has(tagId)) return productId === "telegram-premium";
  if (GEMINI_PRO_ACCOUNT_FILTER_TAG_IDS.has(tagId)) return productId === "gemini-pro-year";
  if (GEMINI_PRO_RECHARGE_FILTER_TAG_IDS.has(tagId)) return productId === "gemini-pro-recharge";
  if (CHATGPT_PLUS_CHANNEL_FILTER_TAG_IDS.has(tagId)) return productId === "chatgpt-plus";
  if (CHATGPT_PLUS_RECHARGE_FILTER_TAG_IDS.has(tagId)) return productId === "chatgpt-plus-recharge";
  if (PRO_MAX_RECHARGE_MODE_FILTER_TAG_IDS.has(tagId)) return PRO_MAX_FILTER_PRODUCT_IDS.has(productId);
  if (CHATGPT_PRO_CHANNEL_FILTER_TAG_IDS.has(tagId)) return CHATGPT_PRO_FILTER_PRODUCT_IDS.has(productId);
  if (CHATGPT_TEAM_FILTER_TAG_IDS.has(tagId)) return productId === "chatgpt-team-business";
  return true;
}

export function deriveOfferFilterTags(input: {
  sourceTitle: string;
  tags?: string[] | null;
}): OfferFilterTagId[] {
  const titleText = normalizeOfferFilterText(input.sourceTitle || "");
  const sourceTagsText = normalizeOfferFilterText((input.tags || []).join(" "));
  const text = normalizeOfferFilterText(`${input.sourceTitle || ""} ${(input.tags || []).join(" ")}`);
  const output = new Set<OfferFilterTagId>();

  if (!hasUnsupportedProxySignal(text) && hasSupportedProxySignal(text)) {
    output.add("proxy_supported");
  }

  if (!hasSharedAccessNegativeSignal(text) && hasSharedAccessSignal(text)) {
    output.add("shared_access");
  }

  if (hasDomesticMirrorSiteSignal(text)) {
    output.add("domestic_mirror_site");
  }

  if (hasSelfServiceDeliverySignal(titleText) || hasSpecificDeliveryTagSignal(sourceTagsText)) {
    output.add("delivery_recharge");
  }
  if (
    !hasAccountDeliveryNegativeSignal(text) &&
    !hasAccountDeliveryExclusionSignal(titleText) &&
    hasAccountDeliverySignal(titleText)
  ) {
    output.add("delivery_account");
  }

  addGeminiProRechargeSubtypeFilterTag(output, text);
  addChatGptPlusChannelFilterTag(output, text);
  addChatGptPlusRechargeSubtypeFilterTag(output, text);
  addProMaxSubtypeFilterTags(output, text);
  addChatGptTeamSubtypeFilterTag(output, titleText, sourceTagsText);

  if (hasDurationYearSignal(text)) {
    output.add("duration_year");
  }
  if (hasDurationHalfYearSignal(text)) {
    output.add("duration_half_year");
  }
  if (hasDurationQuarterSignal(text)) {
    output.add("duration_quarter");
  }
  if (hasDurationMonthSignal(text)) {
    output.add("duration_month");
  }
  if (hasDurationTrialSignal(text)) {
    output.add("duration_trial");
  }

  if (hasVerificationMonthlySignal(text)) {
    output.add("verification_monthly");
  } else if (hasVerificationLongSignal(text)) {
    output.add("verification_long");
  } else if (hasVerificationShortSignal(text)) {
    output.add("verification_short");
  } else if (hasVerificationSingleSignal(text)) {
    output.add("verification_single");
  }

  if (hasTelegramUsRegionSignal(text)) {
    output.add("telegram_region_us");
  } else if (hasTelegramIndiaRegionSignal(text)) {
    output.add("telegram_region_india");
  }

  if (hasTelegramStarsSignal(text)) {
    output.add("telegram_stars");
  } else if (hasTelegramPremiumYearSignal(text)) {
    output.add("telegram_premium_year");
  } else if (hasTelegramPremiumHalfYearSignal(text)) {
    output.add("telegram_premium_half_year");
  } else if (hasTelegramPremiumQuarterSignal(text)) {
    output.add("telegram_premium_quarter");
  }

  if (hasGeminiAntigravityGcpSignal(text)) {
    output.add("gemini_antigravity_gcp");
  }
  if (hasGeminiPhoneRequiredSignal(text)) {
    output.add("gemini_phone_required");
  }
  if (hasGeminiAppealRequiredSignal(text)) {
    output.add("gemini_appeal_required");
  }

  if (
    !hasBlockingNoWarrantySignal(text) &&
    !hasShortWarrantySignal(text) &&
    !hasFirstActionWarrantySignal(text) &&
    hasLongWarrantySignal(text)
  ) {
    output.add("warranty_long");
  }

  return parseOfferFilterTags(Array.from(output));
}

export function buildOfferFilterFacets(offers: Array<{ sourceTitle: string; tags?: string[] | null }>): OfferFilterTagFacet[] {
  const counts = new Map<OfferFilterTagId, number>();

  for (const offer of offers) {
    for (const tag of deriveOfferFilterTags(offer)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return OFFER_FILTER_TAGS
    .map((definition) => ({
      ...definition,
      count: counts.get(definition.id) || 0,
    }))
    .filter((item) => item.count > 0);
}

export function offerMatchesFilterTags(
  offer: { sourceTitle: string; tags?: string[] | null; filterTags?: string[] | null },
  selectedTags: OfferFilterTagId[],
): boolean {
  if (!selectedTags.length) return true;

  const offerTags = new Set(
    offer.filterTags && offer.filterTags.length
      ? parseOfferFilterTags(offer.filterTags)
      : deriveOfferFilterTags(offer),
  );

  return selectedTags.every((tag) => offerTags.has(tag));
}

function normalizeOfferFilterText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[【】\[\]（）()]/g, " ");
}

function hasUnsupportedProxySignal(text: string): boolean {
  return /仅支持?网页|只能网页|仅网页|网页号|不支持codex|无法使用codex|不能使用codex|不能直接登录codex|无法直接登录codex|无法codex|codex不售后|不可反代|无法反代|不能反代|不支持反代/.test(text);
}

function hasSupportedProxySignal(text: string): boolean {
  return /可反代|支持反代|反代\+?codex|可用codex|支持codex|直接登录codex|sub2|cpa|api格式|json格式|json文件|sub格式|cpa格式/.test(text);
}

function hasSharedAccessNegativeSignal(text: string): boolean {
  return /非拼车|不是拼车|不拼车|无拼车|拒绝拼车|非团购|不是团购|不团购|非共享|不是共享|不共享|无共享|非合租|不是合租|不合租|非车位|不是车位/.test(text);
}

function hasSharedAccessSignal(text: string): boolean {
  return hasStrongSharedAccessSignal(text) || (!hasExclusiveAccessSignal(text) && hasWeakSharedAccessSignal(text));
}

function hasDomesticMirrorSiteSignal(text: string): boolean {
  return /国内镜像站|国内镜像|网页镜像|镜像站|镜像|mirror/.test(text);
}

function hasSelfServiceDeliverySignal(text: string): boolean {
  return /自助充值|自助开通|自助卡密|卡密自助|自助激活|自动充值|自动开通|自动激活|全自动激活|全自动开通|直充|代充|卡充|充值|续费|代开|内购|激活码|兑换码|cdk|卡密|提链|提取链接|支付二维码|扫码对接|upi扫码|pix渠道|ideal渠道|i deal渠道/.test(text);
}

function hasSpecificDeliveryTagSignal(text: string): boolean {
  return /自助充值|自助开通|自助卡密|卡密自助|自助激活|自动充值|自动开通|自动激活|全自动激活|全自动开通|直充|代充|卡充|充值|续费|代开|内购|激活码|兑换码|cdk|提链|提取链接|支付二维码|扫码对接|upi扫码|pix渠道|ideal渠道|i deal渠道/.test(text);
}

function hasAccountDeliveryNegativeSignal(text: string): boolean {
  return /非成品|不是成品|非账号|不是账号|非账户|不是账户|不交付账号|不发账号|不提供账号|不含账号|无需账号|自备账号|自备号|自己账号|自己的账号|到自己账号|冲自己号|充值自己号|给自己号/.test(text);
}

function hasAccountDeliveryExclusionSignal(text: string): boolean {
  return /自助充值|自助开通|自助领取|自助激活|自动充值|自动开通|自动激活|全自动激活|全自动开通|免费试用资格|试用资格|资格新号|仅支持新号|老号有试用|新号都可以|充值渠道非成品|非成品|自备账号|国内镜像站|国内镜像|网页镜像|镜像站|镜像|mirror|拼车|团购|拼团|车位|多人共享|多人共用|多人体验号/.test(text);
}

function hasAccountDeliverySignal(text: string): boolean {
  return /成品号|成品账号|成品帐号|成品会员账号|成品|账号购买|账号|帐号|账户|账密|独享号|独享账号|独享账户|库存号|会员号|普通号|普号|白号|网页号|半成品|首登|保首登|质保首登|直登|未接码|已接码|已接|未接|带2fa|带二验|可二验|已绑手机|未绑手机/.test(text);
}

function hasChatGptTeamK12Signal(text: string): boolean {
  return /k12/.test(text);
}

function hasChatGptTeamBugSignal(text: string): boolean {
  return /bugteam|teambug|bug号|bug號|漏洞/.test(text);
}

function hasChatGptTeamOfficialSignal(text: string): boolean {
  return /正价|正规官方|官方.{0,12}(team|business|团队|席位)|business\(team\)|gptbusiness|48个月|48月|四十八个月|4年|四年|全程质保订阅|无限续费|可无限续费|可用pro模型额度比plus高|首次激活码|续费码/.test(text);
}

function addGeminiProRechargeSubtypeFilterTag(output: Set<OfferFilterTagId>, text: string): void {
  if (hasGemini18MonthLinkSignal(text)) {
    output.add("gemini_18_month_link");
    return;
  }
  if (hasGemini12MonthCardBindingSignal(text)) {
    output.add("gemini_12_month_card_binding");
    return;
  }
  if (hasGemini12MonthLinkSignal(text)) {
    output.add("gemini_12_month_link");
  }
}

function hasGemini12MonthSignal(text: string): boolean {
  return /12个月|十二个月|一年|1年|365天|三百六十五天|年卡|年度|全年/.test(text);
}

function hasGemini18MonthSignal(text: string): boolean {
  return /18个月|十八个月|1\.5年|一年半/.test(text);
}

function hasGeminiLinkSignal(text: string): boolean {
  return /提链|提取链接|提取优惠链接|优惠链接|活动链接|领取链接|兑换链接|激活链接|链接|jio|googleone|google one/.test(text);
}

function hasGeminiCardBindingSignal(text: string): boolean {
  return /含绑卡|包绑卡|包含绑卡|带绑卡|代绑卡|绑卡完成|绑定卡|自动订阅|自动开通|包开通|代开通|全包/.test(text);
}

function hasGeminiCardBindingNegativeSignal(text: string): boolean {
  return /不含绑卡|无绑卡|无需绑卡|免绑卡|不包绑卡|自行绑卡|自己绑卡/.test(text);
}

function hasGemini12MonthLinkSignal(text: string): boolean {
  return hasGemini12MonthSignal(text) &&
    !hasGemini18MonthSignal(text) &&
    hasGeminiLinkSignal(text) &&
    !(hasGeminiCardBindingSignal(text) && !hasGeminiCardBindingNegativeSignal(text));
}

function hasGemini12MonthCardBindingSignal(text: string): boolean {
  return hasGemini12MonthSignal(text) &&
    !hasGemini18MonthSignal(text) &&
    !hasGeminiCardBindingNegativeSignal(text) &&
    hasGeminiCardBindingSignal(text);
}

function hasGemini18MonthLinkSignal(text: string): boolean {
  return hasGemini18MonthSignal(text) && hasGeminiLinkSignal(text);
}

function addChatGptPlusChannelFilterTag(output: Set<OfferFilterTagId>, text: string): void {
  if (hasChatGptPlusBrazilPixSignal(text)) {
    output.add("chatgpt_plus_brazil_pix");
    return;
  }
  if (hasChatGptPlusNetherlandsIdealSignal(text)) {
    output.add("chatgpt_plus_netherlands_ideal");
    return;
  }
  if (hasChatGptPlusIndiaUpiSignal(text)) {
    output.add("chatgpt_plus_india_upi");
    return;
  }
  if (hasChatGptPlusEuropeChannelSignal(text)) {
    output.add("chatgpt_plus_europe_channel");
  }
}

function hasPixPaymentSignal(text: string): boolean {
  return /(^|[^a-z])pix([^a-z]|$)|pix渠道|pix充值|巴西pix/.test(text);
}

function hasIdealPaymentSignal(text: string): boolean {
  return /ideal|i-deal|i\/deal/.test(text);
}

function hasUpiPaymentSignal(text: string): boolean {
  return /(^|[^a-z])upi([^a-z]|$)|upi渠道|upi扫码|印度upi/.test(text);
}

function hasChatGptPlusBrazilPixSignal(text: string): boolean {
  return /(巴西|brazil|巴西区)/.test(text) && hasPixPaymentSignal(text);
}

function hasChatGptPlusNetherlandsIdealSignal(text: string): boolean {
  return /(荷兰|netherlands|holland|nl区|荷区)/.test(text) && hasIdealPaymentSignal(text);
}

function hasChatGptPlusIndiaUpiSignal(text: string): boolean {
  return /(印度|india|印度区)/.test(text) && hasUpiPaymentSignal(text);
}

function hasChatGptPlusEuropeChannelSignal(text: string): boolean {
  return /欧洲渠道|欧洲|欧区|欧盟|奥地利|austria|at未接码|at渠道|at号/.test(text);
}

function addChatGptPlusRechargeSubtypeFilterTag(output: Set<OfferFilterTagId>, text: string): void {
  if (hasChatGptPlusRechargePhilippinesCardSignal(text)) {
    output.add("chatgpt_plus_recharge_ph_card");
    return;
  }
  if (hasChatGptPlusRechargeUsIosSignal(text)) {
    output.add("chatgpt_plus_recharge_us_ios");
    return;
  }
  if (hasChatGptPlusRechargeOfficialDirectSignal(text)) {
    output.add("chatgpt_plus_recharge_official_direct");
  }
}

function hasPhilippinesRegionSignal(text: string): boolean {
  return /菲区|菲律宾|菲律宾区|philippines|ph区/.test(text);
}

function hasUsRegionSignal(text: string): boolean {
  return /美区|美国|美国区|us区|usa|u\.s\./.test(text);
}

function hasIosPaymentSignal(text: string): boolean {
  return /ios|appstore|app-store|app store|内购|苹果内购/.test(text);
}

function hasCardRechargeSignal(text: string): boolean {
  return /卡充|卡冲|卡付|卡密|cdk|官方充值|充值|代充|直充/.test(text);
}

function hasChatGptPlusRechargePhilippinesCardSignal(text: string): boolean {
  return hasPhilippinesRegionSignal(text) && hasCardRechargeSignal(text);
}

function hasChatGptPlusRechargeUsIosSignal(text: string): boolean {
  return hasUsRegionSignal(text) && hasIosPaymentSignal(text);
}

function hasChatGptPlusRechargeOfficialDirectSignal(text: string): boolean {
  return /官方直充|官方充值|官方代充|官方订阅|正价代充|正规充值|正规官方|官网直充|官网代充|人工直充|自动直充|带账单|质保订阅/.test(text);
}

function addProMaxSubtypeFilterTags(output: Set<OfferFilterTagId>, text: string): void {
  const hasShortTerm = hasProMaxShortTermSignal(text);

  if (hasShortTerm) {
    output.add("pro_max_short_term");
  } else if (hasProMaxOfficialRechargeSignal(text)) {
    output.add("pro_max_official_recharge");
  }

  if (hasProMaxUsIosSignal(text)) {
    output.add("pro_max_us_ios");
  }
}

function hasProMaxOfficialRechargeSignal(text: string): boolean {
  const hasStrongOfficialSignal =
    hasChatGptPlusRechargeOfficialDirectSignal(text) ||
    /正价|官方|官网|正规|原价|标准价|带账单|真实付费|可续费/.test(text);
  const hasRechargeSignal = /直充|代充|充值|续费|代开|内购|订阅/.test(text);
  const hasCredentialOnlySignal = /cdk|卡密|兑换码|激活码/.test(text) && !hasStrongOfficialSignal;

  return hasStrongOfficialSignal || (hasRechargeSignal && !hasCredentialOnlySignal);
}

function hasProMaxShortTermSignal(text: string): boolean {
  return (
    /速刷|短期|日抛|天抛|周抛|低价体验|体验号|库存号|临时号|临时会员|必死|只保激活|仅保激活|保激活|只保开通|仅保开通/.test(text) ||
    hasDurationTrialSignal(text) ||
    hasBlockingNoWarrantySignal(text) ||
    hasShortWarrantySignal(text) ||
    hasFirstActionWarrantySignal(text)
  );
}

function hasProMaxUsIosSignal(text: string): boolean {
  return hasUsRegionSignal(text) && hasIosPaymentSignal(text);
}

function addChatGptTeamSubtypeFilterTag(
  output: Set<OfferFilterTagId>,
  titleText: string,
  sourceTagsText: string,
): void {
  const titleHasOfficial = hasChatGptTeamOfficialSignal(titleText);
  const titleHasK12 = hasChatGptTeamK12Signal(titleText);
  const titleHasBug = hasChatGptTeamBugSignal(titleText);

  if (titleHasOfficial) {
    output.add("team_official");
    return;
  }
  if (titleHasK12) {
    output.add("team_k12");
    return;
  }
  if (titleHasBug) {
    output.add("team_bug");
    return;
  }

  if (hasChatGptTeamOfficialSignal(sourceTagsText)) {
    output.add("team_official");
    return;
  }
  if (hasChatGptTeamK12Signal(sourceTagsText)) {
    output.add("team_k12");
    return;
  }
  if (hasChatGptTeamBugSignal(sourceTagsText)) {
    output.add("team_bug");
  }
}

function hasStrongSharedAccessSignal(text: string): boolean {
  return /拼车|团购|拼团|车位|多人共享|多人共用|(?:多人|二人|两人|双人|三人|四人|五人|六人|七人|八人|九人|十人|[2-9]人|[1-9][0-9]人)体验(?:号|账号|帐号)|(?:二|两|双|三|四|五|六|七|八|九|十|[2-9]|[1-9][0-9])人(?:车|共享|共用|位)|多人车|车友|车队|家庭车|团号|团购车|拼车位|共享车/.test(text);
}

function hasWeakSharedAccessSignal(text: string): boolean {
  return /共享|共用|合租|共享号/.test(text);
}

function hasExclusiveAccessSignal(text: string): boolean {
  return /独享|独立|一人一号|一人一户|专享/.test(text);
}

function hasDurationTrialSignal(text: string): boolean {
  return /(?:^|[^0-9])(?:[1-9]|10)天(?:号|会员|体验)?|(?:二|两|三|四|五|六|七|八|九|十)天(?:号|会员|体验)?|[1-9]-10天|2到10天|2至10天|3-7天|7-10天|周会员|一周会员|体验卡|短期体验/.test(text);
}

function hasDurationMonthSignal(text: string): boolean {
  return /月卡|月会员|一个月|1个月|30天|三十天|一月|单月/.test(text);
}

function hasDurationQuarterSignal(text: string): boolean {
  return /3个月|三个月|90天|九十天|季度|季卡/.test(text);
}

function hasDurationHalfYearSignal(text: string): boolean {
  return /6个月|六个月|180天|一百八十天|半年|半年卡/.test(text);
}

function hasDurationYearSignal(text: string): boolean {
  return /12个月|十二个月|一年|1年|365天|三百六十五天|年卡|年度|全年/.test(text);
}

function hasVerificationSingleSignal(text: string): boolean {
  return /单次接码|一次性接码|一次性验证|1次接码|1次验证|一次码|单号接码|接一次|质保1次成功接码|质保一次成功接码/.test(text);
}

function hasVerificationShortSignal(text: string): boolean {
  return /短效接码|短效手机号|短期接码|短时接码|临时号码|短效号码|实卡接码|实体卡接码/.test(text);
}

function hasVerificationLongSignal(text: string): boolean {
  return /长效接码|长期接码|长效手机号|长期手机号|原始接码链接|电话接码链接|带电话接码链接|接码链接|取码url|取码链接|可续接|续接/.test(text);
}

function hasVerificationMonthlySignal(text: string): boolean {
  return /月租|包月接码|接码包月|包月号码|长期租号|月付接码|30天接码|一个月接码|1个月接码/.test(text);
}

function hasTelegramUsRegionSignal(text: string): boolean {
  return /(?:^|[^0-9])(?:\+|➕)1(?:[^0-9]|$)|美区|美国|🇺🇸/.test(text);
}

function hasTelegramIndiaRegionSignal(text: string): boolean {
  return /(?:\+|➕)91|区号91|印度/.test(text);
}

function hasTelegramStarsSignal(text: string): boolean {
  return /telegram.{0,12}(星星|star|stars)|(?:星星|star|stars).{0,12}telegram|星星兑换码|星星代充/.test(text);
}

function hasTelegramPremiumQuarterSignal(text: string): boolean {
  if (!hasTelegramPremiumSignal(text)) return false;
  return /3个月|三个月|三月|3月|3month|3months/.test(text);
}

function hasTelegramPremiumHalfYearSignal(text: string): boolean {
  if (!hasTelegramPremiumSignal(text)) return false;
  return /6个月|六个月|六月|6月|半年|6month|6months/.test(text);
}

function hasTelegramPremiumYearSignal(text: string): boolean {
  if (!hasTelegramPremiumSignal(text)) return false;
  return /12个月|十二个月|一年|1年|年费|一年会员|12month|12months/.test(text);
}

function hasTelegramPremiumSignal(text: string): boolean {
  return /telegram.{0,16}(premium|会员|pro)|tg.{0,16}(premium|会员|pro)|电报.{0,16}(premium|会员|pro)|飞机.{0,16}(premium|会员|pro)|premium.{0,16}(telegram|tg)|会员.{0,16}(telegram|tg|电报)/.test(text);
}

function hasGeminiAntigravityGcpSignal(text: string): boolean {
  const hasGcpSignal = /包gcp|支持gcp|gcp可用|gcp已开|gcp正常|googlecloud|谷歌云/.test(text);
  const hasGcpNegativeSignal = /不包gcp|无gcp|gcp已禁用|gcp禁用|不支持gcp|gcp不可用|不带gcp|不含gcp|不送gcp/.test(text);
  const hasAntigravitySignal = /包反重力|支持反重力|反重力直接用|反重力可用|可用反重力|antigravity/.test(text);
  const hasAntigravityNegativeSignal = /不包反重力|不支持反重力|反重力不可用|无法反重力|不能反重力|不等于反重力/.test(text);
  const hasCliSignal = /(?:gemini|googleai|googleaipro|gcp|反重力|antigravity).{0,16}cli|cli.{0,16}(?:gemini|googleai|googleaipro|gcp|反重力|antigravity)|codeassist/.test(text);
  const hasCliNegativeSignal = /不支持cli|cli不可用|无法cli|不能cli/.test(text);

  return (
    (hasGcpSignal && !hasGcpNegativeSignal) ||
    (hasAntigravitySignal && !hasAntigravityNegativeSignal) ||
    (hasCliSignal && !hasCliNegativeSignal)
  );
}

function hasGeminiPhoneRequiredSignal(text: string): boolean {
  if (/无需绑定手机|无需绑手机|无须绑定手机|无须绑手机|免绑手机|不用绑手机|不需要绑定手机|不需要绑手机/.test(text)) {
    return false;
  }

  return /需要绑定手机|需绑定手机|需要绑手机|需绑手机|绑定手机号|绑定手机|手机号接码|手机接码|长效接码|接码|人机号|人机账号|人机帐号/.test(text);
}

function hasGeminiAppealRequiredSignal(text: string): boolean {
  if (/无需申诉|无须申诉|免申诉|不用申诉|不需要申诉|无需注册|无须注册|免注册|不用注册|不需要注册/.test(text)) {
    return false;
  }

  return /首登需要申诉|需要申诉|需申诉|申诉|需注册|需要注册|没注册过谷歌|未注册过谷歌|没注册过google|未注册过google/.test(text);
}

function hasBlockingNoWarrantySignal(text: string): boolean {
  const globalWarrantyText = text.replace(
    /不质保(?:封号|封禁|被封|账号|账户)|封号(?:不质保|无质保|不保|不售后|不在售后范围)|封禁(?:不质保|无质保|不保|不售后|不在售后范围)|不保(?:封号|封禁|被封|账号|账户)|不管(?:封号|封禁|被封)|封号不管/g,
    "",
  );

  return /无.{0,4}质保|没.{0,4}质保|不质保|不保|不售后|售后不管|一律不售后|无售后|不作售后条件|不做售后|不管售后/.test(globalWarrantyText);
}

function hasFirstActionWarrantySignal(text: string): boolean {
  return /质保首登|保首登|包首登|首登质保|首次登录|首次登陆|质保首次|质保购买一小时内首登|质保\d+h?内首登|质保[一二三四五六七八九十]+小时内首登|质保上车|只质保上车|仅质保上车|包上车|保上车|上车质保|质保登上|质保登录|质保登陆|质保直登|质保首登成功/.test(text);
}

function hasShortWarrantySignal(text: string): boolean {
  return /质保(?:[1-9]|1[0-4]|一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天|(?:^|[^0-9])(?:[1-9]|1[0-4])天质保|(?:一|二|三|四|五|六|七|八|九|十|十一|十二|十三|十四)天质保|质保(?:一周|1周|两周|2周|二周)|(?:一周|1周|两周|2周|二周)质保|7天售后|七天售后|质保\d{1,2}h|质保(?:24|48|72)小时|质保\d+小时|\d+h质保|\d+小时质保|质保(?:1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次成功接码|质保(?:1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次接码|质保(?:1|2|3|4|5|6|7|8|9|一|二|三|四|五|六|七|八|九)次|质保额度|质保不来码|质保开通|仅质保开通|只质保开通|质保充值成功|质保激活成功|质保到手|质保上车|只质保上车|仅质保上车|包上车|保上车|上车质保/.test(text);
}

function hasLongWarrantySignal(text: string): boolean {
  return /质保(?:1[5-9]|[2-9]\d|[1-9]\d{2,})天|(?:1[5-9]|[2-9]\d|[1-9]\d{2,})天质保|质保(?:(?:订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[\/丨·、,，和+&-]){1,6}(?:1[5-9]|[2-9]\d|[1-9]\d{2,})天|质保(?:十五|二十|二十五|二十八|三十|一百八十)天|(?:十五|二十|二十五|二十八|三十|一百八十)天质保|质保(?:(?:订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[\/丨·、,，和+&-]){1,6}(?:十五|二十|二十五|二十八|三十|一百八十)天|质保(?:半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|(?:半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)质保|质保(?:(?:订阅|定阅|稳定|权益|会员|掉会员|掉订阅|封号|封订阅|封号和订阅|封号封订阅)|[\/丨·、,，和+&-]){1,6}(?:半个月|一个月|1个月|一月|整月|两个月|2个月|二个月|三个月|3个月|一年|1年|12个月|180天)|全程质保|全程保|质保全程(?:订阅|定阅|权益|会员)?|质保(?:(?:订阅|定阅|稳定|权益|会员|掉会员|掉订阅)|[\/丨·、,，和+&-]){1,6}全程|全程(?:(?:订阅|定阅|稳定|权益|会员|掉会员|掉订阅)|[\/丨·、,，和+&-]){1,6}质保|包月售后|包月质保|质保包月/.test(text);
}
