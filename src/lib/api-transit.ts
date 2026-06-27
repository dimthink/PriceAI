import type {
  TransitChannelType,
  TransitCommercialOffer,
  TransitModelFamily,
  TransitModelPrice,
  TransitStation,
  TransitVerificationEvent,
  TransitStationSystem,
} from "@/data/api-transit/types";
import {
  TRANSIT_CHANNEL_TYPE_LABELS,
  TRANSIT_MODEL_FAMILY_LABELS,
  TRANSIT_COMMERCIAL_LABELS,
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

  const match = text.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const base = Number(match[1]);
  const quota = Number(match[2]);
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
  const coefficient =
    getRechargeCoefficientFromRatio(price.rechargeRatio) ??
    getStationRechargeCoefficient(station);
  if (coefficient === null || price.modelMultiplier === null) return null;

  return coefficient * price.modelMultiplier;
}

export type TransitPriceMetric = "input" | "output" | "cacheWrite" | "cacheRead";

export type TransitOfficialModelPrice = Record<TransitPriceMetric, number | null> & {
  sourceLabel: string;
  sourceUrl: string;
};

const anthropicPricingUrl = "https://platform.claude.com/docs/en/about-claude/pricing";
const openAiPricingUrl = "https://developers.openai.com/api/docs/pricing";

const TRANSIT_OFFICIAL_MODEL_PRICES: Record<
  TransitModelPrice["standardModel"],
  TransitOfficialModelPrice
> = {
  "Claude Sonnet 4.6": {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Opus 4.6": {
    input: 5,
    output: 25,
    cacheWrite: 6.25,
    cacheRead: 0.5,
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Opus 4.7": {
    input: 5,
    output: 25,
    cacheWrite: 6.25,
    cacheRead: 0.5,
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "Claude Opus 4.8": {
    input: 5,
    output: 25,
    cacheWrite: 6.25,
    cacheRead: 0.5,
    sourceLabel: "Anthropic API",
    sourceUrl: anthropicPricingUrl,
  },
  "GPT 5.5": {
    input: 5,
    output: 30,
    cacheWrite: 0.5,
    cacheRead: 0.5,
    sourceLabel: "OpenAI API",
    sourceUrl: openAiPricingUrl,
  },
  "GPT 5.4": {
    input: 2.5,
    output: 15,
    cacheWrite: 0.25,
    cacheRead: 0.25,
    sourceLabel: "OpenAI API",
    sourceUrl: openAiPricingUrl,
  },
};

export function getOfficialTransitModelPrice(
  standardModel: TransitModelPrice["standardModel"]
): TransitOfficialModelPrice {
  return TRANSIT_OFFICIAL_MODEL_PRICES[standardModel];
}

export function getOfficialTransitUnitPrice(
  standardModel: TransitModelPrice["standardModel"],
  metric: TransitPriceMetric
): number | null {
  return getOfficialTransitModelPrice(standardModel)[metric];
}

export function getTransitSplitMultiplier(
  price: TransitModelPrice,
  metric: TransitPriceMetric
): number | null {
  if (metric === "input") return price.inputPrice ?? price.modelMultiplier;
  if (metric === "output") return price.outputPrice ?? price.modelMultiplier;
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
};

export function getFamilyRateSummary(
  station: TransitStation,
  family: TransitModelFamily
): TransitFamilyRateSummary {
  const prices = getFamilyPrices(station, family);
  const multipliers = prices
    .map((price) => price.modelMultiplier)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const combinedRates = prices
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
  };
}

export type TransitStationComparisonSummary = {
  station: TransitStation;
  claude: TransitFamilyRateSummary;
  gpt: TransitFamilyRateSummary;
  bestCombinedRate: number | null;
  stabilityRate: number | null;
  stabilitySamples: number;
  sourceCompleteness: number;
  overallScore: number;
};

export function getStationComparisonSummary(
  station: TransitStation
): TransitStationComparisonSummary {
  const claude = getFamilyRateSummary(station, "claude");
  const gpt = getFamilyRateSummary(station, "gpt");
  const combinedRates = [claude.combinedRateMin, gpt.combinedRateMin].filter(
    (value): value is number => value !== null
  );
  const bestCombinedRate = combinedRates.length ? Math.min(...combinedRates) : null;
  const stabilityRate = station.availability.sevenDayRate;
  const stabilitySamples = station.availability.sevenDaySamples;
  const sourceCompleteness = [
    station.minimumTopUp,
    station.paymentMethods.length ? "payments" : null,
    station.supportChannels.length ? "support" : null,
    station.channelTypes.length ? "channels" : null,
    station.accountPools.length ? "pools" : null,
  ].filter(Boolean).length;

  const rateScore = bestCombinedRate === null ? 0 : Math.max(0, 40 - bestCombinedRate * 900);
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
    claude,
    gpt,
    bestCombinedRate,
    stabilityRate,
    stabilitySamples,
    sourceCompleteness,
    overallScore:
      rateScore + stabilityScore + sampleScore + completenessScore + commercialScore + systemScore - riskPenalty,
  };
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
  return "自研";
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
  return (station.commercialOffers || []).filter((offer) => offer.enabled);
}

export function getPrimaryTransitCommercialOffer(
  station: TransitStation
): TransitCommercialOffer | null {
  const offers = getActiveTransitCommercialOffers(station);
  return offers.find((offer) => offer.type === "coupon") ?? offers[0] ?? null;
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
  sortBy: TransitSortKey
): TransitStation[] {
  return [...stations].sort((left, right) => {
    const a = getStationComparisonSummary(left);
    const b = getStationComparisonSummary(right);

    if (sortBy === "stability") {
      return (
        compareNullableNumber(a.stabilityRate, b.stabilityRate, "desc") ||
        b.stabilitySamples - a.stabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    if (sortBy === "rate") {
      return (
        compareNullableNumber(a.bestCombinedRate, b.bestCombinedRate, "asc") ||
        compareNullableNumber(a.stabilityRate, b.stabilityRate, "desc") ||
        b.stabilitySamples - a.stabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    if (sortBy === "claude_rate") {
      return (
        compareNullableNumber(a.claude.combinedRateMin, b.claude.combinedRateMin, "asc") ||
        compareNullableNumber(a.bestCombinedRate, b.bestCombinedRate, "asc") ||
        compareNullableNumber(a.stabilityRate, b.stabilityRate, "desc") ||
        b.stabilitySamples - a.stabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    if (sortBy === "gpt_rate") {
      return (
        compareNullableNumber(a.gpt.combinedRateMin, b.gpt.combinedRateMin, "asc") ||
        compareNullableNumber(a.bestCombinedRate, b.bestCombinedRate, "asc") ||
        compareNullableNumber(a.stabilityRate, b.stabilityRate, "desc") ||
        b.stabilitySamples - a.stabilitySamples ||
        new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
      );
    }

    return (
      b.overallScore - a.overallScore ||
      compareNullableNumber(a.bestCombinedRate, b.bestCombinedRate, "asc") ||
      compareNullableNumber(a.stabilityRate, b.stabilityRate, "desc") ||
      b.stabilitySamples - a.stabilitySamples ||
      new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime()
    );
  });
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

export function getTransitModelFamilyOptions(
  stations: TransitStation[]
): { id: TransitModelFamily; label: string }[] {
  const seen = new Set<TransitModelFamily>();
  stations.forEach((station) => station.prices.forEach((price) => seen.add(price.family)));

  return (["claude", "gpt"] as const)
    .filter((family) => seen.has(family))
    .map((family) => ({ id: family, label: TRANSIT_MODEL_FAMILY_LABELS[family] }));
}

export function getTransitModelSummaries(
  stations: TransitStation[],
  family: "all" | TransitModelFamily = "all"
): TransitModelSummary[] {
  const byModel = new Map<TransitModelPrice["standardModel"], TransitModelPriceEntry[]>();

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

  return Array.from(byModel.entries())
    .map(([standardModel, prices]) => {
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
      const modelFamily = prices[0].price.family;

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
      const familyOrder = a.family.localeCompare(b.family, "zh-CN");
      if (familyOrder !== 0) return familyOrder;
      return compareNullableNumber(a.bestCombinedRate, b.bestCombinedRate, "asc");
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
  const sevenDaySamples = stations.reduce(
    (total, station) => total + station.availability.sevenDaySamples,
    0
  );

  return {
    total: stations.length,
    bestClaude,
    bestGpt,
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

export function formatUsdPerMTok(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "未公开";
  if (price === 0) return "$0/M";

  const absolutePrice = Math.abs(price);
  const decimals = absolutePrice >= 1 ? (Number.isInteger(price) ? 0 : 2) : absolutePrice >= 0.1 ? 3 : 4;

  return `$${price.toFixed(decimals)}/M`;
}

export function formatMultiplierRange(summary: TransitFamilyRateSummary): string {
  if (summary.modelMultiplierMin === null) return "—";
  if (summary.modelMultiplierMax === null || summary.modelMultiplierMax === summary.modelMultiplierMin) {
    return `${summary.modelMultiplierMin.toFixed(2)}x`;
  }
  return `${summary.modelMultiplierMin.toFixed(2)}-${summary.modelMultiplierMax.toFixed(2)}x`;
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "样本不足";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatAvailability(
  availability: Pick<TransitStation["availability"], "sevenDayRate" | "sevenDaySamples">
): string {
  if (availability.sevenDaySamples <= 0 || availability.sevenDayRate === null) return "样本不足";
  return `${formatPercent(availability.sevenDayRate)} · 样本 ${availability.sevenDaySamples}`;
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
