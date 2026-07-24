import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "hot-offer-verifier-test-key";

const {
  HOT_OFFER_SLICES,
  fetchHotOfferSlices,
  groupCandidatesBySource,
  hotOfferDiff,
  hotOfferShardIndex,
  mergeHotOfferCandidates,
} = await import("./verify-hot-offers.mjs");
const { verifyShopApiOffer } = await import("./collect-prices.mjs");

assert.equal(HOT_OFFER_SLICES.length, 5);
assert.deepEqual(
  HOT_OFFER_SLICES.map((slice) => [slice.productId, slice.tag]),
  [
    ["chatgpt-plus", null],
    ["chatgpt-plus", "account_unverified"],
    ["chatgpt-plus", "account_verified"],
    ["chatgpt-team-business", null],
    ["chatgpt-team-business", "team_bug"],
  ],
);

const merged = mergeHotOfferCandidates([
  { id: "plus-default", productId: "chatgpt-plus", offers: [{ id: "a", sourceId: "s1" }, { id: "b", sourceId: "s2" }] },
  { id: "plus-verified", productId: "chatgpt-plus", offers: [{ id: "a", sourceId: "s1" }, { id: "c", sourceId: "s1" }] },
], { hardLimit: 3 });
assert.deepEqual(merged.map((offer) => offer.id), ["a", "b", "c"]);
assert.deepEqual(merged[0].hotSlices, [{ id: "plus-default", rank: 1 }, { id: "plus-verified", rank: 1 }]);

const sourceOne = merged.filter((offer) => offer.sourceId === "s1");
assert.ok(sourceOne.every((offer) => hotOfferShardIndex(offer, 2) === hotOfferShardIndex(sourceOne[0], 2)));
assert.deepEqual(groupCandidatesBySource(merged).map((group) => [group.sourceId, group.candidates.length]), [["s1", 2], ["s2", 1]]);

assert.deepEqual(
  hotOfferDiff(
    { price: 10, stockCount: 2, status: "in_stock", effectiveStatus: "available" },
    { price: 12, stockCount: 0, status: "out_of_stock", effectiveStatus: "unavailable" },
  ),
  {
    price: { from: 10, to: 12 },
    stockCount: { from: 2, to: 0 },
    status: { from: "in_stock", to: "out_of_stock" },
    effectiveStatus: { from: "available", to: "unavailable" },
  },
);

const requestedUrls = [];
const slices = await fetchHotOfferSlices({
  endpoint: "https://priceai.test",
  sliceLimit: 20,
  fetchImpl: async (url) => {
    requestedUrls.push(url.toString());
    return new Response(JSON.stringify({ offers: [] }), { status: 200, headers: { "content-type": "application/json" } });
  },
});
assert.equal(slices.length, 5);
assert.ok(requestedUrls.every((url) => url.includes("limit=20") && url.includes("offset=0")));
assert.ok(requestedUrls.some((url) => url.includes("tags=account_verified")));

const fixtureRequestJson = async (_url, body) => {
  const soldOut = body.goods_key === "sold-out";
  return {
      code: 1,
      data: {
        name: soldOut ? "Sold out fixture" : "Available fixture",
        price: soldOut ? 9 : 12,
        status: soldOut ? 0 : 1,
        extend: { stock_count: soldOut ? 0 : 7 },
      },
  };
};
{
  const baseUrl = "https://fixture.example";
  const target = {
    sourceId: "fixture-source",
    sourceName: "Fixture source",
    sourceStoreName: "Fixture store",
    sourceUrl: `${baseUrl}/shop/fixture`,
    baseUrl,
    kind: "shopApi",
  };
  const available = await verifyShopApiOffer(target, {
    sourceTitle: "Old title",
    price: 10,
    listedPrice: 10,
    priceBasis: "listed",
    status: "in_stock",
    effectiveStatus: "available",
    url: `${baseUrl}/item/available`,
    tags: ["fixture"],
  }, { shopApiProxyMode: "on-exit", shopApiRequestJson: fixtureRequestJson });
  assert.equal(available.status, "verified");
  assert.equal(available.offer.price, 12);
  assert.equal(available.offer.stockCount, 7);
  assert.equal(available.offer.status, "in_stock");

  const buyerFee = await verifyShopApiOffer({
    ...target,
    buyerFeeRate: 0.1,
    buyerFeeStrategy: "manual_verified",
  }, {
    sourceTitle: "Old title",
    price: 11,
    listedPrice: 10,
    priceBasis: "modeled",
    status: "in_stock",
    effectiveStatus: "available",
    url: `${baseUrl}/item/available`,
    tags: ["fixture"],
  }, { shopApiProxyMode: "on-exit", shopApiRequestJson: fixtureRequestJson });
  assert.equal(buyerFee.offer.listedPrice, 12);
  assert.equal(buyerFee.offer.price, 13.2);

  const soldOut = await verifyShopApiOffer(target, {
    sourceTitle: "Old title",
    price: 9,
    listedPrice: 9,
    priceBasis: "listed",
    status: "in_stock",
    effectiveStatus: "available",
    url: `${baseUrl}/item/sold-out`,
    tags: ["fixture"],
  }, { shopApiProxyMode: "on-exit", shopApiRequestJson: fixtureRequestJson });
  assert.equal(soldOut.status, "verified");
  assert.equal(soldOut.offer.stockCount, 0);
  assert.equal(soldOut.offer.status, "out_of_stock");
  assert.equal(soldOut.offer.effectiveStatus, "unavailable");
}

console.log("hot offer verifier tests passed");
