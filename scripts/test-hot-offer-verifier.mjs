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
  normalizeHotVerifiedOffer,
  selectHotVerifiedOffers,
} = await import("./verify-hot-offers.mjs");
const { stableOfferInputId } = await import("./collect-prices.mjs");

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
assert.deepEqual(hotOfferDiff({ price: 10 }, { price: 10.5 }), {});
assert.deepEqual(hotOfferDiff({ price: null }, { price: null }), {});
assert.deepEqual(hotOfferDiff({ price: 10 }, { price: 10.51 }), {
  price: { from: 10, to: 10.51 },
});

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

{
  const baseUrl = "https://fixture.example";
  const targetFields = {
    sourceId: "fixture-source",
    sourceName: "Fixture source",
    sourceStoreName: "Fixture store",
    sourceUrl: `${baseUrl}/shop/fixture`,
  };
  const current = {
    ...targetFields,
    sourceTitle: "Old title",
    price: 10,
    listedPrice: 10,
    feeAmount: 0,
    priceBasis: "listed",
    status: "in_stock",
    effectiveStatus: "available",
    url: `${baseUrl}/item/available`,
    tags: ["fixture"],
    stockCount: 7,
  };
  const collected = {
    ...targetFields,
    sourceTitle: "Current title",
    price: 10.5,
    listedPrice: 10.5,
    feeAmount: null,
    priceBasis: "listed_fallback",
    status: "in_stock",
    effectiveStatus: "available",
    url: current.url,
    tags: ["fixture"],
    stockCount: 24,
  };
  const unrelated = { ...collected, url: `${baseUrl}/item/unrelated`, stockCount: 83 };
  const candidate = { ...current, id: stableOfferInputId(collected) };
  const selected = selectHotVerifiedOffers([candidate], [unrelated, collected]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].candidate.id, candidate.id);
  assert.equal(selected[0].offer.stockCount, 24);
  assert.equal(selected[0].offer.price, 10);
  assert.equal(selected[0].offer.listedPrice, 10);
  assert.deepEqual(hotOfferDiff(candidate, selected[0].offer), {
    stockCount: { from: 7, to: 24 },
  });

  const unknownStock = normalizeHotVerifiedOffer(candidate, {
    ...collected,
    stockCount: null,
    status: "in_stock",
    effectiveStatus: "available",
  });
  assert.equal(unknownStock.stockCount, 7);
  assert.equal(unknownStock.status, "in_stock");
  assert.equal(unknownStock.effectiveStatus, "available");

  const soldOut = normalizeHotVerifiedOffer(candidate, {
    ...collected,
    stockCount: 0,
    status: "out_of_stock",
    effectiveStatus: "available",
  });
  assert.equal(soldOut.stockCount, 0);
  assert.equal(soldOut.status, "out_of_stock");
  assert.equal(soldOut.effectiveStatus, "unavailable");

  assert.deepEqual(selectHotVerifiedOffers([candidate], [unrelated]), []);
}

console.log("hot offer verifier tests passed");
