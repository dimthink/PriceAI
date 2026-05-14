import type { CanonicalProduct, ProductGroup, RawOffer } from "./types";

export const platformOptions = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Grok",
  "API/CDK",
  "邮箱",
  "虚拟卡",
  "其他",
] as const;

export const productTypeOptions = [
  "订阅/会员",
  "成品账号",
  "邮箱/账号",
  "API额度",
  "虚拟卡",
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
    summary: "ChatGPT Plus 月卡、成品号、直充、代充、卡密、CDK 或自助开通。",
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
    id: "chatgpt-team-business",
    slug: "chatgpt-team-business",
    displayName: "ChatGPT Team / Business",
    platform: "ChatGPT",
    productType: "订阅/会员",
    spec: "Team / Business",
    summary: "Team、Business、T5倍、团队号、母号、邀请或自动拉。",
    aliases: ["team", "business", "t5", "t5倍", "母号", "自动拉", "直拉", "邀请", "团队号"],
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
    platform: "API/CDK",
    productType: "API额度",
    spec: "API 额度 / CDK",
    summary: "通用 API、中转、余额、额度、Codex API 或 OpenAI API 商品。",
    aliases: ["api cdk", "codexapi", "codex api", "token", "中转", "余额", "额度"],
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
    displayName: "Gemini Pro",
    platform: "Gemini",
    productType: "订阅/会员",
    spec: "Pro",
    summary: "Gemini Pro 年卡、成品号、CDK、优惠链接或自助充值。",
    aliases: ["gemini pro", "gemini 一年", "gemini 12个月", "gemini cdk"],
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
    id: "email-account",
    slug: "email-account",
    displayName: "邮箱账号",
    platform: "邮箱",
    productType: "邮箱/账号",
    spec: "邮箱",
    summary: "纯邮箱商品，包括 Gmail、Google 邮箱、Outlook、Hotmail 或 Microsoft 邮箱。",
    aliases: ["gmail", "google 邮箱", "outlook", "hotmail", "微软邮箱", "域名邮箱"],
  },
  {
    id: "virtual-card",
    slug: "virtual-card",
    displayName: "虚拟卡",
    platform: "虚拟卡",
    productType: "虚拟卡",
    spec: "VISA / MasterCard",
    summary: "VISA、MasterCard、0刀卡、1刀卡、BIN 卡或虚拟信用卡。",
    aliases: ["visa", "mastercard", "虚拟卡", "虚拟信用卡", "0刀卡", "1刀卡", "bin 卡", "485954"],
  },
  {
    id: "other-product",
    slug: "other-product",
    displayName: "其他商品",
    platform: "其他",
    productType: "其他",
    spec: "其他",
    summary: "Cursor、Kiro、Suno、Windsurf、X Premium、社交账号、接码、代理、教程等。",
    aliases: ["other", "cursor", "kiro", "suno", "windsurf"],
  },
];

const catalogById = new Map(canonicalCatalog.map((item) => [item.id, item]));
const legacyCanonicalIdMap: Record<string, string> = {
  "chatgpt-plus-month": "chatgpt-plus",
  "chatgpt-plus-account": "chatgpt-plus",
};

export function getCanonicalProduct(id: string): CanonicalProduct {
  return catalogById.get(legacyCanonicalIdMap[id] || id) ?? catalogById.get("other-product")!;
}

export function resolveOfferProduct(
  offer: RawOffer,
  canonicalProducts: CanonicalProduct[] = canonicalCatalog,
): CanonicalProduct {
  const canonicalMap = new Map(canonicalProducts.map((product) => [product.id, product]));
  const classified = classifyOffer(offer.sourceTitle, { tags: offer.tags, categorySlug: offer.categorySlug });
  const mappedId = offer.canonicalProductId ? legacyCanonicalIdMap[offer.canonicalProductId] || offer.canonicalProductId : null;

  if (classified.id !== "other-product") return classified;
  if (mappedId && catalogById.has(mappedId)) return getCanonicalProduct(mappedId);
  if (mappedId && canonicalMap.has(mappedId)) return canonicalMap.get(mappedId)!;

  return classified;
}

export function classifyOffer(
  title: string,
  context: {
    tags?: string[] | string | null;
    categorySlug?: string | null;
  } = {},
): CanonicalProduct {
  const value = normalizeTitle(title);
  const contextValue = normalizeTitle([normalizeTags(context.tags), context.categorySlug].filter(Boolean).join(" "));

  if (isVirtualCardProduct(value)) {
    return getCanonicalProduct("virtual-card");
  }

  if (isSupportService(value)) {
    return getCanonicalProduct("other-product");
  }

  if (isApiProduct(value)) {
    return getCanonicalProduct("openai-api-cdk");
  }

  if (isPureEmail(value)) {
    return getCanonicalProduct("email-account");
  }

  if (isClaudeProduct(value)) {
    if (matches(value, ["20x", "x20", "20×", "max 20", "max x20"])) {
      return getCanonicalProduct("claude-max-20x");
    }

    if (matches(value, ["5x", "x5", "5×", "max 5", "max x5"])) {
      return getCanonicalProduct("claude-max-5x");
    }

    if (matches(value, ["pro", "尼区", "月卡", "直充", "代充", "激活码", "卡密"])) {
      return getCanonicalProduct("claude-pro-month");
    }

    return getCanonicalProduct("claude-account");
  }

  if (isGeminiProduct(value)) {
    if (matches(value, ["ultra", "250美元", "250 美元", "反重力", "flow", "45k", "25k", "企业"])) {
      return getCanonicalProduct("gemini-ultra");
    }

    return getCanonicalProduct("gemini-pro-year");
  }

  if (isGrokProduct(value)) {
    if (matches(value, ["super", "supergrok", "heavy", "月卡", "年卡", "激活码", "卡密", "直充", "充值"])) {
      return getCanonicalProduct("super-grok");
    }

    return getCanonicalProduct("grok-account");
  }

  if (isChatGptProduct(value)) {
    if (isChatGptPro20(value)) {
      return getCanonicalProduct("chatgpt-pro-20x");
    }

    if (isChatGptPro5(value)) {
      return getCanonicalProduct("chatgpt-pro-5x");
    }

    if (matches(value, ["plus"])) {
      return getCanonicalProduct("chatgpt-plus");
    }

    if (isChatGptTeam(value)) {
      return getCanonicalProduct("chatgpt-team-business");
    }

    if (matches(value, ["free", "普号", "白号", "普通号", "空白账号", "长效"])) {
      return getCanonicalProduct("chatgpt-free-account");
    }
  }

  if (isOtherTool(value)) {
    return getCanonicalProduct("other-product");
  }

  if (matches(value, ["codex", "api", "cdk", "token", "额度", "中转", "余额"])) {
    return getCanonicalProduct("openai-api-cdk");
  }

  if (matches(value, ["gmail", "google 邮箱", "谷歌邮箱", "hotmail", "outlook", "微软邮箱", "邮箱"])) {
    return getCanonicalProduct("email-account");
  }

  if (contextValue && matches(contextValue, ["chatgpt", "openai"]) && matches(value, ["plus"])) {
    return getCanonicalProduct("chatgpt-plus");
  }

  return getCanonicalProduct("other-product");
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
    const displayLowestOffer = getDisplayLowestOffer(product.offers);
    const priceMeta = getOfferPriceMeta(displayLowestOffer);

    product.lowestOffer = displayLowestOffer;
    product.lowestPrice = displayLowestOffer?.price ?? null;
    product.lowestPriceLabel = priceMeta.label;
    product.lowestPriceTone = priceMeta.tone;
    product.latestSeenAt = latestDate(
      product.offers.map((offer) => offer.verifiedAt || offer.lastSeenAt || offer.capturedAt || offer.sourceUpdatedAt),
    );
    product.anomalyFlags = collectProductFlags(product);
  }

  return Array.from(map.values()).sort((a, b) => {
    const stockDelta = Number(b.inStockCount > 0) - Number(a.inStockCount > 0);
    if (stockDelta !== 0) return stockDelta;

    return (a.lowestPrice ?? Number.MAX_SAFE_INTEGER) - (b.lowestPrice ?? Number.MAX_SAFE_INTEGER);
  });
}

export function compareOffers(a: RawOffer, b: RawOffer): number {
  const availableDelta = Number(isAvailable(b)) - Number(isAvailable(a));
  if (availableDelta !== 0) return availableDelta;

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

function getDisplayLowestOffer(offers: RawOffer[]): RawOffer | null {
  const displayPool = offers.filter((offer) => hasUsablePrice(offer) && isAvailable(offer));
  if (!displayPool.length) return null;

  return [...displayPool].sort((a, b) => {
    const priceDelta = (a.price ?? Number.MAX_SAFE_INTEGER) - (b.price ?? Number.MAX_SAFE_INTEGER);
    if (priceDelta !== 0) return priceDelta;

    return compareOffers(a, b);
  })[0] ?? null;
}

function hasUsablePrice(offer: RawOffer): offer is RawOffer & { price: number } {
  return typeof offer.price === "number" && Number.isFinite(offer.price);
}

export function collectOfferFlags(offer: RawOffer): string[] {
  const flags = new Set<string>();

  if (!isAvailable(offer)) flags.add("缺货");
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
    .replace(/[×]/g, "x")
    .replace(/[｜|/【】[\]()（）,，:：\-_/]+/g, " ")
    .replace(/\bpuls\b/g, "plus")
    .replace(/\bpulus\b/g, "plus")
    .replace(/chat\s*gpt/g, "chatgpt")
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
  if (matches(value, ["教程", "电话卡", "手机套餐", "paypal接码", "验证码", "代理服务", "并发数"])) {
    return true;
  }

  return value.includes("接码") && !matches(value, ["chatgpt", "gpt", "openai", "claude", "gemini", "grok"]);
}

function isOtherTool(value: string): boolean {
  return matches(value, [
    "suno",
    "cursor",
    "kiro",
    "windsurf",
    "x premium",
    "twitter premium",
    "telegram",
    "facebook",
    "苹果 id",
    "apple id",
  ]);
}

function isApiProduct(value: string): boolean {
  if (matches(value, ["claude/gpt/gemini中转站", "中转站", "中转余额", "中转 gpt", "api中转", "api 中转"])) return true;
  if (matches(value, ["codexapi", "codex api", "codex 授权", "codex 授權"])) return true;
  if (matches(value, ["gpt api", "openai api", "geminiapi", "gemini api"])) return true;
  if (matches(value, ["api 额度", "api额度", "api 100刀", "api 50刀", "api 300刀"])) return true;
  if (matches(value, ["余额兑换", "余额 兑换", "倍率"])) return true;

  return false;
}

function isVirtualCardProduct(value: string): boolean {
  if (matches(value, ["visa", "mastercard", "虚拟卡", "虚拟信用卡", "0刀卡", "1刀卡", "bin 卡", "485954"])) {
    return true;
  }

  return matches(value, ["美国卡", "卡头"]) && !matches(value, ["chatgpt", "claude", "gemini", "grok"]);
}

function isPureEmail(value: string): boolean {
  const explicitEmail = matches(value, ["gmail", "谷歌邮箱", "google 邮箱", "hotmail", "outlook", "微软邮箱"]);
  if (!explicitEmail) return false;
  if (matches(value, ["跑gemini", "跑 gemini", "失败的号", "包gcp", "带gcp"])) return true;

  return !matches(value, [
    "chatgpt",
    "gpt plus",
    "openai 普号",
    "claude",
    "gemini pro",
    "gemini ultra",
    "grok",
  ]);
}

function isClaudeProduct(value: string): boolean {
  return matches(value, ["claude", "克劳德"]);
}

function isGeminiProduct(value: string): boolean {
  return matches(value, ["gemini", "google ai", "ai ultra"]) || (matches(value, ["pixel"]) && matches(value, ["pro", "订阅"]));
}

function isGrokProduct(value: string): boolean {
  return matches(value, ["grok", "supergrok"]);
}

function isChatGptProduct(value: string): boolean {
  if (matches(value, ["gemini", "claude", "grok"])) return false;
  return matches(value, ["chatgpt", "gpt", "openai", "plus", "team", "business", "t5"]);
}

function isChatGptPro20(value: string): boolean {
  if (matches(value, ["gemini", "claude"])) return false;
  return matches(value, ["pro", "gpt pro", "chatgpt pro"]) && matches(value, ["20x", "x20", "20倍", "200刀", "200 美元", "200美元"]);
}

function isChatGptPro5(value: string): boolean {
  if (matches(value, ["gemini", "claude"])) return false;
  return matches(value, ["pro", "gpt pro", "chatgpt pro"]) && matches(value, ["5x", "x5", "5倍", "100刀", "100 美元", "100美元"]);
}

function isChatGptTeam(value: string): boolean {
  if (matches(value, ["gemini", "claude", "grok"])) return false;
  return matches(value, ["team", "business", "t5", "t5倍", "母号", "自动拉", "直拉", "拼车位", "邀请", "团队号", "团队席位"]);
}
