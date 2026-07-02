#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const collectorKindByProviderId = {
  "alibaba-coding-plan": "alibaba_coding_plan",
  "baidu-qianfan": "baidu_qianfan",
  "ctyun-xirang": "ctyun_xirang",
  "deepseek-official": "deepseek_pricing",
  "byteplus-modelark": "byteplus_modelark",
  "fireworks-fire-pass": "fireworks_fire_pass",
  "glm-coding-plan": "bigmodel_glm_coding",
  "google-gemini-api": "google_gemini_api",
  "huaweicloud-modelarts-maas": "huaweicloud_maas",
  "jdcloud-joyai": "jdcloud_joybuilder",
  "kimi-code": "kimi_code_membership",
  "kimi-official": "kimi_pricing",
  "kling-api": "kling_api",
  "minimax-official": "minimax_pricing",
  "nvidia-nim": "nvidia_nim",
  ollama: "ollama_pricing",
  "openai-official": "openai_pricing",
  "opencode-go": "opencode_go",
  "opencode-zen": "opencode_zen",
  openrouter: "openrouter",
  "modelscope-api-inference": "modelscope_api_inference",
  "qwen-official": "qwen_model_pricing",
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
    const result = await importApiModelDataset(args);
    printSummary(result);
    if (args.dryRun) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function importApiModelDataset(options = {}) {
  options = normalizeOptions(options);

  const data = await loadApiModelModule();
  const dataset = data.staticApiModelDataset;
  const families = buildFamilyRows(data);
  const rows = {
    families,
    models: dataset.models.map((model) => ({
      id: model.id,
      family_id: data.apiModelFamilyId(model.family),
      display_name: model.displayName,
      model_id: model.modelId,
      aliases: [],
      context_window: model.contextWindow ?? null,
      description: model.description,
      status: "active",
      source_url: requiredText(model.sourceUrl, `${model.id}.sourceUrl`),
      source_label: model.sourceLabel || "公开来源",
      capabilities: model.capabilities,
      suitable_tools: model.suitableTools,
      data_updated_at: toTimestamp(model.updatedAt),
    })),
    providers: dataset.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      slug: slugify(provider.id),
      type: provider.type,
      billing_mode: provider.billingMode,
      official_url: requiredText(provider.url, `${provider.id}.url`),
      pricing_url: provider.pricingUrl ?? null,
      logo_url: provider.logoUrl ?? null,
      description: provider.description,
      limit_summary: provider.limitSummary,
      limitations: provider.limitations,
      source_label: provider.sourceLabel,
      collector_kind: collectorKindByProviderId[provider.id] ?? "manual_review",
      enabled: true,
      data_updated_at: toTimestamp(provider.updatedAt),
    })),
    plans: dataset.plans.map((plan) => ({
      id: plan.id,
      provider_id: plan.providerId,
      name: plan.name,
      type: plan.type,
      price_label: plan.priceLabel,
      price_usd_monthly: plan.priceUsdMonthly ?? null,
      price_cny_monthly: plan.priceCnyMonthly ?? null,
      quota_summary: plan.quotaSummary,
      reset_summary: plan.resetSummary,
      limit_summary: plan.limitSummary,
      limitations: plan.limitations,
      coverage_label: plan.coverageLabel ?? null,
      compatibility: plan.compatibility,
      suitable_tools: plan.suitableTools,
      source_url: requiredText(plan.url, `${plan.id}.url`),
      source_label: plan.sourceLabel,
      enabled: true,
      data_updated_at: toTimestamp(plan.updatedAt),
    })),
    planModels: dataset.plans.flatMap((plan) => plan.modelIds.map((modelId) => ({
      plan_id: plan.id,
      model_id: modelId,
    }))),
    offers: dataset.offers.map((offer) => ({
      id: offer.id,
      model_id: offer.modelId,
      provider_id: offer.providerId,
      plan_id: inferPlanId(offer, dataset.plans),
      route_model_id: offer.routeModelId ?? null,
      input_price: offer.inputPrice,
      output_price: offer.outputPrice,
      cache_read_price: offer.cacheReadPrice ?? null,
      cache_write_price: offer.cacheWritePrice ?? null,
      free_or_plan: offer.freeOrPlan,
      limit_summary: offer.limitSummary,
      limitations: offer.limitations,
      compatibility: offer.compatibility,
      suitable_tools: offer.suitableTools,
      pricing_url: offer.pricingUrl ?? null,
      source_label: offer.sourceLabel,
      collected_at: toTimestamp(offer.updatedAt),
      status: "active",
      notes: offer.notes ?? null,
    })),
  };

  const result = {
    dryRun: Boolean(options.dryRun),
    post: Boolean(options.post || options.db),
    source: "static_api_models",
    generatedAt: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, value.length])),
    sample: {
      family: rows.families[0] ?? null,
      model: rows.models[0] ?? null,
      provider: rows.providers[0] ?? null,
      plan: rows.plans[0] ?? null,
      offer: rows.offers[0] ?? null,
    },
  };

  if (options.post || options.db) {
    result.database = await postApiModelRows(rows, options);
  }

  return result;
}

async function postApiModelRows(rows, options) {
  const plan = {
    dryRun: Boolean(options.dryRun),
    families: rows.families.length,
    models: rows.models.length,
    providers: rows.providers.length,
    plans: rows.plans.length,
    planModels: rows.planModels.length,
    offers: rows.offers.length,
  };

  if (options.dryRun) {
    return {
      ...plan,
      skipped: true,
      message: "--dry-run --post 只验证将要写入的 API 模型数据，不连接 Supabase。",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for --post/--db.");
  }

  await upsertRows(supabase, "api_model_families", rows.families, { onConflict: "id" });
  await upsertRows(supabase, "api_models", rows.models, { onConflict: "id" });
  await upsertRows(supabase, "api_providers", rows.providers, { onConflict: "id" });
  await upsertRows(supabase, "api_plans", rows.plans, { onConflict: "id" });
  await upsertRows(supabase, "api_plan_models", rows.planModels, { onConflict: "plan_id,model_id" });
  await upsertRows(supabase, "api_model_offers", rows.offers, { onConflict: "id" });

  return {
    ...plan,
    skipped: false,
    message: "API 模型静态数据已写入 Supabase。",
  };
}

function buildFamilyRows(data) {
  const options = data.getApiModelFamilyOptions(data.staticApiModelDataset);
  return options.map((option, index) => {
    const firstModel = data.staticApiModelDataset.models.find((model) => data.apiModelFamilyId(model.family) === option.id);
    return {
      id: option.id,
      name: option.label,
      slug: option.id,
      logo_url: null,
      official_url: firstModel?.sourceUrl ?? null,
      sort_order: index * 10,
    };
  });
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

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "priceai-api-models-"));
  const tempFile = path.join(tempDir, "api-models.mjs");
  await writeFile(tempFile, output, "utf8");

  try {
    return await import(`${pathToFileURL(tempFile).href}?ts=${Date.now()}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function inferPlanId(offer, plans) {
  const matchingPlans = plans.filter((plan) => plan.providerId === offer.providerId && plan.modelIds.includes(offer.modelId));
  return matchingPlans.length === 1 ? matchingPlans[0].id : null;
}

async function upsertRows(supabase, table, rows, options = {}) {
  for (const chunk of chunks(rows, 500)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).upsert(chunk, options);
    if (error) {
      error.table = table;
      throw error;
    }
  }
}

function getSupabaseClient() {
  const env = readEnvFile(path.join(repoRoot, ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T00:00:00.000Z`;
  return text;
}

function requiredText(value, fieldName) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`Missing required API model import field: ${fieldName}`);
  return text;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function chunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function readEnvFile(filePath) {
  const output = {};
  if (!existsSync(filePath)) return output;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    output[match[1]] = unquote(match[2].trim());
  }

  return output;
}

function unquote(value) {
  const quote = value[0];
  if ((quote === `"` || quote === `'`) && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }

  return value;
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
    dryRun: truthyOption(options.dryRun ?? options["dry-run"]),
    post: truthyOption(options.post),
    db: truthyOption(options.db),
  };
}

function truthyOption(value) {
  return value === true || value === "true" || value === "1" || value === "";
}

function printSummary(result) {
  console.log(
    [
      "API model import plan.",
      `families=${result.counts.families}`,
      `models=${result.counts.models}`,
      `providers=${result.counts.providers}`,
      `plans=${result.counts.plans}`,
      `planModels=${result.counts.planModels}`,
      `offers=${result.counts.offers}`,
      result.database ? `database=${result.database.skipped ? "dry-run" : "posted"}` : "database=not-requested",
    ].join(" "),
  );
}

function isCli() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") return JSON.stringify(error, null, 2);
  return String(error);
}
