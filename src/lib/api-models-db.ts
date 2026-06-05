import "server-only";

import {
  staticApiModelDataset,
  type ApiBillingMode,
  type ApiModel,
  type ApiModelDataset,
  type ApiModelOffer,
  type ApiPlan,
  type ApiPriceValue,
  type ApiProvider,
  type ApiProviderType,
} from "@/lib/api-models";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  ApiModelAdminData,
  ApiModelAdminModel,
  ApiModelAdminOffer,
  ApiModelAdminPlan,
  ApiModelAdminProvider,
  ApiModelCollectRun,
} from "@/lib/types";

type DbRow = Record<string, unknown>;

const API_MODEL_CACHE_TTL_MS = 30_000;

let apiModelCache: { expiresAt: number; value: ApiModelDataset } | null = null;
let apiModelPromise: Promise<ApiModelDataset> | null = null;

export function clearApiModelDatasetCache() {
  apiModelCache = null;
  apiModelPromise = null;
}

export async function getApiModelDataset(): Promise<ApiModelDataset> {
  const now = Date.now();
  if (apiModelCache && apiModelCache.expiresAt > now) {
    return apiModelCache.value;
  }

  if (apiModelPromise) return apiModelPromise;

  apiModelPromise = readApiModelDataset()
    .then((value) => {
      apiModelCache = {
        expiresAt: Date.now() + API_MODEL_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      apiModelPromise = null;
    });

  return apiModelPromise;
}

export async function getApiModelAdminData(): Promise<ApiModelAdminData> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return buildStaticApiModelAdminData({
      configured: false,
      tableReady: false,
      message: "Supabase 尚未配置，当前展示 API 模型静态样本。",
    });
  }

  try {
    const [familiesResult, modelsResult, providersResult, plansResult, planModelsResult, offersResult, runsResult] = await Promise.all([
      supabase
        .from("api_model_families")
        .select("id,name,sort_order,updated_at")
        .order("sort_order", { ascending: true }),
      supabase
        .from("api_models")
        .select("id,family_id,display_name,model_id,status,source_url,source_label,data_updated_at,updated_at"),
      supabase
        .from("api_providers")
        .select("id,name,type,billing_mode,official_url,pricing_url,logo_url,enabled,limit_summary,limitations,source_label,data_updated_at,updated_at")
        .order("name", { ascending: true }),
      supabase
        .from("api_plans")
        .select("id,provider_id,name,type,price_label,quota_summary,limit_summary,source_url,source_label,enabled,data_updated_at,updated_at"),
      supabase
        .from("api_plan_models")
        .select("plan_id,model_id"),
      supabase
        .from("api_model_offers")
        .select("id,model_id,provider_id,route_model_id,input_price,output_price,free_or_plan,limit_summary,pricing_url,source_label,status,collected_at,updated_at"),
      supabase
        .from("api_collection_runs")
        .select("id,provider_id,collector_kind,status,model_count,offer_count,error_message,started_at,finished_at")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);

    const error =
      familiesResult.error ||
      modelsResult.error ||
      providersResult.error ||
      plansResult.error ||
      planModelsResult.error ||
      offersResult.error ||
      runsResult.error;
    if (error) throw error;

    const familyRows = dbRows(familiesResult.data);
    const modelRows = dbRows(modelsResult.data);
    const providerRows = dbRows(providersResult.data);
    const planRows = dbRows(plansResult.data);
    const planModelRows = dbRows(planModelsResult.data);
    const offerRows = dbRows(offersResult.data);
    const runRows = dbRows(runsResult.data);

    if (!familyRows.length && !modelRows.length && !providerRows.length) {
      return buildStaticApiModelAdminData({
        configured: true,
        tableReady: true,
        message: "api_* 表已存在，但还没有导入 API 模型静态数据。可先运行 npm run import:api-models -- --dry-run --post 验证，再确认是否写库。",
      });
    }

    const familyNameById = new Map(familyRows.map((row) => [stringValue(row.id), stringValue(row.name)]));
    const modelNameById = new Map(modelRows.map((row) => [stringValue(row.id), stringValue(row.display_name)]));
    const modelFamilyById = new Map(modelRows.map((row) => [stringValue(row.id), familyNameById.get(stringValue(row.family_id)) || stringValue(row.family_id)]));
    const providerNameById = new Map(providerRows.map((row) => [stringValue(row.id), stringValue(row.name)]));
    const providerTypeById = new Map(providerRows.map((row) => [stringValue(row.id), providerType(row.type)]));
    const planModelsByPlanId = new Map<string, string[]>();
    for (const row of planModelRows) {
      const planId = stringValue(row.plan_id);
      const modelId = stringValue(row.model_id);
      if (!planId || !modelId) continue;
      planModelsByPlanId.set(planId, [...(planModelsByPlanId.get(planId) || []), modelId]);
    }

    const offerRowsByModelId = groupRowsBy(offerRows, "model_id");
    const offerRowsByProviderId = groupRowsBy(offerRows, "provider_id");
    const planRowsByProviderId = groupRowsBy(planRows, "provider_id");

    const models = modelRows.map((row): ApiModelAdminModel => {
      const offers = offerRowsByModelId.get(stringValue(row.id)) || [];
      return {
        id: stringValue(row.id),
        family: familyNameById.get(stringValue(row.family_id)) || stringValue(row.family_id),
        displayName: stringValue(row.display_name),
        modelId: stringValue(row.model_id),
        status: apiModelStatus(row.status),
        offerCount: offers.length,
        providerCount: new Set(offers.map((offer) => stringValue(offer.provider_id)).filter(Boolean)).size,
        sourceUrl: stringValue(row.source_url),
        sourceLabel: stringValue(row.source_label) || "公开来源",
        updatedAt: timestampValue(row.data_updated_at || row.updated_at),
      };
    });

    const providers = providerRows
      .map((row): ApiModelAdminProvider | null => {
        const id = stringValue(row.id);
        const type = providerType(row.type);
        const billingMode = billingModeValue(row.billing_mode);
        if (!type || !billingMode) return null;
        const offers = offerRowsByProviderId.get(id) || [];
        return {
          id,
          name: stringValue(row.name),
          type,
          billingMode,
          url: stringValue(row.official_url),
          pricingUrl: nullableString(row.pricing_url),
          logoUrl: nullableString(row.logo_url),
          enabled: booleanValue(row.enabled, true),
          offerCount: offers.length,
          modelCount: new Set(offers.map((offer) => stringValue(offer.model_id)).filter(Boolean)).size,
          planCount: (planRowsByProviderId.get(id) || []).length,
          limitSummary: stringValue(row.limit_summary),
          limitations: stringValue(row.limitations),
          sourceLabel: stringValue(row.source_label) || "公开来源",
          updatedAt: timestampValue(row.data_updated_at || row.updated_at),
        };
      })
      .filter((provider): provider is ApiModelAdminProvider => Boolean(provider));

    const plans = planRows
      .map((row): ApiModelAdminPlan | null => {
        const id = stringValue(row.id);
        const providerId = stringValue(row.provider_id);
        const type = providerType(row.type);
        if (!type) return null;
        return {
          id,
          providerId,
          providerName: providerNameById.get(providerId) || providerId,
          name: stringValue(row.name),
          type,
          priceLabel: stringValue(row.price_label),
          modelCount: (planModelsByPlanId.get(id) || []).length,
          enabled: booleanValue(row.enabled, true),
          quotaSummary: stringValue(row.quota_summary),
          limitSummary: stringValue(row.limit_summary),
          sourceUrl: stringValue(row.source_url),
          sourceLabel: stringValue(row.source_label) || "公开来源",
          updatedAt: timestampValue(row.data_updated_at || row.updated_at),
        };
      })
      .filter((plan): plan is ApiModelAdminPlan => Boolean(plan));

    const offers = offerRows
      .map((row): ApiModelAdminOffer | null => {
        const providerId = stringValue(row.provider_id);
        const providerTypeValue = providerTypeById.get(providerId);
        if (!providerTypeValue) return null;
        const modelId = stringValue(row.model_id);
        return {
          id: stringValue(row.id),
          modelId,
          modelName: modelNameById.get(modelId) || modelId,
          family: modelFamilyById.get(modelId) || "未知模型",
          providerId,
          providerName: providerNameById.get(providerId) || providerId,
          providerType: providerTypeValue,
          routeModelId: nullableString(row.route_model_id),
          inputPrice: priceValue(row.input_price),
          outputPrice: priceValue(row.output_price),
          freeOrPlan: stringValue(row.free_or_plan),
          limitSummary: stringValue(row.limit_summary),
          pricingUrl: nullableString(row.pricing_url),
          sourceLabel: stringValue(row.source_label) || "公开来源",
          status: apiModelStatus(row.status),
          updatedAt: timestampValue(row.collected_at || row.updated_at),
        };
      })
      .filter((offer): offer is ApiModelAdminOffer => Boolean(offer));

    const collectRuns = runRows.map((row): ApiModelCollectRun => {
      const providerId = nullableString(row.provider_id);
      return {
        id: stringValue(row.id),
        providerId,
        providerName: providerId ? providerNameById.get(providerId) || providerId : null,
        collectorKind: nullableString(row.collector_kind),
        status: apiRunStatus(row.status),
        modelCount: numberValue(row.model_count) || 0,
        offerCount: numberValue(row.offer_count) || 0,
        errorMessage: nullableString(row.error_message),
        startedAt: timestampValue(row.started_at),
        finishedAt: nullableString(row.finished_at),
      };
    });

    return {
      configured: true,
      tableReady: true,
      source: "supabase",
      generatedAt: latestDate([
        ...models.map((model) => model.updatedAt),
        ...providers.map((provider) => provider.updatedAt),
        ...plans.map((plan) => plan.updatedAt),
        ...offers.map((offer) => offer.updatedAt),
      ]),
      message: null,
      models,
      providers,
      plans,
      offers,
      collectRuns,
    };
  } catch (error) {
    console.warn("Falling back to static API model admin data because Supabase read failed:", error);
    return buildStaticApiModelAdminData({
      configured: true,
      tableReady: false,
      message: "未能读取 api_* 表，可能还没有应用 API 模型 migration。后台暂时展示静态样本。",
    });
  }
}

async function readApiModelDataset(): Promise<ApiModelDataset> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return staticApiModelDataset;

  try {
    const [familiesResult, modelsResult, providersResult, plansResult, planModelsResult, offersResult] = await Promise.all([
      supabase
        .from("api_model_families")
        .select("id,name,slug,sort_order,updated_at")
        .order("sort_order", { ascending: true }),
      supabase
        .from("api_models")
        .select("id,family_id,display_name,model_id,context_window,description,status,source_url,source_label,capabilities,suitable_tools,data_updated_at,updated_at")
        .eq("status", "active"),
      supabase
        .from("api_providers")
        .select("id,name,type,billing_mode,official_url,pricing_url,logo_url,description,limit_summary,limitations,source_label,enabled,data_updated_at,updated_at")
        .eq("enabled", true),
      supabase
        .from("api_plans")
        .select("id,provider_id,name,type,price_label,price_usd_monthly,quota_summary,reset_summary,limit_summary,limitations,coverage_label,compatibility,suitable_tools,source_url,source_label,enabled,data_updated_at,updated_at")
        .eq("enabled", true),
      supabase
        .from("api_plan_models")
        .select("plan_id,model_id"),
      supabase
        .from("api_model_offers")
        .select("id,model_id,provider_id,route_model_id,input_price,output_price,cache_read_price,cache_write_price,free_or_plan,limit_summary,limitations,compatibility,suitable_tools,pricing_url,source_label,collected_at,status,notes,updated_at")
        .eq("status", "active"),
    ]);

    const error =
      familiesResult.error ||
      modelsResult.error ||
      providersResult.error ||
      plansResult.error ||
      planModelsResult.error ||
      offersResult.error;
    if (error) throw error;

    const familyRows = dbRows(familiesResult.data);
    const modelRows = dbRows(modelsResult.data);
    const providerRows = dbRows(providersResult.data);
    const planRows = dbRows(plansResult.data);
    const planModelRows = dbRows(planModelsResult.data);
    const offerRows = dbRows(offersResult.data);

    if (!familyRows.length || !modelRows.length || !providerRows.length || !offerRows.length) {
      return {
        ...staticApiModelDataset,
        source: "static",
      };
    }

    const familyNameById = new Map(familyRows.map((row) => [stringValue(row.id), stringValue(row.name)]));
    const providerNameById = new Map(providerRows.map((row) => [stringValue(row.id), stringValue(row.name)]));
    const providerBillingModeById = new Map(providerRows.map((row) => [stringValue(row.id), billingModeValue(row.billing_mode)]));
    const planModelsByPlanId = new Map<string, string[]>();
    for (const row of planModelRows) {
      const planId = stringValue(row.plan_id);
      const modelId = stringValue(row.model_id);
      if (!planId || !modelId) continue;
      const current = planModelsByPlanId.get(planId) || [];
      current.push(modelId);
      planModelsByPlanId.set(planId, current);
    }

    const models = modelRows
      .map((row) => mapApiModel(row, familyNameById))
      .filter((model): model is ApiModel => Boolean(model));
    const providers = providerRows
      .map(mapApiProvider)
      .filter((provider): provider is ApiProvider => Boolean(provider));
    const plans = planRows
      .map((row) => mapApiPlan(row, providerNameById, planModelsByPlanId))
      .filter((plan): plan is ApiPlan => Boolean(plan));
    const offers = offerRows
      .map((row) => mapApiOffer(row, providerBillingModeById))
      .filter((offer): offer is ApiModelOffer => Boolean(offer));

    if (!models.length || !providers.length || !offers.length) {
      return {
        ...staticApiModelDataset,
        source: "static",
      };
    }

    return {
      source: "supabase",
      generatedAt: latestDate([
        ...models.map((model) => model.updatedAt),
        ...providers.map((provider) => provider.updatedAt),
        ...plans.map((plan) => plan.updatedAt),
        ...offers.map((offer) => offer.updatedAt),
      ]),
      fxSummary: staticApiModelDataset.fxSummary,
      models,
      providers,
      plans,
      offers,
    };
  } catch (error) {
    console.warn("Falling back to static API model data because Supabase read failed:", error);
    return {
      ...staticApiModelDataset,
      source: "static",
    };
  }
}

function buildStaticApiModelAdminData({
  configured,
  tableReady,
  message,
}: {
  configured: boolean;
  tableReady: boolean;
  message: string | null;
}): ApiModelAdminData {
  const models = staticApiModelDataset.models.map((model): ApiModelAdminModel => {
    const offers = staticApiModelDataset.offers.filter((offer) => offer.modelId === model.id);
    return {
      id: model.id,
      family: model.family,
      displayName: model.displayName,
      modelId: model.modelId,
      status: "active",
      offerCount: offers.length,
      providerCount: new Set(offers.map((offer) => offer.providerId)).size,
      sourceUrl: model.sourceUrl,
      sourceLabel: model.sourceLabel,
      updatedAt: model.updatedAt,
    };
  });

  const providers = staticApiModelDataset.providers.map((provider): ApiModelAdminProvider => {
    const offers = staticApiModelDataset.offers.filter((offer) => offer.providerId === provider.id);
    const plans = staticApiModelDataset.plans.filter((plan) => plan.providerId === provider.id);
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      billingMode: provider.billingMode,
      url: provider.url,
      pricingUrl: provider.pricingUrl || null,
      logoUrl: provider.logoUrl || null,
      enabled: true,
      offerCount: offers.length,
      modelCount: new Set(offers.map((offer) => offer.modelId)).size,
      planCount: plans.length,
      limitSummary: provider.limitSummary,
      limitations: provider.limitations,
      sourceLabel: provider.sourceLabel,
      updatedAt: provider.updatedAt,
    };
  });

  const providerNameById = new Map(staticApiModelDataset.providers.map((provider) => [provider.id, provider.name]));
  const plans = staticApiModelDataset.plans.map((plan): ApiModelAdminPlan => ({
    id: plan.id,
    providerId: plan.providerId,
    providerName: providerNameById.get(plan.providerId) || plan.providerName,
    name: plan.name,
    type: plan.type,
    priceLabel: plan.priceLabel,
    modelCount: plan.modelIds.length,
    enabled: true,
    quotaSummary: plan.quotaSummary,
    limitSummary: plan.limitSummary,
    sourceUrl: plan.url,
    sourceLabel: plan.sourceLabel,
    updatedAt: plan.updatedAt,
  }));

  const modelById = new Map(staticApiModelDataset.models.map((model) => [model.id, model]));
  const providerById = new Map(staticApiModelDataset.providers.map((provider) => [provider.id, provider]));
  const offers = staticApiModelDataset.offers
    .map((offer): ApiModelAdminOffer | null => {
      const model = modelById.get(offer.modelId);
      const provider = providerById.get(offer.providerId);
      if (!model || !provider) return null;
      return {
        id: offer.id,
        modelId: offer.modelId,
        modelName: model.displayName,
        family: model.family,
        providerId: offer.providerId,
        providerName: provider.name,
        providerType: provider.type,
        routeModelId: offer.routeModelId || null,
        inputPrice: offer.inputPrice,
        outputPrice: offer.outputPrice,
        freeOrPlan: offer.freeOrPlan,
        limitSummary: offer.limitSummary,
        pricingUrl: offer.pricingUrl || null,
        sourceLabel: offer.sourceLabel,
        status: "active",
        updatedAt: offer.updatedAt,
      };
    })
    .filter((offer): offer is ApiModelAdminOffer => Boolean(offer));

  return {
    configured,
    tableReady,
    source: "static",
    generatedAt: staticApiModelDataset.generatedAt,
    message,
    models,
    providers,
    plans,
    offers,
    collectRuns: [],
  };
}

function mapApiModel(row: DbRow, familyNameById: Map<string, string>): ApiModel | null {
  const familyId = stringValue(row.family_id);
  const family = familyNameById.get(familyId);
  if (!family) return null;

  return {
    id: stringValue(row.id),
    displayName: stringValue(row.display_name),
    family,
    modelId: stringValue(row.model_id),
    description: stringValue(row.description),
    contextWindow: nullableString(row.context_window) || undefined,
    sourceUrl: stringValue(row.source_url),
    sourceLabel: stringValue(row.source_label) || "公开来源",
    capabilities: stringArray(row.capabilities),
    suitableTools: stringArray(row.suitable_tools),
    updatedAt: timestampValue(row.data_updated_at || row.updated_at),
  };
}

function mapApiProvider(row: DbRow): ApiProvider | null {
  const type = providerType(row.type);
  const billingMode = billingModeValue(row.billing_mode);
  if (!type || !billingMode) return null;

  return {
    id: stringValue(row.id),
    name: stringValue(row.name),
    type,
    billingMode,
    url: stringValue(row.official_url),
    pricingUrl: nullableString(row.pricing_url) || undefined,
    logoUrl: nullableString(row.logo_url) || undefined,
    description: stringValue(row.description),
    limitSummary: stringValue(row.limit_summary),
    limitations: stringValue(row.limitations),
    sourceLabel: stringValue(row.source_label) || "公开来源",
    updatedAt: timestampValue(row.data_updated_at || row.updated_at),
  };
}

function mapApiPlan(row: DbRow, providerNameById: Map<string, string>, planModelsByPlanId: Map<string, string[]>): ApiPlan | null {
  const id = stringValue(row.id);
  const providerId = stringValue(row.provider_id);
  const providerName = providerNameById.get(providerId);
  const type = providerType(row.type);
  if (!providerName || !type) return null;

  return {
    id,
    providerId,
    name: stringValue(row.name),
    providerName,
    type,
    priceLabel: stringValue(row.price_label),
    priceUsdMonthly: numberValue(row.price_usd_monthly) ?? undefined,
    url: stringValue(row.source_url),
    quotaSummary: stringValue(row.quota_summary),
    resetSummary: stringValue(row.reset_summary),
    limitSummary: stringValue(row.limit_summary),
    limitations: stringValue(row.limitations),
    modelIds: planModelsByPlanId.get(id) || [],
    coverageLabel: nullableString(row.coverage_label) || undefined,
    compatibility: stringArray(row.compatibility),
    suitableTools: stringArray(row.suitable_tools),
    sourceLabel: stringValue(row.source_label) || "公开来源",
    updatedAt: timestampValue(row.data_updated_at || row.updated_at),
  };
}

function mapApiOffer(row: DbRow, providerBillingModeById: Map<string, ApiBillingMode | null>): ApiModelOffer | null {
  const providerId = stringValue(row.provider_id);
  const billingMode = providerBillingModeById.get(providerId);
  if (!billingMode) return null;

  return {
    id: stringValue(row.id),
    modelId: stringValue(row.model_id),
    providerId,
    billingMode,
    routeModelId: nullableString(row.route_model_id) || undefined,
    inputPrice: priceValue(row.input_price),
    outputPrice: priceValue(row.output_price),
    cacheReadPrice: optionalPriceValue(row.cache_read_price),
    cacheWritePrice: optionalPriceValue(row.cache_write_price),
    freeOrPlan: stringValue(row.free_or_plan),
    limitSummary: stringValue(row.limit_summary),
    limitations: stringValue(row.limitations),
    compatibility: stringArray(row.compatibility),
    suitableTools: stringArray(row.suitable_tools),
    pricingUrl: nullableString(row.pricing_url) || undefined,
    sourceLabel: stringValue(row.source_label) || "公开来源",
    updatedAt: timestampValue(row.collected_at || row.updated_at),
    notes: nullableString(row.notes) || undefined,
  };
}

function providerType(value: unknown): ApiProviderType | null {
  return value === "official" || value === "router" || value === "free" || value === "subscription" ? value : null;
}

function apiModelStatus(value: unknown): "active" | "inactive" | "needs_review" {
  return value === "inactive" || value === "needs_review" ? value : "active";
}

function apiRunStatus(value: unknown): "success" | "partial" | "failed" {
  if (value === "success" || value === "partial" || value === "failed") return value;
  return "failed";
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function billingModeValue(value: unknown): ApiBillingMode | null {
  return value === "按量计费" || value === "免费/测试" || value === "订阅套餐" || value === "动态路由" ? value : null;
}

function priceValue(value: unknown): ApiPriceValue {
  if (isPriceValue(value)) return value;
  return { kind: "text", text: "待确认" };
}

function optionalPriceValue(value: unknown): ApiPriceValue | undefined {
  return isPriceValue(value) ? value : undefined;
}

function isPriceValue(value: unknown): value is ApiPriceValue {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (row.kind === "text") return typeof row.text === "string";
  if (row.kind !== "numeric") return false;
  return (
    typeof row.usdPerMTokens === "number" ||
    typeof row.cnyPerMTokens === "number" ||
    typeof row.label === "string"
  );
}

function dbRows(value: unknown): DbRow[] {
  return Array.isArray(value) ? value.filter((row): row is DbRow => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const normalized = stringValue(value).trim();
  return normalized ? normalized : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => stringValue(item).trim()).filter(Boolean) : [];
}

function groupRowsBy(rows: DbRow[], key: string): Map<string, DbRow[]> {
  const output = new Map<string, DbRow[]>();
  for (const row of rows) {
    const value = stringValue(row[key]);
    if (!value) continue;
    output.set(value, [...(output.get(value) || []), row]);
  }
  return output;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function timestampValue(value: unknown): string {
  const normalized = nullableString(value);
  if (!normalized) return staticApiModelDataset.generatedAt;
  return normalized;
}

function latestDate(values: string[]) {
  return values.reduce((latest, value) => (value > latest ? value : latest), staticApiModelDataset.generatedAt);
}
