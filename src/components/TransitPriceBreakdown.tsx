"use client";

import type { TransitModelPrice, TransitStation } from "@/data/api-transit/types";
import {
  formatRate,
  formatUsdPerMTok,
  getOfficialTransitUnitPrice,
  getTransitConvertedUnitPrice,
  getTransitEffectiveMetricRate,
  type TransitPriceMetric,
} from "@/lib/api-transit";

const priceMetrics: { metric: TransitPriceMetric; label: string }[] = [
  { metric: "input", label: "输入" },
  { metric: "output", label: "输出" },
  { metric: "cacheWrite", label: "缓存写入" },
  { metric: "cacheRead", label: "缓存读取" },
];

const compactPriceMetrics = priceMetrics.slice(0, 2);

export function TransitPriceBreakdown({
  station,
  price,
  mode = "detail",
}: {
  station: TransitStation;
  price: TransitModelPrice;
  mode?: "compact" | "detail";
}) {
  const metrics = mode === "compact" ? compactPriceMetrics : priceMetrics;

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-panel)]">
      {metrics.map(({ metric, label }, index) => (
        <RateChip
          key={metric}
          index={index}
          total={metrics.length}
          label={label}
          officialPrice={getOfficialTransitUnitPrice(price.standardModel, metric)}
          convertedPrice={getTransitConvertedUnitPrice(station, price, metric)}
          effectiveRate={getTransitEffectiveMetricRate(station, price, metric)}
        />
      ))}
    </div>
  );
}

function RateChip({
  index,
  total,
  label,
  officialPrice,
  convertedPrice,
  effectiveRate,
}: {
  index: number;
  total: number;
  label: string;
  officialPrice: number | null;
  convertedPrice: number | null;
  effectiveRate: number | null;
}) {
  const isMissing = convertedPrice === null;
  const isLeft = index % 2 === 0;
  const hasBottomBorder = index < total - 2;
  const cellClassName = isMissing
    ? "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
    : "bg-[var(--color-panel-soft)] text-[var(--color-text-primary)]";

  return (
    <div
      className={`min-w-0 px-2 py-1.5 leading-tight ${cellClassName} ${
        isLeft ? "border-r border-[var(--color-border)]" : ""
      } ${hasBottomBorder ? "border-b border-[var(--color-border)]" : ""}`}
    >
      <div className="flex min-w-0 items-center justify-start gap-1.5">
        <p className="truncate text-[10px] font-bold text-[var(--color-text-muted)]">{label}</p>
        <span className="shrink-0 rounded-full bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--color-text-muted)] ring-1 ring-[var(--color-border-soft)]">
          {formatRate(effectiveRate)}
        </span>
      </div>
      <div className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        {officialPrice !== null ? (
          <span className="shrink-0 text-[10px] font-semibold text-[var(--color-text-soft)] line-through decoration-[var(--color-text-soft)]/70">
            {formatUsdPerMTok(officialPrice)}
          </span>
        ) : null}
        <span className="truncate text-[13px] font-extrabold tabular-nums text-[var(--color-text-primary)]">
          {formatUsdPerMTok(convertedPrice)}
        </span>
      </div>
    </div>
  );
}
