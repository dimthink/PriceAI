import {
  hasMoreProductOfferPage,
  mergeProductOfferPages,
  type ProductOfferPage,
} from "../src/lib/product-offer-pagination.js";

type TestOffer = {
  id: string;
  label: string;
};

type TestPage = ProductOfferPage<TestOffer> & {
  generatedAt: string;
};

const page = (ids: string[], total: number, limited: boolean): TestPage => ({
  offers: ids.map((id) => ({ id, label: id.toUpperCase() })),
  total,
  limited,
  generatedAt: "2026-07-13T00:00:00.000Z",
});

const firstPage = page(["a", "b"], 5, true);
assertEqual(hasMoreProductOfferPage(firstPage), true);

const middlePage = mergeProductOfferPages(firstPage, page(["c", "d"], 5, true));
assertDeepEqual(middlePage.offers.map((offer) => offer.id), ["a", "b", "c", "d"]);
assertEqual(middlePage.total, 5);
assertEqual(middlePage.limited, true);
assertEqual(hasMoreProductOfferPage(middlePage), true);

const lastPage = mergeProductOfferPages(middlePage, page(["e"], 5, false));
assertDeepEqual(lastPage.offers.map((offer) => offer.id), ["a", "b", "c", "d", "e"]);
assertEqual(lastPage.total, 5);
assertEqual(lastPage.limited, false);
assertEqual(hasMoreProductOfferPage(lastPage), false);

const emptyPageAfterTotalShrink = mergeProductOfferPages(firstPage, page([], 0, false));
assertDeepEqual(emptyPageAfterTotalShrink.offers.map((offer) => offer.id), ["a", "b"]);
assertEqual(emptyPageAfterTotalShrink.total, 2);
assertEqual(emptyPageAfterTotalShrink.limited, false);
assertEqual(hasMoreProductOfferPage(emptyPageAfterTotalShrink), false);

const duplicateOnlyPage = mergeProductOfferPages(firstPage, page(["a", "b"], 5, true));
assertDeepEqual(duplicateOnlyPage.offers.map((offer) => offer.id), ["a", "b"]);
assertEqual(duplicateOnlyPage.total, 2);
assertEqual(duplicateOnlyPage.limited, false);
assertEqual(hasMoreProductOfferPage(duplicateOnlyPage), false);

console.log("product offer pagination test passed");

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
