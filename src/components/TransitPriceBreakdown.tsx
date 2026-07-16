"use client";

import type { TransitModelPrice, TransitStation } from "@/data/api-transit/types";
import {
  formatRate,
  formatTransitModelMultiplier,
  formatOfficialUnitPrice,
  getOfficialTransitUnitCurrency,
  getOfficialTransitUnitPrice,
  getTransitConvertedUnitPrice,
  getTransitEffectiveMetricRate,
  hasComparableTransitOfficialPrice,
  isTransitFixedPrice,
  formatTransitFixedPrice,
  formatTransitFixedPriceValue,
  type TransitPriceMetric,
} from "@/lib/api-transit";

const priceMetrics: { metric: TransitPriceMetric; label: string }[] = [
  { metric: "input", label: "输入" },
  { metric: "output", label: "输出" },
  { metric: "imageOutput", label: "图片输出" },
  { metric: "cacheWrite", label: "缓存写入" },
  { metric: "cacheRead", label: "缓存读取" },
];

export function TransitPriceBreakdown({
  station,
  price,
  mode = "detail",
}: {
  station: TransitStation;
  price: TransitModelPrice;
  mode?: "compact" | "detail";
}) {
  const hasImageOutput = getOfficialTransitUnitPrice(price.standardModel, "imageOutput") !== null;
  const hasComparableOfficial = hasComparableTransitOfficialPrice(price.standardModel);
  const compactMetrics = hasImageOutput
    ? priceMetrics.filter(({ metric }) => metric === "input" || metric === "imageOutput")
    : priceMetrics.filter(({ metric }) => metric === "input" || metric === "output");
  const metrics = (mode === "compact" ? compactMetrics : priceMetrics).filter(({ metric }) => {
    if (metric === "imageOutput") return getOfficialTransitUnitPrice(price.standardModel, metric) !== null;
    if (metric === "output") return getOfficialTransitUnitPrice(price.standardModel, metric) !== null;
    return true;
  });
  const currency = getOfficialTransitUnitCurrency(price.standardModel);

  if (isTransitFixedPrice(price)) {
    const tiers = price.fixedPriceTiers || [];
    return (
      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-2 py-1.5 leading-tight">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-[10px] font-bold text-[var(--color-text-muted)]">人民币固定价</p>
          <span className="shrink-0 rounded-full bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-muted)] ring-1 ring-[var(--color-border-soft)]">
            按次
          </span>
        </div>
        <p className="mt-0.5 text-[13px] font-extrabold tabular-nums text-[var(--color-text-primary)]">
          {formatTransitFixedPrice(price)}
        </p>
        {mode === "detail" && tiers.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {tiers.slice(0, 4).map((tier) => (
              <span
                key={`${tier.label}-${tier.price}`}
                className="rounded-full bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--color-text-muted)] ring-1 ring-[var(--color-border-soft)]"
              >
                {tier.label} {formatTransitFixedPriceValue(tier.price, tier.unit)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (!hasComparableOfficial) {
    return (
      <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-2 py-1.5 leading-tight">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="truncate text-[10px] font-bold text-[var(--color-text-muted)]">公开固定价</p>
          <span className="shrink-0 rounded-full bg-[var(--color-surface-raised)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--color-text-muted)] ring-1 ring-[var(--color-border-soft)]">
            非官方倍率
          </span>
        </div>
        <p className="mt-0.5 text-[13px] font-extrabold tabular-nums text-[var(--color-text-primary)]">
          {formatTransitModelMultiplier(price)}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-panel)]">
      {metrics.map(({ metric, label }, index) => (
        <RateChip
          key={metric}
          index={index}
          total={metrics.length}
          label={label}
          currency={currency}
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
  currency,
  officialPrice,
  convertedPrice,
  effectiveRate,
}: {
  index: number;
  total: number;
  label: string;
  currency: "USD" | "CNY";
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
      <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {officialPrice !== null ? (
          <span className="shrink-0 text-[10px] font-semibold text-[var(--color-text-soft)] line-through decoration-[var(--color-text-soft)]/70">
            {formatOfficialUnitPrice(officialPrice, currency)}
          </span>
        ) : null}
        <span className="text-[13px] font-extrabold tabular-nums text-[var(--color-text-primary)]">
          {formatOfficialUnitPrice(convertedPrice, currency)}
        </span>
      </div>
    </div>
  );
}
