"use client";

import type { TransitAvailability } from "@/data/api-transit/types";
import {
  buildTransitAvailabilityBars,
  type TransitAvailabilityBarTone,
} from "@/lib/api-transit";

export function TransitAvailabilityStrip({
  rate,
  samples,
  firstCheckedAt = null,
  lastCheckedAt = null,
  recentSamples,
  className = "",
}: {
  rate: number | null;
  samples: number;
  firstCheckedAt?: string | null;
  lastCheckedAt?: string | null;
  recentSamples?: TransitAvailability["recentSamples"];
  className?: string;
}) {
  const bars = buildTransitAvailabilityBars({
    rate,
    samples,
    firstCheckedAt,
    lastCheckedAt,
    recentSamples,
  });
  const emptyCount = bars.filter((tone) => tone === "empty").length;
  const recentSampleCount = recentSamples?.length ?? 0;

  return (
    <div
      className={`flex h-4 items-end gap-[2px] ${className}`}
      aria-label={availabilityAriaLabel({
        rate,
        samples,
        emptyCount,
        recentSampleCount,
      })}
      title={
        recentSampleCount > 0
          ? "最近请求样本概览，按时间从旧到新：每条最多代表 3 次请求，绿色为成功，黄色为部分失败，红色为失败，浅灰为样本不足。"
          : "近 7 日样本比例概览，非时间顺序：绿色为成功，黄色/红色为异常或失败，浅灰为样本不足。"
      }
    >
      {bars.map((tone, index) => (
        <span
          key={`${tone}-${index}`}
          className={`block w-[4px] rounded-full ${availabilityBarClass(tone)}`}
          style={{ height: `${index % 4 === 0 ? 12 : 15}px` }}
        />
      ))}
    </div>
  );
}

function availabilityAriaLabel({
  rate,
  samples,
  emptyCount,
  recentSampleCount,
}: {
  rate: number | null;
  samples: number;
  emptyCount: number;
  recentSampleCount: number;
}): string {
  if (recentSampleCount > 0) {
    const rateText = rate === null || samples <= 0
      ? "稳定性样本不足"
      : `稳定性 ${(rate * 100).toFixed(1)}%，样本 ${samples}`;
    return `${rateText}；最近 ${recentSampleCount} 次请求概览，每条最多 3 次，按时间从旧到新，样本不足时右侧留空`;
  }
  if (rate === null || samples <= 0) return "稳定性样本不足，暂无可用性监测样本";
  const rateText = `稳定性样本比例概览 ${(rate * 100).toFixed(1)}%，样本 ${samples}，非时间顺序`;
  if (emptyCount <= 0) return rateText;
  return `${rateText}，${emptyCount} 段样本不足`;
}

function availabilityBarClass(tone: TransitAvailabilityBarTone): string {
  if (tone === "good") return "bg-[#45bf78]";
  if (tone === "warn") return "bg-[#d99a2b]";
  if (tone === "bad") return "bg-[#d95745]";
  return "bg-[#e5eaea]";
}
