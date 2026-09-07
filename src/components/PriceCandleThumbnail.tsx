"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PriceHistoryInterval,
  ProductPriceChartSummary,
  ProductPriceChartSummaryResponse,
} from "@/lib/price-history";

type SummaryRequestState = {
  requestKey: string;
  response: ProductPriceChartSummaryResponse | null;
  error: string | null;
};

export function useProductPriceChartSummaries(input: {
  interval: PriceHistoryInterval;
  platform?: string | null;
  productType?: string | null;
  enabled?: boolean;
}) {
  const platform = normalizedFilter(input.platform);
  const productType = normalizedFilter(input.productType);
  const points = input.interval === "1h" ? 24 : 30;
  const cacheKey = `${input.interval}:${points}:${platform || "all"}:${productType || "all"}`;
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${cacheKey}:${attempt}`;
  const [state, setState] = useState<SummaryRequestState | null>(null);
  const activeState = state?.requestKey === requestKey ? state : null;
  const activeResponse = activeState?.response || null;
  const loading = input.enabled !== false && !activeState;
  const error = activeState?.error || null;

  useEffect(() => {
    if (input.enabled === false) return;

    const controller = new AbortController();
    const params = new URLSearchParams({ interval: input.interval, points: String(points) });
    if (platform) params.set("platform", platform);
    if (productType) params.set("productType", productType);

    void fetch(`/api/price-chart-summaries?${params.toString()}`, { signal: controller.signal })
      .then(async (fetchResponse) => {
        if (!fetchResponse.ok) {
          const payload = await fetchResponse.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message || "价格走势加载失败");
        }
        return fetchResponse.json() as Promise<ProductPriceChartSummaryResponse>;
      })
      .then((value) => {
        setState({ requestKey, response: value, error: null });
      })
      .catch((fetchError: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            requestKey,
            response: null,
            error: fetchError instanceof Error ? fetchError.message : "价格走势加载失败",
          });
        }
      });

    return () => controller.abort();
  }, [input.enabled, input.interval, platform, points, productType, requestKey]);

  const summaries = useMemo(
    () => new Map((activeResponse?.products || []).map((summary) => [summary.productId, summary])),
    [activeResponse],
  );
  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { response: activeResponse, summaries, loading, error, retry };
}

export function PriceCandleThumbnail({
  summary,
  interval,
  loading = false,
  error = null,
  onRetry,
  className = "",
}: {
  summary?: ProductPriceChartSummary;
  interval: PriceHistoryInterval;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const points = summary?.candles || [];
  const intervalLabel = interval === "1h" ? "1小时" : "1天";

  if (loading && !summary) return <ThumbnailLoading className={className} />;
  if (error && !summary) {
    return (
      <div className={`flex h-[64px] w-[148px] flex-col items-center justify-center gap-1 text-[0.65rem] text-[#8a5520] ${className}`}>
        <span>趋势加载失败</span>
        <button
          type="button"
          onClick={onRetry}
          className="pointer-events-auto relative z-20 inline-flex h-6 items-center gap-1 rounded bg-[#fff1d8] px-2 font-semibold text-[#76501f]"
        >
          <RefreshCw size={11} />
          重试
        </button>
      </div>
    );
  }
  if (!points.length) {
    return (
      <div className={`flex h-[64px] w-[148px] flex-col items-center justify-center text-[0.65rem] font-medium text-[#8a9293] ${className}`}>
        <span>暂无价格趋势</span>
        <span className="mt-1 text-[0.6rem] text-[#a0a7a8]">{intervalLabel}</span>
      </div>
    );
  }

  const width = 148;
  const height = 42;
  const padding = 3;
  const low = Math.min(...points.map((candle) => candle[3]));
  const high = Math.max(...points.map((candle) => candle[2]));
  const range = high - low || Math.max(0.01, high * 0.04);
  const step = (width - padding * 2) / points.length;
  const bodyWidth = Math.max(1.5, Math.min(4, step * 0.58));
  const yForPrice = (price: number) => padding + (1 - (price - low) / range) * (height - padding * 2);
  const change = summary?.change ?? null;
  const changePercent = summary?.changePercent ?? null;
  const changeTone = change === null || Math.abs(change) < 0.000001
    ? "text-[#7a8182]"
    : change > 0
      ? "text-[#b43c34]"
      : "text-[#2f7a4b]";

  return (
    <div className={`w-[148px] ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-[42px] w-[148px]"
        role="img"
        aria-label={`${intervalLabel}最低可买价 K 线${formatChangeLabel(change, changePercent)}`}
      >
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#edf0f1" strokeWidth="1" />
        {points.map((candle, index) => {
          const x = padding + step * index + step / 2;
          const openY = yForPrice(candle[1]);
          const closeY = yForPrice(candle[4]);
          const highY = yForPrice(candle[2]);
          const lowY = yForPrice(candle[3]);
          const color = candle[4] > candle[1] ? "#c6453d" : candle[4] < candle[1] ? "#2f7a4b" : "#7a8182";
          return (
            <g key={candle[0]}>
              <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth="1" />
              <rect
                x={x - bodyWidth / 2}
                y={Math.min(openY, closeY)}
                width={bodyWidth}
                height={Math.max(1.2, Math.abs(closeY - openY))}
                fill={color}
                rx="0.4"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center justify-between text-[0.62rem] font-semibold leading-none">
        <span className="text-[#8a9293]">{points.length < 2 ? "数据积累中" : intervalLabel}</span>
        <span className={changeTone}>{formatChange(change, changePercent)}</span>
      </div>
    </div>
  );
}

function ThumbnailLoading({ className }: { className: string }) {
  return (
    <div className={`h-[64px] w-[148px] animate-pulse ${className}`} aria-busy="true">
      <div className="h-[42px] rounded bg-[#edf0f1]" />
      <div className="mt-2 h-2 w-20 rounded bg-[#edf0f1]" />
    </div>
  );
}

function normalizedFilter(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return !normalized || normalized === "全部" ? null : normalized;
}

function formatChange(change: number | null, percent: number | null): string {
  if (change === null || percent === null) return "-";
  const sign = change > 0 ? "+" : "";
  const digits = Math.abs(change) < 0.01 && change !== 0 ? 4 : 2;
  return `${sign}${change.toFixed(digits)} / ${sign}${percent.toFixed(1)}%`;
}

function formatChangeLabel(change: number | null, percent: number | null): string {
  const text = formatChange(change, percent);
  return text === "-" ? "" : `，涨跌 ${text}`;
}
