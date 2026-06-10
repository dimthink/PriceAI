"use client";

import { ExternalLink, Flag, X } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { isAvailable } from "@/lib/catalog";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { readSessionCache, writeSessionCache } from "@/lib/client-cache";
import { createTimeoutSignal, isGeneratedDatasetStale, newestGeneratedDataset } from "@/lib/client-refresh";
import type { RawOffer } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

type ProductOffersResponse = {
  offers: RawOffer[];
  total: number;
  limited?: boolean;
  generatedAt: string;
  degraded?: boolean;
  message?: string | null;
};

const OFFER_PAGE_SIZE = 80;
const PRODUCT_OFFERS_CACHE_TTL_MS = 2 * 60 * 1000;
const productOffersMemoryCache = new Map<string, ProductOffersResponse>();

export function ProductOffersPanel({
  productId,
  productSlug,
  productName,
  initialCount,
  initialData = null,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  initialCount: number;
  initialData?: ProductOffersResponse | null;
}) {
  const initialCacheKey = productOffersCacheKey(productId, 0);
  const cachedInitialData = newestGeneratedDataset(productOffersMemoryCache.get(initialCacheKey), initialData);
  const [data, setData] = useState<ProductOffersResponse | null>(cachedInitialData);
  const [loading, setLoading] = useState(!cachedInitialData);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackOffer, setFeedbackOffer] = useState<RawOffer | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cacheKey = productOffersCacheKey(productId, 0);
    let cancelRefresh: (() => void) | null = null;
    let active = true;

    async function loadOffers() {
      const cachedData = newestGeneratedDataset(
        productOffersMemoryCache.get(cacheKey),
        initialData,
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
        const nextData = await fetchProductOfferPage(productId, 0, timeout.signal);
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
  }, [initialData, productId]);

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

        const mergedData = {
          ...nextPage,
          offers: [...current.offers, ...nextOffers],
          total: nextPage.total,
          limited: nextPage.limited,
        };

        const cacheKey = productOffersCacheKey(productId, 0);
        productOffersMemoryCache.set(cacheKey, mergedData);
        writeSessionCache(cacheKey, mergedData);

        return mergedData;
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
      {data?.degraded ? (
        <DegradedBanner message={data.message} />
      ) : null}
      <OfferTable offers={offers} onFeedback={setFeedbackOffer} />
      <section className="mt-5 grid gap-3 md:hidden">
        {offers.map((offer) => (
          <OfferListItem key={offer.id} offer={offer} onFeedback={setFeedbackOffer} />
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

function productOffersCacheKey(productId: string, offset: number): string {
  return `priceai:product-offers:v2:${productId}:${offset}:${OFFER_PAGE_SIZE}`;
}

function OfferTable({ offers, onFeedback }: { offers: RawOffer[]; onFeedback: (offer: RawOffer) => void }) {
  return (
    <section className="mt-6 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-[110px]" />
            <col className="w-[220px]" />
            <col />
            <col className="w-[130px]" />
            <col className="w-[150px]" />
            <col className="w-[140px]" />
            <col className="w-[80px]" />
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
                  <td className="whitespace-nowrap px-5 py-4 text-[#5a6061]">{formatRelativeTime(offerTimestamp(offer))}</td>
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
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5a6061]">{offer.sourceTitle}</p>
        </div>
        <OfferStatusBadge available={available} />
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={`text-2xl font-bold tracking-normal ${available ? "text-[#202829]" : "text-[#9b3328]"}`}>
            {formatCurrency(offer.price, offer.currency)}
          </p>
          <p className="mt-1 text-xs text-[#5a6061]">{formatRelativeTime(offerTimestamp(offer))}</p>
        </div>
        <OfferActions offer={offer} available={available} onFeedback={onFeedback} />
      </div>
    </article>
  );
}

function TableHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-5 py-3 font-semibold ${className}`}>{children}</th>;
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
      window.setTimeout(onClose, 1200);
    } catch (currentError) {
      setMessage({ type: "error", text: currentError instanceof Error ? currentError.message : "反馈提交失败。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#202829]/35 px-4 py-4 sm:items-center">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-[0_24px_80px_rgba(32,40,41,0.22)]">
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
          {message ? (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              message.type === "success" ? "bg-[#e8f3ec] text-[#2f7a4b]" : "bg-[#fbe9e7] text-[#9b3328]"
            }`}>
              {message.text}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829] disabled:opacity-60"
          >
            {loading ? "提交中..." : "提交反馈"}
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
