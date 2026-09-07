#!/usr/bin/env node

import assert from "node:assert/strict";
import { resolveOfficialPriceCollectionMode } from "./resolve-official-price-collection-mode.mjs";

const scheduledModeAt = (date) => resolveOfficialPriceCollectionMode({
  eventName: "schedule",
  now: new Date(`${date}T18:10:00.000Z`),
});

assert.equal(scheduledModeAt("2026-07-24"), "fx_only");
assert.equal(scheduledModeAt("2026-07-26"), "fx_only");
assert.equal(scheduledModeAt("2026-07-27"), "weekly_full");
assert.equal(scheduledModeAt("2026-07-28"), "fx_only");
assert.equal(scheduledModeAt("2026-07-30"), "weekly_full");
assert.equal(scheduledModeAt("2026-08-02"), "weekly_full");
assert.equal(
  resolveOfficialPriceCollectionMode({ eventName: "workflow_dispatch", requestedMode: "weekly_full" }),
  "weekly_full",
);
assert.equal(
  resolveOfficialPriceCollectionMode({ eventName: "workflow_dispatch", requestedMode: "fx_only" }),
  "fx_only",
);

console.log("official price schedule test passed");
