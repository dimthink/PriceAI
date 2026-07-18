import "server-only";

import {
  getOfficialTransitUnitCurrency,
  getOfficialTransitUnitPrice,
  normalizedTransitCommercialOfferDisclosure,
  type TransitPriceCurrency,
  type TransitPriceMetric,
} from "@/lib/api-transit";
import { clearTransitStationsCache } from "@/lib/api-transit-db";
import type {
  ApiTransitAdminData,
  ApiTransitAdminLoadError,
  ApiTransitAdminMetrics,
  ApiTransitAdminOffer,
  ApiTransitCommercialOffer,
  ApiTransitOfferCandidate,
  ApiTransitAdminRun,
  ApiTransitAdminStation,
  ApiTransitAdminSubmission,
  ApiTransitCollectionStatus,
  ApiTransitDataStatus,
  ApiTransitInvoiceSupport,
  ApiTransitOfferStatus,
  ApiTransitOperatorType,
  ApiTransitParseStatus,
  ApiTransitProbeStatus,
  ApiTransitRunStatus,
  ApiTransitStationStatus,
  ApiTransitStationSystem,
  ApiTransitSubmissionReviewStatus,
  ApiTransitSubmissionType,
  ApiTransitUsageAdvice,
  ApiTransitVerificationEvent,
  WholesaleAdminMatch,
  WholesaleMatchStatus,
} from "@/lib/api-transit-admin-types";
import {
  TRANSIT_STANDARD_MODELS,
  type TransitStandardModel,
} from "@/data/api-transit/types";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { normalizeTransitSubmissionUrl } from "@/lib/api-transit-normalization";
import { slugify, stableId } from "@/lib/utils";

const ADMIN_STATION_LIMIT = 80;
const ADMIN_OFFER_LIMIT = 600;
const ADMIN_SUBMISSION_LIMIT = 120;
const ADMIN_RUN_LIMIT = 60;
const ADMIN_LATEST_RUN_SCAN_LIMIT = ADMIN_STATION_LIMIT * 5;
const ADMIN_RUN_SELECT = [
  "id",
  "station_id",
  "run_type",
  "status",
  "model_count",
  "offer_count",
  "error_message",
  "source_url",
  "started_at",
  "finished_at",
  "api_transit_stations(name)",
].join(",");

type DbRow = Record<string, unknown>;

type ApiTransitSubmissionUpdateResult = {
  submission: ApiTransitAdminSubmission;
  station: ApiTransitAdminStation | null;
  stationCreated: boolean;
};

export async function getApiTransitAdminData(input: {
  isAuthenticated: boolean;
}): Promise<ApiTransitAdminData> {
  if (!input.isAuthenticated) return getEmptyApiTransitAdminData(false);

  const supabase = getSupabaseServerClient();
  if (!supabase) return getEmptyApiTransitAdminData(true, "Supabase 尚未配置。");

  const loadErrors: ApiTransitAdminLoadError[] = [];
  const [stations, offers, submissions, wholesaleMatches, runs] = await Promise.all([
    adminLoad("stations", "中转站", listAdminTransitStations(), [], loadErrors),
    adminLoad("offers", "中转站报价", listAdminTransitOffers(), [], loadErrors),
    adminLoad("submissions", "中转站提交", listAdminTransitSubmissions(), [], loadErrors),
    adminLoad("wholesale-matches", "批发撮合记录", listAdminWholesaleMatches(), [], loadErrors),
    adminLoad("runs", "中转站检测记录", listAdminTransitRuns(), [], loadErrors),
  ]);

  return {
    isAuthenticated: true,
    configured: true,
    generatedAt: new Date().toISOString(),
    loadErrors,
    metrics: buildMetrics(stations, offers, submissions, runs),
    stations,
    offers,
    offerCandidates: buildOfferCandidates(offers),
    submissions,
    wholesaleMatches,
    runs,
  };
}

export function getEmptyApiTransitAdminData(
  isAuthenticated = false,
  message?: string,
): ApiTransitAdminData {
  return {
    isAuthenticated,
    configured: isSupabaseConfigured(),
    generatedAt: new Date().toISOString(),
    loadErrors: message ? [{ key: "supabase", label: "Supabase", message }] : [],
    metrics: {
      totalStations: 0,
      publishedStations: 0,
      pendingStations: 0,
      removedStations: 0,
      totalOffers: 0,
      activeOffers: 0,
      pendingOffers: 0,
      candidateOffers: 0,
      pendingSubmissions: 0,
      successfulRuns: 0,
      failedRuns: 0,
    },
    stations: [],
    offers: [],
    offerCandidates: [],
    submissions: [],
    wholesaleMatches: [],
    runs: [],
  };
}

export async function createWholesaleMatch(input: {
  demandSubmissionId: string;
  supplySubmissionId: string;
  matchScore: number;
  matchReasons: string[];
  adminNote?: string | null;
}): Promise<WholesaleAdminMatch> {
  const supabase = getSupabaseOrThrow();
  const [demand, supply] = await Promise.all([
    getAdminTransitSubmissionById(input.demandSubmissionId),
    getAdminTransitSubmissionById(input.supplySubmissionId),
  ]);
  if (!isWholesaleAdminSubmission(demand) || !isWholesaleAdminSubmission(supply)) {
    throw new Error("撮合双方必须都是批发线索。");
  }
  if (demand.submittedMeta.wholesaleRole !== "buyer" || supply.submittedMeta.wholesaleRole !== "seller") {
    throw new Error("撮合记录必须由一条买方需求和一条源头供给组成。");
  }

  const row = {
    id: stableId("wholesale-match", demand.id, supply.id),
    demand_submission_id: demand.id,
    supply_submission_id: supply.id,
    status: "draft" satisfies WholesaleMatchStatus,
    match_score: Math.max(0, Math.min(100, Math.round(input.matchScore))),
    match_reasons: uniqueText(input.matchReasons).slice(0, 10),
    admin_note: cleanNullable(input.adminNote),
  };
  const { data, error } = await supabase
    .from("wholesale_matches")
    .upsert(row, { onConflict: "demand_submission_id,supply_submission_id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) return mapWholesaleMatch(data as DbRow);

  const { data: existing, error: existingError } = await supabase
    .from("wholesale_matches")
    .select("*")
    .eq("demand_submission_id", demand.id)
    .eq("supply_submission_id", supply.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("创建撮合记录失败。");
  return mapWholesaleMatch(existing as DbRow);
}

export async function updateWholesaleMatch(input: {
  id: string;
  status: WholesaleMatchStatus;
  adminNote?: string | null;
  nextFollowUpAt?: string | null;
}): Promise<WholesaleAdminMatch> {
  const supabase = getSupabaseOrThrow();
  const row: DbRow = { status: input.status };
  if (input.adminNote !== undefined) row.admin_note = cleanNullable(input.adminNote);
  if (input.nextFollowUpAt !== undefined) row.next_follow_up_at = cleanNullable(input.nextFollowUpAt);
  const { data, error } = await supabase
    .from("wholesale_matches")
    .update(row)
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("撮合记录不存在。");
  return mapWholesaleMatch(data as DbRow);
}

export async function updateApiTransitStation(input: {
  id: string;
  name?: string;
  websiteUrl?: string;
  logoUrl?: string | null;
  apiBaseUrl?: string | null;
  pricingUrl?: string | null;
  monitorUrl?: string | null;
  summary?: string | null;
  sourceType?: string;
  commercialRelation?: string;
  stationSystem?: ApiTransitStationSystem;
  operatorType?: ApiTransitOperatorType;
  invoiceSupport?: ApiTransitInvoiceSupport;
  collectorKind?: string;
  collectionStatus?: ApiTransitCollectionStatus;
  channelTypes?: string[];
  accountPools?: string[];
  paymentMethods?: string[];
  minimumTopUp?: string | null;
  balanceExpiry?: string | null;
  supportChannels?: string[];
  refundPolicy?: string | null;
  riskLabels?: string[];
  published?: boolean;
  dataStatus?: ApiTransitDataStatus;
  usageAdvice?: ApiTransitUsageAdvice;
  status?: ApiTransitStationStatus;
  adminNote?: string | null;
  strengths?: string[];
  cautions?: string[];
  commercialOffers?: ApiTransitCommercialOffer[];
  verificationEvents?: ApiTransitVerificationEvent[];
  removedAt?: string | null;
  removedReason?: string | null;
}): Promise<ApiTransitAdminStation> {
  const supabase = getSupabaseOrThrow();
  const row: DbRow = {
    last_updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) row.name = cleanRequired(input.name, "站点名称不能为空。");
  if (input.websiteUrl !== undefined) row.website_url = cleanRequired(input.websiteUrl, "站点 URL 不能为空。");
  if (input.logoUrl !== undefined) row.logo_url = cleanNullable(input.logoUrl);
  if (input.apiBaseUrl !== undefined) row.api_base_url = cleanNullable(input.apiBaseUrl);
  if (input.pricingUrl !== undefined) {
    row.pricing_url = cleanNullable(input.pricingUrl);
    row.pricing_endpoint_url = cleanNullable(input.pricingUrl);
  }
  if (input.monitorUrl !== undefined) row.monitor_url = cleanNullable(input.monitorUrl);
  if (input.summary !== undefined) row.summary = cleanNullable(input.summary) || "";
  if (input.sourceType !== undefined) row.source_type = input.sourceType;
  if (input.commercialRelation !== undefined) row.commercial_relation = input.commercialRelation;
  if (input.stationSystem !== undefined) row.station_system = input.stationSystem === "unknown" ? null : input.stationSystem;
  if (input.operatorType !== undefined) row.operator_type = input.operatorType === "unknown" ? "individual" : input.operatorType;
  if (input.invoiceSupport !== undefined) row.invoice_support = input.invoiceSupport;
  if (input.collectorKind !== undefined) row.collector_kind = cleanRequired(input.collectorKind, "采集器类型不能为空。");
  if (input.collectionStatus) row.collection_status = input.collectionStatus;
  if (input.channelTypes !== undefined) row.channel_types = normalizeChannelTypes(input.channelTypes);
  if (input.accountPools !== undefined) row.account_pools = normalizeAccountPools(input.accountPools);
  if (input.paymentMethods !== undefined) row.payment_methods = uniqueText(input.paymentMethods);
  if (input.minimumTopUp !== undefined) row.minimum_top_up = cleanNullable(input.minimumTopUp);
  if (input.balanceExpiry !== undefined) row.balance_expiry = cleanNullable(input.balanceExpiry);
  if (input.supportChannels !== undefined) row.support_channels = uniqueText(input.supportChannels);
  if (input.refundPolicy !== undefined) row.refund_policy = cleanNullable(input.refundPolicy);
  if (input.riskLabels !== undefined) row.risk_labels = uniqueText(input.riskLabels);
  if (typeof input.published === "boolean") row.published = input.published;
  if (input.dataStatus) row.data_status = input.dataStatus;
  if (input.usageAdvice) row.usage_advice = input.usageAdvice;
  if (input.status) row.status = input.status;
  if (input.adminNote !== undefined) row.admin_note = cleanNullable(input.adminNote);
  if (input.strengths !== undefined) row.strengths = uniqueText(input.strengths);
  if (input.cautions !== undefined) row.cautions = uniqueText(input.cautions);
  if (input.commercialOffers !== undefined) row.commercial_offers = sanitizeCommercialOffers(input.commercialOffers);
  if (input.verificationEvents !== undefined) row.verification_events = sanitizeVerificationEvents(input.verificationEvents);
  if (input.removedAt !== undefined) row.removed_at = cleanNullable(input.removedAt);
  if (input.removedReason !== undefined) row.removed_reason = cleanNullable(input.removedReason);

  let { data, error } = await supabase
    .from("api_transit_stations")
    .update(row)
    .eq("id", input.id)
    .select("*")
    .maybeSingle();

  if (error && isMissingColumnError(error, "logo_url") && Object.prototype.hasOwnProperty.call(row, "logo_url")) {
    const requestedLogoUrl = row.logo_url;
    delete row.logo_url;
    if (requestedLogoUrl) {
      throw new Error("Logo 字段尚未完成数据库迁移，请稍后再保存站点 Logo。");
    }

    const retryResult = await supabase
      .from("api_transit_stations")
      .update(row)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error && isMissingColumnError(error, "station_system") && Object.prototype.hasOwnProperty.call(row, "station_system")) {
    const requestedStationSystem = row.station_system;
    delete row.station_system;
    if (requestedStationSystem && requestedStationSystem !== "unknown") {
      throw new Error("系统标签字段尚未完成数据库迁移，请稍后再保存站点系统。");
    }

    const retryResult = await supabase
      .from("api_transit_stations")
      .update(row)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    data = retryResult.data;
    error = retryResult.error;
  }

  if (
    error &&
    (isMissingColumnError(error, "operator_type") || isMissingColumnError(error, "invoice_support")) &&
    (Object.prototype.hasOwnProperty.call(row, "operator_type") || Object.prototype.hasOwnProperty.call(row, "invoice_support"))
  ) {
    const requestedOperatorType = row.operator_type;
    const requestedInvoiceSupport = row.invoice_support;
    delete row.operator_type;
    delete row.invoice_support;
    if (
      (requestedOperatorType && requestedOperatorType !== "unknown") ||
      (requestedInvoiceSupport && requestedInvoiceSupport !== "unknown")
    ) {
      throw new Error("主体与发票字段尚未完成数据库迁移，请稍后再保存这些标签。");
    }

    const retryResult = await supabase
      .from("api_transit_stations")
      .update(row)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error && isMissingColumnError(error, "station_system") && Object.prototype.hasOwnProperty.call(row, "station_system")) {
    const requestedStationSystem = row.station_system;
    delete row.station_system;
    if (requestedStationSystem && requestedStationSystem !== "unknown") {
      throw new Error("系统标签字段尚未完成数据库迁移，请稍后再保存站点系统。");
    }

    const retryResult = await supabase
      .from("api_transit_stations")
      .update(row)
      .eq("id", input.id)
      .select("*")
      .maybeSingle();
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) throw error;
  if (!data) throw new Error("中转站不存在。");

  clearTransitStationsCache();
  const stats = await getOfferStatsByStationIds([input.id]);
  const latestRuns = await getLatestRunsByStationIds([input.id]);
  return mapStation(data as DbRow, stats.get(input.id), latestRuns.get(input.id));
}

export async function updateApiTransitOffers(input: {
  ids: string[];
  status?: ApiTransitOfferStatus;
}): Promise<{ updatedCount: number; stationSlugs: string[] }> {
  const ids = uniqueText(input.ids);
  const emptyResult = { updatedCount: 0, stationSlugs: [] };
  if (!ids.length) return emptyResult;

  const supabase = getSupabaseOrThrow();
  if (!input.status) return emptyResult;
  const { data, error } = await supabase
    .from("api_transit_offers")
    .update({ status: input.status })
    .in("id", ids)
    .select("id,api_transit_stations!inner(slug)");

  if (error) throw error;
  clearTransitStationsCache();
  const rows = dbRows(data);
  return {
    updatedCount: rows.length,
    stationSlugs: uniqueText(rows.map((row) => stringValue(nestedRow(row.api_transit_stations)?.slug))),
  };
}

export async function updateApiTransitOffer(input: {
  id: string;
  family?: string;
  standardModel?: string;
  rawModelName?: string;
  groupName?: string;
  rechargeRatio?: string | null;
  billingMode?: string | null;
  modelMultiplier?: number | null;
  inputPrice?: number | null;
  outputPrice?: number | null;
  cacheReadPrice?: number | null;
  cacheWritePrice?: number | null;
  imageOutputPrice?: number | null;
  fixedPrice?: number | null;
  fixedPriceCurrency?: string | null;
  fixedPriceUnit?: string | null;
  fixedPriceTiers?: Array<{ label: string; price: number; unit?: string | null }>;
  currency?: string;
  accountPool?: string;
  channelType?: string;
  priceSource?: string;
  sourceUrl?: string | null;
  status?: ApiTransitOfferStatus;
}): Promise<ApiTransitAdminOffer> {
  const supabase = getSupabaseOrThrow();
  const row: DbRow = {};

  if (input.family !== undefined) row.family = input.family;
  if (input.standardModel !== undefined) row.standard_model = cleanRequired(input.standardModel, "标准模型不能为空。");
  if (input.rawModelName !== undefined) row.raw_model_name = cleanRequired(input.rawModelName, "原始模型不能为空。");
  if (input.groupName !== undefined) row.group_name = cleanRequired(input.groupName, "分组名不能为空。");
  if (input.rechargeRatio !== undefined) row.recharge_ratio = cleanNullable(input.rechargeRatio);
  if (input.billingMode !== undefined) row.billing_mode = cleanNullable(input.billingMode);
  if (input.modelMultiplier !== undefined) row.model_multiplier = input.modelMultiplier;
  if (input.inputPrice !== undefined) row.input_price = input.inputPrice;
  if (input.outputPrice !== undefined) row.output_price = input.outputPrice;
  if (input.cacheReadPrice !== undefined) row.cache_read_price = input.cacheReadPrice;
  if (input.cacheWritePrice !== undefined) row.cache_write_price = input.cacheWritePrice;
  if (input.imageOutputPrice !== undefined) row.image_output_price = input.imageOutputPrice;
  if (input.fixedPrice !== undefined) row.fixed_price = input.fixedPrice;
  if (input.fixedPriceCurrency !== undefined) row.fixed_price_currency = cleanNullable(input.fixedPriceCurrency) || "CNY";
  if (input.fixedPriceUnit !== undefined) row.fixed_price_unit = cleanNullable(input.fixedPriceUnit);
  if (input.fixedPriceTiers !== undefined) row.fixed_price_tiers = input.fixedPriceTiers;
  if (input.currency !== undefined) row.currency = cleanRequired(input.currency, "币种不能为空。");
  if (input.accountPool !== undefined) row.account_pool = normalizeAccountPool(input.accountPool) || cleanRequired(input.accountPool, "号池不能为空。");
  if (input.channelType !== undefined) row.channel_type = normalizeChannelType(input.channelType) || cleanRequired(input.channelType, "渠道类型不能为空。");
  if (input.priceSource !== undefined) row.price_source = cleanRequired(input.priceSource, "价格来源不能为空。");
  if (input.sourceUrl !== undefined) row.source_url = cleanNullable(input.sourceUrl);
  if (input.status) row.status = input.status;

  const { data, error } = await supabase
    .from("api_transit_offers")
    .update(row)
    .eq("id", input.id)
    .select(
      [
        "id",
        "station_id",
        "family",
        "standard_model",
        "raw_model_name",
        "group_name",
        "recharge_ratio",
        "billing_mode",
        "model_multiplier",
        "input_price",
        "output_price",
        "cache_read_price",
        "cache_write_price",
        "image_output_price",
        "fixed_price",
        "fixed_price_currency",
        "fixed_price_unit",
        "fixed_price_tiers",
        "currency",
        "account_pool",
        "channel_type",
        "price_source",
        "source_url",
        "last_verified_at",
        "status",
        "created_at",
        "updated_at",
        "api_transit_stations!inner(slug,name,published,removed_at)",
      ].join(",")
    )
    .is("api_transit_stations.removed_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("报价不存在。");
  clearTransitStationsCache();
  return mapOffer(data as unknown as DbRow);
}

export async function publishApiTransitStationWithOffers(input: {
  stationId: string;
  offerIds?: string[];
}): Promise<{ station: ApiTransitAdminStation; updatedOfferCount: number }> {
  const station = await updateApiTransitStation({
    id: input.stationId,
    published: true,
    removedAt: null,
    removedReason: null,
    dataStatus: "verified",
    status: "active",
    usageAdvice: "try_small",
  });

  let offerIds = uniqueText(input.offerIds || []);
  if (!offerIds.length) {
    offerIds = await listOfferIdsForStation(input.stationId, "needs_review");
  }
  const result = await updateApiTransitOffers({ ids: offerIds, status: "active" });
  return { station, updatedOfferCount: result.updatedCount };
}

export async function removeApiTransitStation(input: {
  id: string;
  reason?: string | null;
}): Promise<ApiTransitAdminStation> {
  return updateApiTransitStation({
    id: input.id,
    published: false,
    removedAt: new Date().toISOString(),
    removedReason: cleanNullable(input.reason) || "后台移除",
    dataStatus: "pending_review",
    status: "unknown",
    usageAdvice: "pending",
    collectionStatus: "manual_review",
  });
}

export async function restoreApiTransitStation(input: {
  id: string;
}): Promise<ApiTransitAdminStation> {
  return updateApiTransitStation({
    id: input.id,
    removedAt: null,
    removedReason: null,
    published: false,
    dataStatus: "pending_review",
    status: "unknown",
    usageAdvice: "pending",
  });
}

export async function updateApiTransitSubmission(input: {
  id: string;
  reviewStatus: ApiTransitSubmissionReviewStatus;
  stationId?: string | null;
  adminNote?: string | null;
}): Promise<ApiTransitSubmissionUpdateResult> {
  const supabase = getSupabaseOrThrow();

  let station: ApiTransitAdminStation | null = null;
  let stationCreated = false;
  let stationId = input.stationId;
  if (input.reviewStatus === "approved") {
    const submission = await getAdminTransitSubmissionById(input.id);
    if (isWholesaleAdminSubmission(submission)) {
      stationId = input.stationId ?? submission.stationId;
    } else {
      const promotion = await promoteTransitSubmissionToStation(input.id, input.stationId);
      station = promotion.station;
      stationCreated = promotion.created;
      stationId = promotion.station.id;
    }
  }

  const row: DbRow = {
    review_status: input.reviewStatus,
    admin_note: cleanNullable(input.adminNote),
  };
  if (stationId !== undefined) row.station_id = cleanNullable(stationId);

  const { data, error } = await supabase
    .from("api_transit_submissions")
    .update(row)
    .eq("id", input.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("提交记录不存在。");
  const submission = mapSubmission(data as DbRow);
  if (!station && submission.stationId) station = await getAdminTransitStationById(submission.stationId);
  return { submission, station, stationCreated };
}

async function getAdminTransitSubmissionById(
  submissionId: string,
): Promise<ApiTransitAdminSubmission> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_submissions")
    .select("*")
    .eq("id", submissionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("提交记录不存在。");
  return mapSubmission(data as DbRow);
}

async function promoteTransitSubmissionToStation(
  submissionId: string,
  requestedStationId?: string | null,
): Promise<{ station: ApiTransitAdminStation; created: boolean }> {
  const submission = await getAdminTransitSubmissionById(submissionId);
  if (isWholesaleAdminSubmission(submission)) {
    throw new Error("批发线索不能自动创建中转站草稿。");
  }
  const supabase = getSupabaseOrThrow();
  const existing = await findStationForSubmission(submission, requestedStationId);
  if (existing) return { station: existing, created: false };

  const now = new Date().toISOString();
  const websiteUrl = normalizeUrlForStation(submission.submittedUrl);
  const pricingUrl = normalizeOptionalUrl(submission.pricingUrl);
  const apiBaseUrl = normalizeOptionalUrl(submission.apiBaseUrl);
  const monitorUrl = normalizeOptionalUrl(metaText(submission.submittedMeta, "monitorUrl") || firstUrlFromText(metaText(submission.submittedMeta, "monitor_text")));
  const stationId = buildStationId(submission);
  const stationName = cleanNullable(submission.submittedName) || stationNameFromUrl(websiteUrl) || stationId;
  const sourceType = submission.submissionType === "merchant" ? "merchant_submitted" : "user_submitted";
  const collectionStatus: ApiTransitCollectionStatus =
    submission.probeStatus === "public_pricing_found" ? "manual_review" : "pending";

  const stationRow: DbRow = {
    id: stationId,
    slug: stationId,
    name: stationName,
    website_url: websiteUrl,
    api_base_url: apiBaseUrl,
    pricing_url: pricingUrl,
    monitor_url: monitorUrl,
    status: "unknown",
    source_type: sourceType,
    commercial_relation: "unknown",
    summary: buildStationDraftSummary(submission),
    channel_types: submittedMetaList(submission.submittedMeta, "channel_types_normalized", "channel_types_raw"),
    account_pools: submittedAccountPools(submission),
    payment_methods: [],
    support_channels: supportChannelsFromContact(submission.contact),
    risk_labels: [],
    usage_advice: "pending",
    data_status: "pending_review",
    collector_kind: "submission_review",
    pricing_endpoint_url: pricingUrl,
    collection_status: collectionStatus,
    last_updated_at: now,
    published: false,
    admin_note: buildStationDraftAdminNote(submission),
  };

  const { data: inserted, error: insertError } = await supabase
    .from("api_transit_stations")
    .insert(stationRow)
    .select("*")
    .maybeSingle();

  if (insertError) throw insertError;
  if (!inserted) throw new Error("站点草稿创建失败。");

  await linkSubmissionCredentialsToStation(submission.id, stationId);
  clearTransitStationsCache();
  return { station: mapStation(inserted as DbRow), created: true };
}

async function findStationForSubmission(
  submission: ApiTransitAdminSubmission,
  requestedStationId?: string | null,
): Promise<ApiTransitAdminStation | null> {
  const explicitId = cleanNullable(requestedStationId) || submission.stationId;
  if (explicitId) {
    const explicitStation = await getAdminTransitStationById(explicitId);
    if (explicitStation) {
      await linkSubmissionCredentialsToStation(submission.id, explicitStation.id);
      return explicitStation;
    }
  }

  const candidateId = buildStationId(submission);
  const submittedHost = hostnameForCompare(submission.submittedUrl);
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("*")
    .is("removed_at", null)
    .limit(500);

  if (error) throw error;

  const matchingRow = dbRows(data).find((row) => {
    const id = stringValue(row.id);
    const slug = stringValue(row.slug);
    if (id === candidateId || slug === candidateId) return true;
    const stationHost = hostnameForCompare(stringValue(row.website_url));
    return Boolean(submittedHost && stationHost && submittedHost === stationHost);
  });

  if (!matchingRow) return null;
  const stationId = stringValue(matchingRow.id);
  await linkSubmissionCredentialsToStation(submission.id, stationId);
  return getAdminTransitStationById(stationId);
}

async function getAdminTransitStationById(stationId: string): Promise<ApiTransitAdminStation | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("*")
    .eq("id", stationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const [stats, latestRuns] = await Promise.all([
    getOfferStatsByStationIds([stationId]),
    getLatestRunsByStationIds([stationId]),
  ]);
  return mapStation(data as DbRow, stats.get(stationId), latestRuns.get(stationId));
}

async function linkSubmissionCredentialsToStation(submissionId: string, stationId: string): Promise<void> {
  const supabase = getSupabaseOrThrow();
  const { error } = await supabase
    .from("api_transit_credentials")
    .update({ station_id: stationId })
    .eq("submission_id", submissionId);
  if (error) throw error;
}

function buildStationId(submission: ApiTransitAdminSubmission): string {
  const hostSlug = slugify(hostnameForCompare(submission.submittedUrl) || "");
  const nameSlug = slugify(submission.submittedName || "");
  return hostSlug || nameSlug || stableId("api-transit-station", submission.submittedUrl);
}

function buildStationDraftSummary(submission: ApiTransitAdminSubmission): string {
  const actor = submission.submissionType === "merchant" ? "站长" : "用户";
  const accessMode = accessModeLabel(metaText(submission.submittedMeta, "accessMode"));
  const details = [
    `${actor}提交的 API 中转站线索，已通过初筛并进入站点池。`,
    accessMode ? `接入方式：${accessMode}。` : "",
    "待运营补全价格、号池、风险、售后和可用性数据后再发布。",
  ].filter(Boolean);
  return details.join("");
}

function buildStationDraftAdminNote(submission: ApiTransitAdminSubmission): string {
  const pieces = [
    `由提交线索 ${submission.id} 自动生成站点草稿。`,
    submission.probeStatus === "public_pricing_found" ? "已发现公开价格/监测入口。" : "",
    submission.notes ? `提交备注：${submission.notes}` : "",
    submission.adminNote ? `原后台备注：${submission.adminNote}` : "",
  ].filter(Boolean);
  return pieces.join("\n");
}

function stationNameFromUrl(value: string): string | null {
  const host = hostnameForCompare(value);
  if (!host) return null;
  return host.split(".").filter(Boolean)[0] || host;
}

function hostnameForCompare(value: string | null | undefined): string | null {
  try {
    const host = new URL(String(value || "").trim()).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function normalizeUrlForStation(value: string): string {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return value.trim();
  }
}

function normalizeOptionalUrl(value: string | null | undefined): string | null {
  const text = cleanNullable(value);
  if (!text) return null;
  try {
    return normalizeUrlForStation(text);
  } catch {
    return null;
  }
}

function firstUrlFromText(value: string | null): string | null {
  return value?.match(/https?:\/\/[^\s，,；;]+/)?.[0] || null;
}

function submittedMetaList(meta: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const values = stringArray(meta[key]);
    if (values.length) return normalizeChannelTypes(values);
  }
  return [];
}

function submittedAccountPools(submission: ApiTransitAdminSubmission): string[] {
  const raw = [
    metaText(submission.submittedMeta, "credentialAccountPool"),
    metaText(submission.submittedMeta, "accountPool"),
    ...submission.submittedModels,
  ].filter((value): value is string => Boolean(value));
  return normalizeAccountPools(raw);
}

function supportChannelsFromContact(contact: string | null): string[] {
  const text = String(contact || "").toLowerCase();
  return uniqueText([
    text.includes("t.me") || text.includes("telegram") || text.includes("tg") ? "Telegram" : "",
    text.includes("qq") ? "QQ" : "",
    text.includes("@") ? "Email" : "",
  ]);
}

function metaText(meta: Record<string, unknown>, key: string): string | null {
  return nullableString(meta[key]);
}

function accessModeLabel(value: string | null): string | null {
  if (value === "public_only") return "公开资料";
  if (value === "test_key") return "测试 Key";
  if (value === "test_account") return "测试账号";
  return null;
}

async function listAdminTransitStations(): Promise<ApiTransitAdminStation[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_stations")
    .select("*")
    .order("removed_at", { ascending: true, nullsFirst: true })
    .order("published", { ascending: false })
    .order("last_collected_at", { ascending: false })
    .limit(ADMIN_STATION_LIMIT);

  if (error) throw error;

  const rows = dbRows(data);
  const stationIds = rows.map((row) => stringValue(row.id)).filter(Boolean);
  const [stats, latestRuns] = await Promise.all([
    getOfferStatsByStationIds(stationIds),
    getLatestRunsByStationIds(stationIds),
  ]);

  return rows.map((row) => {
    const stationId = stringValue(row.id);
    return mapStation(row, stats.get(stationId), latestRuns.get(stationId));
  });
}

async function listAdminTransitOffers(): Promise<ApiTransitAdminOffer[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_offers")
    .select(
      [
        "id",
        "station_id",
        "family",
        "standard_model",
        "raw_model_name",
        "group_name",
        "recharge_ratio",
        "billing_mode",
        "model_multiplier",
        "input_price",
        "output_price",
        "cache_read_price",
        "cache_write_price",
        "image_output_price",
        "fixed_price",
        "fixed_price_currency",
        "fixed_price_unit",
        "fixed_price_tiers",
        "currency",
        "account_pool",
        "channel_type",
        "price_source",
        "source_url",
        "last_verified_at",
        "status",
        "created_at",
        "updated_at",
        "api_transit_stations!inner(slug,name,published,removed_at)",
      ].join(",")
    )
    .is("api_transit_stations.removed_at", null)
    .order("status", { ascending: false })
    .order("last_verified_at", { ascending: false })
    .limit(ADMIN_OFFER_LIMIT);

  if (error) throw error;
  return dbRows(data).map(mapOffer);
}

async function listAdminTransitSubmissions(): Promise<ApiTransitAdminSubmission[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(ADMIN_SUBMISSION_LIMIT);

  if (error) throw error;
  return dbRows(data).map(mapSubmission);
}

async function listAdminWholesaleMatches(): Promise<WholesaleAdminMatch[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("wholesale_matches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return dbRows(data).map(mapWholesaleMatch);
}

async function listAdminTransitRuns(): Promise<ApiTransitAdminRun[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_detection_runs")
    .select(ADMIN_RUN_SELECT)
    .order("started_at", { ascending: false })
    .limit(ADMIN_RUN_LIMIT);

  if (error) throw error;
  return dbRows(data).map(mapRun);
}

async function listOfferIdsForStation(
  stationId: string,
  status?: ApiTransitOfferStatus,
): Promise<string[]> {
  const supabase = getSupabaseOrThrow();
  let query = supabase
    .from("api_transit_offers")
    .select("id")
    .eq("station_id", stationId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return dbRows(data).map((row) => stringValue(row.id)).filter(Boolean);
}

async function getOfferStatsByStationIds(stationIds: string[]): Promise<Map<string, OfferStats>> {
  const ids = uniqueText(stationIds);
  const stats = new Map<string, OfferStats>();
  if (!ids.length) return stats;

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_offers")
    .select("station_id,status")
    .in("station_id", ids);

  if (error) throw error;

  for (const row of dbRows(data)) {
    const stationId = stringValue(row.station_id);
    if (!stationId) continue;
    const current = stats.get(stationId) || { total: 0, active: 0, pending: 0, inactive: 0 };
    current.total += 1;
    const status = offerStatus(row.status);
    if (status === "active") current.active += 1;
    else if (status === "inactive") current.inactive += 1;
    else current.pending += 1;
    stats.set(stationId, current);
  }

  return stats;
}

async function getLatestRunsByStationIds(stationIds: string[]): Promise<Map<string, ApiTransitAdminRun>> {
  const ids = uniqueText(stationIds);
  const latestRuns = new Map<string, ApiTransitAdminRun>();
  if (!ids.length) return latestRuns;

  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from("api_transit_detection_runs")
    .select(ADMIN_RUN_SELECT)
    .in("station_id", ids)
    .order("started_at", { ascending: false })
    .limit(ADMIN_LATEST_RUN_SCAN_LIMIT);

  if (error) throw error;

  for (const row of dbRows(data)) {
    const stationId = stringValue(row.station_id);
    if (!stationId || latestRuns.has(stationId)) continue;
    latestRuns.set(stationId, mapRun(row));
  }

  return latestRuns;
}

async function adminLoad<T>(
  key: string,
  label: string,
  promise: Promise<T>,
  fallback: T,
  loadErrors: ApiTransitAdminLoadError[],
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    loadErrors.push({
      key,
      label,
      message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

type OfferStats = {
  total: number;
  active: number;
  pending: number;
  inactive: number;
};

function mapStation(
  row: DbRow,
  stats?: OfferStats,
  latestRun?: ApiTransitAdminRun,
): ApiTransitAdminStation {
  const stationStats = stats || { total: 0, active: 0, pending: 0, inactive: 0 };
  return {
    id: stringValue(row.id),
    slug: stringValue(row.slug),
    name: stringValue(row.name),
    websiteUrl: stringValue(row.website_url),
    logoUrl: nullableString(row.logo_url),
    apiBaseUrl: nullableString(row.api_base_url),
    pricingUrl: nullableString(row.pricing_url || row.pricing_endpoint_url),
    monitorUrl: nullableString(row.monitor_url),
    status: stationStatus(row.status),
    sourceType: stringValue(row.source_type) || "manual_collected",
    commercialRelation: stringValue(row.commercial_relation) || "unknown",
    stationSystem: stationSystem(row.station_system),
    operatorType: operatorType(row.operator_type),
    invoiceSupport: invoiceSupport(row.invoice_support),
    summary: stringValue(row.summary),
    channelTypes: stringArray(row.channel_types),
    accountPools: stringArray(row.account_pools),
    paymentMethods: stringArray(row.payment_methods),
    minimumTopUp: nullableString(row.minimum_top_up),
    balanceExpiry: nullableString(row.balance_expiry),
    supportChannels: stringArray(row.support_channels),
    refundPolicy: nullableString(row.refund_policy),
    riskLabels: stringArray(row.risk_labels),
    usageAdvice: usageAdvice(row.usage_advice),
    dataStatus: dataStatus(row.data_status),
    collectorKind: stringValue(row.collector_kind) || "manual_review",
    collectionStatus: collectionStatus(row.collection_status),
    collectionError: nullableString(row.collection_error),
    lastCollectedAt: nullableString(row.last_collected_at),
    lastUpdatedAt: nullableString(row.last_updated_at),
    published: Boolean(row.published),
    removedAt: nullableString(row.removed_at),
    removedReason: nullableString(row.removed_reason),
    adminNote: nullableString(row.admin_note),
    strengths: stringArray(row.strengths),
    cautions: stringArray(row.cautions),
    commercialOffers: commercialOffers(row.commercial_offers),
    verificationEvents: verificationEvents(row.verification_events),
    createdAt: timestampValue(row.created_at),
    updatedAt: nullableString(row.updated_at),
    offerCount: stationStats.total,
    activeOfferCount: stationStats.active,
    pendingOfferCount: stationStats.pending,
    inactiveOfferCount: stationStats.inactive,
    latestRunStatus: latestRun?.status || null,
    latestRunAt: latestRun?.finishedAt || latestRun?.startedAt || null,
  };
}

function mapOffer(row: DbRow): ApiTransitAdminOffer {
  const station = nestedRow(row.api_transit_stations);
  const standardModel = stringValue(row.standard_model);
  const inputPrice = numberValue(row.input_price);
  const outputPrice = numberValue(row.output_price);
  const cacheReadPrice = numberValue(row.cache_read_price);
  const cacheWritePrice = numberValue(row.cache_write_price);
  const imageOutputPrice = numberValue(row.image_output_price);
  const unitPriceCurrency = getOfficialUnitCurrencySafe(standardModel);

  return {
    id: stringValue(row.id),
    stationId: stringValue(row.station_id),
    stationSlug: stringValue(station?.slug),
    stationName: stringValue(station?.name) || stringValue(row.station_id),
    stationPublished: Boolean(station?.published),
    family: stringValue(row.family),
    standardModel,
    rawModelName: stringValue(row.raw_model_name),
    groupName: stringValue(row.group_name),
    rechargeRatio: nullableString(row.recharge_ratio),
    billingMode: nullableString(row.billing_mode),
    modelMultiplier: numberValue(row.model_multiplier),
    inputPrice,
    outputPrice,
    cacheReadPrice,
    cacheWritePrice,
    imageOutputPrice,
    fixedPrice: numberValue(row.fixed_price),
    fixedPriceCurrency: nullableString(row.fixed_price_currency),
    fixedPriceUnit: nullableString(row.fixed_price_unit),
    fixedPriceTiers: adminFixedPriceTiers(row.fixed_price_tiers),
    inputUnitPriceUsd: getAdminUnitPriceUsd(standardModel, "input", inputPrice),
    outputUnitPriceUsd: getAdminUnitPriceUsd(standardModel, "output", outputPrice),
    cacheReadUnitPriceUsd: getAdminUnitPriceUsd(standardModel, "cacheRead", cacheReadPrice),
    cacheWriteUnitPriceUsd: getAdminUnitPriceUsd(standardModel, "cacheWrite", cacheWritePrice),
    imageOutputUnitPriceUsd: getAdminUnitPriceUsd(standardModel, "imageOutput", imageOutputPrice),
    unitPriceCurrency,
    currency: stringValue(row.currency) || "CNY",
    accountPool: stringValue(row.account_pool) || "undisclosed",
    channelType: stringValue(row.channel_type) || "undisclosed",
    priceSource: stringValue(row.price_source) || "公开价格页",
    sourceUrl: nullableString(row.source_url),
    lastVerifiedAt: nullableString(row.last_verified_at),
    status: offerStatus(row.status),
    createdAt: timestampValue(row.created_at),
    updatedAt: nullableString(row.updated_at),
  };
}

function mapSubmission(row: DbRow): ApiTransitAdminSubmission {
  const submittedUrl = stringValue(row.submitted_url);
  const submittedMeta = recordValue(row.submitted_meta);
  const normalized = isWholesaleInternalLeadUrl(submittedUrl, submittedMeta)
    ? { normalizedUrl: null, normalizedHost: null }
    : normalizeTransitSubmissionUrl(submittedUrl);
  return {
    id: stringValue(row.id),
    submissionType: submissionType(row.submission_type),
    submittedUrl,
    submittedName: nullableString(row.submitted_name),
    apiBaseUrl: nullableString(row.api_base_url),
    pricingUrl: nullableString(row.pricing_url),
    contact: nullableString(row.contact),
    notes: nullableString(row.notes),
    submittedModels: stringArray(row.submitted_models),
    submittedMeta,
    parseStatus: parseStatus(row.parse_status),
    probeStatus: probeStatus(row.probe_status),
    reviewStatus: reviewStatus(row.review_status),
    stationId: nullableString(row.station_id),
    normalizedUrl: nullableString(row.normalized_url) || normalized.normalizedUrl,
    normalizedHost: nullableString(row.normalized_host) || normalized.normalizedHost,
    duplicateOf: nullableString(row.duplicate_of),
    duplicateCount: numberValue(row.duplicate_count) || 0,
    adminNote: nullableString(row.admin_note),
    createdAt: timestampValue(row.created_at),
    updatedAt: nullableString(row.updated_at),
  };
}

function mapWholesaleMatch(row: DbRow): WholesaleAdminMatch {
  return {
    id: stringValue(row.id),
    demandSubmissionId: stringValue(row.demand_submission_id),
    supplySubmissionId: stringValue(row.supply_submission_id),
    status: wholesaleMatchStatus(row.status),
    matchScore: Math.max(0, Math.min(100, Math.round(numberValue(row.match_score) || 0))),
    matchReasons: stringArray(row.match_reasons),
    adminNote: nullableString(row.admin_note),
    nextFollowUpAt: nullableString(row.next_follow_up_at),
    createdAt: timestampValue(row.created_at),
    updatedAt: nullableString(row.updated_at),
  };
}

function isWholesaleInternalLeadUrl(
  submittedUrl: string,
  submittedMeta: Record<string, unknown>,
): boolean {
  return (
    submittedMeta.workflow === "wholesale" &&
    /^https:\/\/priceai\.cc\/wholesale\/leads\//.test(submittedUrl)
  );
}

function isWholesaleAdminSubmission(submission: ApiTransitAdminSubmission): boolean {
  return submission.submittedMeta.workflow === "wholesale";
}

function mapRun(row: DbRow): ApiTransitAdminRun {
  const station = nestedRow(row.api_transit_stations);
  return {
    id: stringValue(row.id),
    stationId: nullableString(row.station_id),
    stationName: nullableString(station?.name),
    runType: stringValue(row.run_type) || "public_pricing",
    status: runStatus(row.status),
    modelCount: integerValue(row.model_count) || 0,
    offerCount: integerValue(row.offer_count) || 0,
    errorMessage: nullableString(row.error_message),
    sourceUrl: nullableString(row.source_url),
    startedAt: timestampValue(row.started_at),
    finishedAt: nullableString(row.finished_at),
  };
}

function buildMetrics(
  stations: ApiTransitAdminStation[],
  offers: ApiTransitAdminOffer[],
  submissions: ApiTransitAdminSubmission[],
  runs: ApiTransitAdminRun[],
): ApiTransitAdminMetrics {
  const offerCandidates = buildOfferCandidates(offers);
  const activeStations = stations.filter((station) => !station.removedAt);
  const visibleSubmissions = groupVisibleAdminSubmissions(submissions);
  return {
    totalStations: activeStations.length,
    publishedStations: activeStations.filter((station) => station.published).length,
    pendingStations: activeStations.filter((station) => !station.published).length,
    removedStations: stations.filter((station) => station.removedAt).length,
    totalOffers: offers.length,
    activeOffers: offers.filter((offer) => offer.status === "active").length,
    pendingOffers: offers.filter((offer) => offer.status === "needs_review").length,
    candidateOffers: offerCandidates.filter((candidate) => candidate.status === "needs_review").length,
    pendingSubmissions: visibleSubmissions.filter((submission) => submission.reviewStatus === "pending").length,
    successfulRuns: runs.filter((run) => run.status === "success").length,
    failedRuns: runs.filter((run) => run.status === "failed").length,
  };
}

function groupVisibleAdminSubmissions(submissions: ApiTransitAdminSubmission[]): ApiTransitAdminSubmission[] {
  const byId = new Map(submissions.map((submission) => [submission.id, submission]));
  const groups = new Map<string, ApiTransitAdminSubmission[]>();

  for (const submission of submissions) {
    const rootId = submission.duplicateOf && byId.has(submission.duplicateOf) ? submission.duplicateOf : null;
    const key = rootId || submission.normalizedHost || submission.normalizedUrl || submission.submittedUrl || submission.id;
    groups.set(key, [...(groups.get(key) || []), submission]);
  }

  return Array.from(groups.values()).map((group) => group.find((submission) => !submission.duplicateOf) || group[0]);
}

function buildOfferCandidates(offers: ApiTransitAdminOffer[]): ApiTransitOfferCandidate[] {
  const grouped = new Map<string, ApiTransitAdminOffer[]>();

  for (const offer of offers) {
    if (!isPrimaryStandardModel(offer.standardModel)) continue;
    const key = [
      offer.stationId,
      offer.standardModel,
      normalizeCandidateLane(offer),
      offer.status,
    ].join("::");
    grouped.set(key, [...(grouped.get(key) || []), offer]);
  }

  return Array.from(grouped.values())
    .map(toOfferCandidate)
    .filter((candidate): candidate is ApiTransitOfferCandidate => Boolean(candidate))
    .sort(compareOfferCandidates);
}

function toOfferCandidate(group: ApiTransitAdminOffer[]): ApiTransitOfferCandidate | null {
  const sorted = [...group].sort(compareRawOffersForCandidate);
  const representative = sorted[0];
  const qualityFlags = Array.from(new Set(sorted.flatMap(getOfferQualityFlags)));
  const hiddenRawCount = sorted.filter((offer) => isNoisyOffer(offer)).length;
  const publishableOffers = sorted.filter((offer) => !isNoisyOffer(offer));
  if (!publishableOffers.length) return null;
  const candidateOffers = publishableOffers;
  const lane = normalizeCandidateLane(representative);

  return {
    id: `${representative.stationId}:${representative.standardModel}:${lane}:${representative.status}`,
    stationId: representative.stationId,
    stationName: representative.stationName,
    stationPublished: representative.stationPublished,
    family: representative.family,
    standardModel: representative.standardModel,
    representativeOfferId: representative.id,
    rawOfferIds: candidateOffers.map((offer) => offer.id),
    rawOfferCount: sorted.length,
    groupName: representative.groupName,
    rechargeRatio: representative.rechargeRatio,
    billingMode: representative.billingMode,
    modelMultiplier: representative.modelMultiplier,
    inputPrice: representative.inputPrice,
    outputPrice: representative.outputPrice,
    cacheReadPrice: representative.cacheReadPrice,
    cacheWritePrice: representative.cacheWritePrice,
    imageOutputPrice: representative.imageOutputPrice,
    fixedPrice: representative.fixedPrice,
    fixedPriceCurrency: representative.fixedPriceCurrency,
    fixedPriceUnit: representative.fixedPriceUnit,
    fixedPriceTiers: representative.fixedPriceTiers,
    inputUnitPriceUsd: representative.inputUnitPriceUsd,
    outputUnitPriceUsd: representative.outputUnitPriceUsd,
    cacheReadUnitPriceUsd: representative.cacheReadUnitPriceUsd,
    cacheWriteUnitPriceUsd: representative.cacheWriteUnitPriceUsd,
    imageOutputUnitPriceUsd: representative.imageOutputUnitPriceUsd,
    unitPriceCurrency: representative.unitPriceCurrency,
    currency: representative.currency,
    accountPool: representative.accountPool,
    channelType: representative.channelType,
    priceSource: representative.priceSource,
    sourceUrl: representative.sourceUrl,
    lastVerifiedAt: representative.lastVerifiedAt,
    status: representative.status,
    candidateScore: scoreRawOffer(representative),
    reviewReason: buildCandidateReviewReason(representative, sorted, hiddenRawCount),
    qualityFlags,
    hiddenRawCount,
  };
}

function compareOfferCandidates(left: ApiTransitOfferCandidate, right: ApiTransitOfferCandidate): number {
  const statusOrder = statusSortValue(left.status) - statusSortValue(right.status);
  if (statusOrder) return statusOrder;
  return (
    left.stationName.localeCompare(right.stationName, "zh-CN") ||
    modelSortValue(left.standardModel) - modelSortValue(right.standardModel) ||
    right.candidateScore - left.candidateScore ||
    compareNullableNumber(left.modelMultiplier, right.modelMultiplier)
  );
}

function compareRawOffersForCandidate(left: ApiTransitAdminOffer, right: ApiTransitAdminOffer): number {
  return (
    scoreRawOffer(right) - scoreRawOffer(left) ||
    compareNullableNumber(left.modelMultiplier, right.modelMultiplier) ||
    compareNullableNumber(left.inputPrice, right.inputPrice) ||
    left.groupName.localeCompare(right.groupName, "zh-CN")
  );
}

function scoreRawOffer(offer: ApiTransitAdminOffer): number {
  let score = 50;
  const text = offerText(offer);

  if (offer.status === "active") score += 8;
  if (offer.status === "inactive") score -= 12;
  if (offer.inputPrice !== null && (offer.outputPrice !== null || offer.imageOutputPrice !== null)) score += 10;
  if (offer.modelMultiplier !== null) score += 8;
  if (offer.cacheReadPrice !== null || offer.cacheWritePrice !== null) score += 3;
  if (offer.accountPool !== "undisclosed") score += 5;
  if (offer.channelType !== "undisclosed") score += 5;
  if (offer.channelType === "official_api" || offer.channelType === "cloud") score += 6;
  if (offer.accountPool === "pro" || offer.accountPool === "max" || offer.accountPool === "official_api") score += 4;
  if (/\bazure\b|aws|vertex|official|官方|官转|codex|cc|pro|max/i.test(text)) score += 4;
  if (/\bremap\b|test|free|trial|体验|测试|免费/i.test(text)) score -= 18;
  if (/\bmini\b|compact|thinking|image|audio|embedding|search/i.test(text)) score -= 12;
  if (offer.modelMultiplier !== null && offer.modelMultiplier > 4) score -= 8;
  if (offer.modelMultiplier !== null && offer.modelMultiplier <= 0.02) score -= 6;
  if (offer.outputPrice === null && offer.imageOutputPrice === null && offer.inputPrice === null) score -= 15;

  return score;
}

function buildCandidateReviewReason(
  representative: ApiTransitAdminOffer,
  group: ApiTransitAdminOffer[],
  hiddenRawCount: number,
): string {
  const parts = [
    `${group.length} 条原始报价合并为 1 个审核候选`,
    `优先展示 ${representative.groupName || "默认分组"}`,
  ];
  if (hiddenRawCount > 0) parts.push(`已弱化 ${hiddenRawCount} 条噪音报价`);
  if (representative.channelType === "undisclosed" || representative.accountPool === "undisclosed") {
    parts.push("号池/渠道仍需人工确认");
  }
  return parts.join("，");
}

function getOfferQualityFlags(offer: ApiTransitAdminOffer): string[] {
  const flags: string[] = [];
  const text = offerText(offer);
  if (offer.accountPool === "undisclosed") flags.push("号池未披露");
  if (offer.channelType === "undisclosed") flags.push("渠道未披露");
  if (offer.modelMultiplier === null) flags.push("倍率缺失");
  if (offer.inputPrice === null || (offer.outputPrice === null && offer.imageOutputPrice === null)) flags.push("价格不完整");
  if (/\bremap\b/i.test(text)) flags.push("remap 分组");
  if (/\bmini\b|compact|thinking/i.test(text)) flags.push("变体已弱化");
  if (/test|free|trial|体验|测试|免费/i.test(text)) flags.push("疑似测试/免费分组");
  return flags;
}

function isNoisyOffer(offer: ApiTransitAdminOffer): boolean {
  return scoreRawOffer(offer) < 50 || getOfferQualityFlags(offer).some((flag) =>
    flag === "remap 分组" ||
    flag === "变体已弱化" ||
    flag === "疑似测试/免费分组"
  );
}

function normalizeCandidateLane(offer: ApiTransitAdminOffer): string {
  if (offer.channelType === "official_api") return "official";
  if (offer.channelType === "cloud") return "cloud";
  if (offer.accountPool === "max") return "max";
  if (offer.accountPool === "pro") return "pro";
  if (offer.accountPool === "plus") return "plus";
  if (offer.accountPool === "team") return "team";
  if (/cc|codex/i.test(offer.groupName)) return "code";
  if (/azure|aws|vertex/i.test(offer.groupName)) return "cloud";
  if (/remap/i.test(offer.groupName)) return "remap";
  return "default";
}

function isPrimaryStandardModel(value: string): boolean {
  return TRANSIT_STANDARD_MODELS.includes(value as TransitStandardModel);
}

function offerText(offer: ApiTransitAdminOffer): string {
  return [
    offer.standardModel,
    offer.rawModelName,
    offer.groupName,
    offer.accountPool,
    offer.channelType,
    offer.priceSource,
  ].join(" ").toLowerCase();
}

function modelSortValue(value: string): number {
  const order = [
    "Claude Fable 5",
    "Claude Sonnet 5",
    "Claude Sonnet 4.5",
    "Claude Sonnet 4.6",
    "Claude Haiku 4.5",
    "Claude Opus 4.5",
    "Claude Opus 4.6",
    "Claude Opus 4.7",
    "Claude Opus 4.8",
    "Codex Compact",
    "GPT 5.6 Sol",
    "GPT 5.6 Terra",
    "GPT 5.6 Luna",
    "GPT 5.5",
    "GPT 5.4",
    "GPT 5.4 Mini",
    "Gemini 3.5 Flash",
    "Gemini 3.1 Pro",
    "Grok 4.20",
    "Grok 4.3",
    "Grok 4.5",
    "Grok Build",
    "Composer 2.5",
    "GLM-5.2",
    "GLM-5.1",
    "DeepSeek V4 Flash",
    "DeepSeek V4 Pro",
    "GPT Image 2",
    "Nano Banana Pro",
    "Nano Banana 2",
    "Nano Banana",
    "Nano Banana Lite",
    "Sora 2",
    "Sora 2 Pro",
    "Veo 3.1",
    "Veo 3.1 Lite",
    "Gemini Omni Flash",
    "Seedance 2.0",
    "Kling 2.5 Turbo",
  ];
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

function statusSortValue(value: ApiTransitOfferStatus): number {
  if (value === "needs_review") return 0;
  if (value === "active") return 1;
  return 2;
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function getSupabaseOrThrow() {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");
  return supabase;
}

function dbRows(value: unknown): DbRow[] {
  return Array.isArray(value) ? value.filter((item): item is DbRow => Boolean(item && typeof item === "object")) : [];
}

function nestedRow(value: unknown): DbRow | null {
  if (Array.isArray(value)) return nestedRow(value[0]);
  return value && typeof value === "object" ? value as DbRow : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function objectArray(value: unknown): DbRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is DbRow => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function cleanNullable(value: string | null | undefined): string | null {
  const text = stringValue(value).trim();
  return text ? text : null;
}

function cleanRequired(value: string, message: string): string {
  const text = stringValue(value).trim();
  if (!text) throw new Error(message);
  return text;
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value).trim();
  return text ? text : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function adminFixedPriceTiers(value: unknown): Array<{ label: string; price: number; unit?: string | null }> {
  const tiers: Array<{ label: string; price: number; unit?: string | null }> = [];
  for (const item of objectArray(value)) {
    const label = nullableString(item.label);
    const price = numberValue(item.price);
    if (!label || price === null || price <= 0) continue;
    tiers.push({
      label,
      price,
      unit: nullableString(item.unit),
    });
  }
  return tiers;
}

function getAdminUnitPriceUsd(
  standardModel: string,
  metric: TransitPriceMetric,
  multiplier: number | null
): number | null {
  if (multiplier === null) return null;
  const official = getOfficialUnitPriceSafe(standardModel, metric);
  if (official === null) return null;
  return roundNumber(official * multiplier, 6);
}

function getOfficialUnitPriceSafe(
  standardModel: string,
  metric: TransitPriceMetric
): number | null {
  try {
    return getOfficialTransitUnitPrice(
      standardModel as Parameters<typeof getOfficialTransitUnitPrice>[0],
      metric
    );
  } catch {
    return null;
  }
}

function getOfficialUnitCurrencySafe(standardModel: string): TransitPriceCurrency {
  try {
    return getOfficialTransitUnitCurrency(
      standardModel as Parameters<typeof getOfficialTransitUnitCurrency>[0]
    );
  } catch {
    return "USD";
  }
}

function roundNumber(value: number, digits: number): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function timestampValue(value: unknown): string {
  return nullableString(value) || new Date().toISOString();
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => stringValue(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,，\n|｜]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

const CHANNEL_TYPE_ALIASES: Record<string, string> = {
  officialapi: "official_api",
  official_api: "official_api",
  官方api: "official_api",
  官方: "official_api",
  云厂商: "cloud",
  云: "cloud",
  cloud: "cloud",
  firstpartypool: "first_party_pool",
  first_party_pool: "first_party_pool",
  一手自建号池: "first_party_pool",
  一手号池: "first_party_pool",
  自建号池: "first_party_pool",
  plus: "first_party_pool",
  pro: "first_party_pool",
  max: "first_party_pool",
  team: "first_party_pool",
  reverseengineered: "reverse_engineered",
  reverse_engineered: "reverse_engineered",
  逆向: "reverse_engineered",
  kiro: "reverse_engineered",
  firstpartywholesale: "first_party_wholesale",
  first_party_wholesale: "first_party_wholesale",
  一手批发: "first_party_wholesale",
  reseller: "reseller",
  二级分销: "reseller",
  mixed: "mixed",
  混合渠道: "mixed",
  混合: "mixed",
  undisclosed: "undisclosed",
  未披露: "undisclosed",
};

const ACCOUNT_POOL_ALIASES: Record<string, string> = {
  pro: "pro",
  plus: "plus",
  max: "max",
  team: "team",
  kiro: "kiro",
  企业池: "enterprise",
  enterprise: "enterprise",
  officialapi: "official_api",
  official_api: "official_api",
  官方api: "official_api",
  官方: "official_api",
  mixed: "mixed",
  混池: "mixed",
  混合: "mixed",
  undisclosed: "undisclosed",
  未披露: "undisclosed",
};

function normalizeChannelTypes(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeChannelType).filter((value): value is string => Boolean(value))));
}

function normalizeAccountPools(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeAccountPool).filter((value): value is string => Boolean(value))));
}

function normalizeChannelType(value: string): string | null {
  return normalizeAliasValue(value, CHANNEL_TYPE_ALIASES);
}

function normalizeAccountPool(value: string): string | null {
  return normalizeAliasValue(value, ACCOUNT_POOL_ALIASES);
}

function normalizeAliasValue(value: string, aliases: Record<string, string>): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s/／\\-]+/g, "");
  return aliases[key] || aliases[raw] || null;
}

function commercialOffers(value: unknown): ApiTransitCommercialOffer[] {
  const offers: ApiTransitCommercialOffer[] = [];
  objectArray(value).forEach((item, index) => {
    const offer: ApiTransitCommercialOffer = {
      id: nullableString(item.id) || `offer-${index}`,
      type: commercialOfferType(item.type),
      title: stringValue(item.title),
      listLabel: nullableString(item.listLabel || item.list_label),
      description: nullableString(item.description),
      code: nullableString(item.code),
      url: nullableString(item.url),
      validUntil: nullableString(item.validUntil || item.valid_until),
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
      disclosure: item.enabled === false
        ? null
        : normalizedTransitCommercialOfferDisclosure(nullableString(item.disclosure)),
    };
    if (hasCommercialOfferContent(offer)) offers.push(offer);
  });
  return offers;
}

function verificationEvents(value: unknown): ApiTransitVerificationEvent[] {
  return objectArray(value).map((item, index) => ({
    id: nullableString(item.id) || `event-${index}`,
    source: verificationEventSource(item.source),
    status: verificationEventStatus(item.status),
    title: stringValue(item.title) || "核验记录",
    description: nullableString(item.description),
    happenedAt: timestampValue(item.happenedAt || item.happened_at),
  })).filter((item) => item.title);
}

function sanitizeCommercialOffers(values: ApiTransitCommercialOffer[]): ApiTransitCommercialOffer[] {
  const offers: ApiTransitCommercialOffer[] = [];
  values.forEach((item, index) => {
    const enabled = Boolean(item.enabled);
    const offer: ApiTransitCommercialOffer = {
      id: cleanNullable(item.id) || `offer-${index}`,
      type: commercialOfferType(item.type),
      title: cleanNullable(item.title) || "",
      listLabel: cleanNullable(item.listLabel),
      description: cleanNullable(item.description),
      code: cleanNullable(item.code),
      url: cleanNullable(item.url),
      validUntil: cleanNullable(item.validUntil),
      disclosure: enabled
        ? normalizedTransitCommercialOfferDisclosure(cleanNullable(item.disclosure))
        : null,
      enabled,
    };
    if (hasCommercialOfferContent(offer)) offers.push(offer);
  });
  return offers.slice(0, 8);
}

function hasCommercialOfferContent(offer: Pick<ApiTransitCommercialOffer, "title" | "listLabel" | "description" | "code" | "url" | "validUntil">): boolean {
  return Boolean(offer.title || offer.listLabel || offer.description || offer.code || offer.url || offer.validUntil);
}

function sanitizeVerificationEvents(values: ApiTransitVerificationEvent[]): ApiTransitVerificationEvent[] {
  return values
    .map((item, index) => ({
      id: cleanNullable(item.id) || `event-${index}`,
      source: verificationEventSource(item.source),
      status: verificationEventStatus(item.status),
      title: cleanNullable(item.title) || "",
      description: cleanNullable(item.description),
      happenedAt: cleanNullable(item.happenedAt) || new Date().toISOString(),
    }))
    .filter((item) => item.title)
    .slice(0, 12);
}

function commercialOfferType(value: unknown): ApiTransitCommercialOffer["type"] {
  return value === "affiliate" || value === "sponsored" || value === "coupon" ? value : "coupon";
}

function verificationEventSource(value: unknown): ApiTransitVerificationEvent["source"] {
  return value === "official" || value === "user" || value === "merchant" || value === "priceai" ? value : "priceai";
}

function verificationEventStatus(value: unknown): ApiTransitVerificationEvent["status"] {
  return value === "warning" || value === "failed" || value === "info" || value === "success" ? value : "info";
}

function stationStatus(value: unknown): ApiTransitStationStatus {
  const text = stringValue(value);
  return text === "active" || text === "limited" || text === "unavailable" || text === "unknown" ? text : "unknown";
}

function stationSystem(value: unknown): ApiTransitStationSystem {
  const text = stringValue(value);
  return text === "new_api" || text === "sub_to_api" || text === "custom" || text === "unknown" ? text : "unknown";
}

function operatorType(value: unknown): ApiTransitOperatorType {
  const text = stringValue(value);
  return text === "company" || text === "individual" ? text : "individual";
}

function invoiceSupport(value: unknown): ApiTransitInvoiceSupport {
  const text = stringValue(value);
  return text === "supported" || text === "unsupported" || text === "unknown" ? text : "unknown";
}

function dataStatus(value: unknown): ApiTransitDataStatus {
  const text = stringValue(value);
  return text === "sample" || text === "pending_review" || text === "verified" ? text : "pending_review";
}

function usageAdvice(value: unknown): ApiTransitUsageAdvice {
  const text = stringValue(value);
  return text === "try_small" || text === "cautious" || text === "not_recommended" || text === "pending" ? text : "pending";
}

function collectionStatus(value: unknown): ApiTransitCollectionStatus {
  const text = stringValue(value);
  return text === "pending" || text === "success" || text === "partial" || text === "failed" || text === "manual_review" ? text : "pending";
}

function offerStatus(value: unknown): ApiTransitOfferStatus {
  const text = stringValue(value);
  return text === "active" || text === "inactive" || text === "needs_review" ? text : "needs_review";
}

function submissionType(value: unknown): ApiTransitSubmissionType {
  return stringValue(value) === "merchant" ? "merchant" : "user";
}

function parseStatus(value: unknown): ApiTransitParseStatus {
  const text = stringValue(value);
  return text === "parsed" || text === "failed" || text === "pending" ? text : "pending";
}

function probeStatus(value: unknown): ApiTransitProbeStatus {
  const text = stringValue(value);
  return text === "public_pricing_found" || text === "needs_login" || text === "failed" || text === "pending" ? text : "pending";
}

function reviewStatus(value: unknown): ApiTransitSubmissionReviewStatus {
  const text = stringValue(value);
  return text === "collector_todo" || text === "approved" || text === "rejected" || text === "pending" ? text : "pending";
}

function runStatus(value: unknown): ApiTransitRunStatus {
  const text = stringValue(value);
  return text === "success" || text === "partial" || text === "failed" ? text : "failed";
}

function wholesaleMatchStatus(value: unknown): WholesaleMatchStatus {
  const text = stringValue(value);
  return text === "draft" || text === "consent_pending" || text === "connected" || text === "trial" || text === "deal" || text === "closed"
    ? text
    : "draft";
}

function isMissingColumnError(error: unknown, columnName?: string): boolean {
  const message = error && typeof error === "object"
    ? String(
      (error as { message?: unknown; details?: unknown }).message ||
      (error as { message?: unknown; details?: unknown }).details ||
      "",
    )
    : "";
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as { code?: unknown }).code === "42703" || (error as { code?: unknown }).code === "PGRST204") &&
      (!columnName || message.includes(columnName))
  );
}
