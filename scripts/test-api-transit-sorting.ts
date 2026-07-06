import {
  compareStations,
  getActiveTransitCommercialOffers,
  getStationComparisonSummary,
  getStationPublishedAvailabilitySummary,
  getStandardModelRateSummary,
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

const stationLevelSamplesOnly = station({
  id: "station-level-samples",
  name: "Station Level Samples",
  claudeRate: 0.8,
  availabilityRate: 1,
  availabilitySamples: 120,
});
stationLevelSamplesOnly.availability = {
  ...stationLevelSamplesOnly.availability,
  firstCheckedAt: "2026-07-02T06:00:00.000Z",
  lastCheckedAt: "2026-07-02T08:00:00.000Z",
  recentSamples: [
    {
      ok: true,
      latencyMs: 1200,
      pingLatencyMs: 180,
      checkedAt: "2026-07-02T08:00:00.000Z",
      sourceType: "priceai_probe",
      sourceLabel: "PriceAI 实测",
      sourceUrl: null,
    },
  ],
};
stationLevelSamplesOnly.prices[0]!.availability = {
  ...stationLevelSamplesOnly.prices[0]!.availability,
  recentSamples: [],
};
const stationLevelSampleSummary = getStationPublishedAvailabilitySummary(stationLevelSamplesOnly);
assertEqual(stationLevelSampleSummary.recentSamples?.length, 1);
assertEqual(stationLevelSampleSummary.lastCheckedAt, "2026-07-02T08:00:00.000Z");

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
