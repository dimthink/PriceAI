import type {
  TransitAvailability,
  TransitChannelType,
  TransitCommercialOffer,
  TransitModelFamily,
  TransitModelPrice,
  TransitOperatorType,
  TransitStation,
  TransitVerificationEvent,
  TransitStationSystem,
} from "@/data/api-transit/types";
import {
  TRANSIT_CHANNEL_TYPE_LABELS,
  TRANSIT_MODEL_FAMILY_OPTIONS,
  TRANSIT_MODEL_FAMILY_LABELS,
  TRANSIT_MODEL_FAMILY_ORDER,
  TRANSIT_STANDARD_MODELS,
  TRANSIT_STANDARD_MODEL_FAMILY,
  TRANSIT_COMMERCIAL_LABELS,
  TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE,
} from "@/data/api-transit/types";
import { seedStations } from "@/data/api-transit/stations";

let cached: TransitStation[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;
const sourceChannelPriority: TransitChannelType[] = [
  "official_api",
  "cloud",
  "first_party_pool",
  "reverse_engineered",
  "first_party_wholesale",
  "reseller",
  "mixed",
  "undisclosed",
];

export type TransitSortKey = "overall" | "rate" | "claude_rate" | "gpt_rate" | "stability";

export const ALLOWED_RETURN_KEYS = [
  "q",
  "family",
  "model",
  "channel",
  "pool",
  "risk",
  "sort",
] as const;

export async function getStations(): Promise<TransitStation[]> {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;

  cached = seedStations;
  cachedAt = now;
  return cached;
}

export async function getStationBySlug(
  slug: string
): Promise<TransitStation | undefined> {
  const stations = await getStations();
  return stations.find((station) => station.slug === slug);
}

export function parseRechargeRatio(text: string | null): number | null {
  if (!text) return null;

  const ratioMatch = text.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (ratioMatch) {
    const base = Number(ratioMatch[1]);
    const quota = Number(ratioMatch[2]);
    if (!Number.isFinite(base) || !Number.isFinite(quota) || base <= 0) return null;

    return quota / base;
  }

  const balanceMatch = text.match(
    /(\d+(?:\.\d+)?)\s*(?:CNY|RMB|人民币|元|￥|¥)?\s*=\s*(\d+(?:\.\d+)?)\s*(?:USD\s*)?(?:balance|余额|额度|credit|credits)?/i
  );
  if (!balanceMatch) return null;

  const base = Number(balanceMatch[1]);
  const quota = Number(balanceMatch[2]);
  if (!Number.isFinite(base) || !Number.isFinite(quota) || base <= 0) return null;

  return quota / base;
}

export function getRechargeCoefficientFromRatio(text: string | null): number | null {
  const ratio = parseRechargeRatio(text);
  if (ratio === null) return null;
  if (ratio <= 0) return null;
  return 1 / ratio;
}

export function getStationRechargeCoefficient(station: TransitStation): number | null {
  return getRechargeCoefficientFromRatio(station.prices[0]?.rechargeRatio ?? null);
}

export function getCombinedRateForPrice(
  station: TransitStation,
  price: TransitModelPrice
): number | null {
  if (!hasComparableTransitOfficialPrice(price.standardModel)) return null;

  const coefficient =
    getRechargeCoefficientFromRatio(price.rechargeRatio) ??
    getStationRechargeCoefficient(station);
  if (coefficient === null || price.modelMultiplier === null) return null;

  return coefficient * price.modelMultiplier;
}

export function getRepresentativeTransitPrice(
  prices: TransitModelPrice[]
): TransitModelPrice | null {
  return [...prices].sort(compareTransitModelPriority)[0] ?? null;
}

export function compareTransitModelPriority(
  left: TransitModelPrice,
  right: TransitModelPrice
): number {
  return getTransitModelPriority(right.standardModel) - getTransitModelPriority(left.standardModel) ||
    new Date(right.lastVerifiedAt).getTime() - new Date(left.lastVerifiedAt).getTime();
}

function getTransitModelPriority(model: TransitModelPrice["standardModel"]): number {
  if (model === "GPT Image 2") return 602;
  if (model === "Nano Banana Pro") return 595;
  if (model === "Nano Banana 2") return 594;
  if (model === "Nano Banana") return 593;
  if (model === "Nano Banana Lite") return 592;
  if (model === "Sora 2 Pro") return 590;
  if (model === "Sora 2") return 589;
  if (model === "Veo 3.1") return 588;
  if (model === "Veo 3.1 Lite") return 587;
  if (model === "Gemini Omni Flash") return 586;
  if (model === "Seedance 2.0") return 585;
  if (model === "Kling 2.5 Turbo") return 584;
  if (model === "GPT 5.5") return 505;
  if (model === "GPT 5.4") return 504;
  if (model === "Claude Fable 5") return 510;
  if (model === "Claude Sonnet 5") return 500;
  if (model === "Claude Opus 4.8") return 408;
  if (model === "Claude Opus 4.7") return 407;
  if (model === "Claude Opus 4.6") return 406;
  if (model === "Claude Sonnet 4.6") return 306;
  if (model === "Gemini 3.5 Flash") return 335;
  if (model === "Gemini 3.1 Pro") return 331;
  if (model === "GLM-5.2") return 252;
  if (model === "GLM-5.1") return 251;
  if (model === "DeepSeek V4 Pro") return 244;
  if (model === "DeepSeek V4 Flash") return 243;
  return 0;
}

export type TransitPriceMetric = "input" | "output" | "cacheWrite" | "cacheRead" | "imageOutput";
export type TransitPriceCurrency = "USD" | "CNY";

export type TransitOfficialModelPrice = Record<TransitPriceMetric, number | null> & {
  currency: TransitPriceCurrency;
  sourceLabel: string;
  sourceUrl: string;
};

const anthropicPricingUrl = "https://platform.claude.com/docs/en/about-claude/pricing";
const openAiPricingUrl = "https://platform.openai.com/docs/pricing";
const openAiVideoGenerationUrl = "https://platform.openai.com/docs/guides/video-generation";
const geminiPricingUrl = "https://ai.google.dev/gemini-api/docs/pricing";
const geminiImageGenerationUrl = "https://ai.google.dev/gemini-api/docs/image-generation";
const geminiModelDocsUrl = "https://ai.google.dev/gemini-api/docs/models";
const glmPricingUrl = "https://bigmodel.cn/pricing";
const deepseekPricingUrl = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing";
const seedanceDocsUrl = "https://docs.byteplus.com/en/docs/ModelArk/1520757";
const klingDocsUrl = "https://app.klingai.com/global/dev/document-api/apiReference/model/video";

function unpricedOfficialModel(
  sourceLabel: string,
  sourceUrl: string,
  currency: TransitPriceCurrency = "USD"
): TransitOfficialModelPrice {
  return {
    input: null,
    output: null,
    cacheWrite: null,
    cacheRead: null,
    imageOutput: null,
    currency,
    sourceLabel,
    sourceUrl,
  };
}

const TRANSIT_OFFICIAL_MODEL_PRICES: Record<
  TransitModelPrice["standardModel"],
  TransitOfficialModelPrice
> = {
  "Claude Fable 5": {
    input: 10,
    output: 50,
    cacheWrite: 12.5,
    cacheRead: 1,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Sonnet 5": {
    input: 2,
    output: 10,
    cacheWrite: 2.5,
    cacheRead: 0.2,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Sonnet 4.6": {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Opus 4.6": {
    input: 5,
    output: 25,
    cacheWrite: 6.25,
    cacheRead: 0.5,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Opus 4.7": {
    input: 5,
    output: 25,
    cacheWrite: 6.25,
    cacheRead: 0.5,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Opus 4.8": {
    input: 5,
    output: 25,
    cacheWrite: 6.25,
    cacheRead: 0.5,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "GPT 5.5": {
    input: 5,
    output: 30,
    cacheWrite: 0.5,
    cacheRead: 0.5,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "OpenAI API",
    sourceUrl: openAiPricingUrl,
  },
  "GPT 5.4": {
    input: 2.5,
    output: 15,
    cacheWrite: 0.25,
    cacheRead: 0.25,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "OpenAI API",
    sourceUrl: openAiPricingUrl,
  },
  "Gemini 3.5 Flash": {
    input: 1.5,
    output: 9,
    cacheWrite: null,
    cacheRead: null,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Google Gemini API",
    sourceUrl: geminiPricingUrl,
  },
  "Gemini 3.1 Pro": {
    input: 2,
    output: 12,
    cacheWrite: null,
    cacheRead: null,
    imageOutput: null,
    currency: "USD",
    sourceLabel: "Google Gemini API",
    sourceUrl: geminiPricingUrl,
  },
  "GLM-5.2": {
    input: 8,
    output: 28,
    cacheWrite: null,
    cacheRead: 2,
    imageOutput: null,
    currency: "CNY",
    sourceLabel: "智谱 BigModel",
    sourceUrl: glmPricingUrl,
  },
  "GLM-5.1": {
    input: 6,
    output: 24,
    cacheWrite: null,
    cacheRead: 1.3,
    imageOutput: null,
    currency: "CNY",
    sourceLabel: "智谱 BigModel",
    sourceUrl: glmPricingUrl,
  },
  "DeepSeek V4 Flash": {
    input: 1,
    output: 2,
    cacheWrite: null,
    cacheRead: 0.02,
    imageOutput: null,
    currency: "CNY",
    sourceLabel: "DeepSeek API",
    sourceUrl: deepseekPricingUrl,
  },
  "DeepSeek V4 Pro": {
    input: 3,
    output: 6,
    cacheWrite: null,
    cacheRead: 0.025,
    imageOutput: null,
    currency: "CNY",
    sourceLabel: "DeepSeek API",
    sourceUrl: deepseekPricingUrl,
  },
  "GPT Image 2": {
    input: 5,
    output: null,
    cacheWrite: null,
    cacheRead: 1.25,
    imageOutput: 30,
    currency: "USD",
    sourceLabel: "OpenAI API",
    sourceUrl: openAiPricingUrl,
  },
  "Nano Banana Pro": unpricedOfficialModel("Google Gemini API", geminiImageGenerationUrl),
  "Nano Banana 2": unpricedOfficialModel("Google Gemini API", geminiImageGenerationUrl),
  "Nano Banana": unpricedOfficialModel("Google Gemini API", geminiImageGenerationUrl),
  "Nano Banana Lite": unpricedOfficialModel("Google Gemini API", geminiImageGenerationUrl),
  "Sora 2": unpricedOfficialModel("OpenAI Video API", openAiVideoGenerationUrl),
  "Sora 2 Pro": unpricedOfficialModel("OpenAI Video API", openAiVideoGenerationUrl),
  "Veo 3.1": unpricedOfficialModel("Google Gemini API", geminiModelDocsUrl),
  "Veo 3.1 Lite": unpricedOfficialModel("Google Gemini API", geminiModelDocsUrl),
  "Gemini Omni Flash": unpricedOfficialModel("Google Gemini API", geminiModelDocsUrl),
  "Seedance 2.0": unpricedOfficialModel("BytePlus ModelArk", seedanceDocsUrl),
  "Kling 2.5 Turbo": unpricedOfficialModel("Kling API", klingDocsUrl),
};

export function getOfficialTransitModelPrice(
  standardModel: TransitModelPrice["standardModel"]
): TransitOfficialModelPrice {
  const price = TRANSIT_OFFICIAL_MODEL_PRICES[standardModel];
  if (!price) throw new Error(`Unknown API transit standard model: ${standardModel}`);
  return price;
}

export function getOfficialTransitUnitPrice(
  standardModel: TransitModelPrice["standardModel"],
  metric: TransitPriceMetric
): number | null {
  return getOfficialTransitModelPrice(standardModel)[metric];
}

export function getOfficialTransitUnitCurrency(
  standardModel: TransitModelPrice["standardModel"]
): TransitPriceCurrency {
  return getOfficialTransitModelPrice(standardModel).currency;
}

export function hasComparableTransitOfficialPrice(
  standardModel: TransitModelPrice["standardModel"]
): boolean {
  const price = getOfficialTransitModelPrice(standardModel);
  return [price.input, price.output, price.cacheRead, price.cacheWrite, price.imageOutput].some(
    (value) => value !== null && Number.isFinite(value) && value > 0
  );
}

export function getTransitSplitMultiplier(
  price: TransitModelPrice,
  metric: TransitPriceMetric
): number | null {
  if (metric === "input") return price.inputPrice ?? price.modelMultiplier;
  if (metric === "output") return price.outputPrice ?? price.modelMultiplier;
  if (metric === "imageOutput") return price.imageOutputPrice ?? price.modelMultiplier;
  if (metric === "cacheRead") return price.cacheReadPrice;

  if (price.cacheWritePrice !== null) return price.cacheWritePrice;

  const officialPrice = getOfficialTransitModelPrice(price.standardModel);
  if (
    officialPrice.cacheWrite !== null &&
    officialPrice.cacheRead !== null &&
    officialPrice.cacheWrite === officialPrice.cacheRead
  ) {
    return price.cacheReadPrice;
  }

  return null;
}

export function getTransitEffectiveMetricRate(
  station: TransitStation,
  price: TransitModelPrice,
  metric: TransitPriceMetric
): number | null {
  const coefficient =
    getRechargeCoefficientFromRatio(price.rechargeRatio) ??
    getStationRechargeCoefficient(station);
  const splitMultiplier = getTransitSplitMultiplier(price, metric);
  if (coefficient === null || splitMultiplier === null) return null;

  return coefficient * splitMultiplier;
}

export function getTransitConvertedUnitPrice(
  station: TransitStation,
  price: TransitModelPrice,
  metric: TransitPriceMetric
): number | null {
  const officialPrice = getOfficialTransitUnitPrice(price.standardModel, metric);
  const effectiveRate = getTransitEffectiveMetricRate(station, price, metric);
  if (officialPrice === null || effectiveRate === null) return null;

  return officialPrice * effectiveRate;
}

export function getFamilyPrices(
  station: TransitStation,
  family: TransitModelFamily
): TransitModelPrice[] {
  return station.prices.filter((price) => price.family === family);
}

export function getStandardModelPrices(
  station: TransitStation,
  standardModel: TransitModelPrice["standardModel"]
): TransitModelPrice[] {
  return station.prices.filter((price) => price.standardModel === standardModel);
}

export function getFamilyAvailabilitySourceMeta(
  station: TransitStation,
  family: TransitModelFamily
): ReturnType<typeof getAvailabilitySourceMeta> {
  const prices = getFamilyPrices(station, family);
  const sorted = [...prices].sort(
    (left, right) =>
      availabilitySourcePriority(right.availability.sourceType) -
      availabilitySourcePriority(left.availability.sourceType)
  );
  const price = sorted.find((item) => item.availability.sourceType !== "unknown") || sorted[0];
  return price ? getAvailabilitySourceMeta(price.availability) : getAvailabilitySourceMeta(station.availability);
}

export function getStandardModelAvailabilitySourceMeta(
  station: TransitStation,
  standardModel: TransitModelPrice["standardModel"]
): ReturnType<typeof getAvailabilitySourceMeta> {
  const prices = getStandardModelPrices(station, standardModel);
  const sorted = [...prices].sort(
    (left, right) =>
      availabilitySourcePriority(right.availability.sourceType) -
      availabilitySourcePriority(left.availability.sourceType)
  );
  const price = sorted.find((item) => item.availability.sourceType !== "unknown") || sorted[0];
  return price ? getAvailabilitySourceMeta(price.availability) : getAvailabilitySourceMeta(station.availability);
}

function availabilitySourcePriority(sourceType: TransitModelPrice["availability"]["sourceType"]): number {
  switch (sourceType) {
    case "priceai_probe":
      return 6;
    case "public_status":
      return 5;
    case "public_model_catalog":
      return 4;
    case "partner_api":
      return 3;
    case "merchant_reported":
      return 2;
    case "manual_snapshot":
      return 1;
    default:
      return 0;
  }
}

export type TransitFamilyRateSummary = {
  family: TransitModelFamily;
  familyLabel: string;
  priceCount: number;
  modelMultiplierMin: number | null;
  modelMultiplierMax: number | null;
  combinedRateMin: number | null;
  combinedRateMax: number | null;
  sevenDayRate: number | null;
  sevenDaySamples: number;
  firstCheckedAt: string | null;
  lastCheckedAt: string | null;
  latestLatencyMs: number | null;
  avgLatency7dMs: number | null;
};

export type TransitAvailabilityRollup = Pick<
  TransitAvailability,
  | "sevenDayRate"
  | "sevenDaySamples"
  | "firstCheckedAt"
  | "lastCheckedAt"
  | "latestLatencyMs"
  | "avgLatency7dMs"
  | "sourceType"
  | "sourceLabel"
  | "sourceUrl"
> & {
  note?: string;
};

function summarizeRateScope(
  station: TransitStation,
  family: TransitModelFamily,
  prices: TransitModelPrice[],
  options: { rollupByGroup?: boolean } = {}
): TransitFamilyRateSummary {
  const scopePrices = options.rollupByGroup ? getRepresentativePricesByGroup(prices) : prices;
  const multipliers = scopePrices
    .map((price) => price.modelMultiplier)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const combinedRates = scopePrices
    .map((price) => getCombinedRateForPrice(station, price))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const availabilitySamples = prices.reduce(
    (total, price) => total + price.availability.sevenDaySamples,
    0
  );
  const weightedAvailability =
    availabilitySamples > 0
      ? prices.reduce((total, price) => {
          const rate = price.availability.sevenDayRate ?? 0;
          return total + rate * price.availability.sevenDaySamples;
        }, 0) / availabilitySamples
      : null;
  const lastCheckedAt =
    prices
      .map((price) => price.availability.lastCheckedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const firstCheckedAt =
    prices
      .map((price) => price.availability.firstCheckedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(0) ?? null;
  const latestLatencyMs = latestLatencyFromPrices(prices);
  const avgLatency7dMs = weightedAverageLatency(prices);

  return {
    family,
    familyLabel: TRANSIT_MODEL_FAMILY_LABELS[family],
    priceCount: prices.length,
    modelMultiplierMin: multipliers.length ? Math.min(...multipliers) : null,
    modelMultiplierMax: multipliers.length ? Math.max(...multipliers) : null,
    combinedRateMin: combinedRates.length ? Math.min(...combinedRates) : null,
    combinedRateMax: combinedRates.length ? Math.max(...combinedRates) : null,
    sevenDayRate: weightedAvailability,
    sevenDaySamples: availabilitySamples,
    firstCheckedAt,
    lastCheckedAt,
    latestLatencyMs,
    avgLatency7dMs,
  };
}

export function getFamilyRateSummary(
  station: TransitStation,
  family: TransitModelFamily
): TransitFamilyRateSummary {
  return summarizeRateScope(station, family, getFamilyPrices(station, family), { rollupByGroup: true });
}

export function getStandardModelRateSummary(
  station: TransitStation,
  standardModel: TransitModelPrice["standardModel"]
): TransitFamilyRateSummary {
  return summarizeRateScope(
    station,
    TRANSIT_STANDARD_MODEL_FAMILY[standardModel],
    getStandardModelPrices(station, standardModel)
  );
}

function getRepresentativePricesByGroup(prices: TransitModelPrice[]): TransitModelPrice[] {
  const grouped = new Map<string, TransitModelPrice[]>();
  for (const price of prices) {
    const groupName = price.groupName || "默认分组";
    const groupPrices = grouped.get(groupName) || [];
    groupPrices.push(price);
    grouped.set(groupName, groupPrices);
  }

  return Array.from(grouped.values())
    .map(getRepresentativeTransitPrice)
    .filter((price): price is TransitModelPrice => price !== null);
}

export type TransitStationComparisonSummary = {
  station: TransitStation;
  families: Record<TransitModelFamily, TransitFamilyRateSummary>;
  claude: TransitFamilyRateSummary;
  gpt: TransitFamilyRateSummary;
  availability: TransitAvailabilityRollup;
  bestCombinedRate: number | null;
  stabilityRate: number | null;
  stabilitySamples: number;
  sourceCompleteness: number;
  overallScore: number;
};

export function getStationComparisonSummary(
  station: TransitStation
): TransitStationComparisonSummary {
  const families = TRANSIT_MODEL_FAMILY_ORDER.reduce(
    (accumulator, family) => ({
      ...accumulator,
      [family]: getFamilyRateSummary(station, family),
    }),
    {} as Record<TransitModelFamily, TransitFamilyRateSummary>
  );
  const combinedRates = Object.values(families).map((summary) => summary.combinedRateMin).filter(
    (value): value is number => value !== null
  );
  const bestCombinedRate = combinedRates.length ? Math.min(...combinedRates) : null;
  const availability = getStationPublishedAvailabilitySummary(station);
  const stabilityRate = availability.sevenDayRate;
  const stabilitySamples = availability.sevenDaySamples;
  const sourceCompleteness = [
    station.minimumTopUp,
    station.paymentMethods.length ? "payments" : null,
    station.supportChannels.length ? "support" : null,
    station.channelTypes.length ? "channels" : null,
    station.accountPools.length ? "pools" : null,
  ].filter(Boolean).length;

  const rateScore = scoreTransitCombinedRate(bestCombinedRate);
  const stabilityScore = (stabilityRate ?? 0) * 35;
  const sampleScore = Math.min(stabilitySamples / 12, 12);
  const completenessScore = Math.min(sourceCompleteness * 1.5, 9);
  const commercialScore =
    station.commercialRelation === "sponsored" ? 6 :
      station.commercialRelation === "partner" ? 4 :
        station.commercialRelation === "listed" ? 2 :
          station.commercialRelation === "affiliate" ? 1 :
            0;
  const stationSystem = getTransitStationSystem(station);
  const systemScore =
    stationSystem === "sub_to_api" ? 5 :
      stationSystem === "new_api" ? -10 :
        0;
  const riskPenalty = station.riskLabels.reduce((total, risk) => {
    if (risk === "sample_data") return total + 1;
    if (risk === "insufficient_samples") return total + 3;
    if (risk === "mixed_pool") return total + 2;
    if (risk === "reseller") return total + 3;
    if (risk === "undisclosed_upstream") return total + 5;
    if (risk === "third_party_aggregate") return total + 6;
    return total + 2;
  }, 0);

  return {
    station,
    families,
    claude: families.claude,
    gpt: families.gpt,
    availability,
    bestCombinedRate,
    stabilityRate,
    stabilitySamples,
    sourceCompleteness,
    overallScore:
      rateScore + stabilityScore + sampleScore + completenessScore + commercialScore + systemScore - riskPenalty,
  };
}

export function getStationPublishedAvailabilitySummary(station: TransitStation): TransitAvailabilityRollup {
  const summaries = TRANSIT_MODEL_FAMILY_ORDER
    .map((family) => getFamilyRateSummary(station, family))
    .filter((summary) => summary.priceCount > 0);
  const samples = summaries.reduce((total, summary) => total + summary.sevenDaySamples, 0);

  if (!samples) {
    return {
      ...station.availability,
      note: "当前公开模型暂无可用性样本。",
    };
  }

  const weightedRate = summaries.reduce((total, summary) => {
    const rate = summary.sevenDayRate ?? 0;
    return total + rate * summary.sevenDaySamples;
  }, 0) / samples;
  const source = getStationPublishedAvailabilitySourceMeta(station);
  const firstCheckedAt =
    summaries
      .map((summary) => summary.firstCheckedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(0) ?? null;
  const lastCheckedAt =
    summaries
      .map((summary) => summary.lastCheckedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  return {
    sevenDayRate: roundAvailabilityRate(weightedRate),
    sevenDaySamples: samples,
    firstCheckedAt,
    lastCheckedAt,
    latestLatencyMs: latestLatencyFromSummaries(summaries),
    avgLatency7dMs: weightedAverageLatencyFromSummaries(summaries),
    note: `按当前公开模型分组汇总：${formatPercent(roundAvailabilityRate(weightedRate))} · 样本 ${samples}`,
    sourceType: source.sourceType,
    sourceLabel: source.sourceLabel,
    sourceUrl: source.sourceUrl,
  };
}

function getStationPublishedAvailabilitySourceMeta(station: TransitStation): Pick<
  TransitAvailability,
  "sourceType" | "sourceLabel" | "sourceUrl"
> {
  const prices = [...station.prices].sort(
    (left, right) =>
      availabilitySourcePriority(right.availability.sourceType) -
      availabilitySourcePriority(left.availability.sourceType)
  );
  const price = prices.find((item) => item.availability.sourceType !== "unknown") || prices[0];
  if (!price) {
    return {
      sourceType: station.availability.sourceType,
      sourceLabel: station.availability.sourceLabel,
      sourceUrl: station.availability.sourceUrl,
    };
  }

  return {
    sourceType: price.availability.sourceType,
    sourceLabel: price.availability.sourceLabel,
    sourceUrl: price.availability.sourceUrl,
  };
}

function roundAvailabilityRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function getTransitStationSystem(station: TransitStation): TransitStationSystem {
  if (station.stationSystem && station.stationSystem !== "unknown") return station.stationSystem;

  const text = [
    station.collectorKind,
    station.id,
    station.slug,
    station.name,
    station.websiteUrl,
  ].filter(Boolean).join(" ").toLowerCase();

  if (
    text.includes("sub2api") ||
    text.includes("sub-to-api") ||
    text.includes("sub_to_api") ||
    text.includes("subway") ||
    text.includes("apinode_public_site_info") ||
    text.includes("callai_partner_status")
  ) {
    return "sub_to_api";
  }

  if (text.includes("onehop") || text.includes("onehop_public_models")) {
    return "custom";
  }

  if (text.includes("new_api") || text.includes("new-api") || text.includes("new api")) {
    return "new_api";
  }

  if (station.collectorKind?.includes("new_api")) return "new_api";
  return "custom";
}

export function getTransitStationSystemLabel(station: TransitStation): string {
  const system = getTransitStationSystem(station);
  if (system === "new_api") return "New API";
  if (system === "sub_to_api") return "Sub2API";
  if (system === "custom") return "自研";
  return "未知";
}

export function getTransitOperatorType(station: TransitStation): TransitOperatorType {
  return station.operatorType === "company" ? "company" : "individual";
}

export function getNormalizedSourceTags(
  station: TransitStation
): { id: string; label: string; tone: "neutral" | "warn" }[] {
  const channelTypes = getEffectiveTransitChannelTypes(station);
  const primary = sourceChannelPriority.filter((type) => channelTypes.includes(type));
  const tags = primary.map((type) => ({
    id: `channel-${type}`,
    label: TRANSIT_CHANNEL_TYPE_LABELS[type],
    tone: type === "undisclosed" ? "warn" as const : "neutral" as const,
  }));

  if (getTransitStationSystem(station) === "new_api") {
    tags.unshift({ id: "system-new-api", label: "第三方聚合", tone: "warn" });
  }

  return dedupeTags(tags);
}

export function getTransitReviewTags(
  station: TransitStation
): { id: string; label: string; tone: "warn" | "danger" | "neutral" }[] {
  const disclosed = getEffectiveTransitChannelTypes(station).some((type) => type !== "undisclosed");
  const tags: { id: string; label: string; tone: "warn" | "danger" | "neutral" }[] = [];

  if (!disclosed) tags.push({ id: "undisclosed", label: "未披露", tone: "warn" });
  if (getTransitStationSystem(station) === "new_api") tags.push({ id: "third-party-aggregate", label: "第三方聚合待验真", tone: "warn" });
  if (station.feedback.pendingCount > 0) tags.push({ id: "pending-feedback", label: "反馈待核验", tone: "warn" });
  if (station.riskLabels.includes("reseller")) tags.push({ id: "reseller", label: "二级分销", tone: "warn" });
  if (station.riskLabels.includes("third_party_aggregate")) tags.push({ id: "third-party-risk", label: "渠道来源需复核", tone: "warn" });

  return dedupeTags(tags);
}

export function getEffectiveTransitChannelTypes(station: TransitStation): TransitChannelType[] {
  const inferred: TransitChannelType[] = [];
  if (station.accountPools.some((pool) => pool === "plus" || pool === "pro" || pool === "max" || pool === "team")) {
    inferred.push("first_party_pool");
  }
  if (station.accountPools.includes("kiro")) {
    inferred.push("reverse_engineered");
  }

  const explicit = station.channelTypes.filter((type) => type !== "undisclosed");
  const merged = dedupeValues([...explicit, ...inferred]);
  return merged.length ? merged : ["undisclosed"];
}

export function getActiveTransitCommercialOffers(
  station: TransitStation
): TransitCommercialOffer[] {
  return (station.commercialOffers || [])
    .filter((offer) => offer.enabled)
    .map(withTransitCommercialOfferDisclosure);
}

export function hasTransitAffRelation(station: TransitStation): boolean {
  return station.commercialRelation === "affiliate" ||
    getActiveTransitCommercialOffers(station).some((offer) => offer.type === "affiliate");
}

export function getTransitStationOutboundUrl(
  station: TransitStation,
  offer: TransitCommercialOffer | null | undefined
): string {
  return offer?.url || station.websiteUrl;
}

export function isTransitStationOutboundAff(
  station: TransitStation,
  offer: TransitCommercialOffer | null | undefined
): boolean {
  return Boolean(offer?.url) &&
    (station.commercialRelation === "affiliate" || offer?.type === "affiliate");
}

export function getPrimaryTransitCommercialOffer(
  station: TransitStation
): TransitCommercialOffer | null {
  const offers = getActiveTransitCommercialOffers(station);
  return offers.find((offer) => offer.type === "coupon") ?? offers[0] ?? null;
}

export function getPrimaryTransitOutboundOffer(
  station: TransitStation
): TransitCommercialOffer | null {
  const offers = getActiveTransitCommercialOffers(station).filter((offer) => Boolean(offer.url));
  return offers.find((offer) => offer.type === "affiliate") ?? offers[0] ?? null;
}

export function withTransitCommercialOfferDisclosure(
  offer: TransitCommercialOffer
): TransitCommercialOffer {
  if (!offer.enabled) return { ...offer, disclosure: null };
  return {
    ...offer,
    disclosure: normalizedTransitCommercialOfferDisclosure(offer.disclosure),
  };
}

export function normalizedTransitCommercialOfferDisclosure(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text || isLegacyTransitCommercialOfferDisclosure(text)) {
    return TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE;
  }
  return text;
}

function isLegacyTransitCommercialOfferDisclosure(value: string): boolean {
  return [
    "该链接可能包含 AFF；优惠为首充充值折扣，不改变模型公开价格倍率，也不代表 PriceAI 担保。",
    "该站点存在商业合作信息，不影响页面价格口径；注册后请回原站核验活动规则、充值比例和退款规则。",
    "该链接包含AFF,但不影响排序口径。",
    "该链接包含AFF，但不影响排序口径。",
    "该链接可能包含 AFF，不影响排序口径。",
  ].includes(value);
}

export function getTransitVerificationEvents(
  station: TransitStation
): TransitVerificationEvent[] {
  const events = station.verificationEvents || [];
  if (events.length) {
    return [...events].sort((left, right) =>
      new Date(right.happenedAt).getTime() - new Date(left.happenedAt).getTime()
    );
  }

  const fallbackEvents: TransitVerificationEvent[] = [];
  if (station.availability.lastCheckedAt) {
    fallbackEvents.push({
      id: `${station.id}-availability`,
      source: "priceai",
      status: station.availability.sevenDayRate === null ? "warning" : "success",
      title: "可用性样本已记录",
      description: station.availability.note ?? null,
      happenedAt: station.availability.lastCheckedAt,
    });
  }
  if (station.lastUpdatedAt) {
    fallbackEvents.push({
      id: `${station.id}-updated`,
      source: "priceai",
      status: station.dataStatus === "verified" ? "success" : "info",
      title: `资料状态：${station.dataStatus === "verified" ? "已核验" : "待继续核验"}`,
      description: station.feedback.publicNotes,
      happenedAt: station.lastUpdatedAt,
    });
  }

  return fallbackEvents;
}

function dedupeTags<T extends { id: string; label: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeValues<T extends string>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function compareStations(
  stations: TransitStation[],
  sortBy: TransitSortKey,
  options: {
    activeFamily?: TransitModelFamily | "all";
    activeStandardModel?: TransitModelPrice["standardModel"] | "all";
  } = {}
): TransitStation[] {
  return [...stations].sort((left, right) => {
    const a = getStationComparisonSummary(left);
    const b = getStationComparisonSummary(right);
    const aScope = getActiveSortScope(left, a, options);
    const bScope = getActiveSortScope(right, b, options);
    const aRate = aScope ? aScope.combinedRateMin : a.bestCombinedRate;
    const bRate = bScope ? bScope.combinedRateMin : b.bestCombinedRate;
    const aStabilityRate = aScope ? aScope.sevenDayRate : a.stabilityRate;
    const bStabilityRate = bScope ? bScope.sevenDayRate : b.stabilityRate;
    const aStabilitySamples = aScope ? aScope.sevenDaySamples : a.stabilitySamples;
    const bStabilitySamples = bScope ? bScope.sevenDaySamples : b.stabilitySamples;
    const aOverallScore = aScope ? getScopedOverallScore(left, a, aScope) : a.overallScore;
    const bOverallScore = bScope ? getScopedOverallScore(right, b, bScope) : b.overallScore;

    if (sortBy === "stability") {
      return (
        compareNullableNumber(aStabilityRate, bStabilityRate, "desc") ||
        bStabilitySamples - aStabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    if (sortBy === "rate") {
      return (
        compareNullableNumber(aRate, bRate, "asc") ||
        compareNullableNumber(aStabilityRate, bStabilityRate, "desc") ||
        bStabilitySamples - aStabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    if (sortBy === "claude_rate") {
      return (
        compareNullableNumber(a.claude.combinedRateMin, b.claude.combinedRateMin, "asc") ||
        compareNullableNumber(aRate, bRate, "asc") ||
        compareNullableNumber(aStabilityRate, bStabilityRate, "desc") ||
        bStabilitySamples - aStabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    if (sortBy === "gpt_rate") {
      return (
        compareNullableNumber(a.gpt.combinedRateMin, b.gpt.combinedRateMin, "asc") ||
        compareNullableNumber(aRate, bRate, "asc") ||
        compareNullableNumber(aStabilityRate, bStabilityRate, "desc") ||
        bStabilitySamples - aStabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    return (
      bOverallScore - aOverallScore ||
      compareNullableNumber(aRate, bRate, "asc") ||
      compareNullableNumber(aStabilityRate, bStabilityRate, "desc") ||
      bStabilitySamples - aStabilitySamples ||
      new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
    );
  });
}

function getActiveSortScope(
  station: TransitStation,
  summary: TransitStationComparisonSummary,
  options: {
    activeFamily?: TransitModelFamily | "all";
    activeStandardModel?: TransitModelPrice["standardModel"] | "all";
  }
): TransitFamilyRateSummary | null {
  if (options.activeStandardModel && options.activeStandardModel !== "all") {
    return getStandardModelRateSummary(station, options.activeStandardModel);
  }

  if (options.activeFamily && options.activeFamily !== "all") {
    return summary.families[options.activeFamily];
  }

  return null;
}

function getScopedOverallScore(
  station: TransitStation,
  summary: TransitStationComparisonSummary,
  scope: TransitFamilyRateSummary
): number {
  const rateScore = scoreTransitCombinedRate(scope.combinedRateMin);
  const stabilityScore = (scope.sevenDayRate ?? 0) * 35;
  const sampleScore = Math.min(scope.sevenDaySamples / 12, 12);
  const completenessScore = Math.min(summary.sourceCompleteness * 1.5, 9);
  const commercialScore =
    station.commercialRelation === "sponsored" ? 6 :
      station.commercialRelation === "partner" ? 4 :
        station.commercialRelation === "listed" ? 2 :
          station.commercialRelation === "affiliate" ? 1 :
            0;
  const stationSystem = getTransitStationSystem(station);
  const systemScore =
    stationSystem === "sub_to_api" ? 5 :
      stationSystem === "new_api" ? -10 :
        0;
  const riskPenalty = station.riskLabels.reduce((total, risk) => {
    if (risk === "sample_data") return total + 1;
    if (risk === "insufficient_samples") return total + 3;
    if (risk === "mixed_pool") return total + 2;
    if (risk === "reseller") return total + 3;
    if (risk === "undisclosed_upstream") return total + 5;
    if (risk === "third_party_aggregate") return total + 6;
    return total + 2;
  }, 0);

  return rateScore + stabilityScore + sampleScore + completenessScore + commercialScore + systemScore - riskPenalty;
}

export function scoreTransitCombinedRate(rate: number | null): number {
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.min(55, 18 / rate);
}

function compareNullableNumber(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc"
) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

export type TransitModelPriceEntry = {
  station: TransitStation;
  price: TransitModelPrice;
  rechargeCoefficient: number | null;
  combinedRate: number | null;
};

export type TransitModelSummary = {
  standardModel: TransitModelPrice["standardModel"];
  family: TransitModelFamily;
  familyLabel: string;
  stationCount: number;
  bestCombinedRate: number | null;
  worstCombinedRate: number | null;
  averageAvailability: number | null;
  sampleCount: number;
  prices: TransitModelPriceEntry[];
};

export function getTransitModelFamilyOptions(): { id: TransitModelFamily; label: string }[] {
  return TRANSIT_MODEL_FAMILY_OPTIONS;
}

export function getTransitModelSummaries(
  stations: TransitStation[],
  family: "all" | TransitModelFamily = "all"
): TransitModelSummary[] {
  const byModel = new Map<TransitModelPrice["standardModel"], TransitModelPriceEntry[]>();
  const standardModels = TRANSIT_STANDARD_MODELS.filter((standardModel) => {
    if (family === "all") return true;
    return TRANSIT_STANDARD_MODEL_FAMILY[standardModel] === family;
  });
  const standardModelOrder = new Map(
    TRANSIT_STANDARD_MODELS.map((standardModel, index) => [standardModel, index])
  );

  stations.forEach((station) => {
    station.prices.forEach((price) => {
      if (family !== "all" && price.family !== family) return;

      const entry: TransitModelPriceEntry = {
        station,
        price,
        rechargeCoefficient:
          getRechargeCoefficientFromRatio(price.rechargeRatio) ??
          getStationRechargeCoefficient(station),
        combinedRate: getCombinedRateForPrice(station, price),
      };

      const existing = byModel.get(price.standardModel);
      if (existing) {
        existing.push(entry);
      } else {
        byModel.set(price.standardModel, [entry]);
      }
    });
  });

  const summaryModels = [...standardModels];
  byModel.forEach((_, standardModel) => {
    if (!summaryModels.includes(standardModel)) {
      summaryModels.push(standardModel);
    }
  });

  return summaryModels
    .map((standardModel) => {
      const prices = byModel.get(standardModel) ?? [];
      const finiteRates = prices
        .map((entry) => entry.combinedRate)
        .filter((rate): rate is number => rate !== null && Number.isFinite(rate))
        .sort((a, b) => a - b);
      const sampleCount = prices.reduce(
        (total, entry) => total + entry.price.availability.sevenDaySamples,
        0
      );
      const averageAvailability =
        sampleCount > 0
          ? prices.reduce((total, entry) => {
              const rate = entry.price.availability.sevenDayRate ?? 0;
              return total + rate * entry.price.availability.sevenDaySamples;
            }, 0) / sampleCount
          : null;
      const modelFamily = prices[0]?.price.family ?? TRANSIT_STANDARD_MODEL_FAMILY[standardModel];

      return {
        standardModel,
        family: modelFamily,
        familyLabel: TRANSIT_MODEL_FAMILY_LABELS[modelFamily],
        stationCount: new Set(prices.map((entry) => entry.station.id)).size,
        bestCombinedRate: finiteRates[0] ?? null,
        worstCombinedRate: finiteRates[finiteRates.length - 1] ?? null,
        averageAvailability,
        sampleCount,
        prices: prices.sort((a, b) =>
          compareNullableNumber(a.combinedRate, b.combinedRate, "asc")
        ),
      };
    })
    .sort((a, b) => {
      const familyOrder = TRANSIT_MODEL_FAMILY_ORDER.indexOf(a.family) - TRANSIT_MODEL_FAMILY_ORDER.indexOf(b.family);
      if (familyOrder !== 0) return familyOrder;
      return (
        compareNullableNumber(a.bestCombinedRate, b.bestCombinedRate, "asc") ||
        (standardModelOrder.get(a.standardModel) ?? Number.MAX_SAFE_INTEGER) -
          (standardModelOrder.get(b.standardModel) ?? Number.MAX_SAFE_INTEGER)
      );
    });
}

export function getSummaryStats(stations: TransitStation[]) {
  const summaries = stations.map(getStationComparisonSummary);
  const bestClaude = summaries
    .map((summary) => summary.claude.combinedRateMin)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[0] ?? null;
  const bestGpt = summaries
    .map((summary) => summary.gpt.combinedRateMin)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)[0] ?? null;
  const bestByFamily = TRANSIT_MODEL_FAMILY_ORDER.reduce(
    (accumulator, family) => {
      accumulator[family] = summaries
        .map((summary) => summary.families[family].combinedRateMin)
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b)[0] ?? null;
      return accumulator;
    },
    {} as Record<TransitModelFamily, number | null>
  );
  const sevenDaySamples = stations.reduce(
    (total, station) => total + getStationPublishedAvailabilitySummary(station).sevenDaySamples,
    0
  );

  return {
    total: stations.length,
    bestClaude,
    bestGpt,
    bestByFamily,
    sevenDaySamples,
    withRisk: stations.filter((station) => station.riskLabels.length > 0).length,
  };
}

export function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "—";
  if (rate < 0.01) return `${rate.toFixed(4)}x`;
  if (rate < 0.1) return `${rate.toFixed(3)}x`;
  return `${rate.toFixed(2)}x`;
}

export function formatTransitModelMultiplier(price: TransitModelPrice): string {
  const value = price.modelMultiplier;
  if (value === null || !Number.isFinite(value)) return "—";
  if (!hasComparableTransitOfficialPrice(price.standardModel)) return `${formatFixedTransitUnitPrice(value)} 固定价`;
  return `${value.toFixed(2)}x`;
}

function formatFixedTransitUnitPrice(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  if (value >= 1) return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  if (value >= 0.1) return value.toFixed(3);
  return value.toFixed(4);
}

export function formatUsdPerMTok(price: number | null): string {
  return formatOfficialUnitPrice(price, "USD");
}

export function formatOfficialUnitPrice(
  price: number | null,
  currency: TransitPriceCurrency
): string {
  if (price === null || !Number.isFinite(price)) return "未公开";
  if (price === 0) return currency === "CNY" ? "¥0/M" : "$0/M";

  const absolutePrice = Math.abs(price);
  const decimals = absolutePrice >= 1 ? (Number.isInteger(price) ? 0 : 2) : absolutePrice >= 0.1 ? 3 : 4;

  return `${currency === "CNY" ? "¥" : "$"}${price.toFixed(decimals)}/M`;
}

export function formatMultiplierRange(summary: TransitFamilyRateSummary): string {
  if (summary.modelMultiplierMin === null) return "—";
  const suffix = summary.combinedRateMin === null && (summary.family === "image" || summary.family === "video") ? " 固定价" : "x";
  if (summary.modelMultiplierMax === null || summary.modelMultiplierMax === summary.modelMultiplierMin) {
    return `${summary.modelMultiplierMin.toFixed(2)}${suffix}`;
  }
  return `${summary.modelMultiplierMin.toFixed(2)}-${summary.modelMultiplierMax.toFixed(2)}${suffix}`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "样本不足";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatCacheHitRate(cacheUsage: TransitModelPrice["cacheUsage"] | null | undefined): string {
  if (!cacheUsage || cacheUsage.sampleTokens <= 0 || cacheUsage.hitRate === null) return "样本不足";
  return formatPercent(cacheUsage.hitRate);
}

export function getCacheHitRateBadgeClass(cacheUsage: TransitModelPrice["cacheUsage"] | null | undefined): string {
  if (!cacheUsage || cacheUsage.sampleTokens <= 0 || cacheUsage.hitRate === null) {
    return "bg-[#f2f4f4] text-[#7f8889]";
  }
  if (cacheUsage.hitRate >= 0.9) return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (cacheUsage.hitRate >= 0.8) return "bg-[#eef3f8] text-[#47657a]";
  if (cacheUsage.hitRate >= 0.5) return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#fbe9e7] text-[#9b3328]";
}

export function formatTransitLatencyMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "未记录";
  if (value >= 1000) return `${formatCompactNumber(value / 1000)}s`;
  return `${Math.round(value)}ms`;
}

export function getRepresentativeCacheUsage(
  prices: TransitModelPrice[]
): TransitModelPrice["cacheUsage"] | undefined {
  return prices
    .map((price) => price.cacheUsage)
    .filter((cacheUsage): cacheUsage is NonNullable<TransitModelPrice["cacheUsage"]> => Boolean(cacheUsage))
    .sort((left, right) => {
      const leftHasSamples = left.sampleTokens > 0 && left.hitRate !== null;
      const rightHasSamples = right.sampleTokens > 0 && right.hitRate !== null;
      if (leftHasSamples !== rightHasSamples) return leftHasSamples ? -1 : 1;
      return right.sampleTokens - left.sampleTokens;
    })[0];
}

function latestLatencyFromPrices(prices: TransitModelPrice[]): number | null {
  return prices
    .filter((price) => price.availability.latestLatencyMs !== null && price.availability.latestLatencyMs !== undefined)
    .sort((left, right) => {
      const leftTime = new Date(left.availability.lastCheckedAt || left.lastVerifiedAt).getTime();
      const rightTime = new Date(right.availability.lastCheckedAt || right.lastVerifiedAt).getTime();
      return rightTime - leftTime;
    })[0]?.availability.latestLatencyMs ?? null;
}

function weightedAverageLatency(prices: TransitModelPrice[]): number | null {
  let total = 0;
  let samples = 0;
  for (const price of prices) {
    const latency = price.availability.avgLatency7dMs;
    if (latency === null || latency === undefined || !Number.isFinite(latency)) continue;
    const weight = Math.max(1, price.availability.sevenDaySamples || 0);
    total += latency * weight;
    samples += weight;
  }
  return samples > 0 ? total / samples : null;
}

function latestLatencyFromSummaries(summaries: TransitFamilyRateSummary[]): number | null {
  return summaries
    .filter((summary) => summary.latestLatencyMs !== null && summary.latestLatencyMs !== undefined)
    .sort((left, right) => {
      const leftTime = new Date(left.lastCheckedAt || left.firstCheckedAt || 0).getTime();
      const rightTime = new Date(right.lastCheckedAt || right.firstCheckedAt || 0).getTime();
      return rightTime - leftTime;
    })[0]?.latestLatencyMs ?? null;
}

function weightedAverageLatencyFromSummaries(summaries: TransitFamilyRateSummary[]): number | null {
  let total = 0;
  let samples = 0;
  for (const summary of summaries) {
    if (summary.avgLatency7dMs === null || summary.avgLatency7dMs === undefined || !Number.isFinite(summary.avgLatency7dMs)) {
      continue;
    }
    const weight = Math.max(1, summary.sevenDaySamples || 0);
    total += summary.avgLatency7dMs * weight;
    samples += weight;
  }
  return samples > 0 ? total / samples : null;
}

function formatCompactNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

export function formatAvailability(
  availability: Pick<TransitStation["availability"], "sevenDayRate" | "sevenDaySamples">
): string {
  if (availability.sevenDaySamples <= 0 || availability.sevenDayRate === null) return "样本不足";
  return `${formatPercent(availability.sevenDayRate)} · 样本 ${availability.sevenDaySamples}`;
}

export type AvailabilitySourceTone = "success" | "info" | "warning" | "muted";

export function getAvailabilitySourceMeta(
  availability: Pick<TransitAvailability, "sourceType" | "sourceLabel" | "sourceUrl">
): { label: string; tone: AvailabilitySourceTone; title: string; url: string | null } {
  const explicitLabel = availability.sourceLabel?.trim();
  switch (availability.sourceType) {
    case "priceai_probe":
      return {
        label: "PriceAI 实测",
        tone: "success",
        title: explicitLabel
          ? `PriceAI 使用测试 API Key 发起真实模型请求后汇总的可用性样本。原始来源：${explicitLabel}`
          : "PriceAI 使用测试 API Key 发起真实模型请求后汇总的可用性样本。",
        url: availability.sourceUrl,
      };
    case "public_status":
      return {
        label: "公开来源",
        tone: "info",
        title: explicitLabel
          ? `来自站点公开状态页或公开监测接口，非 PriceAI API Key 实测。原始来源：${explicitLabel}`
          : "来自站点公开状态页或公开监测接口，非 PriceAI API Key 实测。",
        url: availability.sourceUrl,
      };
    case "public_model_catalog":
      return {
        label: "公开来源",
        tone: "info",
        title: explicitLabel
          ? `来自站点公开模型目录中的可用性指标，非 PriceAI API Key 实测。原始来源：${explicitLabel}`
          : "来自站点公开模型目录中的可用性指标，非 PriceAI API Key 实测。",
        url: availability.sourceUrl,
      };
    case "partner_api":
      return {
        label: "公开来源",
        tone: "info",
        title: explicitLabel
          ? `来自站长提供的公开或合作接口，非 PriceAI API Key 实测。原始来源：${explicitLabel}`
          : "来自站长提供的公开或合作接口，非 PriceAI API Key 实测。",
        url: availability.sourceUrl,
      };
    case "merchant_reported":
      return {
        label: "未核验",
        tone: "warning",
        title: explicitLabel
          ? `来自商家提交的截图或资料，尚未视为 PriceAI 实测。原始来源：${explicitLabel}`
          : "来自商家提交的截图或资料，尚未视为 PriceAI 实测。",
        url: availability.sourceUrl,
      };
    case "manual_snapshot":
      return {
        label: "未核验",
        tone: "muted",
        title: explicitLabel
          ? `来自一次性快照或未完成自动核验的数据，后续应替换为公开接口或 PriceAI 实测。原始来源：${explicitLabel}`
          : "来自一次性快照或未完成自动核验的数据，后续应替换为公开接口或 PriceAI 实测。",
        url: availability.sourceUrl,
      };
    default:
      return {
        label: "未核验",
        tone: "muted",
        title: explicitLabel
          ? `当前稳定性来源尚未结构化记录。原始来源：${explicitLabel}`
          : "当前稳定性来源尚未结构化记录。",
        url: availability.sourceUrl,
      };
  }
}

export function getRateBadgeClass(rate: number | null): string {
  if (rate === null) return "bg-[#f2f4f4] text-[#5a6061]";
  if (rate <= 0.5) return "bg-[#e8f3ec] text-[#2f7a4b]";
  if (rate <= 1) return "bg-[#fff7e8] text-[#7a541b]";
  return "bg-[#f2f4f4] text-[#5a6061]";
}

export function getUsageAdviceBadgeClass(advice: TransitStation["usageAdvice"]): string {
  switch (advice) {
    case "try_small":
      return "bg-[#e8f3ec] text-[#2f7a4b]";
    case "cautious":
      return "bg-[#fff7e8] text-[#7a541b]";
    case "not_recommended":
      return "bg-[#fbe9e7] text-[#9b3328]";
    default:
      return "bg-[#f2f4f4] text-[#5a6061]";
  }
}

export { TRANSIT_COMMERCIAL_LABELS };
