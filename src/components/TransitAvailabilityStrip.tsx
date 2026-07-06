"use client";

import type { TransitAvailabilitySample } from "@/data/api-transit/types";

export function TransitAvailabilityStrip({
  rate,
  samples,
  recentSamples = [],
  lastCheckedAt = null,
  className = "",
  showLabels = false,
}: {
  rate: number | null;
  samples: number;
  recentSamples?: TransitAvailabilitySample[];
  firstCheckedAt?: string | null;
  lastCheckedAt?: string | null;
  className?: string;
  showLabels?: boolean;
}) {
  const samplesForTrend = recentSamples.slice(-TRANSIT_RECENT_SAMPLE_LIMIT);
  const bars = samplesForTrend.map(sampleTone);
  const hasTrend = bars.length > 0;

  return (
    <div className={className}>
      {showLabels ? (
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-[#8a9394]">
          <span>{hasTrend ? `近 ${bars.length} 次记录` : availabilityEmptyLabel(rate, samples)}</span>
          {lastCheckedAt ? <span>{formatShortTime(lastCheckedAt)}</span> : null}
        </div>
      ) : null}
      <div
        className="flex h-4 items-end gap-[2px]"
        aria-label={availabilityAriaLabel(rate, samples, bars.length, hasTrend)}
        title={hasTrend
          ? "近 60 次真实监测记录，按时间从左到右：绿色为成功，黄色为部分异常或延迟偏高，红色为失败。"
          : "暂无逐次监测记录，仅展示 7 天可用性汇总。"}
      >
        {hasTrend ? bars.map((tone, index) => (
          <span
            key={`${tone}-${samplesForTrend[index]?.checkedAt || "sample"}-${index}`}
            className={`block w-[4px] rounded-full ${availabilityBarClass(tone)}`}
            style={{ height: `${index % 5 === 0 ? 13 : 16}px` }}
          />
        )) : (
          <span className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-[10px] font-semibold text-[#7f8889]">
            {availabilityEmptyLabel(rate, samples)}
          </span>
        )}
      </div>
      {showLabels && hasTrend ? (
        <div className="mt-1 flex items-center justify-between text-[9px] font-semibold tracking-[0.08em] text-[#a2abad]">
          <span>PAST</span>
          <span>NOW</span>
        </div>
      ) : null}
    </div>
  );
}

function sampleTone(sample: TransitAvailabilitySample): "good" | "warn" | "bad" {
  if (sample.ok === false) return "bad";
  if (sample.ok === null) return "warn";
  const latency = sample.latencyMs ?? null;
  if (latency !== null && latency >= HIGH_LATENCY_MS) return "warn";
  return "good";
}

function availabilityAriaLabel(rate: number | null, samples: number, trendCount: number, hasTrend: boolean): string {
  if (rate === null || samples <= 0) return "稳定性样本不足，暂无可用性监测样本";
  const rateText = `7天可用性 ${(rate * 100).toFixed(1)}%，样本 ${samples}`;
  if (!hasTrend) return `${rateText}，仅有汇总数据，暂无逐次明细`;
  return `${rateText}，展示最近 ${trendCount} 次逐次记录`;
}

function availabilityEmptyLabel(rate: number | null, samples: number): string {
  if (rate === null || samples <= 0) return "样本不足";
  return "仅汇总";
}

function formatShortTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

function availabilityBarClass(tone: "good" | "warn" | "bad"): string {
  if (tone === "good") return "bg-[#45bf78]";
  if (tone === "warn") return "bg-[#d99a2b]";
  return "bg-[#d95745]";
}

const TRANSIT_RECENT_SAMPLE_LIMIT = 60;
const HIGH_LATENCY_MS = 5_000;
