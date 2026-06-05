#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { extractInAppPurchasePairs, loadFallbackFxSnapshot, parsePriceValue } from "./collect-official-prices.mjs";

const html = `
  <div class="text-pair svelte-1gyt6l2"><span>ChatGPT Plus</span> <span>₺499,99</span></div>
  <div class="text-pair svelte-1gyt6l2"><span>ChatGPT Plus</span> <span>₺8.999,99</span></div>
  <div class="text-pair svelte-1gyt6l2"><span>100 Credits</span> <span>$4.00</span></div>
  <div class="text-pair svelte-1gyt6l2"><span>Claude Pro - Monthly</span> <span>EGP 699.99</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>Claude Max 5x - Monthly</span> <span>₦ 100,000.00</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>Claude Pro - Monthly</span> <span>Rs 4,900.00</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>Claude Pro - Monthly</span> <span>499.000đ</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>Claude Pro - Monthly</span> <span>S/ 69.90</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>ChatGPT Plus</span> <span>￦29,000</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>ChatGPT Plus</span> <span>฿699.00</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>ChatGPT Plus</span> <span>RM99.90</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>ChatGPT Plus</span> <span>Rp 349ribu</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>ChatGPT Pro 20x</span> <span>Rp 3,499juta</span> </div>
  <div class="text-pair svelte-1gyt6l2"><span>Developer</span> <span>OpenAI OpCo, LLC</span></div>
`;

const pairs = extractInAppPurchasePairs(html, "https://apps.apple.com/tr/app/chatgpt/id6448311069");

assert.equal(pairs.length, 13);
assert.deepEqual(
  pairs.map((item) => [item.title, item.priceText]),
  [
    ["ChatGPT Plus", "₺499,99"],
    ["ChatGPT Plus", "₺8.999,99"],
    ["100 Credits", "$4.00"],
    ["Claude Pro - Monthly", "EGP 699.99"],
    ["Claude Max 5x - Monthly", "₦ 100,000.00"],
    ["Claude Pro - Monthly", "Rs 4,900.00"],
    ["Claude Pro - Monthly", "499.000đ"],
    ["Claude Pro - Monthly", "S/ 69.90"],
    ["ChatGPT Plus", "￦29,000"],
    ["ChatGPT Plus", "฿699.00"],
    ["ChatGPT Plus", "RM99.90"],
    ["ChatGPT Plus", "Rp 349ribu"],
    ["ChatGPT Pro 20x", "Rp 3,499juta"],
  ],
);
assert.ok(pairs.every((item) => item.sourceUrl === "https://apps.apple.com/tr/app/chatgpt/id6448311069"));
assert.ok(pairs.every((item) => item.rawSnippetHash.length === 16));
assert.equal(parsePriceValue("￦29,000"), 29000);
assert.equal(parsePriceValue("฿699.00"), 699);
assert.equal(parsePriceValue("RM99.90"), 99.9);
assert.equal(parsePriceValue("Rp 349ribu"), 349000);
assert.equal(parsePriceValue("Rp 3,499juta"), 3499000);

const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-official-fx-"));
const latestPath = path.join(tempDir, "latest.json");

try {
  await writeFile(
    latestPath,
    JSON.stringify({
      generatedAt: "2026-06-05T07:54:53.617Z",
      fx: {
        baseCurrency: "USD",
        source: "Frankfurter",
        date: "2026-06-04",
        rates: {
          USD: 1,
          CNY: 6.7739,
          TRY: 45.974,
          PHP: 61.587,
        },
      },
    }),
    "utf8",
  );

  const fallback = loadFallbackFxSnapshot(["CNY", "TRY", "PHP"], latestPath);
  assert.equal(fallback?.source, "Frankfurter local snapshot");
  assert.equal(fallback?.date, "2026-06-04");
  assert.equal(fallback?.rates.CNY, 6.7739);
  assert.equal(fallback?.fallbackGeneratedAt, "2026-06-05T07:54:53.617Z");
  assert.equal(loadFallbackFxSnapshot(["CNY", "HKD"], latestPath), null);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

console.log("official price parser test passed");
