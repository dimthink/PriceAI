"use client";

import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isAvailable } from "@/lib/catalog";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { RawOffer } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

type ProductOffersResponse = {
  offers: RawOffer[];
  total: number;
  limited?: boolean;
  generatedAt: string;
};

const OFFER_PAGE_SIZE = 80;

export function ProductOffersPanel({
  productId,
  initialCount,
}: {
  productId: string;
  initialCount: number;
}) {
  const [data, setData] = useState<ProductOffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOffers() {
      setLoading(true);
      setError(null);

      try {
        setData(await fetchProductOfferPage(productId, 0, controller.signal));
      } catch (currentError) {
        if (controller.signal.aborted) return;
        setError(currentError instanceof Error ? currentError.message : "报价加载失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadOffers();

    return () => controller.abort();
  }, [productId]);

  const offers = data?.offers ?? [];
  const total = data?.total ?? initialCount;
  const hasMore = Boolean(data) && offers.length < total;

  const loadMoreOffers = useCallback(async () => {
    if (!data || paging || offers.length >= total) return;

    setPaging(true);
    setError(null);

    try {
      const nextPage = await fetchProductOfferPage(productId, offers.length);
      setData((current) => {
        if (!current) return nextPage;

        const seen = new Set(current.offers.map((offer) => offer.id));
        const nextOffers = nextPage.offers.filter((offer) => !seen.has(offer.id));

        return {
          ...nextPage,
          offers: [...current.offers, ...nextOffers],
          total: nextPage.total,
          limited: nextPage.limited,
        };
      });
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "报价加载失败");
    } finally {
      setPaging(false);
    }
  }, [data, offers.length, paging, productId, total]);

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

  if (loading) {
    return (
      <section className="mt-6 overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
        {Array.from({ length: Math.min(Math.max(initialCount, 3), 6) }).map((_, index) => (
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

  if (error) {
    return (
      <div className="mt-6 rounded-lg bg-[#fff7e8] px-5 py-4 text-sm font-medium text-[#6a4b16]">
        {error}
      </div>
    );
  }

  return (
    <>
      {total > offers.length ? (
        <div className="mt-6 rounded-lg bg-[#fff7e8] px-4 py-3 text-sm text-[#6a4b16]">
          当前商品共有 {total} 条报价，已显示 {offers.length} 条。
        </div>
      ) : null}
      <OfferTable offers={offers} />
      <section className="mt-5 grid gap-3 md:hidden">
        {offers.map((offer) => (
          <OfferListItem key={offer.id} offer={offer} />
        ))}
      </section>
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
    </>
  );
}

async function fetchProductOfferPage(
  productId: string,
  offset: number,
  signal?: AbortSignal,
): Promise<ProductOffersResponse> {
  const params = new URLSearchParams({
    limit: String(OFFER_PAGE_SIZE),
    offset: String(offset),
  });
  const response = await fetch(`/api/products/${encodeURIComponent(productId)}/offers?${params.toString()}`, {
    signal,
  });

  if (!response.ok) throw new Error("报价加载失败");

  return (await response.json()) as ProductOffersResponse;
}

function OfferTable({ offers }: { offers: RawOffer[] }) {
  return (
    <section className="mt-6 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-left text-sm">
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>状态</TableHead>
              <TableHead>渠道</TableHead>
              <TableHead>原始商品名</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead>操作</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {offers.map((offer) => {
              const available = isOfferAvailable(offer);

              return (
                <tr key={offer.id} className={`transition hover:bg-[#f7f9f9] ${available ? "" : "bg-[#fbf7f6]"}`}>
                  <td className="px-5 py-4">
                    <OfferStatusBadge available={available} />
                  </td>
                  <td className="max-w-[210px] px-5 py-4">
                    <span className="block truncate font-semibold text-[#202829]">
                      {sourceLabel(offer)}
                    </span>
                    {sourceSecondaryLabel(offer) ? (
                      <span className="mt-1 block truncate text-xs text-[#5a6061]">{sourceSecondaryLabel(offer)}</span>
                    ) : null}
                  </td>
                  <td className="max-w-[380px] px-5 py-4">
                    <span className="block truncate text-[#2d3435]">{offer.sourceTitle}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-lg font-bold ${available ? "text-[#202829]" : "text-[#9b3328]"}`}>
                      {formatCurrency(offer.price, offer.currency)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[#5a6061]">{formatRelativeTime(offerTimestamp(offer))}</td>
                  <td className="px-5 py-4">
                    <OfferLink offer={offer} available={available} compact />
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

function OfferListItem({ offer }: { offer: RawOffer }) {
  const available = isOfferAvailable(offer);

  return (
    <article className={`rounded-lg p-4 shadow-[0_16px_45px_rgba(45,52,53,0.04)] ring-1 ${available ? "bg-white ring-[#adb3b4]/15" : "bg-[#fbf7f6] ring-[#ead8d5]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#202829]">{sourceLabel(offer)}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{offer.sourceTitle}</p>
        </div>
        <OfferStatusBadge available={available} />
      </div>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className={`text-2xl font-bold tracking-normal ${available ? "text-[#202829]" : "text-[#9b3328]"}`}>
            {formatCurrency(offer.price, offer.currency)}
          </p>
          <p className="mt-1 text-xs text-[#5a6061]">{formatRelativeTime(offerTimestamp(offer))}</p>
        </div>
        <OfferLink offer={offer} available={available} compact />
      </div>
    </article>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}

function OfferStatusBadge({ available }: { available: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
        available ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
      }`}
    >
      {available ? "有货" : "缺货"}
    </span>
  );
}

function OfferLink({
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition hover:opacity-90 ${
        compact ? "h-9 px-3" : "h-11 px-5"
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

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-[#e4e9ea] ${className}`} />;
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
