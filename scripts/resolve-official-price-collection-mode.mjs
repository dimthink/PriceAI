#!/usr/bin/env node

const FULL_REFRESH_INTERVAL_DAYS = 3;
const FULL_REFRESH_ANCHOR_DATE = "2026-07-27";
const VALID_MANUAL_MODES = new Set(["fx_only", "weekly_full"]);

export function resolveOfficialPriceCollectionMode({
  eventName,
  requestedMode,
  now = new Date(),
} = {}) {
  if (eventName !== "schedule") {
    return VALID_MANUAL_MODES.has(requestedMode) ? requestedMode : "fx_only";
  }

  const currentDay = utcDayNumber(now);
  const anchorDay = utcDayNumber(new Date(`${FULL_REFRESH_ANCHOR_DATE}T00:00:00.000Z`));
  const daysSinceAnchor = currentDay - anchorDay;
  if (daysSinceAnchor < 0) return "fx_only";

  const isFullRefreshDay = ((daysSinceAnchor % FULL_REFRESH_INTERVAL_DAYS) + FULL_REFRESH_INTERVAL_DAYS)
    % FULL_REFRESH_INTERVAL_DAYS === 0;

  return isFullRefreshDay ? "weekly_full" : "fx_only";
}

function utcDayNumber(value) {
  const timestamp = value instanceof Date ? value.getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) throw new Error("A valid collection date is required.");
  return Math.floor(timestamp / 86_400_000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , eventName = "", requestedMode = ""] = process.argv;
  console.log(resolveOfficialPriceCollectionMode({ eventName, requestedMode }));
}
