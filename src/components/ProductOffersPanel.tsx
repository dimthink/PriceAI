"use client";

import Link from "next/link";
import { AlertTriangle, ExternalLink, Flag, ImageUp, Loader2, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { type ChangeEvent, type ClipboardEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CommunityPrompt } from "@/components/FeedbackLink";
import { isAvailable, isSharedAccessOffer } from "@/lib/catalog";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { readSessionCache, writeSessionCache } from "@/lib/client-cache";
import { useMediaQuery } from "@/lib/client-hooks";
import { createTimeoutSignal, isGeneratedDatasetStale, newestUsableGeneratedDataset } from "@/lib/client-refresh";
import {
  OFFER_FILTER_TAG_BY_ID,
  parseOfferFilterTagsForProduct,
  toggleOfferFilterTag,
  type OfferFilterTagFacet,
  type OfferFilterTagId,
} from "@/lib/offer-filter-tags";
import {
  AFTERSALES_FEEDBACK_REASON,
  OFFER_EXIT_NOTICE_MUTED_DATE_KEY,
  OFFER_HIGH_RISK_PRICE_THRESHOLD,
  feedbackRequiresContact,
  feedbackRequiresEvidence,
  getOfferRiskHints,
  isHighRiskOutboundOffer,
  isShopApiOffer,
} from "@/lib/trust-risk";
import { PRICE_DATA_CACHE_TTL_MS } from "@/lib/public-cache-policy";
import { PUBLIC_OFFER_DEFAULT_LIMIT } from "@/lib/public-offer-query";
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

const OFFER_PAGE_SIZE = PUBLIC_OFFER_DEFAULT_LIMIT;
const PRODUCT_OFFERS_CACHE_TTL_MS = PRICE_DATA_CACHE_TTL_MS;
const PRODUCT_OFFERS_REFRESH_TIMEOUT_MS = 10_000;
const PRODUCT_OFFERS_MEMORY_CACHE_LIMIT = 40;
const FEEDBACK_EVIDENCE_MAX_IMAGES = 5;
const productOffersMemoryCache = new Map<string, ProductOffersResponse>();

type UploadedFeedbackEvidence = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
};

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
  const normalizedInitialFilterTags = useMemo(() => parseOfferFilterTagsForProduct(productId, initialFilterTags), [initialFilterTags, productId]);
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
  const activeCacheKey = productOffersCacheKey(productId, 0, selectedFilterTags, offerQueryKey, offerExcludeQueryKey);
  const activeCacheKeyRef = useRef(activeCacheKey);
  const cachedInitialData = newestUsableGeneratedDataset(productOffersMemoryCache.get(initialCacheKey), initialData);
  const [data, setData] = useState<ProductOffersResponse | null>(cachedInitialData);
  const [dataCacheKey, setDataCacheKey] = useState<string | null>(cachedInitialData ? initialCacheKey : null);
  const [loading, setLoading] = useState(!cachedInitialData);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOffer, setFeedbackOffer] = useState<RawOffer | null>(null);
  const [outboundOffer, setOutboundOffer] = useState<RawOffer | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    activeCacheKeyRef.current = activeCacheKey;
  }, [activeCacheKey]);

  useEffect(() => {
    const urlFilters = readOfferFiltersFromUrl();
    if (!urlFilters) return;

    const nextFilterTags = parseOfferFilterTagsForProduct(productId, urlFilters.tags);
    const nextQuery = normalizeOfferSearchQuery(urlFilters.query);
    const nextExcludeQuery = normalizeOfferSearchQuery(urlFilters.excludeQuery, 160);
    const hasUrlFilters = nextFilterTags.length > 0 || Boolean(nextQuery || nextExcludeQuery);
    if (!hasUrlFilters) return;

    const frameId = window.requestAnimationFrame(() => {
      setSelectedFilterTags(nextFilterTags);
      setQueryInput(nextQuery);
      setExcludeInput(nextExcludeQuery);
      setOfferQuery(nextQuery);
      setOfferExcludeQuery(nextExcludeQuery);
      setSearchOpen(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [productId]);

  useEffect(() => {
    const filterTags = parseOfferFilterTagsForProduct(productId, selectedFilterKey);
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
      const cachedData = newestUsableGeneratedDataset(
        productOffersMemoryCache.get(cacheKey),
        shouldUseInitialData ? initialData : null,
        readSessionCache<ProductOffersResponse>(cacheKey, PRODUCT_OFFERS_CACHE_TTL_MS),
      );

      if (cachedData) {
        rememberHealthyProductOffers(cacheKey, cachedData);
        setData(cachedData);
        setDataCacheKey(cacheKey);
        setLoading(false);
        setError(null);

        if (!isGeneratedDatasetStale(cachedData, PRODUCT_OFFERS_CACHE_TTL_MS)) return;
      } else {
        setLoading(true);
      }
      setPaging(false);

      const timeout = createTimeoutSignal(PRODUCT_OFFERS_REFRESH_TIMEOUT_MS);
      cancelRefresh = timeout.cancel;

      try {
        const nextData = await fetchProductOfferPage(productId, 0, filterTags, query, excludeQuery, timeout.signal);
        if (!active) return;
        const latestData = newestUsableGeneratedDataset(nextData, productOffersMemoryCache.get(cacheKey)) ?? nextData;
        rememberHealthyProductOffers(cacheKey, latestData);
        setData(latestData);
        setDataCacheKey(cacheKey);
        setError(null);
      } catch (currentError) {
        if (!active) return;
        if (timeout.signal.aborted) {
          if (!cachedData) setError("报价加载超时，请稍后刷新");
        } else {
          setError(currentError instanceof Error ? currentError.message : "报价加载失败");
          if (!cachedData) {
            setData(null);
            setDataCacheKey(null);
          }
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
  ]);

  const activeData = dataCacheKey === activeCacheKey ? data : null;
  const offers = activeData?.offers ?? [];
  const total = activeData?.total ?? (selectedFilterTags.length > 0 || Boolean(offerQueryKey || offerExcludeQueryKey) ? 0 : initialCount);
  const filterFacets = activeData?.filterFacets ?? data?.filterFacets ?? initialData?.filterFacets ?? [];
  const hasMore = Boolean(activeData) && !loading && offers.length < total;
  const activeFilters = selectedFilterTags.length > 0 || Boolean(offerQueryKey || offerExcludeQueryKey);

  const loadMoreOffers = useCallback(async () => {
    if (!activeData || loading || paging || offers.length >= total) return;
    const filterTags = parseOfferFilterTagsForProduct(productId, selectedFilterTags);
    const query = normalizeOfferSearchQuery(offerQuery);
    const excludeQuery = normalizeOfferSearchQuery(offerExcludeQuery, 160);
    const requestCacheKey = productOffersCacheKey(productId, 0, filterTags, query, excludeQuery);
    if (dataCacheKey !== requestCacheKey) return;

    setPaging(true);
    setError(null);

    try {
      const nextPage = await fetchProductOfferPage(productId, offers.length, filterTags, query, excludeQuery);
      if (activeCacheKeyRef.current !== requestCacheKey) return;
      setData((current) => {
        if (activeCacheKeyRef.current !== requestCacheKey) return current;
        if (!current) return nextPage;

        const seen = new Set(current.offers.map((offer) => offer.id));
        const nextOffers = nextPage.offers.filter((offer) => !seen.has(offer.id));

        const mergedData = {
          ...nextPage,
          offers: [...current.offers, ...nextOffers],
          total: nextPage.total || current.total,
          limited: nextPage.limited,
        };

        const cacheKey = productOffersCacheKey(productId, 0, filterTags, query, excludeQuery);
        rememberHealthyProductOffers(cacheKey, mergedData);

        return mergedData;
      });
    } catch (currentError) {
      if (activeCacheKeyRef.current !== requestCacheKey) return;
      setError(currentError instanceof Error ? currentError.message : "报价加载失败");
    } finally {
      if (activeCacheKeyRef.current === requestCacheKey) setPaging(false);
    }
  }, [activeData, dataCacheKey, loading, offerExcludeQuery, offerQuery, offers.length, paging, productId, selectedFilterTags, total]);

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
    const nextTags = toggleOfferFilterTag(selectedFilterTags, tagId);
    setSelectedFilterTags(nextTags);
    syncOfferFiltersToUrl(nextTags, offerQuery, offerExcludeQuery);
  }, [offerExcludeQuery, offerQuery, selectedFilterTags]);

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

  if (error && !data) {
    return (
      <div className="mt-6 rounded-lg bg-[#fff7e8] px-5 py-4 text-sm font-medium text-[#6a4b16]">
        {error}
      </div>
    );
  }

  return (
    <>
      {activeData?.degraded ? (
        <DegradedBanner message={activeData.message} />
      ) : null}
      {error ? (
        <InlineErrorBanner message={error} />
      ) : null}
      <OfferFilterBar
        facets={filterFacets}
        selectedTags={selectedFilterTags}
        total={total}
        active={activeFilters}
        pending={loading || !activeData}
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
      {loading || !activeData ? (
        <OfferTableSkeleton count={Math.min(Math.max(total, 3), 6)} />
      ) : offers.length ? (
        isDesktop === false ? (
          <section className="mt-5 grid gap-3 md:hidden">
            {offers.map((offer, index) => (
              <OfferListItem
                key={offerRowKey(offer, index)}
                offer={offer}
                onFeedback={setFeedbackOffer}
                onRequestPurchase={setOutboundOffer}
              />
            ))}
          </section>
        ) : (
          <OfferTable offers={offers} onFeedback={setFeedbackOffer} onRequestPurchase={setOutboundOffer} />
        )
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
      {outboundOffer ? (
        <OfferExitNoticeDialog offer={outboundOffer} onClose={() => setOutboundOffer(null)} />
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

function InlineErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-lg bg-[#fff7e8] px-4 py-3 text-sm font-medium text-[#6a4b16] ring-1 ring-[#efdfbd]">
      {message}。已保留当前报价，可稍后重试或切换筛选条件。
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
  return `priceai:product-offers:v10:${productId}:${offset}:${OFFER_PAGE_SIZE}:${filterTags.join(",") || "all"}:${query || "none"}:${excludeQuery || "none"}`;
}

function rememberProductOffers(cacheKey: string, value: ProductOffersResponse) {
  productOffersMemoryCache.delete(cacheKey);
  productOffersMemoryCache.set(cacheKey, value);

  while (productOffersMemoryCache.size > PRODUCT_OFFERS_MEMORY_CACHE_LIMIT) {
    const oldestKey = productOffersMemoryCache.keys().next().value;
    if (!oldestKey) break;
    productOffersMemoryCache.delete(oldestKey);
  }
}

function rememberHealthyProductOffers(cacheKey: string, value: ProductOffersResponse) {
  if (value.degraded) return;

  rememberProductOffers(cacheKey, value);
  writeSessionCache(cacheKey, value);
}

function normalizeOfferSearchQuery(value: string, limit = 80): string {
  return value.trim().slice(0, limit);
}

function readOfferFiltersFromUrl(): { tags: string | null; query: string; excludeQuery: string } | null {
  if (typeof window === "undefined") return null;

  const params = new URL(window.location.href).searchParams;
  return {
    tags: params.get("tags"),
    query: params.get("q") || "",
    excludeQuery: params.get("exclude") || "",
  };
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
  pending,
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
  pending: boolean;
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
          <span className="text-xs text-[#7a8587]">{pending ? "正在加载" : `当前 ${total} 条`}</span>
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
  const rows = Array.from({ length: Math.min(Math.max(count, 3), 6) });

  return (
    <>
      <section className="mt-5 grid gap-3 md:hidden">
        {rows.map((_, index) => (
          <div key={index} className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="mt-3 h-4 w-full rounded-full" />
                <Skeleton className="mt-2 h-4 w-3/4 rounded-full" />
              </div>
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <Skeleton className="h-7 w-20 rounded-full" />
                <Skeleton className="mt-2 h-4 w-24 rounded-full" />
              </div>
              <Skeleton className="h-9 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
        {rows.map((_, index) => (
          <div key={index} className="grid grid-cols-[90px_205px_1fr_115px_120px_110px_130px_64px] gap-4 border-b border-[#edf0f1] px-5 py-5 last:border-b-0">
            <Skeleton className="h-8 w-16 rounded-full" />
            <div>
              <Skeleton className="h-5 w-32 rounded-full" />
              <Skeleton className="mt-3 h-4 w-24 rounded-full" />
            </div>
            <Skeleton className="h-5 w-full rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        ))}
      </section>
    </>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`bg-[#e4e9ea] ${className}`} />;
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

function OfferTable({
  offers,
  onFeedback,
  onRequestPurchase,
}: {
  offers: RawOffer[];
  onFeedback: (offer: RawOffer) => void;
  onRequestPurchase: (offer: RawOffer) => void;
}) {
  return (
    <section className="mt-6 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
      <div className="overflow-x-auto">
        <table className="min-w-[1160px] w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[90px]" />
            <col className="w-[205px]" />
            <col />
            <col className="w-[115px]" />
            <col className="w-[120px]" />
            <col className="w-[118px]" />
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
              <TableHead className="text-center">风险</TableHead>
              <TableHead className="text-center">操作</TableHead>
              <TableHead className="text-center">反馈</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {offers.map((offer, index) => {
              const available = isOfferAvailable(offer);
              const sharedAccess = isSharedAccessOffer(offer);

              return (
                <tr
                  key={offerRowKey(offer, index)}
                  className={`group/row transition hover:bg-[#f7f9f9] ${available ? "" : "bg-[#fbf7f6]"}`}
                >
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
                    <OfferSourceTitle title={offer.sourceTitle} mode="table" sharedAccess={sharedAccess} />
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
                    <OfferRiskCell offer={offer} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <OfferLink offer={offer} available={available} compact onRequestPurchase={onRequestPurchase} />
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

function OfferListItem({
  offer,
  onFeedback,
  onRequestPurchase,
}: {
  offer: RawOffer;
  onFeedback: (offer: RawOffer) => void;
  onRequestPurchase: (offer: RawOffer) => void;
}) {
  const available = isOfferAvailable(offer);
  const sharedAccess = isSharedAccessOffer(offer);

  return (
    <article
      className={`min-w-0 rounded-lg p-4 shadow-[0_16px_45px_rgba(45,52,53,0.04)] ring-1 ${
        available ? "bg-white ring-[#adb3b4]/15" : "bg-[#fbf7f6] ring-[#ead8d5]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#202829]">{sourceLabel(offer)}</p>
          <OfferSourceTitle title={offer.sourceTitle} mode="card" sharedAccess={sharedAccess} />
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <OfferRiskButton offer={offer} compact />
          <OfferActions offer={offer} available={available} onFeedback={onFeedback} onRequestPurchase={onRequestPurchase} />
        </div>
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

function OfferSourceTitle({ title, mode, sharedAccess }: { title: string; mode: "table" | "card"; sharedAccess?: boolean }) {
  if (mode === "table") {
    return (
      <span className="block leading-6 text-[#2d3435]" title={title} aria-label={`原始商品名：${title}`}>
        {sharedAccess ? <OfferSharedAccessBadge /> : null}
        <span className="line-clamp-2">{title}</span>
      </span>
    );
  }

  return (
    <p className="mt-1 text-sm leading-6 text-[#5a6061]" title={title}>
      {sharedAccess ? <OfferSharedAccessBadge /> : null}
      <span className="line-clamp-2">{title}</span>
    </p>
  );
}

function OfferSharedAccessBadge() {
  return (
    <span className="mb-1 mr-1.5 inline-flex shrink-0 items-center rounded-full bg-[#fff7df] px-2 py-0.5 text-[0.68rem] font-semibold leading-5 text-[#8a5a10] ring-1 ring-[#efd38a]">
      拼车/团购
    </span>
  );
}

function OfferRiskCell({ offer }: { offer: RawOffer }) {
  if (!offer.riskFeedback?.count) {
    return <span aria-hidden="true" className="block h-8" />;
  }

  return <OfferRiskButton offer={offer} />;
}

function OfferRiskButton({ offer, compact = false }: { offer: RawOffer; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const risk = offer.riskFeedback;
  if (!risk?.count) return null;

  const sourceOnly = risk.scope === "source";
  const label = compact
    ? "风险"
    : sourceOnly
      ? "商家风险"
      : risk.scope === "mixed"
        ? "多重风险"
        : "商品风险";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="查看风险详情"
        aria-label={`查看${label}详情`}
        className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-semibold ring-1 transition ${
          compact ? "h-9" : "h-8"
        } ${
          sourceOnly
            ? "bg-[#fff7df] text-[#8a5a10] ring-[#efd38a] hover:bg-[#fff1c7]"
            : "bg-[#fff0ed] text-[#9b3328] ring-[#efc4bc] hover:bg-[#fde5e0]"
        }`}
      >
        <AlertTriangle size={compact ? 14 : 13} />
        <span>{label}</span>
      </button>
      {open ? <OfferRiskDetailDialog offer={offer} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function OfferRiskDetailDialog({ offer, onClose }: { offer: RawOffer; onClose: () => void }) {
  const risk = offer.riskFeedback;
  const titleId = "offer-risk-dialog-title";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  if (!risk?.count) return null;

  const offerCount = risk.offerCount ?? (risk.scope === "offer" ? risk.count : 0);
  const sourceCount = risk.sourceCount ?? (risk.scope === "source" ? risk.count : 0);
  const reasonLabels = (risk.reasons?.length ? risk.reasons : ["fraud" as const]).map(riskFeedbackReasonLabel);
  const offerSummaries = risk.offerSummaries?.filter(Boolean).slice(0, 3) || [];
  const sourceSummaries = risk.sourceSummaries?.filter(Boolean).slice(0, 3) || [];
  const summaries = offerSummaries.length || sourceSummaries.length
    ? [...offerSummaries, ...sourceSummaries].slice(0, 3)
    : risk.summaries?.filter(Boolean).slice(0, 3) || [];
  const sourceOnly = risk.scope === "source";
  const title = sourceOnly ? "商家临时风险提示" : risk.scope === "mixed" ? "商品与商家临时风险提示" : "商品临时风险提示";
  const scopeSummary = [
    offerCount ? `商品 ${offerCount} 条` : null,
    sourceCount ? `商家 ${sourceCount} 条` : null,
  ].filter(Boolean).join(" / ") || `${risk.count} 条反馈`;
  const description = summaries[0] ||
    "有用户反馈该报价存在需要核验的问题。购买前建议先联系商家确认商品细节、交付方式和售后处理规则。";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#202829]/35 px-4 py-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[460px] rounded-lg bg-white p-5 text-left shadow-[0_24px_80px_rgba(32,40,41,0.22)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${
              sourceOnly ? "bg-[#fff7df] text-[#8a5a10]" : "bg-[#fff0ed] text-[#9b3328]"
            }`}>
              <AlertTriangle size={20} />
            </div>
            <h3 id={titleId} className="text-lg font-semibold text-[#202829]">
              {title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{offer.sourceTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭风险提示"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#adb3b4]/25 text-[#5a6061] transition hover:bg-[#f2f4f4]"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mt-4 rounded-lg bg-[#f7f9f9] px-3 py-2 text-sm leading-6 text-[#3d4749]">
          {description}
        </p>

        <div className="mt-4 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#edf0f1] px-3 py-2">
            <span className="text-[#6c7677]">当前状态</span>
            <span className="text-right font-semibold text-[#7a541b]">用户反馈，供购买前参考</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#edf0f1] px-3 py-2">
            <span className="text-[#6c7677]">风险类型</span>
            <span className="text-right font-semibold text-[#202829]">{Array.from(new Set(reasonLabels)).join("、")}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#edf0f1] px-3 py-2">
            <span className="text-[#6c7677]">反馈范围</span>
            <span className="text-right font-semibold text-[#202829]">
              {scopeSummary}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[#edf0f1] px-3 py-2">
            <span className="text-[#6c7677]">最近反馈</span>
            <span className="text-right font-semibold text-[#202829]">
              <OfferRelativeTime value={risk.latestAt} />
            </span>
          </div>
        </div>

        {offerSummaries.length ? (
          <div className="mt-4 rounded-lg border border-[#efd38a] bg-[#fffaf2] px-3 py-2.5">
            <p className="text-xs font-semibold text-[#7a541b]">该商品下的用户反馈摘要</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#5a6061]">
              {offerSummaries.map((summary) => (
                <li key={summary}>• {summary}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {sourceSummaries.length ? (
          <div className="mt-3 rounded-lg border border-[#efc4bc] bg-[#fff7f5] px-3 py-2.5">
            <p className="text-xs font-semibold text-[#9b3328]">该商家的用户反馈摘要</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#5a6061]">
              {sourceSummaries.map((summary) => (
                <li key={summary}>• {summary}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!offerSummaries.length && !sourceSummaries.length && summaries.length ? (
          <div className="mt-4 rounded-lg border border-[#efd38a] bg-[#fffaf2] px-3 py-2.5">
            <p className="text-xs font-semibold text-[#7a541b]">用户反馈摘要</p>
            <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#5a6061]">
              {summaries.map((summary) => (
                <li key={summary}>• {summary}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-xs leading-5 text-[#7a8587]">
          这里展示的是系统预审后的用户高风险反馈摘要，不等同于平台最终裁定。PriceAI 不售卖、不担保商品，购买前仍需你和原店铺确认。
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829]"
        >
          知道了
        </button>
      </div>
    </div>
  );
}

function riskFeedbackReasonLabel(reason: "aftersales_shipping" | "bad_source" | "fraud"): string {
  if (reason === "aftersales_shipping") return "售后/发货问题";
  if (reason === "bad_source") return "渠道不可信";
  return "疑似虚假/欺诈";
}

function OfferExitNoticeDialog({ offer, onClose }: { offer: RawOffer; onClose: () => void }) {
  const [muteToday, setMuteToday] = useState(false);
  const titleId = "offer-exit-notice-title";
  const shopApi = isShopApiOffer(offer);
  const highRisk = isHighRiskOutboundOffer(offer);
  const highPrice = typeof offer.price === "number" && offer.price >= OFFER_HIGH_RISK_PRICE_THRESHOLD;
  const risks = getOfferRiskHints(offer);
  const primaryCopy = shopApi
    ? "我已确认细节，前往链动小铺"
    : "我会先联系商家，继续前往";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  function continueToOffer() {
    if (muteToday) muteOfferExitNoticeToday();
    window.open(offer.url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#202829]/40 px-4 py-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[520px] rounded-lg bg-white p-5 shadow-[0_24px_80px_rgba(32,40,41,0.24)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${
              highRisk ? "bg-[#fff0ed] text-[#9b3328]" : "bg-[#eef3f8] text-[#47657a]"
            }`}>
              {highRisk ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
            </div>
            <h3 id={titleId} className="font-serif text-xl font-semibold text-[#202829]">
              购买前先确认一下
            </h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#5a6061]">
              {offer.sourceTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭购买提醒"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#adb3b4]/25 text-[#5a6061] transition hover:bg-[#f2f4f4]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-6 text-[#3d4749]">
          <p>
            PriceAI 只聚合公开报价，不售卖、不担保商品。分类和价格来自标题、标签和采集结果，最终商品细节、交付内容、售后规则仍以原店铺为准。
          </p>
          {shopApi ? (
            <p className="rounded-lg bg-[#eef8f1] px-3 py-2 text-[#2f7a4b]">
              该渠道识别为链动小铺来源。购买前仍建议确认套餐、有效期、质保和自动发货规则；如订单售后有问题，可优先在链动小铺订单或投诉售后入口处理。
            </p>
          ) : (
            <p className="rounded-lg bg-[#fff7e8] px-3 py-2 text-[#7a541b]">
              该渠道不属于链动小铺采集来源。请先联系商家，确认店铺可信度、发货方式、售后路径和退款边界，再决定是否购买，不建议直接付款。
            </p>
          )}
          {highPrice ? (
            <p className="rounded-lg bg-[#fbe9e7] px-3 py-2 text-[#9b3328]">
              这是一条高额报价（¥{OFFER_HIGH_RISK_PRICE_THRESHOLD} 起触发提醒）。付款前请确认商品细节、账号归属、有效期、质保和售后条件。
            </p>
          ) : null}
          {risks.length ? (
            <div className="rounded-lg bg-[#f7f9f9] px-3 py-2">
              <p className="text-xs font-semibold text-[#2d3435]">当前提示</p>
              <ul className="mt-1 space-y-1 text-xs leading-5 text-[#5a6061]">
                {risks.map((risk) => (
                  <li key={risk.id}>• {risk.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-lg border border-[#adb3b4]/20 bg-[#f7f9f9] px-3 py-2 text-sm text-[#5a6061]">
          <input
            type="checkbox"
            checked={muteToday}
            onChange={(event) => setMuteToday(event.target.checked)}
            className="h-4 w-4 rounded border-[#adb3b4]"
          />
          今天不再提示（普通和高风险提醒都关闭，明天恢复）
        </label>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#adb3b4]/30 px-4 text-sm font-semibold text-[#5a6061] transition hover:bg-[#f2f4f4]"
          >
            再看看
          </button>
          <button
            type="button"
            onClick={continueToOffer}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829]"
          >
            {primaryCopy}
            <ExternalLink size={15} />
          </button>
        </div>
      </div>
    </div>
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

function isOfferExitNoticeMutedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(OFFER_EXIT_NOTICE_MUTED_DATE_KEY) === localDateKey();
  } catch {
    return false;
  }
}

function muteOfferExitNoticeToday(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OFFER_EXIT_NOTICE_MUTED_DATE_KEY, localDateKey());
  } catch {
    // localStorage may be unavailable in private or restricted contexts.
  }
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function OfferLink({
  offer,
  available,
  compact = false,
  onRequestPurchase,
}: {
  offer: RawOffer;
  available: boolean;
  compact?: boolean;
  onRequestPurchase?: (offer: RawOffer) => void;
}) {
  const [localOutboundOffer, setLocalOutboundOffer] = useState<RawOffer | null>(null);

  return (
    <>
      <a
        href={offer.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          trackAnalyticsEvent("purchase_link_click", {
            source_id: offer.sourceId || "unknown",
            available,
          });
          if (isOfferExitNoticeMutedToday()) return;
          event.preventDefault();
          if (onRequestPurchase) {
            onRequestPurchase(offer);
            return;
          }
          setLocalOutboundOffer(offer);
        }}
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
      {localOutboundOffer ? (
        <OfferExitNoticeDialog offer={localOutboundOffer} onClose={() => setLocalOutboundOffer(null)} />
      ) : null}
    </>
  );
}

export function OfferActions({
  offer,
  available,
  onFeedback,
  compact = false,
  onRequestPurchase,
}: {
  offer: RawOffer;
  available: boolean;
  onFeedback: (offer: RawOffer) => void;
  compact?: boolean;
  onRequestPurchase?: (offer: RawOffer) => void;
}) {
  return (
    <div className="flex flex-nowrap items-center justify-end gap-2">
      <OfferLink offer={offer} available={available} compact={compact} onRequestPurchase={onRequestPurchase} />
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
  const [uploadedEvidence, setUploadedEvidence] = useState<UploadedFeedbackEvidence[]>([]);
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleId = "offer-feedback-dialog-title";
  const hasEvidence =
    uploadedEvidence.length > 0 ||
    extractEvidenceUrls(evidenceText).length > 0 ||
    evidenceText.trim().length >= 8;
  const requiresEvidence = needsHighRiskEvidence(reason, userExpectedAction);
  const requiresContact = feedbackRequiresContact(reason);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const uploadEvidenceFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    const availableSlots = FEEDBACK_EVIDENCE_MAX_IMAGES - uploadedEvidence.length;
    if (availableSlots <= 0) {
      setMessage({ type: "error", text: "最多上传 5 张图片证据。" });
      return;
    }

    setUploadingEvidence(true);
    setMessage(null);

    try {
      const nextEvidence: UploadedFeedbackEvidence[] = [];
      for (const file of imageFiles.slice(0, availableSlots)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("website", "");

        const response = await fetch("/api/feedback/evidence", {
          method: "POST",
          body: formData,
        });
        const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
        if (!response.ok || !json.ok) {
          throw new Error(json.message || "图片上传失败。");
        }

        nextEvidence.push({
          url: String(json.evidence.url),
          name: String(json.evidence.name || file.name || "图片证据"),
          mimeType: String(json.evidence.mimeType || file.type),
          size: Number(json.evidence.size || file.size),
        });
      }

      setUploadedEvidence((current) => [...current, ...nextEvidence].slice(0, FEEDBACK_EVIDENCE_MAX_IMAGES));
      if (imageFiles.length > availableSlots) {
        setMessage({ type: "error", text: "最多上传 5 张图片，超出的图片没有上传。" });
      }
    } catch (currentError) {
      setMessage({ type: "error", text: currentError instanceof Error ? currentError.message : "图片上传失败。" });
    } finally {
      setUploadingEvidence(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [uploadedEvidence.length]);

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    void uploadEvidenceFiles(Array.from(event.target.files || []));
  }

  function handleEvidencePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file && file.type.startsWith("image/")));
    if (!files.length) return;

    void uploadEvidenceFiles(files);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setAuthRequired(false);

    if (requiresEvidence && !hasEvidence) {
      setMessage({ type: "error", text: "这类反馈需要补充图片、链接或较完整说明，方便后台判断是否下架。" });
      setLoading(false);
      return;
    }
    if (requiresContact && !contact.trim()) {
      setMessage({ type: "error", text: "这类反馈需要留下 QQ、微信或 Telegram，方便后台核验和追问证据。" });
      setLoading(false);
      return;
    }

    try {
      const evidenceUrls = [
        ...extractEvidenceUrls(evidenceText),
        ...uploadedEvidence.map((item) => item.url),
      ];
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
          evidenceUrls,
          notes: notes || null,
          contact: contact.trim() || null,
          website: "",
        }),
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (!response.ok || !json.ok) {
        if (json.code === "auth_required") setAuthRequired(true);
        throw new Error(json.message || "反馈提交失败。");
      }
      setMessage({ type: "success", text: "已收到反馈，我会在后台审核处理。" });
    } catch (currentError) {
      setMessage({ type: "error", text: currentError instanceof Error ? currentError.message : "反馈提交失败。" });
    } finally {
      setLoading(false);
    }
  }

  function buildLoginHref() {
    const next = typeof window === "undefined" ? `/products/${productSlug}` : `${window.location.pathname}${window.location.search}`;
    return `/login?next=${encodeURIComponent(next)}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#202829]/35 px-4 py-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-[0_24px_80px_rgba(32,40,41,0.22)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={titleId} className="font-serif text-xl font-semibold text-[#202829]">反馈报价问题</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{offer.sourceTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭反馈弹窗"
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
            <span className="mb-1 block text-xs font-medium text-[#5a6061]">
              证据链接或说明{requiresEvidence ? "（必填）" : "（可选）"}
            </span>
            <textarea
              value={evidenceText}
              onChange={(event) => setEvidenceText(event.target.value)}
              onPaste={handleEvidencePaste}
              rows={3}
              maxLength={1000}
              placeholder="可粘贴截图、截图链接、订单页、聊天记录链接，或说明你看到的证据。"
              className="w-full resize-y rounded-lg border border-[#adb3b4]/40 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2d3435]"
            />
          </label>
          <div className="rounded-lg border border-[#adb3b4]/25 bg-[#f7f9f9] px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-[#2d3435]">图片证据</p>
                <p className="mt-1 text-xs leading-5 text-[#5a6061]">支持 PNG、JPG、WebP，单张 4MB 内；电脑端也可以直接粘贴截图。</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingEvidence || uploadedEvidence.length >= FEEDBACK_EVIDENCE_MAX_IMAGES}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/30 transition hover:bg-[#eef1f1] disabled:opacity-60"
              >
                {uploadingEvidence ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
                上传图片
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>
            {uploadedEvidence.length ? (
              <div className="mt-3 grid gap-2">
                {uploadedEvidence.map((item) => (
                  <div key={item.url} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2 text-xs text-[#5a6061] ring-1 ring-[#adb3b4]/20">
                    <span className="min-w-0 truncate">
                      {item.name} · {formatFileSize(item.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUploadedEvidence((current) => current.filter((evidence) => evidence.url !== item.url))}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7a8587] transition hover:bg-[#f2f4f4] hover:text-[#9b3328]"
                      aria-label={`移除图片证据 ${item.name}`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <label className="hidden">
            Website
            <input tabIndex={-1} autoComplete="off" name="website" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[#5a6061]">
              联系方式{requiresContact ? "（必填）" : "（可选）"}
            </span>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              maxLength={200}
              required={requiresContact}
              placeholder="QQ / 微信 / Telegram，任选一种，便于及时联系"
              className="h-10 w-full rounded-lg border border-[#adb3b4]/40 bg-white px-3 text-sm outline-none transition focus:border-[#2d3435]"
            />
          </label>
          <CommunityPrompt>
            {message?.type === "success"
              ? "需要补充截图或查看处理进展？可以加入 PriceAI 交流群继续说明。"
              : "如果问题比较紧急，或需要补充截图/聊天记录，也可以加入 PriceAI 交流群同步反馈。"}
          </CommunityPrompt>
          {message ? (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              message.type === "success" ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
            }`}>
              <p>{message.text}</p>
              {authRequired && message.type === "error" ? (
                <Link
                  href={buildLoginHref()}
                  className="mt-2 inline-flex h-8 items-center justify-center rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-white transition hover:bg-[#202829]"
                >
                  登录后提交
                </Link>
              ) : null}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading || uploadingEvidence || message?.type === "success"}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829] disabled:opacity-60"
          >
            {message?.type === "success" ? "已提交" : loading ? "提交中..." : uploadingEvidence ? "图片上传中..." : "提交反馈"}
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
  { value: AFTERSALES_FEEDBACK_REASON, label: "售后/发货问题" },
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

function needsHighRiskEvidence(reason: string, userExpectedAction: string): boolean {
  return feedbackRequiresEvidence(reason, userExpectedAction);
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "未知大小";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
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
