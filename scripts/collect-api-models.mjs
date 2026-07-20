#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultOutPath = path.join(repoRoot, "data", "api-models", "latest.json");
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) PriceAI/1.0";

const DEFAULT_TIMEOUT_MS = 15000;

const collectorKindByProviderId = {
  "alibaba-coding-plan": "alibaba_coding_plan",
  "baidu-qianfan": "baidu_qianfan",
  "ctyun-xirang": "ctyun_xirang",
  "deepseek-official": "deepseek_pricing",
  "byteplus-modelark": "byteplus_modelark",
  "huaweicloud-modelarts-maas": "huaweicloud_maas",
  "jdcloud-joyai": "jdcloud_joybuilder",
  "fireworks-fire-pass": "fireworks_fire_pass",
  "glm-coding-plan": "bigmodel_glm_coding",
  "google-gemini-api": "google_gemini_api",
  "kimi-code": "kimi_code_membership",
  "kimi-official": "kimi_pricing",
  "kling-api": "kling_api",
  "minimax-official": "minimax_pricing",
  "nvidia-nim": "nvidia_nim",
  ollama: "ollama_pricing",
  "openai-official": "openai_pricing",
  "opencode-go": "opencode_go",
  openrouter: "openrouter",
  "qwen-official": "qwen_model_pricing",
  "qwen-token-plan": "qwen_token_plan",
  "stepfun-official": "stepfun_pricing",
  "stepfun-step-plan": "stepfun_step_plan",
  "tencent-hunyuan-coding-plan": "tencent_tokenhub_coding_plan",
  "unicom-yuanjing": "unicom_yuanjing",
  "volcengine-ark-coding-plan": "volcengine_ark_coding_plan",
  "xiaomi-mimo": "xiaomi_mimo_pricing",
  "zhipu-bigmodel": "bigmodel_pricing",
};

if (isCli()) {
  const args = normalizeOptions(parseArgs(process.argv.slice(2)));

  try {
    const result = await collectApiModels(args);
    printSummary(result);

    if (args.dryRun) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const outPath = path.resolve(repoRoot, args.out || defaultOutPath);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      console.log(`Snapshot written to ${path.relative(repoRoot, outPath)}`);
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function collectApiModels(options = {}) {
  options = normalizeOptions(options);

  const dataset = options.dataset || (await loadApiModelModule()).staticApiModelDataset;
  const selectedProviders = selectProviders(dataset.providers, options);
  if (!selectedProviders.length) {
    throw new Error("No API providers matched. Use --all or --provider openrouter.");
  }

  const selectedProviderIds = new Set(selectedProviders.map((provider) => provider.id));
  const offers = dataset.offers.filter((offer) => selectedProviderIds.has(offer.providerId));
  const plans = dataset.plans.filter((plan) => selectedProviderIds.has(plan.providerId));
  const modelIds = new Set([
    ...offers.map((offer) => offer.modelId),
    ...plans.flatMap((plan) => plan.modelIds),
  ]);
  const models = dataset.models.filter((model) => modelIds.has(model.id));
  const generatedAt = new Date().toISOString();

  const providerSnapshots = [];
  for (const provider of selectedProviders) {
    providerSnapshots.push(
      await collectProviderSnapshot({
        dataset,
        provider,
        generatedAt,
        noFetch: options.noFetch,
        timeoutMs: Number(options.timeoutMs || options.timeout || DEFAULT_TIMEOUT_MS),
      }),
    );
  }

  const probes = providerSnapshots.flatMap((provider) => provider.probes);
  const failedProbes = probes.filter((probe) => probe.status === "failed");
  const successfulProviders = providerSnapshots.filter((provider) => provider.status === "success").length;
  const failedProviders = providerSnapshots.filter((provider) => provider.status === "failed").length;

  return {
    generatedAt,
    dryRun: Boolean(options.dryRun),
    source: {
      kind: "static_api_model_dataset_with_source_probe",
      datasetSource: dataset.source,
      datasetGeneratedAt: dataset.generatedAt,
      fx: dataset.fxSummary,
    },
    scope: {
      providers: selectedProviders.map((provider) => provider.id),
      models: models.map((model) => model.id),
      providerCount: selectedProviders.length,
      modelCount: models.length,
      planCount: plans.length,
      offerCount: offers.length,
      urlProbeCount: probes.length,
    },
    providers: providerSnapshots,
    run: {
      status: runStatus(providerSnapshots),
      providerCount: providerSnapshots.length,
      successfulProviderCount: successfulProviders,
      failedProviderCount: failedProviders,
      partialProviderCount: providerSnapshots.length - successfulProviders - failedProviders,
      modelCount: models.length,
      planCount: plans.length,
      offerCount: offers.length,
      urlProbeCount: probes.length,
      okUrlCount: probes.filter((probe) => probe.status === "ok").length,
      skippedUrlCount: probes.filter((probe) => probe.status === "skipped").length,
      failedUrlCount: failedProbes.length,
      firstError: failedProbes[0]?.errorMessage ?? null,
    },
  };
}

async function collectProviderSnapshot({ dataset, provider, generatedAt, noFetch, timeoutMs }) {
  const offers = dataset.offers.filter((offer) => offer.providerId === provider.id);
  const plans = dataset.plans.filter((plan) => plan.providerId === provider.id);
  const modelIds = new Set([
    ...offers.map((offer) => offer.modelId),
    ...plans.flatMap((plan) => plan.modelIds),
  ]);
  const models = dataset.models.filter((model) => modelIds.has(model.id));
  const sourceRefs = buildSourceRefs({ provider, plans, offers, models });
  const probes = [];

  for (const sourceRef of sourceRefs) {
    probes.push(await probeSourceUrl(sourceRef, { noFetch, timeoutMs }));
  }

  return {
    provider: {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      billingMode: provider.billingMode,
      url: provider.url,
      pricingUrl: provider.pricingUrl ?? null,
      logoUrl: provider.logoUrl ?? null,
      collectorKind: collectorKindByProviderId[provider.id] ?? "manual_review",
      sourceLabel: provider.sourceLabel,
      updatedAt: provider.updatedAt,
    },
    status: providerStatus(probes),
    collectedAt: generatedAt,
    modelCount: models.length,
    planCount: plans.length,
    offerCount: offers.length,
    models: models.map((model) => ({
      id: model.id,
      displayName: model.displayName,
      family: model.family,
      modelId: model.modelId,
      sourceUrl: model.sourceUrl,
      updatedAt: model.updatedAt,
    })),
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      priceLabel: plan.priceLabel,
      priceUsdMonthly: plan.priceUsdMonthly ?? null,
      priceCnyMonthly: plan.priceCnyMonthly ?? null,
      quotaSummary: plan.quotaSummary,
      resetSummary: plan.resetSummary,
      limitSummary: plan.limitSummary,
      sourceUrl: plan.url,
      updatedAt: plan.updatedAt,
    })),
    offers: offers.map((offer) => ({
      id: offer.id,
      modelId: offer.modelId,
      routeModelId: offer.routeModelId ?? null,
      billingMode: offer.billingMode,
      inputPrice: offer.inputPrice,
      outputPrice: offer.outputPrice,
      cacheReadPrice: offer.cacheReadPrice ?? null,
      cacheWritePrice: offer.cacheWritePrice ?? null,
      freeOrPlan: offer.freeOrPlan,
      limitSummary: offer.limitSummary,
      pricingUrl: offer.pricingUrl ?? null,
      sourceLabel: offer.sourceLabel,
      updatedAt: offer.updatedAt,
    })),
    probes,
  };
}

function buildSourceRefs({ provider, plans, offers, models }) {
  const refs = [];
  addRef(refs, "provider_url", provider.sourceLabel, provider.url);
  addRef(refs, "pricing_url", provider.sourceLabel, provider.pricingUrl);

  for (const plan of plans) {
    addRef(refs, "plan_url", plan.sourceLabel, plan.url);
  }

  for (const offer of offers) {
    addRef(refs, "offer_pricing_url", offer.sourceLabel, offer.pricingUrl);
  }

  for (const model of models) {
    addRef(refs, "model_source_url", model.sourceLabel, model.sourceUrl);
  }

  const byUrl = new Map();
  for (const ref of refs) {
    const current = byUrl.get(ref.url);
    if (!current) {
      byUrl.set(ref.url, {
        ...ref,
        kinds: [ref.kind],
        labels: [ref.label],
      });
      continue;
    }

    current.kinds = uniqueStrings([...current.kinds, ref.kind]);
    current.labels = uniqueStrings([...current.labels, ref.label]);
  }

  return Array.from(byUrl.values());
}

function addRef(refs, kind, label, url) {
  if (!url) return;
  refs.push({ kind, label: label || "公开来源", url });
}

async function probeSourceUrl(sourceRef, options) {
  if (options.noFetch) {
    return {
      ...sourceRef,
      status: "skipped",
      checkedAt: new Date().toISOString(),
      httpStatus: null,
      finalUrl: sourceRef.url,
      contentType: null,
      title: null,
      contentHash: null,
      errorMessage: "--no-fetch enabled.",
    };
  }

  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(sourceRef.url, options.timeoutMs);
    const contentType = response.headers.get("content-type") || null;
    const text = await limitedText(response, contentType);

    return {
      ...sourceRef,
      status: response.ok ? "ok" : "failed",
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      httpStatus: response.status,
      finalUrl: response.url || sourceRef.url,
      contentType,
      title: extractTitle(text),
      contentHash: text ? hashText(text.slice(0, 10000)) : null,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ...sourceRef,
      status: "failed",
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      httpStatus: httpStatus(error),
      finalUrl: sourceRef.url,
      contentType: null,
      title: null,
      contentHash: null,
      errorMessage: errorMessage(error),
    };
  }
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.5",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "user-agent": userAgent,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function limitedText(response, contentType) {
  if (contentType && !/text|html|json|xml|javascript/i.test(contentType)) return "";
  const text = await response.text();
  return text.slice(0, 200000);
}

function providerStatus(probes) {
  if (!probes.length) return "failed";
  if (probes.every((probe) => probe.status === "skipped")) return "skipped";
  if (probes.every((probe) => probe.status === "ok" || probe.status === "skipped")) return "success";
  if (probes.some((probe) => probe.status === "ok")) return "partial_success";
  return "failed";
}

function runStatus(providers) {
  if (!providers.length) return "failed";
  if (providers.every((provider) => provider.status === "success" || provider.status === "skipped")) return "success";
  if (providers.some((provider) => provider.status === "success" || provider.status === "partial_success")) return "partial_success";
  return "failed";
}

function selectProviders(providers, options) {
  if (options.all) return providers;

  const selected = String(options.provider || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!selected.length) return [];
  const selectedSet = new Set(selected);
  return providers.filter((provider) => selectedSet.has(provider.id));
}

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

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-api-model-collector-"));
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

function parseArgs(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;

    const rawKey = item.slice(2);
    const [key, inlineValue] = rawKey.split("=", 2);
    const next = values[index + 1];

    if (inlineValue !== undefined) {
      result[key] = inlineValue;
    } else if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }

  return result;
}

function normalizeOptions(options) {
  return {
    ...options,
    all: truthyOption(options.all),
    dryRun: truthyOption(options.dryRun ?? options["dry-run"]),
    noFetch: truthyOption(options.noFetch ?? options["no-fetch"]),
    timeoutMs: options.timeoutMs ?? options["timeout-ms"] ?? options.timeout,
  };
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function extractTitle(text) {
  if (!text) return null;
  const match = text.match(/<title[^>]*>(.*?)<\/title>/is);
  if (!match) return null;
  return decodeHtml(match[1].replace(/\s+/g, " ").trim()).slice(0, 160);
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, `"`)
    .replace(/&#39;/g, "'");
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function httpStatus(error) {
  const status = error?.status || error?.cause?.status;
  return Number.isInteger(status) ? status : null;
}

function printSummary(result) {
  console.log(
    [
      "API model collection snapshot.",
      `status=${result.run.status}`,
      `providers=${result.run.providerCount}`,
      `models=${result.run.modelCount}`,
      `plans=${result.run.planCount}`,
      `offers=${result.run.offerCount}`,
      `urls=${result.run.okUrlCount}/${result.run.urlProbeCount}`,
      result.dryRun ? "mode=dry-run" : "mode=write-snapshot",
    ].join(" "),
  );
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
