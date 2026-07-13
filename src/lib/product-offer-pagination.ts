export type ProductOfferPage<Item extends { id: string }> = {
  offers: Item[];
  total: number;
  limited?: boolean;
};

export function hasMoreProductOfferPage<Item extends { id: string }>(page: ProductOfferPage<Item>): boolean {
  return page.limited !== false && page.offers.length < page.total;
}

export function mergeProductOfferPages<
  Item extends { id: string },
  Page extends ProductOfferPage<Item>,
>(currentPage: Page, nextPage: Page): Page {
  const seen = new Set(currentPage.offers.map((offer) => offer.id));
  const nextOffers = nextPage.offers.filter((offer) => !seen.has(offer.id));
  const offers = [...currentPage.offers, ...nextOffers];
  const serverHasMore = nextPage.limited !== false && offers.length < nextPage.total;
  const hasMore = nextOffers.length > 0 && serverHasMore;

  return {
    ...nextPage,
    offers,
    total: hasMore ? Math.max(nextPage.total, offers.length) : offers.length,
    limited: hasMore,
  };
}
