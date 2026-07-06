import "server-only";

import {
  apiProviderCandidates,
  getPublicApiModelDataset,
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
  ApiProviderCandidate as ApiProviderAdminCandidate,
  ApiProviderSubmission,
  ApiProviderSubmissionParseStatus,
  ApiProviderSubmissionStatus,
} from "@/lib/types";
import { stableId } from "@/lib/utils";

type DbRow = Record<string, unknown>;

type ApiProviderMatchCandidate = {
  id: string;
  name: string;
  type: ApiProviderType;
  url: string;
  pricingUrl: string | null;
  persisted: boolean;
};

const API_MODEL_CACHE_TTL_MS = 30_000;
const PUBLIC_API_MODEL_READ_TIMEOUT_MS = 2_500;
const PUBLIC_API_MODEL_BUILD_READ_TIMEOUT_MS = 15_000;
const NEXT_PRODUCTION_BUILD_PHASE = "phase-production-build";

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
    const [familiesResult, modelsResult, providersResult, plansResult, planModelsResult, offersResult, runsResult, submissionsResult] = await Promise.all([
      supabase
        .from("api_model_families")
        .select("id,name,sort_order,updated_at")
        .order("sort_order", { ascending: true }),
      supabase
        .from("api_models")
        .select("id,family_id,display_name,model_id,context_window,description,status,source_url,source_label,capabilities,suitable_tools,data_updated_at,updated_at"),
      supabase
        .from("api_providers")
        .select("id,name,type,billing_mode,official_url,pricing_url,logo_url,enabled,description,limit_summary,limitations,source_label,data_updated_at,updated_at")
        .order("name", { ascending: true }),
      supabase
        .from("api_plans")
        .select("id,provider_id,name,type,price_label,price_usd_monthly,price_cny_monthly,quota_summary,reset_summary,limit_summary,limitations,coverage_label,compatibility,suitable_tools,source_url,source_label,enabled,data_updated_at,updated_at"),
      supabase
        .from("api_plan_models")
        .select("plan_id,model_id"),
      supabase
        .from("api_model_offers")
        .select("id,model_id,provider_id,route_model_id,input_price,output_price,cache_read_price,cache_write_price,free_or_plan,limit_summary,limitations,compatibility,suitable_tools,pricing_url,source_label,status,notes,collected_at,updated_at"),
      supabase
        .from("api_collection_runs")
        .select("id,provider_id,collector_kind,status,model_count,offer_count,error_message,started_at,finished_at")
        .order("started_at", { ascending: false })
        .limit(20),
      supabase
        .from("api_provider_submissions")
        .select("id,submitted_url,submitted_name,submitted_contact,submitted_note,parsed_provider_url,parsed_provider_name,parsed_type,parse_status,probe_status,review_status,admin_note,provider_id,parsed_meta,submitter_ip,created_at,updated_at")
        .in("review_status", ["pending", "collector_todo"])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const error =
      familiesResult.error ||
      modelsResult.error ||
      providersResult.error ||
      plansResult.error ||
      planModelsResult.error ||
      offersResult.error ||
      runsResult.error ||
      submissionsResult.error;
    if (error) throw error;

    const familyRows = dbRows(familiesResult.data);
    const modelRows = dbRows(modelsResult.data);
    const providerRows = dbRows(providersResult.data);
    const planRows = dbRows(plansResult.data);
    const planModelRows = dbRows(planModelsResult.data);
    const offerRows = dbRows(offersResult.data);
    const runRows = dbRows(runsResult.data);
    const submissionRows = dbRows(submissionsResult.data);

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
        contextWindow: nullableString(row.context_window),
        description: stringValue(row.description),
        status: apiModelStatus(row.status),
        offerCount: offers.length,
        providerCount: new Set(offers.map((offer) => stringValue(offer.provider_id)).filter(Boolean)).size,
        sourceUrl: stringValue(row.source_url),
        sourceLabel: stringValue(row.source_label) || "公开来源",
        capabilities: stringArray(row.capabilities),
        suitableTools: stringArray(row.suitable_tools),
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
          description: stringValue(row.description),
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
          priceUsdMonthly: numberValue(row.price_usd_monthly),
          priceCnyMonthly: numberValue(row.price_cny_monthly),
          modelIds: planModelsByPlanId.get(id) || [],
          modelCount: (planModelsByPlanId.get(id) || []).length,
          enabled: booleanValue(row.enabled, true),
          quotaSummary: stringValue(row.quota_summary),
          resetSummary: stringValue(row.reset_summary),
          limitSummary: stringValue(row.limit_summary),
          limitations: stringValue(row.limitations),
          coverageLabel: nullableString(row.coverage_label),
          compatibility: stringArray(row.compatibility),
          suitableTools: stringArray(row.suitable_tools),
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
          cacheReadPrice: optionalPriceValue(row.cache_read_price) || null,
          cacheWritePrice: optionalPriceValue(row.cache_write_price) || null,
          freeOrPlan: stringValue(row.free_or_plan),
          limitSummary: stringValue(row.limit_summary),
          limitations: stringValue(row.limitations),
          compatibility: stringArray(row.compatibility),
          suitableTools: stringArray(row.suitable_tools),
          pricingUrl: nullableString(row.pricing_url),
          sourceLabel: stringValue(row.source_label) || "公开来源",
          status: apiModelStatus(row.status),
          notes: nullableString(row.notes),
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
    const providerSubmissions = submissionRows.map(mapApiProviderSubmission);

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
      providerCandidates: buildApiProviderCandidates(),
      providerSubmissions,
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
  if (!supabase) return getPublicApiModelDataset(staticApiModelDataset);

  try {
    const signal = publicApiModelReadSignal();
    const [familiesResult, modelsResult, providersResult, plansResult, planModelsResult, offersResult] = await Promise.all([
      supabase
        .from("api_model_families")
        .select("id,name,slug,sort_order,updated_at")
        .order("sort_order", { ascending: true })
        .abortSignal(signal),
      supabase
        .from("api_models")
        .select("id,family_id,display_name,model_id,context_window,description,status,source_url,source_label,capabilities,suitable_tools,data_updated_at,updated_at")
        .eq("status", "active")
        .abortSignal(signal),
      supabase
        .from("api_providers")
        .select("id,name,type,billing_mode,official_url,pricing_url,logo_url,description,limit_summary,limitations,source_label,enabled,data_updated_at,updated_at")
        .eq("enabled", true)
        .abortSignal(signal),
      supabase
        .from("api_plans")
        .select("id,provider_id,name,type,price_label,price_usd_monthly,price_cny_monthly,quota_summary,reset_summary,limit_summary,limitations,coverage_label,compatibility,suitable_tools,source_url,source_label,enabled,data_updated_at,updated_at")
        .eq("enabled", true)
        .abortSignal(signal),
      supabase
        .from("api_plan_models")
        .select("plan_id,model_id")
        .abortSignal(signal),
      supabase
        .from("api_model_offers")
        .select("id,model_id,provider_id,route_model_id,input_price,output_price,cache_read_price,cache_write_price,free_or_plan,limit_summary,limitations,compatibility,suitable_tools,pricing_url,source_label,collected_at,status,notes,updated_at")
        .eq("status", "active")
        .abortSignal(signal),
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
      return getPublicApiModelDataset({
        ...staticApiModelDataset,
        source: "static",
      });
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
      return getPublicApiModelDataset({
        ...staticApiModelDataset,
        source: "static",
      });
    }

    return getPublicApiModelDataset(mergeStaticApiModelDataset({
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
    }));
  } catch (error) {
    console.warn("Falling back to static API model data because Supabase read failed:", error);
    return getPublicApiModelDataset({
      ...staticApiModelDataset,
      source: "static",
    });
  }
}

function mergeStaticApiModelDataset(dataset: ApiModelDataset): ApiModelDataset {
  return {
    ...dataset,
    generatedAt: latestDate([dataset.generatedAt, staticApiModelDataset.generatedAt]),
    models: mergeById(dataset.models, staticApiModelDataset.models),
    providers: mergeById(dataset.providers, staticApiModelDataset.providers),
    plans: mergeById(dataset.plans, staticApiModelDataset.plans),
    offers: mergeById(dataset.offers, staticApiModelDataset.offers),
  };
}

function mergeById<T extends { id: string }>(primary: T[], fallback: T[]): T[] {
  const seen = new Set(primary.map((item) => item.id));
  return [...primary, ...fallback.filter((item) => !seen.has(item.id))];
}

function publicApiModelReadSignal(): AbortSignal {
  return AbortSignal.timeout(publicApiModelReadTimeoutMs());
}

function publicApiModelReadTimeoutMs(): number {
  return process.env.NEXT_PHASE === NEXT_PRODUCTION_BUILD_PHASE
    ? PUBLIC_API_MODEL_BUILD_READ_TIMEOUT_MS
    : PUBLIC_API_MODEL_READ_TIMEOUT_MS;
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
      contextWindow: model.contextWindow || null,
      description: model.description,
      status: "active",
      offerCount: offers.length,
      providerCount: new Set(offers.map((offer) => offer.providerId)).size,
      sourceUrl: model.sourceUrl,
      sourceLabel: model.sourceLabel,
      capabilities: model.capabilities,
      suitableTools: model.suitableTools,
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
      description: provider.description,
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
    priceUsdMonthly: plan.priceUsdMonthly ?? null,
    priceCnyMonthly: plan.priceCnyMonthly ?? null,
    modelIds: plan.modelIds,
    modelCount: plan.modelIds.length,
    enabled: true,
    quotaSummary: plan.quotaSummary,
    resetSummary: plan.resetSummary,
    limitSummary: plan.limitSummary,
    limitations: plan.limitations,
    coverageLabel: plan.coverageLabel || null,
    compatibility: plan.compatibility,
    suitableTools: plan.suitableTools,
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
        cacheReadPrice: offer.cacheReadPrice || null,
        cacheWritePrice: offer.cacheWritePrice || null,
        freeOrPlan: offer.freeOrPlan,
        limitSummary: offer.limitSummary,
        limitations: offer.limitations,
        compatibility: offer.compatibility,
        suitableTools: offer.suitableTools,
        pricingUrl: offer.pricingUrl || null,
        sourceLabel: offer.sourceLabel,
        status: "active",
        notes: offer.notes || null,
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
    providerCandidates: buildApiProviderCandidates(),
    providerSubmissions: [],
  };
}

export async function createApiProviderSubmission(input: {
  url: string;
  name?: string | null;
  contact?: string | null;
  notes?: string | null;
  honeypot?: string | null;
  submitterIp?: string | null;
  rateLimitPerHour?: number;
}): Promise<{ id: string; reviewStatus: ApiProviderSubmissionStatus } | { ignored: true }> {
  if (input.honeypot) return { ignored: true };

  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法接受 API 渠道提交。");

  const normalizedUrl = normalizeSubmissionUrl(input.url);
  const ip = input.submitterIp || null;
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: duplicateRows } = await supabase
    .from("api_provider_submissions")
    .select("id")
    .eq("submitted_url", normalizedUrl)
    .gte("created_at", fiveMinAgo)
    .limit(1);
  if (duplicateRows?.length) {
    throw new Error("该 API 渠道链接刚刚被提交过，请稍后再试。");
  }

  if (ip) {
    const rateLimitPerHour = input.rateLimitPerHour ?? 12;
    const { count } = await supabase
      .from("api_provider_submissions")
      .select("id", { count: "exact", head: true })
      .eq("submitter_ip", ip)
      .gte("created_at", oneHourAgo);
    if ((count || 0) >= rateLimitPerHour) {
      throw new Error("提交过于频繁，请稍后再试。");
    }
  }

  const providers = await readProviderCandidatesForSubmission();
  const parsed = parseApiProviderSubmission(normalizedUrl, providers, input.name || null);
  const id = stableId("api-provider-submission", normalizedUrl, ip || "", Date.now().toString());

  const { error } = await supabase.from("api_provider_submissions").insert({
    id,
    submitted_url: normalizedUrl,
    submitted_name: input.name?.trim() || null,
    submitted_contact: input.contact?.trim() || null,
    submitted_note: input.notes?.trim() || null,
    parsed_provider_url: parsed.providerUrl,
    parsed_provider_name: parsed.providerName,
    parsed_type: parsed.type,
    parse_status: parsed.parseStatus,
    probe_status: "pending",
    review_status: "pending",
    provider_id: parsed.providerId,
    parsed_meta: parsed.meta,
    submitter_ip: ip,
  });
  if (error) throw error;

  return { id, reviewStatus: "pending" };
}

export async function listApiProviderSubmissions(
  status: ApiProviderSubmissionStatus = "pending",
): Promise<ApiProviderSubmission[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("api_provider_submissions")
    .select("id,submitted_url,submitted_name,submitted_contact,submitted_note,parsed_provider_url,parsed_provider_name,parsed_type,parse_status,probe_status,review_status,admin_note,provider_id,parsed_meta,submitter_ip,created_at,updated_at")
    .eq("review_status", status)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).map((row) => mapApiProviderSubmission(row as DbRow));
}

export async function updateApiProviderSubmissionReview(input: {
  id: string;
  reviewStatus: ApiProviderSubmissionStatus;
  adminNote?: string | null;
}): Promise<ApiProviderSubmission> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法更新 API 渠道提交。");

  const { data: existing, error: readError } = await supabase
    .from("api_provider_submissions")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new Error("API 渠道提交不存在。");

  const current = mapApiProviderSubmission(existing as DbRow);
  if (current.reviewStatus !== "pending" && current.reviewStatus !== "collector_todo") {
    throw new Error("该 API 渠道提交已被处理。");
  }
  if (input.reviewStatus === "approved" && !current.providerId) {
    throw new Error("该提交尚未匹配到现有 API 来源，请先加入采集器待办。");
  }

  const now = new Date().toISOString();
  const nextMeta: Record<string, unknown> = {
    ...current.parsedMeta,
    review_stage: input.reviewStatus,
    reviewed_at: now,
  };
  if (input.adminNote?.trim()) nextMeta.admin_note = input.adminNote.trim();

  const { data, error } = await supabase
    .from("api_provider_submissions")
    .update({
      review_status: input.reviewStatus,
      admin_note: input.adminNote?.trim() || null,
      parsed_meta: nextMeta,
      updated_at: now,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("API 渠道提交不存在或已被处理。");

  return mapApiProviderSubmission(data as DbRow);
}

async function readProviderCandidatesForSubmission(): Promise<ApiProviderMatchCandidate[]> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("api_providers")
        .select("id,name,type,official_url,pricing_url")
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = dbRows(data);
      if (rows.length) {
        return rows
          .map((row): ApiProviderMatchCandidate | null => {
            const type = providerType(row.type);
            const url = nullableString(row.official_url);
            if (!type || !url) return null;
            return {
              id: stringValue(row.id),
              name: stringValue(row.name),
              type,
              url,
              pricingUrl: nullableString(row.pricing_url),
              persisted: true,
            };
          })
          .filter((provider): provider is ApiProviderMatchCandidate => Boolean(provider));
      }
    } catch (error) {
      console.warn("Falling back to static API provider candidates:", error);
    }
  }

  return staticApiModelDataset.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    type: provider.type,
    url: provider.url,
    pricingUrl: provider.pricingUrl || null,
    persisted: false,
  }));
}

function parseApiProviderSubmission(
  url: string,
  providers: ApiProviderMatchCandidate[],
  submittedName: string | null,
): {
  providerId: string | null;
  providerUrl: string | null;
  providerName: string | null;
  type: ApiProviderType | null;
  parseStatus: ApiProviderSubmissionParseStatus;
  meta: Record<string, unknown>;
} {
  const parsed = new URL(url);
  const domain = normalizeHost(parsed.hostname);
  const matched = providers.find((provider) => providerHosts(provider).some((host) => hostMatches(domain, host))) || null;
  const providerUrl = matched?.url || `${parsed.protocol}//${parsed.host}`;
  const submittedUrlType = parsed.pathname.replace(/\/+$/, "") ? "detail_or_documentation_page" : "provider_home";
  const providerId = matched?.persisted ? matched.id : null;
  const parseStatus: ApiProviderSubmissionParseStatus = matched
    ? "matched_existing"
    : submittedName?.trim()
      ? "parsed"
      : "needs_review";
  const inferredType = matched?.type || inferProviderTypeFromUrl(parsed);

  return {
    providerId,
    providerUrl,
    providerName: matched?.name || submittedName?.trim() || parsed.hostname.replace(/^www\./, ""),
    type: inferredType,
    parseStatus,
    meta: {
      domain,
      submitted_url_type: submittedUrlType,
      matched_provider_id: matched?.id || null,
      matched_provider_name: matched?.name || null,
      matched_provider_persisted: Boolean(matched?.persisted),
      matched_provider_url: matched?.url || null,
      matched_provider_pricing_url: matched?.pricingUrl || null,
      suggested_action: providerId ? "approve_existing_provider" : "collector_todo",
      support_status: providerId ? "matched_existing_provider" : "needs_api_provider_collector",
      support_reason: providerId
        ? `已匹配到现有 API 来源「${matched?.name}」，审核通过后保留在现有渠道下。`
        : "没有匹配到现有 API 来源，需要补充 API 模型数据或采集脚本后再收录。",
    },
  };
}

function normalizeSubmissionUrl(value: string): string {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("仅支持 http/https 链接。");
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    throw new Error("URL 格式不正确。");
  }
}

function providerHosts(provider: ApiProviderMatchCandidate): string[] {
  return [provider.url, provider.pricingUrl]
    .map((value) => hostFromUrl(value))
    .filter((host): host is string => Boolean(host));
}

function hostFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return normalizeHost(new URL(value).hostname);
  } catch {
    return null;
  }
}

function normalizeHost(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function hostMatches(submittedHost: string, providerHost: string): boolean {
  return (
    submittedHost === providerHost ||
    submittedHost.endsWith(`.${providerHost}`) ||
    providerHost.endsWith(`.${submittedHost}`)
  );
}

function inferProviderTypeFromUrl(parsed: URL): ApiProviderType | null {
  const text = `${parsed.hostname} ${parsed.pathname}`.toLowerCase();
  if (text.includes("openrouter") || text.includes("router")) return "router";
  if (text.includes("free") || text.includes("nim")) return "free";
  if (text.includes("plan") || text.includes("pricing") || text.includes("go")) return "subscription";
  if (text.includes("api") || text.includes("docs") || text.includes("console")) return "official";
  return null;
}

function mapApiProviderSubmission(row: DbRow): ApiProviderSubmission {
  return {
    id: stringValue(row.id),
    submittedUrl: stringValue(row.submitted_url),
    submittedName: nullableString(row.submitted_name),
    submittedContact: nullableString(row.submitted_contact),
    submittedNote: nullableString(row.submitted_note),
    parsedProviderUrl: nullableString(row.parsed_provider_url),
    parsedProviderName: nullableString(row.parsed_provider_name),
    parsedType: providerType(row.parsed_type),
    parseStatus: apiSubmissionParseStatus(row.parse_status),
    probeStatus: apiSubmissionProbeStatus(row.probe_status),
    reviewStatus: apiSubmissionReviewStatus(row.review_status),
    adminNote: nullableString(row.admin_note),
    providerId: nullableString(row.provider_id),
    parsedMeta: recordValue(row.parsed_meta),
    submitterIp: nullableString(row.submitter_ip),
    createdAt: timestampValue(row.created_at),
    updatedAt: timestampValue(row.updated_at),
  };
}

function buildApiProviderCandidates(): ApiProviderAdminCandidate[] {
  return apiProviderCandidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    type: candidate.type,
    billingMode: candidate.billingMode,
    url: candidate.url,
    pricingUrl: candidate.pricingUrl,
    logoUrl: candidate.logoUrl,
    status: candidate.status,
    priority: candidate.priority,
    evidenceStatus: candidate.evidenceStatus,
    sourceLabel: candidate.sourceLabel,
    reason: candidate.reason,
    nextStep: candidate.nextStep,
    notes: candidate.notes,
    updatedAt: candidate.updatedAt,
  }));
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
    priceCnyMonthly: numberValue(row.price_cny_monthly) ?? undefined,
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

function apiSubmissionParseStatus(value: unknown): ApiProviderSubmissionParseStatus {
  if (
    value === "pending" ||
    value === "matched_existing" ||
    value === "parsed" ||
    value === "needs_review" ||
    value === "invalid"
  ) {
    return value;
  }
  return "pending";
}

function apiSubmissionProbeStatus(value: unknown): ApiProviderSubmission["probeStatus"] {
  if (value === "success" || value === "failed" || value === "unsupported") return value;
  return "pending";
}

function apiSubmissionReviewStatus(value: unknown): ApiProviderSubmissionStatus {
  if (value === "approved" || value === "collector_todo" || value === "rejected") return value;
  return "pending";
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

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
