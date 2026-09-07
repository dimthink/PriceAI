"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  MouseEventParams,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type {
  PriceHistoryInterval,
  ProductPriceCandle,
  ProductPriceCandleResponse,
} from "@/lib/price-history";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

const INTERVAL_LIMITS: Record<PriceHistoryInterval, number> = { "1h": 168, "1d": 90 };
const EMPTY_CANDLES: ProductPriceCandle[] = [];

type CandleRequestState = {
  requestKey: string;
  response: ProductPriceCandleResponse | null;
  error: string | null;
};

export function ProductPriceHistoryChart({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [interval, setInterval] = useState<PriceHistoryInterval>("1d");
  const { response, loading, error, retry } = useProductPriceCandles(productId, interval);
  const candles = response?.candles || EMPTY_CANDLES;
  const [activeCandle, setActiveCandle] = useState<ProductPriceCandle | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const displayCandle = activeCandle || candles.at(-1) || null;
  const displayChange = useMemo(() => candleChange(candles, displayCandle), [candles, displayCandle]);

  return (
    <section className="mt-5 overflow-hidden rounded-lg bg-white shadow-[0_18px_50px_rgba(45,52,53,0.04)] ring-1 ring-[#adb3b4]/15 md:mt-7">
      <div className="flex flex-col gap-3 border-b border-[#edf0f1] px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold tracking-normal text-[#202829] sm:text-xl">
            最低可买价走势
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#5a6061]">
            {productName} · 最低起购量为 1 或无批量限制 · 每根 K 线代表 {interval === "1h" ? "1 小时" : "1 天"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            title="恢复默认范围"
            aria-label="恢复默认范围"
            onClick={() => setResetVersion((value) => value + 1)}
            disabled={!candles.length}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#f2f4f4] text-[#5a6061] transition hover:text-[#202829] disabled:opacity-40"
          >
            <RotateCcw size={15} />
          </button>
          <IntervalSwitch
            interval={interval}
            onChange={(value) => {
              setActiveCandle(null);
              setInterval(value);
            }}
          />
        </div>
      </div>

      <CurrentPriceStrip response={response} loading={loading} />

      <div className="relative min-w-0 border-y border-[#edf0f1]">
        {loading && !response ? (
          <ChartLoading />
        ) : error && !response ? (
          <ChartMessage>
            <span>{error}</span>
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435]"
            >
              <RefreshCw size={13} />
              重试
            </button>
          </ChartMessage>
        ) : candles.length ? (
          <>
            <CandlestickCanvas
              candles={candles}
              interval={interval}
              resetVersion={resetVersion}
              onActiveCandleChange={setActiveCandle}
            />
            <CandleTooltip
              candle={activeCandle}
              change={candleChange(candles, activeCandle)}
              interval={interval}
            />
          </>
        ) : (
          <ChartMessage>
            <span>{response?.current.price ? "首批价格已记录，K 线数据积累中" : "暂无历史数据"}</span>
          </ChartMessage>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-xs sm:grid-cols-5 sm:px-5">
        <PriceFact label="开盘" value={formatCurrency(displayCandle?.open ?? null, "CNY")} />
        <PriceFact label="最高" value={formatCurrency(displayCandle?.high ?? null, "CNY")} />
        <PriceFact label="最低" value={formatCurrency(displayCandle?.low ?? null, "CNY")} />
        <PriceFact label="收盘" value={formatCurrency(displayCandle?.close ?? null, "CNY")} />
        <PriceFact
          label="较上一周期"
          value={formatSignedChange(displayChange.change, displayChange.changePercent)}
          tone={changeTone(displayChange.change)}
        />
      </div>

      <p className="border-t border-[#edf0f1] px-4 py-3 text-[0.68rem] leading-5 text-[#7a8182] sm:px-5">
        K 线基于符合条件的最低公开报价生成，仅供价格观察，不代表实际成交价格。
      </p>
    </section>
  );
}

function useProductPriceCandles(productId: string, interval: PriceHistoryInterval) {
  const cacheKey = `${productId}:${interval}`;
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${cacheKey}:${attempt}`;
  const [state, setState] = useState<CandleRequestState | null>(null);
  const activeState = state?.requestKey === requestKey ? state : null;
  const activeResponse = activeState?.response || null;
  const loading = !activeState;
  const error = activeState?.error || null;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ interval, limit: String(INTERVAL_LIMITS[interval]) });
    void fetch(`/api/products/${encodeURIComponent(productId)}/price-candles?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (fetchResponse) => {
        if (!fetchResponse.ok) {
          const payload = await fetchResponse.json().catch(() => null) as { message?: string } | null;
          throw new Error(payload?.message || "价格走势加载失败");
        }
        return fetchResponse.json() as Promise<ProductPriceCandleResponse>;
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
  }, [interval, productId, requestKey]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { response: activeResponse, loading, error, retry };
}

function CurrentPriceStrip({
  response,
  loading,
}: {
  response: ProductPriceCandleResponse | null;
  loading: boolean;
}) {
  const current = response?.current;
  const priceText = current?.price ? formatCurrency(current.price, "CNY") : "当前暂无有效报价";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-5">
      <div>
        <p className="text-[0.65rem] font-medium text-[#7a8182]">当前最低可买价</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-[#202829]">{loading && !response ? "加载中" : priceText}</p>
      </div>
      <PriceFact
        label="最近涨跌"
        value={formatSignedChange(current?.change ?? null, current?.changePercent ?? null)}
        tone={changeTone(current?.change ?? null)}
      />
      <PriceFact label="有效报价" value={current ? String(current.eligibleOfferCount) : "-"} />
      <PriceFact
        label="更新时间"
        value={response?.lastObservedAt || current?.observedAt
          ? formatRelativeTime(response?.lastObservedAt || current?.observedAt)
          : "-"}
      />
    </div>
  );
}

function CandlestickCanvas({
  candles,
  interval,
  resetVersion,
  onActiveCandleChange,
}: {
  candles: ProductPriceCandle[];
  interval: PriceHistoryInterval;
  resetVersion: number;
  onActiveCandleChange: (candle: ProductPriceCandle | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unsubscribe: (() => void) | null = null;

    void import("lightweight-charts").then(({ CandlestickSeries, ColorType, CrosshairMode, createChart }) => {
      if (disposed) return;
      chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: "#ffffff" },
          textColor: "#687071",
          attributionLogo: true,
          fontFamily: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
          fontSize: 11,
        },
        crosshair: { mode: CrosshairMode.Normal },
        grid: { vertLines: { color: "#f0f2f2" }, horzLines: { color: "#edf0f1" } },
        rightPriceScale: { borderColor: "#dfe4e5", scaleMargins: { top: 0.18, bottom: 0.12 } },
        timeScale: {
          borderColor: "#dfe4e5",
          timeVisible: interval === "1h",
          secondsVisible: false,
          rightOffset: 2,
          barSpacing: interval === "1h" ? 7 : 9,
          minBarSpacing: 3,
          tickMarkFormatter: (time: Time) => formatChartTime(time, interval, true),
        },
        localization: {
          locale: "zh-CN",
          priceFormatter: (price: number) => formatCompactPrice(price),
          timeFormatter: (time: Time) => formatChartTime(time, interval, false),
        },
        handleScroll: true,
        handleScale: true,
      });
      chartRef.current = chart;
      const precision = pricePrecision(candles);
      const series: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
        upColor: "#c6453d",
        downColor: "#2f7a4b",
        wickUpColor: "#c6453d",
        wickDownColor: "#2f7a4b",
        borderVisible: false,
        priceFormat: { type: "price", precision, minMove: 10 ** -precision },
      });
      const candleByTimestamp = new Map<number, ProductPriceCandle>();
      const chartData: CandlestickData<UTCTimestamp>[] = candles.map((candle) => {
        const timestamp = Math.floor(new Date(candle.time).getTime() / 1000) as UTCTimestamp;
        candleByTimestamp.set(timestamp, candle);
        return { time: timestamp, open: candle.open, high: candle.high, low: candle.low, close: candle.close };
      });
      series.setData(chartData);
      chart.timeScale().fitContent();

      const handleCrosshairMove = (param: MouseEventParams) => {
        onActiveCandleChange(typeof param.time === "number" ? candleByTimestamp.get(param.time) || null : null);
      };
      chart.subscribeCrosshairMove(handleCrosshairMove);
      unsubscribe = () => chart?.unsubscribeCrosshairMove(handleCrosshairMove);

      resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect?.width && rect.height) chart?.applyOptions({ width: rect.width, height: rect.height });
      });
      resizeObserver.observe(container);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      unsubscribe?.();
      chart?.remove();
      if (chartRef.current === chart) chartRef.current = null;
    };
  }, [candles, interval, onActiveCandleChange]);

  useEffect(() => {
    if (resetVersion > 0) chartRef.current?.timeScale().fitContent();
  }, [resetVersion]);

  return <div ref={containerRef} className="h-[260px] w-full md:h-[340px]" aria-label="最低可买价蜡烛图" />;
}

function CandleTooltip({
  candle,
  change,
  interval,
}: {
  candle: ProductPriceCandle | null;
  change: { change: number | null; changePercent: number | null };
  interval: PriceHistoryInterval;
}) {
  if (!candle) return null;
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-5rem)] rounded-md bg-white/95 px-3 py-2 text-[0.65rem] leading-5 text-[#5a6061] shadow-[0_8px_28px_rgba(45,52,53,0.1)] ring-1 ring-[#adb3b4]/20 backdrop-blur-sm">
      <p className="font-semibold text-[#202829]">{formatCandleTime(candle.time, interval)}</p>
      <p className="tabular-nums">
        开 {formatCompactPrice(candle.open)} · 高 {formatCompactPrice(candle.high)} · 低 {formatCompactPrice(candle.low)} · 收 {formatCompactPrice(candle.close)}
      </p>
      <p>样本 {candle.sampleCount} · 较前期 {formatSignedChange(change.change, change.changePercent)}</p>
    </div>
  );
}

function IntervalSwitch({
  interval,
  onChange,
}: {
  interval: PriceHistoryInterval;
  onChange: (value: PriceHistoryInterval) => void;
}) {
  return (
    <div className="inline-flex h-9 w-fit items-center rounded-md bg-[#f2f4f4] p-1" aria-label="K 线周期">
      {(["1h", "1d"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={interval === value}
          onClick={() => onChange(value)}
          className={`h-7 min-w-[58px] rounded px-3 text-xs font-semibold transition ${
            interval === value
              ? "bg-white text-[#202829] shadow-[0_3px_12px_rgba(45,52,53,0.08)]"
              : "text-[#687071] hover:text-[#202829]"
          }`}
        >
          {value === "1h" ? "1小时" : "1天"}
        </button>
      ))}
    </div>
  );
}

function PriceFact({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "up" | "down" | "muted";
}) {
  const valueClass = { default: "text-[#202829]", up: "text-[#b43c34]", down: "text-[#2f7a4b]", muted: "text-[#7a8182]" }[tone];
  return (
    <div className="min-w-0">
      <div className="text-[0.65rem] font-medium text-[#7a8182]">{label}</div>
      <div className={`mt-1 truncate font-semibold tabular-nums ${valueClass}`} title={value}>{value}</div>
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="flex h-[260px] items-end gap-2 overflow-hidden px-5 py-6 md:h-[340px]" aria-busy="true">
      {Array.from({ length: 22 }, (_, index) => (
        <div key={index} className="min-w-1 flex-1 animate-pulse rounded-sm bg-[#e8ecec]" style={{ height: `${28 + ((index * 17) % 64)}%` }} />
      ))}
    </div>
  );
}

function ChartMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center px-6 text-center text-sm font-medium text-[#7a8182] md:h-[340px]">
      {children}
    </div>
  );
}

function candleChange(candles: ProductPriceCandle[], candle: ProductPriceCandle | null) {
  if (!candle) return { change: null, changePercent: null };
  const index = candles.findIndex((item) => item.time === candle.time);
  const previousClose = index > 0 ? candles[index - 1]?.close : undefined;
  if (!previousClose) return { change: null, changePercent: null };
  const change = candle.close - previousClose;
  return { change, changePercent: (change / previousClose) * 100 };
}

function changeTone(value: number | null): "up" | "down" | "muted" {
  if (value === null || Math.abs(value) < 0.000001) return "muted";
  return value > 0 ? "up" : "down";
}

function formatSignedChange(change: number | null, percent: number | null): string {
  if (change === null || percent === null) return "-";
  const sign = change > 0 ? "+" : "";
  const direction = change > 0 ? "上涨" : change < 0 ? "下跌" : "持平";
  return `${direction} ${sign}${formatNumber(change)} (${sign}${percent.toFixed(2)}%)`;
}

function formatCompactPrice(value: number): string {
  return `¥${formatNumber(value)}`;
}

function formatNumber(value: number): string {
  const digits = Math.abs(value) < 0.01 && value !== 0 ? 4 : 2;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function pricePrecision(candles: ProductPriceCandle[]): number {
  const minimum = Math.min(...candles.flatMap((candle) => [candle.open, candle.high, candle.low, candle.close]));
  return minimum < 0.01 ? 4 : 2;
}

function formatCandleTime(value: string, interval: PriceHistoryInterval): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(interval === "1h" ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(value));
}

function formatChartTime(time: Time, interval: PriceHistoryInterval, compact: boolean): string {
  if (typeof time !== "number") {
    if (typeof time === "string") return time;
    return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
  }
  const options: Intl.DateTimeFormatOptions = interval === "1h"
    ? { timeZone: "Asia/Shanghai", month: compact ? undefined : "2-digit", day: compact ? undefined : "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }
    : { timeZone: "Asia/Shanghai", year: compact ? undefined : "numeric", month: "2-digit", day: "2-digit" };
  return new Intl.DateTimeFormat("zh-CN", options).format(new Date(time * 1000));
}
