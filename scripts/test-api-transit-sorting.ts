import { compareStations, scoreTransitCombinedRate } from "../src/lib/api-transit";
import type { TransitStation } from "../src/data/api-transit/types";

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
