import {
  buildTransitAvailabilityBars,
  compareStations,
  getActiveTransitCommercialOffers,
  getFamilyRateSummary,
  getStationComparisonSummary,
  getStationPublishedAvailabilitySummary,
  getStandardModelRateSummary,
  getTransitModelSummaries,
  normalizedTransitCommercialOfferDisclosure,
  getRechargeCoefficientFromRatio,
  scoreTransitCombinedRate,
} from "../src/lib/api-transit";
import {
  TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE,
  type TransitStation,
} from "../src/data/api-transit/types";

const now = "2026-07-02T07:00:00.000Z";

function station(input: {
  id: string;
  name: string;
  claudeRate: number;
  availabilityRate: number;
  availabilitySamples: number;
}): TransitStation {
  return {
    id: input.id,
    slug: input.id,
    name: input.name,
    websiteUrl: `https://${input.id}.example.test/`,
    operatorType: "individual",
    invoiceSupport: "unknown",
    status: "active",
    sourceType: "manual_collected",
    commercialRelation: "none",
    summary: "",
    channelTypes: ["first_party_pool"],
    accountPools: ["max"],
    paymentMethods: [],
    minimumTopUp: null,
    balanceExpiry: null,
    supportChannels: ["官网后台"],
    refundPolicy: null,
    riskLabels: ["insufficient_samples"],
    usageAdvice: "try_small",
    lastUpdatedAt: now,
    dataStatus: "verified",
    availability: availability(input.availabilityRate, input.availabilitySamples),
    prices: [
      {
        family: "claude",
        standardModel: "Claude Fable 5",
        groupName: "Claude",
        rechargeRatio: "1:1",
        modelMultiplier: input.claudeRate,
        inputPrice: input.claudeRate,
        outputPrice: input.claudeRate,
        cacheReadPrice: input.claudeRate,
        cacheWritePrice: input.claudeRate,
        imageOutputPrice: null,
        currency: "CNY",
        accountPool: "max",
        channelType: "first_party_pool",
        priceSource: "test",
        lastVerifiedAt: now,
        availability: availability(input.availabilityRate, input.availabilitySamples),
      },
    ],
    feedback: {
      pendingCount: 0,
      verifiedRiskCount: 0,
      merchantRespondedCount: 0,
      mainThemes: [],
      publicNotes: null,
    },
  };
}

function availability(sevenDayRate: number, sevenDaySamples: number): TransitStation["availability"] {
  return {
    sevenDayRate,
    sevenDaySamples,
    firstCheckedAt: now,
    lastCheckedAt: now,
    sourceType: "priceai_probe",
    sourceLabel: "PriceAI 实测",
    sourceUrl: null,
  };
}

assertEqual(scoreTransitCombinedRate(0.3) > scoreTransitCombinedRate(1.5), true);
assertEqual(getRechargeCoefficientFromRatio("1 CNY = 1 USD balance"), 1);
assertEqual(getRechargeCoefficientFromRatio("1 CNY = 5 USD balance"), 0.2);

const neko = station({
  id: "999555999-com",
  name: "猫肥NekoAPI",
  claudeRate: 1.5,
  availabilityRate: 0.9847,
  availabilitySamples: 250,
});
const wawa = station({
  id: "wawazz-xyz",
  name: "WAWA ZZ API",
  claudeRate: 0.3,
  availabilityRate: 0.9867,
  availabilitySamples: 600,
});

assertDeepEqual(
  compareStations([neko, wawa], "overall", { activeFamily: "claude" }).map((item) => item.id),
  ["wawazz-xyz", "999555999-com"],
);

assertDeepEqual(
  compareStations([neko, wawa], "rate", { activeFamily: "claude" }).map((item) => item.id),
  ["wawazz-xyz", "999555999-com"],
);

const mixedAvailabilityStation = station({
  id: "mixed-availability",
  name: "Mixed Availability",
  claudeRate: 0.8,
  availabilityRate: 0.389,
  availabilitySamples: 702,
});
mixedAvailabilityStation.prices[0]!.availability = availability(0.966, 149);
mixedAvailabilityStation.prices.push({
  ...mixedAvailabilityStation.prices[0]!,
  family: "gpt",
  standardModel: "GPT 5.5",
  groupName: "GPT",
  modelMultiplier: 0.3,
  inputPrice: 0.3,
  outputPrice: 0.3,
  cacheReadPrice: 0.3,
  cacheWritePrice: 0.3,
  availability: availability(0.866, 149),
});

const publishedAvailability = getStationPublishedAvailabilitySummary(mixedAvailabilityStation);
assertEqual(publishedAvailability.sevenDaySamples, 298);
assertEqual(publishedAvailability.sevenDayRate, 0.916);
assertEqual(getStationComparisonSummary(mixedAvailabilityStation).stabilityRate, 0.916);

const stationOnlyProbeAvailability = station({
  id: "station-only-probe",
  name: "Station Only Probe",
  claudeRate: 0.8,
  availabilityRate: 0,
  availabilitySamples: 1000,
});
stationOnlyProbeAvailability.prices[0]!.availability = {
  ...stationOnlyProbeAvailability.prices[0]!.availability,
  sevenDayRate: null,
  sevenDaySamples: 0,
  firstCheckedAt: null,
  lastCheckedAt: null,
};
const stationOnlyPublishedAvailability = getStationPublishedAvailabilitySummary(stationOnlyProbeAvailability);
assertEqual(stationOnlyPublishedAvailability.sevenDaySamples, 0);
assertEqual(stationOnlyPublishedAvailability.sevenDayRate, null);
assertEqual(stationOnlyPublishedAvailability.firstCheckedAt, null);
assertEqual(stationOnlyPublishedAvailability.lastCheckedAt, null);

const recentTimeline = Array.from({ length: 63 }, (_, index) => ({
  ok:
    index < 3 ? false :
      index < 6 ? true :
        index < 9 ? false :
          index < 12 ? index !== 10 :
            true,
  checkedAt: new Date(Date.UTC(2026, 6, 2, 7, index)).toISOString(),
})).reverse();
const recentBars = buildTransitAvailabilityBars({
  rate: 0.98,
  samples: 63,
  recentSamples: recentTimeline,
});
assertEqual(recentBars.length, 20);
assertDeepEqual(recentBars.slice(0, 4), ["good", "bad", "warn", "good"]);

const partialRecentBars = buildTransitAvailabilityBars({
  rate: 1,
  samples: 2,
  recentSamples: [
    { ok: true, checkedAt: "2026-07-02T07:00:00.000Z" },
    { ok: false, checkedAt: "2026-07-02T07:01:00.000Z" },
  ],
});
assertEqual(partialRecentBars.length, 20);
assertEqual(partialRecentBars[0], "warn");
assertDeepEqual(partialRecentBars.slice(1), Array(19).fill("empty"));

const fallbackAvailabilityBars = buildTransitAvailabilityBars({
  rate: 1,
  samples: 16,
  firstCheckedAt: now,
  lastCheckedAt: now,
});
assertEqual(fallbackAvailabilityBars.length, 20);
assertDeepEqual(fallbackAvailabilityBars.slice(0, 6), Array(6).fill("good"));
assertDeepEqual(fallbackAvailabilityBars.slice(6), Array(14).fill("empty"));

const fullFallbackAvailabilityBars = buildTransitAvailabilityBars({
  rate: 0.99,
  samples: 360,
  firstCheckedAt: now,
  lastCheckedAt: now,
});
assertEqual(fullFallbackAvailabilityBars.length, 20);
assertEqual(fullFallbackAvailabilityBars.filter((tone) => tone === "empty").length, 0);

mixedAvailabilityStation.prices[0]!.availability.recentSamples = [
  { ok: true, checkedAt: "2026-07-02T06:00:00.000Z" },
  { ok: false, checkedAt: "2026-07-02T06:01:00.000Z" },
];
mixedAvailabilityStation.prices[1]!.availability.recentSamples = [
  { ok: true, checkedAt: "2026-07-02T06:02:00.000Z" },
];
assertDeepEqual(
  getStationPublishedAvailabilitySummary(mixedAvailabilityStation).recentSamples,
  [
    { ok: true, checkedAt: "2026-07-02T06:00:00.000Z" },
    { ok: false, checkedAt: "2026-07-02T06:01:00.000Z" },
    { ok: true, checkedAt: "2026-07-02T06:02:00.000Z" },
  ],
);

const mixedClaudeGroupStation = station({
  id: "mixed-claude-group",
  name: "Mixed Claude Group",
  claudeRate: 1.32,
  availabilityRate: 1,
  availabilitySamples: 1,
});
mixedClaudeGroupStation.prices = [
  {
    ...mixedClaudeGroupStation.prices[0]!,
    standardModel: "Claude Sonnet 4.6",
    groupName: "GPT",
    modelMultiplier: 0.06,
    inputPrice: 0.06,
    outputPrice: 0.06,
    cacheReadPrice: 0.06,
    cacheWritePrice: 0.06,
  },
  {
    ...mixedClaudeGroupStation.prices[0]!,
    standardModel: "Claude Opus 4.6",
    groupName: "GPT",
    modelMultiplier: 0.9,
    inputPrice: 0.9,
    outputPrice: 0.9,
    cacheReadPrice: 0.9,
    cacheWritePrice: 0.9,
  },
  {
    ...mixedClaudeGroupStation.prices[0]!,
    standardModel: "Claude Opus 4.6",
    groupName: "Kiro",
    modelMultiplier: 0.22,
    inputPrice: 0.22,
    outputPrice: 0.22,
    cacheReadPrice: 0.22,
    cacheWritePrice: 0.22,
  },
  {
    ...mixedClaudeGroupStation.prices[0]!,
    standardModel: "Claude Opus 4.6",
    groupName: "Claude",
    modelMultiplier: 1.32,
    inputPrice: 1.32,
    outputPrice: 1.32,
    cacheReadPrice: 1.32,
    cacheWritePrice: 1.32,
  },
];
const mixedClaudeSummary = getStationComparisonSummary(mixedClaudeGroupStation);
assertEqual(mixedClaudeSummary.claude.priceCount, 4);
assertEqual(mixedClaudeSummary.claude.combinedRateMin, 0.22);
assertEqual(mixedClaudeSummary.bestCombinedRate, 0.22);
assertEqual(getStandardModelRateSummary(mixedClaudeGroupStation, "Claude Sonnet 4.6").combinedRateMin, 0.06);

const grokMediaStation = station({
  id: "grok-media",
  name: "Grok Media",
  claudeRate: 1,
  availabilityRate: 1,
  availabilitySamples: 1,
});
grokMediaStation.prices = [
  {
    ...grokMediaStation.prices[0]!,
    family: "grok",
    standardModel: "Grok Image",
    groupName: "Grok Image",
    modelMultiplier: 0.12,
    inputPrice: null,
    outputPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    imageOutputPrice: 0.12,
  },
  {
    ...grokMediaStation.prices[0]!,
    family: "grok",
    standardModel: "Grok Video",
    groupName: "Grok Video",
    modelMultiplier: 0.3,
    inputPrice: null,
    outputPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    imageOutputPrice: 0.3,
  },
];
assertEqual(getFamilyRateSummary(grokMediaStation, "grok").priceCount, 2);
assertEqual(getFamilyRateSummary(grokMediaStation, "image").priceCount, 1);
assertEqual(getFamilyRateSummary(grokMediaStation, "video").priceCount, 1);
assertEqual(
  getTransitModelSummaries([grokMediaStation], "image").some((summary) => summary.standardModel === "Grok Image"),
  true,
);
assertEqual(
  getTransitModelSummaries([grokMediaStation], "video").some((summary) => summary.standardModel === "Grok Video"),
  true,
);

const commercialStation = station({
  id: "commercial-test",
  name: "Commercial Test",
  claudeRate: 0.8,
  availabilityRate: 1,
  availabilitySamples: 10,
});
commercialStation.commercialOffers = [
  {
    id: "enabled-empty-disclosure",
    type: "coupon",
    title: "首充优惠",
    description: null,
    code: "PRICEAI",
    url: "https://commercial-test.example.test/register",
    validUntil: null,
    disclosure: null,
    enabled: true,
  },
  {
    id: "disabled-offer",
    type: "coupon",
    title: "不展示优惠",
    description: null,
    code: null,
    url: "https://commercial-test.example.test/hidden",
    validUntil: null,
    disclosure: "不应展示",
    enabled: false,
  },
];

const activeCommercialOffers = getActiveTransitCommercialOffers(commercialStation);
assertEqual(activeCommercialOffers.length, 1);
assertEqual(activeCommercialOffers[0]?.disclosure, TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE);
commercialStation.commercialOffers = [
  {
    id: "enabled-url-without-title",
    type: "affiliate",
    title: "",
    description: null,
    code: null,
    url: "https://commercial-test.example.test/aff",
    validUntil: null,
    disclosure: null,
    enabled: true,
  },
];
const activeUntitledOffers = getActiveTransitCommercialOffers(commercialStation);
assertEqual(activeUntitledOffers.length, 1);
assertEqual(activeUntitledOffers[0]?.title, "");
assertEqual(activeUntitledOffers[0]?.url, "https://commercial-test.example.test/aff");
assertEqual(
  normalizedTransitCommercialOfferDisclosure("该链接包含AFF,但不影响排序口径。"),
  TRANSIT_DEFAULT_COMMERCIAL_OFFER_DISCLOSURE,
);
assertEqual(
  normalizedTransitCommercialOfferDisclosure("特殊活动说明：仅限老用户。"),
  "特殊活动说明：仅限老用户。",
);

console.log("api transit sorting test passed");

function assertEqual(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}.`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`Expected ${actualText} to equal ${expectedText}.`);
  }
}
