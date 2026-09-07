export const OUT_OF_STOCK_MIN_DAILY_CONFIRMATIONS = 3;
export const OUT_OF_STOCK_PRIORITY_INITIAL_MINUTES = 60;
export const OUT_OF_STOCK_STANDARD_INITIAL_MINUTES = 3 * 60;
export const OUT_OF_STOCK_PRIORITY_DAY_TWO_MINUTES = 3 * 60;
export const OUT_OF_STOCK_STANDARD_DAY_TWO_MINUTES = 6 * 60;
export const DAILY_PROBE_INTERVAL_MINUTES = 24 * 60;
export const WEEKLY_PROBE_INTERVAL_MINUTES = 7 * DAILY_PROBE_INTERVAL_MINUTES;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * ONE_DAY_MS;
const FOURTEEN_DAYS_MS = 14 * ONE_DAY_MS;

export function hasSellableOffers(offers) {
  return Array.isArray(offers) && offers.some((offer) => {
    const status = offer?.status;
    const stockCount = offer?.stockCount ?? offer?.stock_count;
    const effectiveStatus = offer?.effectiveStatus ?? offer?.effective_status;
    if (status === "out_of_stock" || stockCount === 0) return false;
    return effectiveStatus !== "unavailable" && effectiveStatus !== "stale" && effectiveStatus !== "failed";
  });
}

export function outOfStockObservationSchedule(source, now = Date.now()) {
  const availabilityStatus = String(source?.availabilityStatus ?? source?.availability_status ?? "unknown");
  if (availabilityStatus !== "out_of_stock") return null;

  const outOfStockSince = source?.outOfStockSince ?? source?.out_of_stock_since;
  const sinceMs = timestampMs(outOfStockSince);
  const nowMs = timestampMs(now);
  const ageMs = Number.isFinite(sinceMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - sinceMs) : 0;
  const confirmations = Math.max(0, Number(
    source?.consecutiveOutOfStockSnapshots ?? source?.consecutive_out_of_stock_snapshots ?? 0,
  ) || 0);
  const priority = String(source?.collectionGroup ?? source?.collection_group ?? "automatic") === "vip_15m";
  const confirmedLongTerm = confirmations >= OUT_OF_STOCK_MIN_DAILY_CONFIRMATIONS;

  if (confirmedLongTerm && ageMs >= FOURTEEN_DAYS_MS) {
    return priority
      ? schedule("daily_probe", DAILY_PROBE_INTERVAL_MINUTES, "VIP 来源持续缺货，保留每日补货复检")
      : schedule("weekly_probe", WEEKLY_PROBE_INTERVAL_MINUTES, "普通来源持续缺货 14 天，降为每周补货复检");
  }
  if (confirmedLongTerm && ageMs >= THREE_DAYS_MS) {
    return schedule("daily_probe", DAILY_PROBE_INTERVAL_MINUTES, "连续缺货达到 72 小时，降为每日补货复检");
  }
  if (ageMs >= ONE_DAY_MS) {
    return priority
      ? schedule("out_of_stock_watch_3h", OUT_OF_STOCK_PRIORITY_DAY_TWO_MINUTES, "VIP 来源缺货超过 24 小时，按 3 小时观察补货")
      : schedule("out_of_stock_watch_6h", OUT_OF_STOCK_STANDARD_DAY_TWO_MINUTES, "普通来源缺货超过 24 小时，按 6 小时观察补货");
  }
  return priority
    ? schedule("out_of_stock_watch_1h", OUT_OF_STOCK_PRIORITY_INITIAL_MINUTES, "VIP 来源刚确认缺货，按 1 小时观察补货")
    : schedule("out_of_stock_watch_3h", OUT_OF_STOCK_STANDARD_INITIAL_MINUTES, "普通来源刚确认缺货，按 3 小时观察补货");
}

export function nextSourceAvailabilityObservation(source, checkedAt, hasSellableOffers) {
  if (hasSellableOffers) {
    return {
      availability_status: "available",
      out_of_stock_since: null,
      consecutive_out_of_stock_snapshots: 0,
    };
  }
  return {
    availability_status: "out_of_stock",
    out_of_stock_since: source?.outOfStockSince ?? source?.out_of_stock_since ?? checkedAt,
    consecutive_out_of_stock_snapshots: Math.max(0, Number(
      source?.consecutiveOutOfStockSnapshots ?? source?.consecutive_out_of_stock_snapshots ?? 0,
    ) || 0) + 1,
  };
}

export function legacyFailureObservationInterval(lastError, consecutiveFailures) {
  if (Number(consecutiveFailures || 0) < OUT_OF_STOCK_MIN_DAILY_CONFIRMATIONS) return null;
  if (isConfirmedEmptyShopMessage(lastError)) return DAILY_PROBE_INTERVAL_MINUTES;
  if (isRecoverableCollectionFailure(lastError)) return null;
  return WEEKLY_PROBE_INTERVAL_MINUTES;
}

export function isConfirmedEmptyShopMessage(value) {
  return /(?:店铺接口正常[^。\n]*(?:完整)?商品快照为空|店铺正常[^。\n]*(?:没有商品|无商品|商品为空)|shop (?:api )?(?:reachable|healthy)[^\n]*(?:0 goods|empty (?:goods )?snapshot)|goods_count\s*[=:]\s*0)/i.test(String(value || ""));
}

export function isRecoverableCollectionFailure(value) {
  const text = String(value || "");
  if (/^\s*采集结果为空[。.]*\s*$/i.test(text)) return true;
  return /no offers|found no offers|empty result|无商品|空结果|verification|challenge|captcha|验证码|风控|waf|http 403|status 403|\b403\b|forbidden|access denied|acw_tc|cdn_sec_tc|安全|拦截|timeout|timed out|fetch failed|network|econn|socket|http 5\d{2}|status 5\d{2}|\b50[234]\b|cancelled|canceled|request was cancelled/i.test(text);
}

function schedule(tier, intervalMinutes, reason) {
  return { tier, intervalMinutes, reason };
}

function timestampMs(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (!value) return NaN;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}
