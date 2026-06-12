"use client";

import { ChevronDown, ChevronUp, ExternalLink, Flag, Search, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isAvailable } from "@/lib/catalog";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { readSessionCache, writeSessionCache } from "@/lib/client-cache";
import { createTimeoutSignal, isGeneratedDatasetStale, newestGeneratedDataset } from "@/lib/client-refresh";
import {
  OFFER_FILTER_TAG_BY_ID,
  parseOfferFilterTags,
  toggleOfferFilterTag,
  type OfferFilterTagFacet,
  type OfferFilterTagId,
} from "@/lib/offer-filter-tags";
import type { RawOffer } from "@/lib/types";
import { formatCurrency, formatDateMinute, formatRelativeTime } from "@/lib/utils";

type ProductOffersResponse = {
  offers: RawOffer[];
  total: number;
  filterFacets?: OfferFilterTagFacet[];
  activeFilterTags?: OfferFilterTagId[];
  limited?: boolean;
  generatedAt: string;
  degraded?: boolean;
  message?: string | null;
};

const OFFER_PAGE_SIZE = 80;
const PRODUCT_OFFERS_CACHE_TTL_MS = 2 * 60 * 1000;
const TELEGRAM_COMMUNITY_URL = "https://t.me/priceaicc";
const productOffersMemoryCache = new Map<string, ProductOffersResponse>();

export function ProductOffersPanel({
  productId,
  productSlug,
  productName,
  initialCount,
  initialData = null,
  initialFilterTags = [],
  initialQuery = "",
  initialExcludeQuery = "",
}: {
  productId: string;
  productSlug: string;
  productName: string;
  initialCount: number;
  initialData?: ProductOffersResponse | null;
  initialFilterTags?: string[];
  initialQuery?: string;
  initialExcludeQuery?: string;
}) {
  const normalizedInitialFilterTags = useMemo(() => parseOfferFilterTags(initialFilterTags), [initialFilterTags]);
  const normalizedInitialQuery = useMemo(() => normalizeOfferSearchQuery(initialQuery), [initialQuery]);
  const normalizedInitialExcludeQuery = useMemo(() => normalizeOfferSearchQuery(initialExcludeQuery, 160), [initialExcludeQuery]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<OfferFilterTagId[]>(normalizedInitialFilterTags);
  const [searchOpen, setSearchOpen] = useState(Boolean(normalizedInitialQuery || normalizedInitialExcludeQuery));
  const [queryInput, setQueryInput] = useState(normalizedInitialQuery);
  const [excludeInput, setExcludeInput] = useState(normalizedInitialExcludeQuery);
  const [offerQuery, setOfferQuery] = useState(normalizedInitialQuery);
  const [offerExcludeQuery, setOfferExcludeQuery] = useState(normalizedInitialExcludeQuery);
  const selectedFilterKey = selectedFilterTags.join(",");
  const offerQueryKey = offerQuery.trim();
  const offerExcludeQueryKey = offerExcludeQuery.trim();
  const initialFilterKey = normalizedInitialFilterTags.join(",");
  const initialCacheKey = productOffersCacheKey(productId, 0, normalizedInitialFilterTags, normalizedInitialQuery, normalizedInitialExcludeQuery);
  const cachedInitialData = newestGeneratedDataset(productOffersMemoryCache.get(initialCacheKey), initialData);
  const [data, setData] = useState<ProductOffersResponse | null>(cachedInitialData);
  const [loading, setLoading] = useState(!cachedInitialData);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOffer, setFeedbackOffer] = useState<RawOffer | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const filterTags = parseOfferFilterTags(selectedFilterTags);
    const query = normalizeOfferSearchQuery(offerQuery);
    const excludeQuery = normalizeOfferSearchQuery(offerExcludeQuery, 160);
    const cacheKey = productOffersCacheKey(productId, 0, filterTags, query, excludeQuery);
    let cancelRefresh: (() => void) | null = null;
    let active = true;

    async function loadOffers() {
      const shouldUseInitialData =
        filterTags.join(",") === initialFilterKey &&
        query === normalizedInitialQuery &&
        excludeQuery === normalizedInitialExcludeQuery;
      const cachedData = newestGeneratedDataset(
        productOffersMemoryCache.get(cacheKey),
        shouldUseInitialData ? initialData : null,
        readSessionCache<ProductOffersResponse>(cacheKey, PRODUCT_OFFERS_CACHE_TTL_MS),
      );

      if (cachedData) {
        productOffersMemoryCache.set(cacheKey, cachedData);
        writeSessionCache(cacheKey, cachedData);
        setData(cachedData);
        setLoading(false);
        setError(null);

        if (!isGeneratedDatasetStale(cachedData)) return;
      } else {
        setLoading(true);
      }

      const timeout = createTimeoutSignal();
      cancelRefresh = timeout.cancel;

      try {
        const nextData = await fetchProductOfferPage(productId, 0, filterTags, query, excludeQuery, timeout.signal);
        if (!active) return;
        const latestData = newestGeneratedDataset(nextData, productOffersMemoryCache.get(cacheKey)) ?? nextData;
        productOffersMemoryCache.set(cacheKey, latestData);
        writeSessionCache(cacheKey, latestData);
        setData(latestData);
        setError(null);
      } catch (currentError) {
        if (!active) return;
        if (timeout.signal.aborted) {
          if (!cachedData) setError("报价加载超时，请稍后刷新");
        } else {
          setError(currentError instanceof Error ? currentError.message : "报价加载失败");
          if (!cachedData) setData(null);
        }
      } finally {
        timeout.clear();
        if (active) setLoading(false);
      }
    }

    loadOffers();

    return () => {
      active = false;
      cancelRefresh?.();
    };
  }, [
    initialData,
    initialFilterKey,
    normalizedInitialExcludeQuery,
    normalizedInitialQuery,
    offerExcludeQuery,
    offerQuery,
    productId,
    selectedFilterKey,
    selectedFilterTags,
  ]);

  const offers = data?.offers ?? [];
  const total = data?.total ?? initialCount;
  const filterFacets = data?.filterFacets ?? initialData?.filterFacets ?? [];
  const hasMore = Boolean(data) && offers.length < total;
  const activeFilters = selectedFilterTags.length > 0 || Boolean(offerQueryKey || offerExcludeQueryKey);

  const loadMoreOffers = useCallback(async () => {
    if (!data || paging || offers.length >= total) return;
    const filterTags = parseOfferFilterTags(selectedFilterTags);
    const query = normalizeOfferSearchQuery(offerQuery);
    const excludeQuery = normalizeOfferSearchQuery(offerExcludeQuery, 160);

    setPaging(true);
    setError(null);

    try {
      const nextPage = await fetchProductOfferPage(productId, offers.length, filterTags, query, excludeQuery);
      setData((current) => {
        if (!current) return nextPage;

        const seen = new Set(current.offers.map((offer) => offer.id));
        const nextOffers = nextPage.offers.filter((offer) => !seen.has(offer.id));

        const mergedData = {
          ...nextPage,
          offers: [...current.offers, ...nextOffers],
          total: nextPage.total,
          limited: nextPage.limited,
        };

        const cacheKey = productOffersCacheKey(productId, 0, filterTags, query, excludeQuery);
        productOffersMemoryCache.set(cacheKey, mergedData);
        writeSessionCache(cacheKey, mergedData);

        return mergedData;
      });
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "报价加载失败");
    } finally {
      setPaging(false);
    }
  }, [data, offerExcludeQuery, offerQuery, offers.length, paging, productId, selectedFilterTags, total]);

  useEffect(() => {
    if (!hasMore) return;

    const node = loadMoreRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreOffers();
        }
      },
      { rootMargin: "640px 0px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMore, loadMoreOffers]);

  const handleToggleFilterTag = useCallback((tagId: OfferFilterTagId) => {
    setSelectedFilterTags((current) => {
      const nextTags = toggleOfferFilterTag(current, tagId);
      syncOfferFiltersToUrl(nextTags, offerQuery, offerExcludeQuery);
      return nextTags;
    });
  }, [offerExcludeQuery, offerQuery]);

  const handleSearchSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = normalizeOfferSearchQuery(queryInput);
    const nextExcludeQuery = normalizeOfferSearchQuery(excludeInput, 160);
    setQueryInput(nextQuery);
    setExcludeInput(nextExcludeQuery);
    setOfferQuery(nextQuery);
    setOfferExcludeQuery(nextExcludeQuery);
    setSearchOpen(Boolean(nextQuery || nextExcludeQuery) || searchOpen);
    syncOfferFiltersToUrl(selectedFilterTags, nextQuery, nextExcludeQuery);
  }, [excludeInput, queryInput, searchOpen, selectedFilterTags]);

  const clearOfferFilters = useCallback(() => {
    setSelectedFilterTags([]);
    setQueryInput("");
    setExcludeInput("");
    setOfferQuery("");
    setOfferExcludeQuery("");
    setSearchOpen(false);
    syncOfferFiltersToUrl([], "", "");
  }, []);

  if (loading && !data) {
    return (
      <OfferTableSkeleton count={initialCount} />
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-lg bg-[#fff7e8] px-5 py-4 text-sm font-medium text-[#6a4b16]">
        {error}
      </div>
    );
  }

  return (
    <>
      {data?.degraded ? (
        <DegradedBanner message={data.message} />
      ) : null}
      <OfferFilterBar
        facets={filterFacets}
        selectedTags={selectedFilterTags}
        total={total}
        active={activeFilters}
        excludeInput={excludeInput}
        queryInput={queryInput}
        searchOpen={searchOpen}
        onClear={clearOfferFilters}
        onExcludeInputChange={setExcludeInput}
        onSearchInputChange={setQueryInput}
        onSearchOpen={() => setSearchOpen(true)}
        onSearchSubmit={handleSearchSubmit}
        onToggle={handleToggleFilterTag}
      />
      {loading ? (
        <OfferTableSkeleton count={Math.min(Math.max(total, 3), 6)} />
      ) : offers.length ? (
        <>
          <OfferTable offers={offers} onFeedback={setFeedbackOffer} />
          <section className="mt-5 grid gap-3 md:hidden">
            {offers.map((offer, index) => (
              <OfferListItem key={offerRowKey(offer, index)} offer={offer} onFeedback={setFeedbackOffer} />
            ))}
          </section>
        </>
      ) : (
        <EmptyOfferFilterState onClear={clearOfferFilters} />
      )}
      {hasMore ? (
        <div ref={loadMoreRef} className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={loadMoreOffers}
            disabled={paging}
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#e4e9ea] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5] disabled:opacity-60"
          >
            {paging ? "正在加载更多报价..." : `继续加载报价 (${offers.length}/${total})`}
          </button>
        </div>
      ) : null}
      {feedbackOffer ? (
        <OfferFeedbackDialog
          productId={productId}
          productSlug={productSlug}
          productName={productName}
          offer={feedbackOffer}
          onClose={() => setFeedbackOffer(null)}
        />
      ) : null}
    </>
  );
}

function DegradedBanner({ message }: { message?: string | null }) {
  return (
    <div className="mt-6 rounded-lg bg-[#fff2ef] px-5 py-4 text-sm text-[#7b2f26] ring-1 ring-[#efd0ca]">
      {message || "真实报价数据暂时不可用，请稍后刷新。"}
    </div>
  );
}

async function fetchProductOfferPage(
  productId: string,
  offset: number,
  filterTags: OfferFilterTagId[] = [],
  query = "",
  excludeQuery = "",
  signal?: AbortSignal,
): Promise<ProductOffersResponse> {
  const params = new URLSearchParams({
    limit: String(OFFER_PAGE_SIZE),
    offset: String(offset),
  });
  if (filterTags.length) params.set("tags", filterTags.join(","));
  if (query) params.set("q", query);
  if (excludeQuery) params.set("exclude", excludeQuery);
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}/offers?${params.toString()}`, {
    signal,
  });

  if (!response.ok) throw new Error("报价加载失败");

  return (await response.json()) as ProductOffersResponse;
}

function productOffersCacheKey(
  productId: string,
  offset: number,
  filterTags: OfferFilterTagId[] = [],
  query = "",
  excludeQuery = "",
): string {
  return `priceai:product-offers:v6:${productId}:${offset}:${OFFER_PAGE_SIZE}:${filterTags.join(",") || "all"}:${query || "none"}:${excludeQuery || "none"}`;
}

function normalizeOfferSearchQuery(value: string, limit = 80): string {
  return value.trim().slice(0, limit);
}

function syncOfferFiltersToUrl(filterTags: OfferFilterTagId[], query: string, excludeQuery: string) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (filterTags.length) {
    url.searchParams.set("tags", filterTags.join(","));
  } else {
    url.searchParams.delete("tags");
  }
  const normalizedQuery = normalizeOfferSearchQuery(query);
  if (normalizedQuery) {
    url.searchParams.set("q", normalizedQuery);
  } else {
    url.searchParams.delete("q");
  }
  const normalizedExcludeQuery = normalizeOfferSearchQuery(excludeQuery, 160);
  if (normalizedExcludeQuery) {
    url.searchParams.set("exclude", normalizedExcludeQuery);
  } else {
    url.searchParams.delete("exclude");
  }

  window.history.replaceState(window.history.state, "", url);
}

function OfferFilterBar({
  facets,
  selectedTags,
  total,
  active,
  excludeInput,
  queryInput,
  searchOpen,
  onClear,
  onExcludeInputChange,
  onSearchInputChange,
  onSearchOpen,
  onSearchSubmit,
  onToggle,
}: {
  facets: OfferFilterTagFacet[];
  selectedTags: OfferFilterTagId[];
  total: number;
  active: boolean;
  excludeInput: string;
  queryInput: string;
  searchOpen: boolean;
  onClear: () => void;
  onExcludeInputChange: (value: string) => void;
  onSearchInputChange: (value: string) => void;
  onSearchOpen: () => void;
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: (tagId: OfferFilterTagId) => void;
}) {
  const facetById = new Map(facets.map((facet) => [facet.id, facet]));
  const visibleFacets = Array.from(OFFER_FILTER_TAG_BY_ID.values())
    .filter((definition) => facetById.has(definition.id));

  return (
    <section className="mt-5 flex flex-col gap-3 border-y border-[#e5eaea] py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-semibold text-[#5a6061]">只看</span>
        {visibleFacets.map((facet) => {
          const selected = selectedTags.includes(facet.id);

          return (
            <button
              key={facet.id}
              type="button"
              onClick={() => onToggle(facet.id)}
              title={facet.description}
              className={`inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold transition ${
                selected
                  ? "bg-[#202829] text-white"
                  : "bg-[#eef1f1] text-[#4d5657] hover:bg-[#e3e9e9] hover:text-[#202829]"
              }`}
            >
              {facet.label}
            </button>
          );
        })}
        {active ? (
          <span className="text-xs text-[#7a8587]">当前 {total} 条</span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {searchOpen ? (
          <form onSubmit={onSearchSubmit} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(190px,240px)_minmax(190px,240px)_auto] sm:items-center">
            <label className="relative min-w-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#7a8587]">
                包含
              </span>
              <input
                value={queryInput}
                onChange={(event) => onSearchInputChange(event.target.value)}
                placeholder="关键词、渠道、商品名"
                className="h-9 w-full rounded-full bg-white pl-12 pr-3 text-sm text-[#202829] outline-none ring-1 ring-[#dbe2e3] transition placeholder:text-[#9aa3a5] focus:ring-2 focus:ring-[#adb3b4]/35"
              />
            </label>
            <label className="relative min-w-0">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#9b3328]">
                排除
              </span>
              <input
                value={excludeInput}
                onChange={(event) => onExcludeInputChange(event.target.value)}
                placeholder="网页、无质保、日抛"
                className="h-9 w-full rounded-full bg-white pl-12 pr-3 text-sm text-[#202829] outline-none ring-1 ring-[#dbe2e3] transition placeholder:text-[#9aa3a5] focus:ring-2 focus:ring-[#adb3b4]/35"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[#202829] px-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              应用
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={onSearchOpen}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#eef1f1] px-3 text-sm font-semibold text-[#4d5657] transition hover:bg-[#e3e9e9] hover:text-[#202829]"
          >
            <Search size={14} />
            搜索报价
          </button>
        )}
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-transparent px-2 text-xs font-semibold text-[#6c7677] transition hover:bg-[#eef1f1] hover:text-[#202829]"
          >
            <X size={13} />
            清除
          </button>
        ) : null}
      </div>
    </section>
  );
}

function OfferTableSkeleton({ count }: { count: number }) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      {Array.from({ length: Math.min(Math.max(count, 3), 6) }).map((_, index) => (
        <div key={index} className="grid grid-cols-[110px_220px_1fr_120px_130px_110px] gap-5 border-b border-[#edf0f1] px-5 py-5 last:border-b-0">
          <Skeleton className="h-8 w-16 rounded-full" />
          <div>
            <Skeleton className="h-5 w-32 rounded-full" />
            <Skeleton className="mt-3 h-4 w-24 rounded-full" />
          </div>
          <Skeleton className="h-5 w-full rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>
      ))}
    </section>
  );
}

function EmptyOfferFilterState({ onClear }: { onClear: () => void }) {
  return (
    <div className="mt-6 rounded-lg bg-white px-5 py-8 text-center shadow-[0_18px_45px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <p className="text-sm font-semibold text-[#202829]">没有匹配的报价</p>
      <p className="mt-2 text-sm text-[#5a6061]">换一组标签，或回到全部报价继续查看。</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-full bg-[#202829] px-4 text-sm font-semibold text-white transition hover:opacity-90"
      >
        查看全部报价
      </button>
    </div>
  );
}

function OfferTable({ offers, onFeedback }: { offers: RawOffer[]; onFeedback: (offer: RawOffer) => void }) {
  return (
    <section className="mt-6 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[90px]" />
            <col className="w-[205px]" />
            <col />
            <col className="w-[115px]" />
            <col className="w-[120px]" />
            <col className="w-[130px]" />
            <col className="w-[64px]" />
          </colgroup>
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>状态</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>原始商品名</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="text-center">操作</TableHead>
              <TableHead className="text-center">反馈</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {offers.map((offer, index) => {
              const available = isOfferAvailable(offer);

              return (
                <tr key={offerRowKey(offer, index)} className={`group/row transition hover:bg-[#f7f9f9] ${available ? "" : "bg-[#fbf7f6]"}`}>
                  <td className="px-5 py-4">
                    <OfferStatusBadge available={available} />
                  </td>
                  <td className="max-w-[195px] px-4 py-4">
                    <span className="block truncate font-semibold text-[#202829]">
                      {sourceLabel(offer)}
                    </span>
                    {sourceSecondaryLabel(offer) ? (
                      <span className="mt-1 block truncate text-xs text-[#5a6061]">{sourceSecondaryLabel(offer)}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <OfferSourceTitle title={offer.sourceTitle} mode="table" />
                  </td>
                  <td className="px-4 py-4">
                    <span className={`text-lg font-bold ${available ? "text-[#202829]" : "text-[#9b3328]"}`}>
                      {formatCurrency(offer.price, offer.currency)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#5a6061]">
                    <OfferRelativeTime value={offerTimestamp(offer)} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <OfferLink offer={offer} available={available} compact />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <OfferFeedbackButton offer={offer} onFeedback={onFeedback} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfferListItem({ offer, onFeedback }: { offer: RawOffer; onFeedback: (offer: RawOffer) => void }) {
  const available = isOfferAvailable(offer);

  return (
    <article className={`min-w-0 rounded-lg p-4 shadow-[0_16px_45px_rgba(45,52,53,0.04)] ring-1 ${available ? "bg-white ring-[#adb3b4]/15" : "bg-[#fbf7f6] ring-[#ead8d5]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#202829]">{sourceLabel(offer)}</p>
          <OfferSourceTitle title={offer.sourceTitle} mode="card" />
        </div>
        <OfferStatusBadge available={available} />
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={`text-2xl font-bold tracking-normal ${available ? "text-[#202829]" : "text-[#9b3328]"}`}>
            {formatCurrency(offer.price, offer.currency)}
          </p>
          <p className="mt-1 text-xs text-[#5a6061]">
            <OfferRelativeTime value={offerTimestamp(offer)} />
          </p>
        </div>
        <OfferActions offer={offer} available={available} onFeedback={onFeedback} />
      </div>
    </article>
  );
}

function offerRowKey(offer: RawOffer, index: number): string {
  return `${offer.id}:${offer.url}:${index}`;
}

function TableHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-3 font-semibold ${className}`}>{children}</th>;
}

function OfferSourceTitle({ title, mode }: { title: string; mode: "table" | "card" }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const titleRef = useRef<HTMLElement | null>(null);
  const setTitleNode = useCallback((node: HTMLElement | null) => {
    titleRef.current = node;
  }, []);

  useEffect(() => {
    if (expanded) return;

    const node = titleRef.current;
    if (!node) {
      setCanExpand(false);
      return;
    }

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCanExpand(node.scrollHeight > node.clientHeight + 1);
      });
    };

    measure();

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resizeObserver?.observe(node);
    window.addEventListener("resize", measure);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [canExpand, expanded, mode, title]);

  if (!canExpand) {
    if (mode === "table") {
      return (
        <span ref={setTitleNode} className="block line-clamp-2 leading-6 text-[#2d3435]" aria-label={`原始商品名：${title}`}>
          {title}
        </span>
      );
    }

    return (
      <p ref={setTitleNode} className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">
        {title}
      </p>
    );
  }

  if (mode === "table") {
    return (
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "收起" : "展开"}原始商品名：${title}`}
        className="group/title block w-full rounded-md text-left text-[#2d3435] transition hover:text-[#202829] focus:outline-none focus:ring-2 focus:ring-[#adb3b4]/30"
      >
        <span ref={setTitleNode} className={expanded ? "block whitespace-normal break-words leading-6" : "line-clamp-2 leading-6"}>
          {title}
        </span>
        <span className={`mt-1 items-center gap-1 text-xs font-semibold text-[#47657a] ${
          expanded ? "inline-flex" : "hidden group-hover/row:inline-flex group-focus-visible/title:inline-flex"
        }`}>
          {expanded ? "收起" : "更多"}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}
      aria-label={`${expanded ? "收起" : "展开"}原始商品名：${title}`}
      className="mt-1 block w-full rounded-md text-left text-sm leading-6 text-[#5a6061] transition hover:text-[#2d3435] focus:outline-none focus:ring-2 focus:ring-[#adb3b4]/30"
    >
      <span ref={setTitleNode} className={expanded ? "block" : "line-clamp-2"}>{title}</span>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#47657a]">
        {expanded ? "收起" : "展开完整名称"}
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </span>
    </button>
  );
}

function OfferStatusBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
        available ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
      }`}
    >
      {available ? "有货" : "缺货"}
    </span>
  );
}

function OfferRelativeTime({ value }: { value: string | null | undefined }) {
  const mounted = useClientHydrated();

  return <span suppressHydrationWarning>{mounted ? formatRelativeTime(value) : formatDateMinute(value)}</span>;
}

function useClientHydrated(): boolean {
  return useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerHydrationSnapshot);
}

function subscribeToHydration(onStoreChange: () => void): () => void {
  const timeoutId = window.setTimeout(onStoreChange, 0);
  return () => window.clearTimeout(timeoutId);
}

function getHydratedSnapshot(): boolean {
  return true;
}

function getServerHydrationSnapshot(): boolean {
  return false;
}

export function OfferLink({
  offer,
  available,
  compact = false,
}: {
  offer: RawOffer;
  available: boolean;
  compact?: boolean;
}) {
  return (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAnalyticsEvent("purchase_link_click", {
        source_id: offer.sourceId || "unknown",
        available,
      })}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-semibold leading-none transition hover:opacity-90 ${
        compact ? "h-9 min-w-[108px] px-3" : "h-10 min-w-[112px] px-4"
      } ${
        available
          ? "bg-[#2d3435] text-[#f8f8f8]"
          : "bg-[#ead8d5] text-[#8f2f24]"
      }`}
    >
      {available ? "前往购买" : "查看"}
      <ExternalLink size={compact ? 14 : 16} />
    </a>
  );
}

export function OfferActions({
  offer,
  available,
  onFeedback,
  compact = false,
}: {
  offer: RawOffer;
  available: boolean;
  onFeedback: (offer: RawOffer) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-nowrap items-center justify-end gap-2">
      <OfferLink offer={offer} available={available} compact={compact} />
      <OfferFeedbackButton offer={offer} onFeedback={onFeedback} compact={compact} />
    </div>
  );
}

export function OfferFeedbackButton({
  offer,
  onFeedback,
  compact = false,
}: {
  offer: RawOffer;
  onFeedback: (offer: RawOffer) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onFeedback(offer)}
      title="反馈报价问题"
      aria-label="反馈报价问题"
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[#adb3b4]/30 bg-white text-xs font-semibold text-[#5a6061] transition hover:border-[#5a6061]/35 hover:bg-[#f2f4f4] ${
        compact ? "h-9 w-9" : "h-10 px-3"
      }`}
    >
      <Flag size={14} />
      {!compact ? <span className="ml-1.5">反馈</span> : null}
    </button>
  );
}

export function OfferFeedbackDialog({
  productId,
  productSlug,
  productName,
  offer,
  onClose,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  offer: RawOffer;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("wrong_price");
  const [userExpectedAction, setUserExpectedAction] = useState("recheck");
  const [notes, setNotes] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          productSlug,
          productName,
          offerId: offer.id,
          sourceId: offer.sourceId || null,
          sourceName: sourceLabel(offer),
          sourceTitle: offer.sourceTitle,
          offerUrl: offer.url,
          offerPrice: offer.price,
          offerCurrency: offer.currency,
          offerStatus: offer.status,
          offerCapturedAt: offer.capturedAt || null,
          offerSourceUpdatedAt: offer.sourceUpdatedAt || null,
          offerLastSeenAt: offer.lastSeenAt || null,
          reason,
          userExpectedAction,
          evidenceText: evidenceText || null,
          evidenceUrls: extractEvidenceUrls(evidenceText),
          notes: notes || null,
          contact: contact || null,
          website: "",
        }),
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (!response.ok || !json.ok) {
        throw new Error(json.message || "反馈提交失败。");
      }
      setMessage({ type: "success", text: "已收到反馈，我会在后台审核处理。" });
    } catch (currentError) {
      setMessage({ type: "error", text: currentError instanceof Error ? currentError.message : "反馈提交失败。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#202829]/35 px-4 py-4 sm:items-center">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-[0_24px_80px_rgba(32,40,41,0.22)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-xl font-semibold text-[#202829]">反馈报价问题</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{offer.sourceTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#adb3b4]/25 text-[#5a6061] transition hover:bg-[#f2f4f4]"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#5a6061]">问题类型</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition focus:border-[#2d3435]"
            >
              {feedbackReasonOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#5a6061]">希望处理方式</span>
            <select
              value={userExpectedAction}
              onChange={(event) => setUserExpectedAction(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition focus:border-[#2d3435]"
            >
              {expectedActionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#5a6061]">补充说明</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="例如：点进去实际价格是 1280，或原站已下架。"
              className="w-full resize-y rounded-lg border border-[#adb3b4]/40 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2d3435]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#5a6061]">证据链接或说明（可选）</span>
            <textarea
              value={evidenceText}
              onChange={(event) => setEvidenceText(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="可粘贴截图链接、订单页、聊天记录链接，或说明你看到的证据。"
              className="w-full resize-y rounded-lg border border-[#adb3b4]/40 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2d3435]"
            />
          </label>
          <label className="hidden">
            Website
            <input tabIndex={-1} autoComplete="off" name="website" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#5a6061]">联系方式（可选）</span>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              maxLength={200}
              placeholder="方便需要时追问，可留空"
              className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition focus:border-[#2d3435]"
            />
          </label>
          <a
            href={TELEGRAM_COMMUNITY_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-[#2AABEE]/20 bg-[#eef8fe] px-3 py-2 text-sm leading-6 text-[#23658a] transition hover:border-[#2AABEE]/35 hover:bg-[#e3f4fd]"
          >
            <span>
              {message?.type === "success"
                ? "需要补充截图或查看处理进展？可以加入 PriceAI 交流群继续说明。"
                : "如果问题比较紧急，或需要补充截图/聊天记录，也可以加入 PriceAI 交流群同步反馈。"}
            </span>
            <ExternalLink size={14} className="shrink-0" />
          </a>
          {message ? (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              message.type === "success" ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
            }`}>
              {message.text}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading || message?.type === "success"}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829] disabled:opacity-60"
          >
            {message?.type === "success" ? "已提交" : loading ? "提交中..." : "提交反馈"}
          </button>
        </form>
      </div>
    </div>
  );
}

const feedbackReasonOptions = [
  { value: "wrong_price", label: "价格不准" },
  { value: "item_removed", label: "商品已下架" },
  { value: "stock_mismatch", label: "库存状态不准" },
  { value: "wrong_category", label: "分类错误" },
  { value: "fraud", label: "疑似虚假/欺诈" },
  { value: "bad_source", label: "渠道不可信" },
  { value: "other", label: "其他问题" },
];

const expectedActionOptions = [
  { value: "recheck", label: "请重新核查" },
  { value: "hide_offer", label: "建议下架这条报价" },
  { value: "hide_source", label: "建议下架整个渠道" },
  { value: "unsure", label: "不确定，交给管理员判断" },
];

function extractEvidenceUrls(value: string): string[] {
  const matches = value.match(/https?:\/\/[^\s"'<>，。；、]+/g) || [];
  return Array.from(new Set(matches)).slice(0, 10);
}

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-[#e4e9ea] ${className}`} />;
}

function isOfferAvailable(offer: RawOffer): boolean {
  return isAvailable(offer);
}

function offerTimestamp(offer: RawOffer): string | null | undefined {
  return offer.verifiedAt || offer.lastSeenAt || offer.capturedAt || offer.sourceUpdatedAt;
}

function sourceLabel(offer: RawOffer): string {
  return offer.sourceStoreName || offer.sourceName || "未记录渠道";
}

function sourceSecondaryLabel(offer: RawOffer): string | null {
  if (!offer.sourceName || offer.sourceName === sourceLabel(offer)) return null;
  return offer.sourceName;
}
