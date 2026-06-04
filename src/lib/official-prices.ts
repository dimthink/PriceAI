export type OfficialPriceAppSlug = "chatgpt" | "claude" | "gemini" | "grok";

export type OfficialPricePlan = {
  slug: string;
  appSlug: OfficialPriceAppSlug;
  label: string;
  billingPeriod: "monthly" | "annual";
  notes?: string;
};

export type OfficialPriceRegion = {
  countryCode: string;
  countryLabel: string;
  currencyCode: string;
  priceText: string;
  priceValue: number;
  sourceUrl: string;
  evidenceSource: "app_store_html";
  fetchedAt: string;
  status: "available" | "missing";
};

export type OfficialPriceRow = OfficialPriceRegion & {
  appSlug: OfficialPriceAppSlug;
  planSlug: string;
  cnyPrice: number;
  fxRateToCny: number;
  fxDate: string;
};

export type OfficialPriceApp = {
  slug: OfficialPriceAppSlug;
  displayName: string;
  provider: string;
  appStoreId: string;
  appStoreSlug: string;
  summary: string;
};

export const officialPriceGeneratedAt = "2026-06-05T00:00:00+08:00";

export const officialPriceFxSummary = {
  baseCurrency: "USD",
  source: "Frankfurter",
  sourceUrl: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY,TRY,PHP,EGP,JPY,EUR",
  date: "2026-06-04",
  rates: {
    USD: 1,
    CNY: 6.7739,
    TRY: 45.974,
    PHP: 61.587,
  },
};

export const officialPriceApps: OfficialPriceApp[] = [
  {
    slug: "chatgpt",
    displayName: "ChatGPT",
    provider: "OpenAI",
    appStoreId: "6448311069",
    appStoreSlug: "chatgpt",
    summary: "覆盖 Plus、Go、Pro 5x、Pro 20x 等 App Store 公开内购价格样本。",
  },
  {
    slug: "claude",
    displayName: "Claude",
    provider: "Anthropic",
    appStoreId: "6473753684",
    appStoreSlug: "claude-by-anthropic",
    summary: "覆盖 Pro、Max 5x、Max 20x 和 Pro Annual 的公开内购价格样本。",
  },
  {
    slug: "gemini",
    displayName: "Gemini",
    provider: "Google",
    appStoreId: "6477489729",
    appStoreSlug: "google-gemini",
    summary: "覆盖 Google AI Plus、Google AI Pro、Google AI Ultra 的公开内购价格样本。",
  },
  {
    slug: "grok",
    displayName: "Grok",
    provider: "xAI",
    appStoreId: "6670324846",
    appStoreSlug: "grok",
    summary: "覆盖 SuperGrok Lite、SuperGrok、SuperGrok Heavy 的公开内购价格样本。",
  },
];

export const officialPricePlans: OfficialPricePlan[] = [
  { appSlug: "chatgpt", slug: "go-monthly", label: "ChatGPT Go", billingPeriod: "monthly" },
  { appSlug: "chatgpt", slug: "plus-monthly", label: "ChatGPT Plus", billingPeriod: "monthly" },
  { appSlug: "chatgpt", slug: "pro-5x", label: "ChatGPT Pro 5x", billingPeriod: "monthly" },
  { appSlug: "chatgpt", slug: "pro-20x", label: "ChatGPT Pro 20x", billingPeriod: "monthly" },
  { appSlug: "claude", slug: "pro-monthly", label: "Claude Pro", billingPeriod: "monthly" },
  { appSlug: "claude", slug: "max-5x-monthly", label: "Claude Max 5x", billingPeriod: "monthly" },
  { appSlug: "claude", slug: "max-20x-monthly", label: "Claude Max 20x", billingPeriod: "monthly" },
  { appSlug: "claude", slug: "pro-annual", label: "Claude Pro Annual", billingPeriod: "annual" },
  { appSlug: "gemini", slug: "ai-plus", label: "Google AI Plus", billingPeriod: "monthly" },
  { appSlug: "gemini", slug: "ai-pro", label: "Google AI Pro", billingPeriod: "monthly" },
  { appSlug: "gemini", slug: "ai-ultra", label: "Google AI Ultra", billingPeriod: "monthly" },
  { appSlug: "grok", slug: "supergrok-lite", label: "SuperGrok Lite", billingPeriod: "monthly" },
  { appSlug: "grok", slug: "supergrok", label: "SuperGrok", billingPeriod: "monthly" },
  { appSlug: "grok", slug: "supergrok-heavy", label: "SuperGrok Heavy", billingPeriod: "monthly" },
];

const fetchedAt = "2026-06-05T00:00:00+08:00";

const priceByPlan: Record<string, OfficialPriceRegion[]> = {
  "chatgpt/go-monthly": [
    price("US", "美国", "USD", "$8.00", 8, "https://apps.apple.com/us/app/chatgpt/id6448311069"),
    price("TR", "土耳其", "TRY", "₺249,99", 249.99, "https://apps.apple.com/tr/app/chatgpt/id6448311069"),
    price("PH", "菲律宾", "PHP", "₱ 300.00", 300, "https://apps.apple.com/ph/app/chatgpt/id6448311069"),
  ],
  "chatgpt/plus-monthly": [
    price("US", "美国", "USD", "$19.99", 19.99, "https://apps.apple.com/us/app/chatgpt/id6448311069"),
    price("TR", "土耳其", "TRY", "₺499,99", 499.99, "https://apps.apple.com/tr/app/chatgpt/id6448311069"),
    price("PH", "菲律宾", "PHP", "₱ 999.00", 999, "https://apps.apple.com/ph/app/chatgpt/id6448311069"),
  ],
  "chatgpt/pro-5x": [
    price("US", "美国", "USD", "$100.00", 100, "https://apps.apple.com/us/app/chatgpt/id6448311069"),
    price("TR", "土耳其", "TRY", "₺5.299,99", 5299.99, "https://apps.apple.com/tr/app/chatgpt/id6448311069"),
    price("PH", "菲律宾", "PHP", "₱ 6,490.00", 6490, "https://apps.apple.com/ph/app/chatgpt/id6448311069"),
  ],
  "chatgpt/pro-20x": [
    price("US", "美国", "USD", "$200.00", 200, "https://apps.apple.com/us/app/chatgpt/id6448311069"),
    price("TR", "土耳其", "TRY", "₺7.999,99", 7999.99, "https://apps.apple.com/tr/app/chatgpt/id6448311069"),
    price("PH", "菲律宾", "PHP", "₱ 9,990.00", 9990, "https://apps.apple.com/ph/app/chatgpt/id6448311069"),
  ],
  "claude/pro-monthly": [
    price("US", "美国", "USD", "$20.00", 20, "https://apps.apple.com/us/app/claude-by-anthropic/id6473753684"),
    price("TR", "土耳其", "TRY", "₺799,99", 799.99, "https://apps.apple.com/tr/app/claude-by-anthropic/id6473753684"),
  ],
  "claude/max-5x-monthly": [
    price("US", "美国", "USD", "$124.99", 124.99, "https://apps.apple.com/us/app/claude-by-anthropic/id6473753684"),
    price("TR", "土耳其", "TRY", "₺4.999,99", 4999.99, "https://apps.apple.com/tr/app/claude-by-anthropic/id6473753684"),
  ],
  "claude/max-20x-monthly": [
    price("US", "美国", "USD", "$249.99", 249.99, "https://apps.apple.com/us/app/claude-by-anthropic/id6473753684"),
    price("TR", "土耳其", "TRY", "₺9.999,99", 9999.99, "https://apps.apple.com/tr/app/claude-by-anthropic/id6473753684"),
  ],
  "claude/pro-annual": [
    price("US", "美国", "USD", "$214.99", 214.99, "https://apps.apple.com/us/app/claude-by-anthropic/id6473753684"),
    price("TR", "土耳其", "TRY", "₺8.699,99", 8699.99, "https://apps.apple.com/tr/app/claude-by-anthropic/id6473753684"),
  ],
  "gemini/ai-plus": [
    price("US", "美国", "USD", "$7.99", 7.99, "https://apps.apple.com/us/app/google-gemini/id6477489729"),
    price("TR", "土耳其", "TRY", "₺199,99", 199.99, "https://apps.apple.com/tr/app/google-gemini/id6477489729"),
  ],
  "gemini/ai-pro": [
    price("US", "美国", "USD", "$19.99", 19.99, "https://apps.apple.com/us/app/google-gemini/id6477489729"),
    price("TR", "土耳其", "TRY", "₺719,99", 719.99, "https://apps.apple.com/tr/app/google-gemini/id6477489729"),
  ],
  "gemini/ai-ultra": [
    price("US", "美国", "USD", "$199.99", 199.99, "https://apps.apple.com/us/app/google-gemini/id6477489729"),
  ],
  "grok/supergrok-lite": [
    price("US", "美国", "USD", "$10.00", 10, "https://apps.apple.com/us/app/grok/id6670324846"),
    price("TR", "土耳其", "TRY", "₺499,99", 499.99, "https://apps.apple.com/tr/app/grok/id6670324846"),
  ],
  "grok/supergrok": [
    price("US", "美国", "USD", "$30.00", 30, "https://apps.apple.com/us/app/grok/id6670324846"),
    price("TR", "土耳其", "TRY", "₺1.299,99", 1299.99, "https://apps.apple.com/tr/app/grok/id6670324846"),
  ],
  "grok/supergrok-heavy": [
    price("US", "美国", "USD", "$300.00", 300, "https://apps.apple.com/us/app/grok/id6670324846"),
    price("TR", "土耳其", "TRY", "₺12.999,99", 12999.99, "https://apps.apple.com/tr/app/grok/id6670324846"),
  ],
};

export const officialPriceRows: OfficialPriceRow[] = officialPricePlans.flatMap((plan) =>
  (priceByPlan[`${plan.appSlug}/${plan.slug}`] || []).map((region) => ({
    ...region,
    appSlug: plan.appSlug,
    planSlug: plan.slug,
    cnyPrice: convertToCny(region.priceValue, region.currencyCode),
    fxRateToCny: rateToCny(region.currencyCode),
    fxDate: officialPriceFxSummary.date,
  })),
);

export function getOfficialPricePlans(appSlug: OfficialPriceAppSlug) {
  return officialPricePlans.filter((plan) => plan.appSlug === appSlug);
}

export function getOfficialPriceRows(appSlug: OfficialPriceAppSlug, planSlug: string) {
  return officialPriceRows
    .filter((row) => row.appSlug === appSlug && row.planSlug === planSlug)
    .sort((a, b) => a.cnyPrice - b.cnyPrice);
}

function price(
  countryCode: string,
  countryLabel: string,
  currencyCode: string,
  priceText: string,
  priceValue: number,
  sourceUrl: string,
): OfficialPriceRegion {
  return {
    countryCode,
    countryLabel,
    currencyCode,
    priceText,
    priceValue,
    sourceUrl,
    evidenceSource: "app_store_html",
    fetchedAt,
    status: "available",
  };
}

function rateToCny(currencyCode: string) {
  if (currencyCode === "CNY") return 1;

  const rates = officialPriceFxSummary.rates as Record<string, number>;
  const cnyPerUsd = rates.CNY;
  const currencyPerUsd = rates[currencyCode];

  if (!currencyPerUsd) return cnyPerUsd;
  return cnyPerUsd / currencyPerUsd;
}

function convertToCny(value: number, currencyCode: string) {
  return roundCurrency(value * rateToCny(currencyCode));
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
