#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { collectApiModels } from "./collect-api-models.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const data = await loadApiModelModule();
const dataset = data.staticApiModelDataset;
const iconSources = await readFile(path.join(repoRoot, "public", "brand-icons", "SOURCES.md"), "utf8");

assert.ok(dataset.models.length >= 10, "API model dataset should include the first batch of standard models.");
assert.ok(dataset.providers.length >= 8, "API model dataset should include the first batch of providers.");
assert.ok(dataset.offers.length >= 20, "API model dataset should include provider/model offer rows.");

const modelIds = new Set(dataset.models.map((model) => model.id));
const providerIds = new Set(dataset.providers.map((provider) => provider.id));
const planIds = new Set(dataset.plans.map((plan) => plan.id));

const claudeOpus5 = dataset.models.find((model) => model.id === "claude-opus-5");
assert.ok(claudeOpus5, "Claude Opus 5 should be included in the official API model dataset.");
assert.equal(claudeOpus5.modelId, "claude-opus-5", "Claude Opus 5 should use the official Anthropic model id.");
assert.equal(claudeOpus5.updatedAt, "2026-07-24", "Claude Opus 5 should use its official release date.");
assert.equal(
  claudeOpus5.sourceUrl,
  "https://www.anthropic.com/news/claude-opus-5",
  "Claude Opus 5 should link to the Anthropic announcement.",
);

const claudeOpus5Offer = dataset.offers.find((offer) => offer.id === "anthropic-claude-opus-5");
assert.ok(claudeOpus5Offer, "Claude Opus 5 should include an Anthropic official API offer.");
assert.equal(claudeOpus5Offer.routeModelId, "claude-opus-5", "Claude Opus 5 offer should use the official route id.");
assert.deepEqual(
  {
    input: claudeOpus5Offer.inputPrice,
    output: claudeOpus5Offer.outputPrice,
    cacheWrite: claudeOpus5Offer.cacheWritePrice,
    cacheRead: claudeOpus5Offer.cacheReadPrice,
  },
  {
    input: { kind: "numeric", usdPerMTokens: 5 },
    output: { kind: "numeric", usdPerMTokens: 25 },
    cacheWrite: { kind: "numeric", usdPerMTokens: 6.25 },
    cacheRead: { kind: "numeric", usdPerMTokens: 0.5 },
  },
  "Claude Opus 5 official prices should match Anthropic pricing.",
);

for (const model of dataset.models) {
  assert.ok(model.id, "Model id is required.");
  assert.ok(model.displayName, `${model.id} displayName is required.`);
  assert.ok(model.family, `${model.id} family is required.`);
  assertValidUrl(model.sourceUrl, `${model.id} sourceUrl`);
  assert.ok(model.sourceLabel, `${model.id} sourceLabel is required.`);
  assert.ok(model.updatedAt, `${model.id} updatedAt is required.`);
}

for (const provider of dataset.providers) {
  assert.ok(provider.id, "Provider id is required.");
  assert.ok(provider.name, `${provider.id} name is required.`);
  assertValidUrl(provider.url, `${provider.id} url`);
  if (provider.pricingUrl) assertValidUrl(provider.pricingUrl, `${provider.id} pricingUrl`);
  assert.ok(provider.sourceLabel, `${provider.id} sourceLabel is required.`);
  assert.ok(provider.limitSummary, `${provider.id} limitSummary is required.`);
  assert.ok(provider.limitations, `${provider.id} limitations is required.`);
  assert.ok(provider.logoUrl, `${provider.id} logoUrl is required.`);

  const iconFile = provider.logoUrl.replace(/^\/brand-icons\//, "");
  assert.notEqual(iconFile, provider.logoUrl, `${provider.id} logoUrl must point to /brand-icons/.`);
  assert.ok(existsSync(path.join(repoRoot, "public", "brand-icons", iconFile)), `${provider.id} logo file is missing: ${iconFile}`);
  assert.ok(iconSources.includes(`\`${iconFile}\``), `${provider.id} logo source is missing in public/brand-icons/SOURCES.md.`);
}

for (const plan of dataset.plans) {
  assert.ok(providerIds.has(plan.providerId), `${plan.id} references unknown provider ${plan.providerId}.`);
  assertValidUrl(plan.url, `${plan.id} url`);
  assert.ok(plan.priceLabel, `${plan.id} priceLabel is required.`);
  assert.ok(plan.quotaSummary, `${plan.id} quotaSummary is required.`);
  assert.ok(plan.resetSummary, `${plan.id} resetSummary is required.`);
  assert.ok(plan.limitSummary, `${plan.id} limitSummary is required.`);
  assert.ok(plan.limitations, `${plan.id} limitations is required.`);
  assert.ok(plan.sourceLabel, `${plan.id} sourceLabel is required.`);
  for (const modelId of plan.modelIds) {
    assert.ok(modelIds.has(modelId), `${plan.id} references unknown model ${modelId}.`);
  }
}

for (const offer of dataset.offers) {
  assert.ok(modelIds.has(offer.modelId), `${offer.id} references unknown model ${offer.modelId}.`);
  assert.ok(providerIds.has(offer.providerId), `${offer.id} references unknown provider ${offer.providerId}.`);
  if (offer.planId) assert.ok(planIds.has(offer.planId), `${offer.id} references unknown plan ${offer.planId}.`);
  assert.ok(offer.inputPrice?.kind, `${offer.id} inputPrice is required.`);
  assert.ok(offer.outputPrice?.kind, `${offer.id} outputPrice is required.`);
  assert.ok(offer.freeOrPlan, `${offer.id} freeOrPlan is required.`);
  assert.ok(offer.limitSummary, `${offer.id} limitSummary is required.`);
  assert.ok(offer.limitations, `${offer.id} limitations is required.`);
  assert.ok(offer.sourceLabel, `${offer.id} sourceLabel is required.`);
}

const collectionSnapshot = await collectApiModels({ all: true, dryRun: true, noFetch: true });
assert.equal(collectionSnapshot.dryRun, true, "API model collector should support dry-run mode.");
assert.equal(collectionSnapshot.run.status, "success", "No-fetch API model collection should produce a valid snapshot.");
assert.equal(collectionSnapshot.run.providerCount, dataset.providers.length, "Collector provider count should match static dataset.");
assert.equal(collectionSnapshot.run.modelCount, dataset.models.length, "Collector model count should match static dataset.");
assert.equal(collectionSnapshot.run.offerCount, dataset.offers.length, "Collector offer count should match static dataset.");
assert.ok(collectionSnapshot.run.urlProbeCount >= dataset.providers.length, "Collector should include source URL probes.");

for (const providerSnapshot of collectionSnapshot.providers) {
  assert.ok(providerIds.has(providerSnapshot.provider.id), `Collector returned unknown provider ${providerSnapshot.provider.id}.`);
  assert.ok(providerSnapshot.provider.collectorKind, `${providerSnapshot.provider.id} collectorKind is required.`);
  assert.ok(providerSnapshot.probes.length > 0, `${providerSnapshot.provider.id} should include source probes.`);
  for (const probe of providerSnapshot.probes) {
    assert.equal(probe.status, "skipped", `${providerSnapshot.provider.id} no-fetch probe should be skipped.`);
    assertValidUrl(probe.url, `${providerSnapshot.provider.id} probe url`);
  }
}

console.log(
  [
    "api model dataset test passed",
    `models=${dataset.models.length}`,
    `providers=${dataset.providers.length}`,
    `plans=${dataset.plans.length}`,
    `offers=${dataset.offers.length}`,
  ].join(" "),
);

async function loadApiModelModule() {
  const sourcePath = path.join(repoRoot, "src", "lib", "api-models.ts");
  const source = await readFile(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
      esModuleInterop: true,
    },
  }).outputText;

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-api-models-test-"));
  const tempFile = path.join(tempDir, "api-models.mjs");
  await writeFile(tempFile, output, "utf8");

  try {
    return await import(`${pathToFileURL(tempFile).href}?ts=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function mkdtemp(prefix) {
  const { mkdtemp: makeTempDir } = await import("node:fs/promises");
  return makeTempDir(prefix);
}

function assertValidUrl(value, label) {
  assert.ok(value, `${label} is required.`);
  assert.doesNotThrow(() => new URL(value), `${label} must be a valid URL.`);
}
