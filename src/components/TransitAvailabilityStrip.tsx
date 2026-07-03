"use client";

export function TransitAvailabilityStrip({
  rate,
  samples,
  firstCheckedAt = null,
  lastCheckedAt = null,
  className = "",
}: {
  rate: number | null;
  samples: number;
  firstCheckedAt?: string | null;
  lastCheckedAt?: string | null;
  className?: string;
}) {
  const bars = buildAvailabilityBars({
    rate,
    samples,
    firstCheckedAt,
    lastCheckedAt,
  });
  const emptyCount = bars.filter((tone) => tone === "empty").length;

  return (
    <div
      className={`flex h-4 items-end gap-[2px] ${className}`}
      aria-label={availabilityAriaLabel(rate, samples, emptyCount)}
      title="近 7 日滚动样本比例概览，非时间顺序：绿色为成功，黄色/红色为异常或失败，浅灰为空白未检测。"
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

function buildAvailabilityBars({
  rate,
  samples,
  firstCheckedAt,
  lastCheckedAt,
}: {
  rate: number | null;
  samples: number;
  firstCheckedAt: string | null;
  lastCheckedAt: string | null;
}): Array<"good" | "warn" | "bad" | "empty"> {
  const total = 16;
  if (rate === null || samples <= 0) return Array(total).fill("empty");
  const monitoredBars = observedBarCount({
    samples,
    firstCheckedAt,
    lastCheckedAt,
    total,
  });
  if (monitoredBars <= 0) return Array(total).fill("empty");

  const clamped = Math.max(0, Math.min(1, rate));
  return Array.from({ length: total }, (_, index) => {
    if (index >= monitoredBars) return "empty";
    const expectedGoodCount = Math.round(clamped * (index + 1));
    const previousGoodCount = Math.round(clamped * index);
    if (expectedGoodCount > previousGoodCount) return "good";
    return clamped >= 0.75 ? "warn" : "bad";
  });
}

function observedBarCount({
  samples,
  firstCheckedAt,
  lastCheckedAt,
  total,
}: {
  samples: number;
  firstCheckedAt: string | null;
  lastCheckedAt: string | null;
  total: number;
}) {
  const sampleBars = Math.max(0, Math.min(total, samples));
  const lastCheckedMs = parseTimestamp(lastCheckedAt);
  if (!lastCheckedMs) return sampleBars;

  const nowMs = roundedNowMs();
  const trailingBlankBars = trailingUnmonitoredBars({
    lastCheckedMs,
    nowMs,
    total,
  });
  const activeWindowBars = Math.max(0, total - trailingBlankBars);
  const firstCheckedMs = parseTimestamp(firstCheckedAt);

  if (!firstCheckedMs) return Math.min(sampleBars, activeWindowBars);

  const windowMs = TRANSIT_AVAILABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const monitoringSpanMs = Math.max(0, Math.min(nowMs, lastCheckedMs) - Math.max(nowMs - windowMs, firstCheckedMs));
  const spanBars = Math.max(1, Math.ceil((monitoringSpanMs / windowMs) * total));

  return Math.min(sampleBars, activeWindowBars, spanBars);
}

function trailingUnmonitoredBars({
  lastCheckedMs,
  nowMs,
  total,
}: {
  lastCheckedMs: number;
  nowMs: number;
  total: number;
}) {
  const windowMs = TRANSIT_AVAILABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const graceMs = TRANSIT_EXPECTED_PROBE_INTERVAL_MINUTES * 60 * 1000;
  const staleMs = Math.max(0, nowMs - lastCheckedMs - graceMs);
  if (staleMs <= 0) return 0;
  return Math.max(0, Math.min(total, Math.ceil((staleMs / windowMs) * total)));
}

function roundedNowMs() {
  const bucketMs = TRANSIT_EXPECTED_PROBE_INTERVAL_MINUTES * 60 * 1000;
  return Math.floor(Date.now() / bucketMs) * bucketMs;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(" ", "T") : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function availabilityAriaLabel(rate: number | null, samples: number, emptyCount: number): string {
  if (rate === null || samples <= 0) return "稳定性样本不足，暂无可用性监测样本";
  const rateText = `稳定性样本比例概览 ${(rate * 100).toFixed(1)}%，样本 ${samples}，非时间顺序`;
  if (emptyCount <= 0) return rateText;
  return `${rateText}，${emptyCount} 段未检测`;
}

function availabilityBarClass(tone: "good" | "warn" | "bad" | "empty"): string {
  if (tone === "good") return "bg-[#45bf78]";
  if (tone === "warn") return "bg-[#d99a2b]";
  if (tone === "bad") return "bg-[#d95745]";
  return "bg-[#e5eaea]";
}

const TRANSIT_AVAILABILITY_WINDOW_DAYS = 7;
const TRANSIT_EXPECTED_PROBE_INTERVAL_MINUTES = 60;
