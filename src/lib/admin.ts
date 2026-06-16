import "server-only";

import { canonicalCatalog, classifyOffer } from "./catalog";
import { ADMIN_SESSION_COOKIE, getAdminPassword, verifyAdminSessionToken } from "./env";
import { freshnessFields } from "./freshness";
import {
  collectorHostsForKind,
  inferCollectorKindFromHost,
  normalizeCollectorKind as normalizeRegisteredCollectorKind,
} from "./collector-registry";
import { pruneOperationalLogs } from "./operational-logs";
import { safeFetch } from "./safe-fetch";
import { isFeedbackEvidenceReference } from "./feedback-evidence";
import { getSupabaseServerClient } from "./supabase";
import type {
  ChannelSubmission,
  CollectionMethod,
  CollectorKind,
  OfferInput,
  OfferFeedback,
  OfferFeedbackReason,
  OfferFeedbackSuggestedAction,
  OfferFeedbackStatus,
  OfferFeedbackUserExpectedAction,
  OfferStatus,
  RawOffer,
  SiteFeedback,
  SiteFeedbackStatus,
  SiteFeedbackType,
  Source,
  SubmissionStatus,
} from "./types";
import { normalizeStatus, parseTags, slugify, stableId, stableOfferInputId } from "./utils";

export const ADMIN_SOURCE_HIDE_REASON_PREFIX = "管理员手动下架渠道";
export const ADMIN_OFFER_HIDE_REASON_PREFIX = "管理员手动下架报价";
export const ADMIN_MANUAL_HIDE_REASON_PREFIX = "管理员手动下架";
const UNCHANGED_OFFER_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
const RAW_OFFER_WRITE_CHUNK_SIZE = 5;

export type RawOfferUpsertResult = {
  receivedCount: number;
  writtenCount: number;
  unchangedCount: number;
  refreshedCount: number;
};

let canonicalProductsEnsurePromise: Promise<void> | null = null;

type SubmissionProbeResult = {
  sourceId?: string;
  sourceName?: string;
  sourceUrl?: string;
  baseUrl?: string;
  kind?: string | null;
  status?: string;
  offerCount?: number;
  offers?: Array<Record<string, unknown>>;
  ms?: number;
  message?: string;
  finishedAt?: string;
};

type ShopGoodsLookupResult = {
  checkedAt: string;
  goodsKey: string;
  httpStatus?: number;
  apiCode?: number | string | null;
  apiMessage?: string | null;
  token?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
  title?: string | null;
  price?: number | null;
  realPrice?: number | null;
  status?: string | null;
  category?: string | null;
  descriptionPreview?: string | null;
  error?: string | null;
};

type SubmissionParseContext = {
  submissionId?: string | null;
  submittedName?: string | null;
  submittedAt?: string | null;
};

export function getAdminPasswordFromRequest(request: Request): string | null {
  const header = request.headers.get("x-admin-password");
  if (header) return header;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);

  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  if (cookie && verifyAdminSessionToken(decodeURIComponent(cookie))) return getAdminPassword();

  return null;
}

export async function upsertSource(input: {
  id?: string | null;
  name: string;
  entryUrl: string;
  baseUrl?: string | null;
  collectionMethod?: CollectionMethod;
  collectorKind?: CollectorKind | null;
  enabled?: boolean;
  notes?: string | null;
}): Promise<Source> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法保存来源。");

  const normalizedEntryUrl = normalizeSourceEntryUrl(input.entryUrl) || input.entryUrl;
  let id = input.id || slugify(input.name || normalizedEntryUrl);
  const existingByEntryUrl = await findSourceRowByEntryUrl(normalizedEntryUrl);
  if (existingByEntryUrl?.id) id = String(existingByEntryUrl.id);

  const { data: existing, error: existingError } = await supabase
    .from("sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw existingError;

  const matchedExisting = existing || existingByEntryUrl;
  const matchedByEntryUrl = Boolean(existingByEntryUrl?.id);
  const sourceName = matchedByEntryUrl && matchedExisting?.name
    ? String(matchedExisting.name)
    : input.name;

  const nextUpdatedAt = new Date().toISOString();
  const source: Source = {
    id,
    name: sourceName,
    baseUrl: input.baseUrl || deriveBaseUrl(normalizedEntryUrl),
    entryUrl: normalizedEntryUrl,
    collectionMethod: input.collectionMethod || String(matchedExisting?.collection_method || "manual") as CollectionMethod,
    collectorKind: input.collectorKind ?? normalizeCollectorKind(matchedExisting?.collector_kind),
    enabled: input.enabled ?? (matchedExisting ? Boolean(matchedExisting.enabled) : true),
    notes: input.notes || (matchedExisting?.notes ? String(matchedExisting.notes) : null),
    updatedAt: nextUpdatedAt,
  };

  const row: Record<string, unknown> = {
    id: source.id,
    name: source.name,
    base_url: source.baseUrl,
    entry_url: source.entryUrl,
    collection_method: source.collectionMethod,
    enabled: source.enabled,
    notes: source.notes,
    updated_at: source.updatedAt,
  };
  if (input.collectorKind !== undefined) row.collector_kind = source.collectorKind;

  if (matchedExisting && isSourceRowUnchanged(row, matchedExisting)) {
    return {
      ...source,
      updatedAt: matchedExisting.updated_at ? String(matchedExisting.updated_at) : source.updatedAt,
    };
  }

  const { error } = await supabase.from("sources").upsert(row);

  if (error) throw error;
  return source;
}

export async function updateSourceState(input: {
  id: string;
  enabled?: boolean;
  collectionMethod?: CollectionMethod;
  collectorKind?: CollectorKind | null;
  notes?: string | null;
}): Promise<Source> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法更新来源。");

  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof input.enabled === "boolean") row.enabled = input.enabled;
  if (input.collectionMethod) row.collection_method = input.collectionMethod;
  if (input.collectorKind !== undefined) row.collector_kind = input.collectorKind || null;
  if (input.notes !== undefined) row.notes = input.notes;

  const { data, error } = await supabase
    .from("sources")
    .update(row)
    .eq("id", input.id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("来源不存在。");
  return mapSourceRow(data);
}

export async function deleteSource(input: {
  id: string;
  deleteOffers?: boolean;
}): Promise<{ deletedOfferCount: number }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法删除来源。");

  let deletedOfferCount = 0;
  if (input.deleteOffers) {
    const { count, error: offerError } = await supabase
      .from("raw_offers")
      .delete({ count: "exact" })
      .eq("source_id", input.id);
    if (offerError) throw offerError;
    deletedOfferCount = count || 0;
  }

  const { error } = await supabase.from("sources").delete().eq("id", input.id);
  if (error) throw error;

  return { deletedOfferCount };
}

export async function setSourceOffersHidden(input: {
  sourceId: string;
  hidden: boolean;
  reason?: string | null;
}): Promise<{ source: Source; updatedOfferCount: number }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法更新渠道报价。");

  const now = new Date().toISOString();
  const source = await updateSourceState({ id: input.sourceId, enabled: !input.hidden });

  if (input.hidden) {
    const reason = `${ADMIN_SOURCE_HIDE_REASON_PREFIX}：${input.reason?.trim() || "线上反馈/临时处理"}`;
    const { count, error } = await supabase
      .from("raw_offers")
      .update({
        hidden: true,
        failure_reason: reason,
        last_failed_at: now,
        updated_at: now,
      }, { count: "exact" })
      .eq("source_id", input.sourceId)
      .eq("hidden", false);

    if (error) throw error;
    return { source, updatedOfferCount: count || 0 };
  }

  const { count, error } = await supabase
    .from("raw_offers")
    .update({
      hidden: false,
      failure_reason: null,
      last_failed_at: null,
      updated_at: now,
    }, { count: "exact" })
    .eq("source_id", input.sourceId)
    .eq("hidden", true)
    .ilike("failure_reason", `${ADMIN_SOURCE_HIDE_REASON_PREFIX}%`);

  if (error) throw error;
  return { source, updatedOfferCount: count || 0 };
}

export async function setRawOfferHidden(input: {
  id: string;
  hidden: boolean;
  reason?: string | null;
}): Promise<{ updatedOfferCount: number }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法更新报价。");

  const now = new Date().toISOString();
  const row = input.hidden
    ? {
        hidden: true,
        failure_reason: `${ADMIN_OFFER_HIDE_REASON_PREFIX}：${input.reason?.trim() || "线上反馈/临时处理"}`,
        last_failed_at: now,
        updated_at: now,
      }
    : {
        hidden: false,
        failure_reason: null,
        last_failed_at: null,
        updated_at: now,
      };

  let query = supabase
    .from("raw_offers")
    .update(row, { count: "exact" })
    .eq("id", input.id);
  if (!input.hidden) {
    query = query.ilike("failure_reason", `${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`);
  }
  const { count, error } = await query;

  if (error) throw error;
  return { updatedOfferCount: count || 0 };
}

export async function upsertRawOffer(input: OfferInput & { sourceId?: string | null }): Promise<RawOffer> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法保存报价。");

  await ensureCanonicalProducts(supabase);

  const sourceId = input.sourceId || slugify(input.sourceName || input.sourceUrl);
  const source = await upsertSource({
    id: sourceId,
    name: input.sourceName,
    entryUrl: input.sourceUrl,
    collectionMethod: "manual",
    notes: "由后台调试补录或采集助手自动创建。",
  });

  const now = new Date().toISOString();
  const tags = parseTags(input.tags || "");
  const status = normalizeStatus(input.status || "");
  const trustFields = freshnessFields({ method: "manual", status, verifiedAt: now });
  const canonical = classifyOffer(input.sourceTitle, { tags, price: input.price ?? null });
  const existingManualHidden = await getManualHiddenOffer(rawOfferInputId(input));
  const offer: RawOffer = {
    id: rawOfferInputId(input),
    sourceId: sourceId || source.id,
    sourceName: input.sourceName,
    sourceStoreName: input.sourceStoreName || input.sourceName,
    sourceTitle: input.sourceTitle,
    price: input.price ?? null,
    currency: input.currency || "CNY",
    status,
    url: input.url,
    tags,
    stockCount: input.stockCount ?? null,
    hidden: Boolean(existingManualHidden),
    canonicalProductId: canonical.id,
    categorySlug: canonical.platform,
    capturedAt: now,
    sourceUpdatedAt: now,
    lastSeenAt: now,
    verifiedAt: now,
    expiresAt: trustFields.expires_at,
    sourcePriority: trustFields.source_priority,
    confidence: trustFields.confidence,
    effectiveStatus: trustFields.effective_status,
    freshnessStatus: trustFields.freshness_status,
    lastFailedAt: existingManualHidden?.lastFailedAt,
    failureReason: existingManualHidden?.failureReason,
  };

  const { error } = await supabase.from("raw_offers").upsert(toRawOfferRow(offer));
  if (error) throw error;

  return offer;
}

export async function upsertRawOffers(
  offers: OfferInput[],
  options: { collectionMethod?: CollectionMethod; checkedAt?: string } = {},
): Promise<RawOfferUpsertResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法保存报价。");

  await ensureCanonicalProducts(supabase);

  const collectedRows = [];
  const collectionMethod = options.collectionMethod || "browser";
  const sourceCache = new Map<string, Source>();
  const checkedAt = normalizedDateString(options.checkedAt) || new Date().toISOString();

  for (const offer of offers) {
    const sourceKey = offer.sourceId || `${offer.sourceName}|${offer.sourceUrl}|${collectionMethod}`;
    let source = sourceCache.get(sourceKey);
    if (!source) {
      source = await upsertSource({
        id: offer.sourceId,
        name: offer.sourceName,
        entryUrl: offer.sourceUrl,
        collectionMethod,
        notes: collectionMethod === "http" ? "由自动价格采集脚本维护。" : "由半自动浏览器采集助手创建。",
      });
      sourceCache.set(sourceKey, source);
    }
    const normalizedOffer = {
      ...offer,
      sourceName: source.name,
      sourceStoreName: offer.sourceStoreName || source.name,
    };
    const status = normalizeStatus(offer.status || "");
    const tags = parseTags(offer.tags || "");
    const canonical = classifyOffer(offer.sourceTitle, { tags, price: offer.price ?? null });
    const trustFields = freshnessFields({ method: collectionMethod, status, verifiedAt: checkedAt });

    const row = toRawOfferRow({
      id: rawOfferInputId(normalizedOffer),
      sourceId: source.id,
      sourceName: source.name,
      sourceStoreName: normalizedOffer.sourceStoreName,
      sourceTitle: offer.sourceTitle,
      price: offer.price ?? null,
      currency: offer.currency || "CNY",
      status,
      url: offer.url,
      tags,
      stockCount: offer.stockCount ?? null,
      hidden: false,
      canonicalProductId: canonical.id,
      categorySlug: canonical.platform,
      capturedAt: checkedAt,
      sourceUpdatedAt: checkedAt,
      lastSeenAt: checkedAt,
      verifiedAt: checkedAt,
      expiresAt: trustFields.expires_at,
      sourcePriority: trustFields.source_priority,
      confidence: trustFields.confidence,
      effectiveStatus: trustFields.effective_status,
      freshnessStatus: trustFields.freshness_status,
    });
    row.updated_at = checkedAt;
    collectedRows.push(row);
  }

  const rows = dedupeRawOfferRowsById(collectedRows);
  if (!rows.length) return { receivedCount: 0, writtenCount: 0, unchangedCount: 0, refreshedCount: 0 };

  const manualHiddenById = await getManualHiddenOffersById(rows.map((row) => String(row.id)));
  for (const row of rows) {
    const existing = manualHiddenById.get(String(row.id));
    if (!existing) continue;
    row.hidden = true;
    row.failure_reason = existing.failureReason;
    row.last_failed_at = existing.lastFailedAt;
  }

  const existingById = await getExistingOfferRowsById(rows.map((row) => String(row.id)));
  const changedRows = [];
  const unchangedRows = [];
  const refreshRows = [];

  for (const row of rows) {
    const existingRow = existingById.get(String(row.id));
    if (isRawOfferRowUnchanged(row, existingRow)) {
      unchangedRows.push(row);
      if (shouldRefreshUnchangedOffer(row, existingRow)) refreshRows.push(row);
    } else {
      changedRows.push(row);
    }
  }

  for (const rowChunk of chunks(changedRows, RAW_OFFER_WRITE_CHUNK_SIZE)) {
    const { error } = await supabase.from("raw_offers").upsert(rowChunk);
    if (error) throw error;
  }

  const refreshedCount = refreshRows.length ? await refreshSeenRawOfferRows(refreshRows) : 0;

  return {
    receivedCount: rows.length,
    writtenCount: changedRows.length,
    unchangedCount: unchangedRows.length,
    refreshedCount,
  };
}

async function getExistingOfferRowsById(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const supabase = getSupabaseServerClient();
  const output = new Map<string, Record<string, unknown>>();
  if (!supabase || !ids.length) return output;

  for (const idChunk of chunks(Array.from(new Set(ids)), 100)) {
    const { data, error } = await supabase
      .from("raw_offers")
      .select("id,source_id,source_name,source_store_name,source_title,price,currency,status,url,tags,stock_count,hidden,canonical_product_id,category_slug,last_seen_at,verified_at,updated_at,last_failed_at,failure_reason")
      .in("id", idChunk);

    if (error) throw error;
    for (const row of data || []) output.set(String(row.id), row as Record<string, unknown>);
  }

  return output;
}

function isRawOfferRowUnchanged(next: Record<string, unknown>, existing?: Record<string, unknown>): boolean {
  if (!existing) return false;

  const keys = [
    "source_id",
    "source_name",
    "source_store_name",
    "source_title",
    "price",
    "currency",
    "status",
    "url",
    "tags",
    "stock_count",
    "hidden",
    "canonical_product_id",
    "category_slug",
    "last_failed_at",
    "failure_reason",
  ];

  return keys.every((key) => comparableValue(next[key]) === comparableValue(existing[key]));
}

function shouldRefreshUnchangedOffer(next: Record<string, unknown>, existing?: Record<string, unknown>): boolean {
  if (!existing) return true;

  const nextTime = timestampMs(next.last_seen_at || next.verified_at || next.updated_at);
  const existingTime = timestampMs(existing.last_seen_at || existing.verified_at || existing.updated_at);
  if (!nextTime || !existingTime) return true;

  return nextTime - existingTime >= UNCHANGED_OFFER_REFRESH_INTERVAL_MS;
}

function dedupeRawOfferRowsById(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const id = String(row.id || "");
    if (!id) continue;
    const existing = byId.get(id);
    byId.set(id, existing ? preferredRawOfferRow(existing, row) : row);
  }

  return Array.from(byId.values());
}

function preferredRawOfferRow(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  const statusDiff = offerStatusRank(right.status) - offerStatusRank(left.status);
  if (statusDiff > 0) return right;
  if (statusDiff < 0) return left;

  const rightTitleLength = String(right.source_title || "").length;
  const leftTitleLength = String(left.source_title || "").length;
  if (rightTitleLength > leftTitleLength) return right;

  return left;
}

function offerStatusRank(value: unknown): number {
  if (value === "in_stock") return 4;
  if (value === "low_stock") return 3;
  if (value === "unknown") return 2;
  if (value === "out_of_stock") return 1;
  return 0;
}

async function refreshSeenRawOfferRows(rows: Array<Record<string, unknown>>): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase || !rows.length) return 0;

  const groups = new Map<string, { ids: string[]; update: Record<string, unknown> }>();
  for (const row of rows) {
    const update = compactUndefined({
      captured_at: row.captured_at,
      source_updated_at: row.source_updated_at,
      last_seen_at: row.last_seen_at,
      verified_at: row.verified_at,
      expires_at: row.expires_at,
      source_status: row.source_status,
      effective_status: row.effective_status,
      freshness_status: row.freshness_status,
      source_priority: row.source_priority,
      confidence: row.confidence,
      updated_at: row.updated_at,
    });
    const key = JSON.stringify(update);
    const current = groups.get(key) || { ids: [], update };
    current.ids.push(String(row.id));
    groups.set(key, current);
  }

  let refreshedCount = 0;
  for (const group of groups.values()) {
    for (const ids of chunks(group.ids, RAW_OFFER_WRITE_CHUNK_SIZE)) {
      const { count, error } = await supabase
        .from("raw_offers")
        .update(group.update, { count: "exact" })
        .in("id", ids);

      if (error) throw error;
      refreshedCount += count || 0;
    }
  }

  return refreshedCount;
}

function compactUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function timestampMs(value: unknown): number {
  const time = new Date(String(value || "")).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizedDateString(value: string | null | undefined): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function comparableValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(String).sort());
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function isSourceRowUnchanged(next: Record<string, unknown>, existing: Record<string, unknown>): boolean {
  const keys = [
    "id",
    "name",
    "base_url",
    "entry_url",
    "collection_method",
    "enabled",
    "notes",
    "collector_kind",
  ];

  return keys.every((key) => {
    if (!(key in next) && key === "collector_kind") return true;
    return comparableValue(next[key]) === comparableValue(existing[key]);
  });
}

function isCanonicalProductRowUnchanged(next: Record<string, unknown>, existing?: Record<string, unknown>): boolean {
  if (!existing) return false;

  const keys = [
    "id",
    "slug",
    "display_name",
    "platform",
    "product_type",
    "spec",
    "summary",
    "aliases",
    "is_active",
  ];

  return keys.every((key) => comparableValue(next[key]) === comparableValue(existing[key]));
}

async function getManualHiddenOffer(id: string): Promise<{ lastFailedAt?: string | null; failureReason?: string | null } | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("raw_offers")
    .select("last_failed_at,failure_reason")
    .eq("id", id)
    .eq("hidden", true)
    .ilike("failure_reason", `${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`)
    .maybeSingle();

  if (error) throw error;
  return data
    ? {
        lastFailedAt: data.last_failed_at ? String(data.last_failed_at) : null,
        failureReason: data.failure_reason ? String(data.failure_reason) : null,
      }
    : null;
}

async function getManualHiddenOffersById(ids: string[]): Promise<Map<string, { lastFailedAt?: string | null; failureReason?: string | null }>> {
  const supabase = getSupabaseServerClient();
  const output = new Map<string, { lastFailedAt?: string | null; failureReason?: string | null }>();
  if (!supabase || !ids.length) return output;

  for (const idChunk of chunks(Array.from(new Set(ids)), 100)) {
    const { data, error } = await supabase
      .from("raw_offers")
      .select("id,last_failed_at,failure_reason")
      .in("id", idChunk)
      .eq("hidden", true)
      .ilike("failure_reason", `${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`);

    if (error) throw error;
    for (const row of data || []) {
      output.set(String(row.id), {
        lastFailedAt: row.last_failed_at ? String(row.last_failed_at) : null,
        failureReason: row.failure_reason ? String(row.failure_reason) : null,
      });
    }
  }

  return output;
}

async function ensureCanonicalProducts(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>) {
  if (canonicalProductsEnsurePromise) return canonicalProductsEnsurePromise;

  canonicalProductsEnsurePromise = ensureCanonicalProductsOnce(supabase).finally(() => {
    canonicalProductsEnsurePromise = null;
  });

  return canonicalProductsEnsurePromise;
}

async function ensureCanonicalProductsOnce(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>) {
  const desiredRows = canonicalCatalog.map((product) => ({
      id: product.id,
      slug: product.slug,
      display_name: product.displayName,
      platform: product.platform,
      product_type: product.productType,
      spec: product.spec,
      summary: product.summary,
      aliases: product.aliases,
      is_active: true,
    }));

  const { data, error: readError } = await supabase
    .from("canonical_products")
    .select("id,slug,display_name,platform,product_type,spec,summary,aliases,is_active");
  if (readError) throw readError;

  const existingById = new Map((data || []).map((row) => [String(row.id), row as Record<string, unknown>]));
  const changedRows = desiredRows
    .filter((row) => !isCanonicalProductRowUnchanged(row, existingById.get(String(row.id))))
    .map((row) => ({
      ...row,
      updated_at: new Date().toISOString(),
    }));

  if (!changedRows.length) return;

  const { error } = await supabase.from("canonical_products").upsert(changedRows);

  if (error) throw error;
}

export function rawOfferInputId(offer: Pick<OfferInput, "sourceName" | "sourceStoreName" | "sourceTitle" | "url">): string {
  return stableOfferInputId(offer);
}

export async function recordSourceCollectionResult(input: {
  sourceId: string;
  status: "success" | "partial" | "failed" | "skipped";
  checkedAt: string;
  message?: string | null;
  seenOfferIds?: string[];
  fullSnapshot?: boolean;
}): Promise<{ changedOfferCount: number }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法记录来源采集状态。");

  const { data: existing } = await supabase
    .from("sources")
    .select("consecutive_failures,last_success_at")
    .eq("id", input.sourceId)
    .maybeSingle();

  // Skip failure if another channel succeeded recently (within 1 hour)
  if (input.status === "failed" && existing?.last_success_at) {
    const ageMs = Date.now() - new Date(existing.last_success_at).getTime();
    if (ageMs < 60 * 60 * 1000) return { changedOfferCount: 0 };
  }

  const previousFailures = Number(existing?.consecutive_failures || 0);
  if (input.status === "skipped") {
    return { changedOfferCount: 0 };
  }

  const consecutiveFailures = input.status === "failed" ? previousFailures + 1 : 0;
  const healthStatus =
    input.status === "success"
      ? "healthy"
      : input.status === "partial"
        ? "partial"
        : consecutiveFailures >= 3
          ? "failing"
          : "retrying";

  const { error: sourceError } = await supabase
    .from("sources")
    .update({
      health_status: healthStatus,
      last_checked_at: input.checkedAt,
      last_success_at: input.status === "failed" ? existing?.last_success_at || null : input.checkedAt,
      consecutive_failures: consecutiveFailures,
      last_error: input.status === "failed" ? input.message || "采集失败，等待重试。" : null,
      updated_at: input.checkedAt,
    })
    .eq("id", input.sourceId);

  if (sourceError) throw sourceError;

  if (input.status === "failed") {
    const changedOfferCount = await recordOfferCollectionFailure(input.sourceId, input.checkedAt, input.message || null, consecutiveFailures);
    return { changedOfferCount };
  }

  let changedOfferCount = await clearOfferCollectionFailure(input.sourceId);

  if (input.status === "success" && input.fullSnapshot && input.seenOfferIds?.length) {
    changedOfferCount += await hideMissingOffersAsDelisted(input.sourceId, input.seenOfferIds, input.checkedAt);
  }

  return { changedOfferCount };
}

async function recordOfferCollectionFailure(
  sourceId: string,
  failedAt: string,
  message: string | null,
  consecutiveFailures: number,
): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return 0;

  const failureReason = message || "本次采集失败，旧报价暂不更新。";
  const { count: markedCount, error: markError } = await supabase
    .from("raw_offers")
    .update({
      last_failed_at: failedAt,
      failure_reason: failureReason,
      updated_at: failedAt,
    }, { count: "exact" })
    .eq("source_id", sourceId)
    .or(`failure_reason.is.null,failure_reason.not.ilike.${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`);

  if (markError) throw markError;

  const staleBefore = new Date(new Date(failedAt).getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (consecutiveFailures < 3) return markedCount || 0;

  const { count: expiredCount, error: expireError } = await supabase
    .from("raw_offers")
    .update({
      effective_status: "unavailable",
      freshness_status: "expired",
      last_failed_at: failedAt,
      failure_reason: `连续采集失败 ${consecutiveFailures} 次：${failureReason}`,
      updated_at: failedAt,
    }, { count: "exact" })
    .eq("source_id", sourceId)
    .or(`failure_reason.is.null,failure_reason.not.ilike.${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`)
    .or(`verified_at.is.null,verified_at.lt.${staleBefore}`);

  if (expireError) throw expireError;
  return (markedCount || 0) + (expiredCount || 0);
}

async function clearOfferCollectionFailure(sourceId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("raw_offers")
    .update({
      last_failed_at: null,
      failure_reason: null,
    }, { count: "exact" })
    .eq("source_id", sourceId)
    .or("last_failed_at.not.is.null,failure_reason.not.is.null")
    .or(`failure_reason.is.null,failure_reason.not.ilike.${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`);

  if (error) throw error;
  return count || 0;
}

async function hideMissingOffersAsDelisted(sourceId: string, seenOfferIds: string[], checkedAt: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return 0;

  const seen = new Set(seenOfferIds);
  const { data, error } = await supabase
    .from("raw_offers")
    .select("id")
    .eq("source_id", sourceId)
    .eq("hidden", false);

  if (error) throw error;

  const missingIds = (data || [])
    .map((row) => String(row.id))
    .filter((id) => !seen.has(id));

  let changedCount = 0;
  for (const ids of chunks(missingIds, 100)) {
    const { count, error: updateError } = await supabase
      .from("raw_offers")
      .update({
        hidden: true,
        status: "out_of_stock",
        source_status: "out_of_stock",
        effective_status: "unavailable",
        freshness_status: "fresh",
        verified_at: checkedAt,
        last_failed_at: null,
        failure_reason: "完整采集未再返回该商品，疑似已下架；如源站后续重新返回会自动恢复展示。",
        updated_at: checkedAt,
      }, { count: "exact" })
      .in("id", ids);

    if (updateError) throw updateError;
    changedCount += count || 0;
  }

  return changedCount;
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

export function toRawOfferRow(offer: RawOffer) {
  return {
    id: offer.id,
    source_id: offer.sourceId,
    source_name: offer.sourceName,
    source_store_name: offer.sourceStoreName,
    source_title: offer.sourceTitle,
    price: offer.price,
    currency: offer.currency,
    status: offer.status,
    url: normalizeOfferUrlForStorage(offer.url),
    tags: offer.tags,
    stock_count: offer.stockCount,
    hidden: offer.hidden ?? false,
    canonical_product_id: offer.canonicalProductId,
    category_slug: offer.categorySlug,
    captured_at: offer.capturedAt,
    source_updated_at: offer.sourceUpdatedAt,
    last_seen_at: offer.lastSeenAt || offer.capturedAt,
    verified_at: offer.verifiedAt,
    expires_at: offer.expiresAt,
    source_priority: offer.sourcePriority,
    confidence: offer.confidence,
    source_status: offer.status,
    effective_status: offer.effectiveStatus,
    freshness_status: offer.freshnessStatus,
    last_failed_at: offer.lastFailedAt,
    failure_reason: offer.failureReason,
    updated_at: new Date().toISOString(),
  };
}

function normalizeOfferUrlForStorage(value: string): string {
  const parsed = safeUrl(value);
  if (!parsed) return value;

  const commodityId = parsed.searchParams.get("commodity");
  if (!commodityId || !collectorHostsForKind("kami").has(normalizeHostname(parsed.hostname))) return value;

  parsed.pathname = `/item/${encodeURIComponent(commodityId)}`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function deriveBaseUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

function normalizeSourceEntryUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = normalizeHostname(parsed.hostname);
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function sourceEntryUrlCandidates(value: string | null | undefined): string[] {
  const normalized = normalizeSourceEntryUrl(value);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  if (normalized.endsWith("/")) candidates.add(normalized.replace(/\/+$/, ""));
  else candidates.add(`${normalized}/`);
  return [...candidates].filter(Boolean);
}

async function findSourceRowByEntryUrl(entryUrl: string | null | undefined): Promise<Record<string, unknown> | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const candidates = sourceEntryUrlCandidates(entryUrl);
  if (!candidates.length) return null;

  const { data, error } = await supabase
    .from("sources")
    .select("*")
    .in("entry_url", candidates)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

function mapSubmissionRow(row: Record<string, unknown>): ChannelSubmission {
  return {
    id: String(row.id),
    url: String(row.url || ""),
    name: row.name ? String(row.name) : null,
    contact: row.contact ? String(row.contact) : null,
    notes: row.notes ? String(row.notes) : null,
    parsedTitle: row.parsed_title ? String(row.parsed_title) : null,
    parsedMeta:
      row.parsed_meta && typeof row.parsed_meta === "object"
        ? (row.parsed_meta as Record<string, unknown>)
        : {},
    status: String(row.status || "pending") as SubmissionStatus,
    reviewerNote: row.reviewer_note ? String(row.reviewer_note) : null,
    approvedSourceId: row.approved_source_id ? String(row.approved_source_id) : null,
    submitterIp: row.submitter_ip ? String(row.submitter_ip) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

function mapOfferFeedbackRow(row: Record<string, unknown>): OfferFeedback {
  const reason = String(row.reason || "other") as OfferFeedbackReason;

  return {
    id: String(row.id),
    productId: row.product_id ? String(row.product_id) : null,
    productSlug: row.product_slug ? String(row.product_slug) : null,
    productName: row.product_name ? String(row.product_name) : null,
    offerId: row.offer_id ? String(row.offer_id) : null,
    sourceId: row.source_id ? String(row.source_id) : null,
    sourceName: row.source_name ? String(row.source_name) : null,
    sourceTitle: row.source_title ? String(row.source_title) : null,
    offerUrl: row.offer_url ? String(row.offer_url) : null,
    offerPrice: row.offer_price === null || row.offer_price === undefined ? null : Number(row.offer_price),
    offerCurrency: row.offer_currency ? String(row.offer_currency) : null,
    offerStatus: row.offer_status ? String(row.offer_status) as OfferStatus : null,
    offerCapturedAt: row.offer_captured_at ? String(row.offer_captured_at) : null,
    offerSourceUpdatedAt: row.offer_source_updated_at ? String(row.offer_source_updated_at) : null,
    offerLastSeenAt: row.offer_last_seen_at ? String(row.offer_last_seen_at) : null,
    reason,
    userExpectedAction: normalizeOfferFeedbackUserExpectedAction(row.user_expected_action),
    suggestedAction: normalizeOfferFeedbackSuggestedAction(row.suggested_action, reason),
    evidenceText: row.evidence_text ? String(row.evidence_text) : null,
    evidenceUrls: parseFeedbackEvidenceUrls(row.evidence_urls),
    aiReviewResult: row.ai_review_result && typeof row.ai_review_result === "object" ? row.ai_review_result as Record<string, unknown> : null,
    notes: row.notes ? String(row.notes) : null,
    contact: row.contact ? String(row.contact) : null,
    status: String(row.status || "pending") as OfferFeedbackStatus,
    reviewerNote: row.reviewer_note ? String(row.reviewer_note) : null,
    submitterIp: row.submitter_ip ? String(row.submitter_ip) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

function normalizeOfferFeedbackUserExpectedAction(value: unknown): OfferFeedbackUserExpectedAction {
  return value === "hide_offer" || value === "hide_source" || value === "unsure" || value === "recheck"
    ? value
    : "recheck";
}

function normalizeOfferFeedbackSuggestedAction(value: unknown, reason: OfferFeedbackReason): OfferFeedbackSuggestedAction {
  if (
    value === "recollect" ||
    value === "reclassify" ||
    value === "hide_offer" ||
    value === "hide_source" ||
    value === "todo" ||
    value === "ignore"
  ) {
    return value;
  }

  return inferOfferFeedbackSuggestedAction(reason);
}

function inferOfferFeedbackSuggestedAction(reason: OfferFeedbackReason): OfferFeedbackSuggestedAction {
  if (reason === "wrong_price" || reason === "stock_mismatch") return "recollect";
  if (reason === "item_removed" || reason === "fraud") return "hide_offer";
  if (reason === "bad_source") return "hide_source";
  if (reason === "wrong_category") return "reclassify";
  return "todo";
}

function parseFeedbackEvidenceUrls(value: unknown): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? tryParseJsonArray(value)
      : [];

  return items
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter((item) => item.length > 0)
    .slice(0, 10);
}

function sanitizeFeedbackEvidenceUrls(value: string[]): string[] {
  return value
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item) => {
      try {
        const url = new URL(item);
        return url.protocol === "http:" || url.protocol === "https:" || isFeedbackEvidenceReference(item);
      } catch {
        return false;
      }
    })
    .slice(0, 10);
}

function tryParseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapSiteFeedbackRow(row: Record<string, unknown>): SiteFeedback {
  return {
    id: String(row.id),
    type: String(row.type || "other") as SiteFeedbackType,
    message: String(row.message || ""),
    contact: row.contact ? String(row.contact) : null,
    pageUrl: row.page_url ? String(row.page_url) : null,
    status: String(row.status || "pending") as SiteFeedbackStatus,
    reviewerNote: row.reviewer_note ? String(row.reviewer_note) : null,
    submitterIp: row.submitter_ip ? String(row.submitter_ip) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  };
}

function mapSourceRow(row: Record<string, unknown>): Source {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    baseUrl: row.base_url ? String(row.base_url) : null,
    entryUrl: String(row.entry_url || row.base_url || ""),
    collectionMethod: String(row.collection_method || "http") as CollectionMethod,
    collectorKind: normalizeCollectorKind(row.collector_kind),
    enabled: Boolean(row.enabled),
    notes: row.notes ? String(row.notes) : null,
    healthStatus: row.health_status ? String(row.health_status) as Source["healthStatus"] : null,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    consecutiveFailures:
      row.consecutive_failures === null || row.consecutive_failures === undefined
        ? null
        : Number(row.consecutive_failures),
    lastError: row.last_error ? String(row.last_error) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

const MAX_FETCH_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const SHOP_API_TIMEOUT_MS = 8000;
const CURRENCY_PRICE_RE = /[¥￥]\s*\d+(?:\.\d{1,2})?/;
export async function parseSubmissionMetadata(rawUrl: string, context: SubmissionParseContext = {}): Promise<{
  url: string;
  parsedTitle: string | null;
  parsedMeta: Record<string, unknown>;
}> {
  const meta: Record<string, unknown> = {};
  let parsedTitle: string | null = null;
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("URL 格式不正确。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https。");
  }

  meta.domain = parsed.host;
  const initialSourceNameHint = context.submittedName || null;
  Object.assign(meta, analyzeSubmissionUrl(parsed, initialSourceNameHint));

  Object.assign(meta, await resolveSubmittedSource(parsed, initialSourceNameHint, null, context));
  parsedTitle = submittedProductTitleFromMeta(meta);
  if (parsedTitle) {
    Object.assign(meta, classifySubmissionTitleMeta(parsedTitle));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await safeFetch(parsed.toString(), {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "AIPriceHubBot/1.0 (+https://priceai.cc)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    meta.http_status = response.status;
    if (!response.ok) {
      meta.parse_error = `HTTP ${response.status}`;
      return { url: parsed.toString(), parsedTitle, parsedMeta: await enrichSubmissionReviewMeta(meta, context) };
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return { url: parsed.toString(), parsedTitle, parsedMeta: await enrichSubmissionReviewMeta(meta, context) };
    }

    const decoder = new TextDecoder("utf-8", { fatal: false });
    let received = 0;
    let html = "";
    while (received < MAX_FETCH_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (received >= MAX_FETCH_BYTES) break;
    }
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      parsedTitle = titleMatch[1]
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
    }

    if (parsedTitle) {
      Object.assign(meta, classifySubmissionTitleMeta(parsedTitle));
      if (!stringValue(meta.canonical_source_url)) {
        Object.assign(meta, await resolveSubmittedSource(parsed, parsedTitle, html, context));
      }
    }
    Object.assign(meta, refineSubmissionCollectorFromHtml(parsed, html, meta));
  } catch (error) {
    meta.parse_error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }

  return { url: parsed.toString(), parsedTitle, parsedMeta: await enrichSubmissionReviewMeta(meta, context) };
}

function classifySubmissionTitleMeta(title: string): Record<string, unknown> {
  const canonical = classifyOffer(title);
  return {
    canonical_product_id: canonical.id,
    platform: canonical.platform,
    product_type: canonical.productType,
  };
}

function submittedProductTitleFromMeta(meta: Record<string, unknown>): string | null {
  const preview = meta.submitted_product_preview;
  if (!preview || typeof preview !== "object" || Array.isArray(preview)) return null;
  return stringValue((preview as Record<string, unknown>).title);
}

function analyzeSubmissionUrl(parsed: URL, parsedTitle: string | null): Record<string, unknown> {
  const host = normalizeHostname(parsed.hostname);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const shopToken = getShopToken(parsed.pathname);
  const submittedUrlType = getSubmittedUrlType(parsed);
  const collectorKind = inferCollectorKind(host);
  const collectionMethod: CollectionMethod = collectorKind === "browser" ? "browser" : "http";
  const suggestedName = inferSubmittedSourceName(host, parsedTitle, shopToken);
  const canonicalSourceUrl = shopToken
    ? `${baseUrl}/shop/${encodeURIComponent(shopToken)}`
    : submittedUrlType === "source" && !isSharedShopApiPlatformHost(host)
      ? baseUrl
      : null;

  return {
    normalized_url: parsed.toString(),
    submitted_url_type: submittedUrlType,
    base_url: baseUrl,
    ...(canonicalSourceUrl ? { canonical_source_url: canonicalSourceUrl } : {}),
    shop_token: shopToken,
    suggested_source_name: suggestedName,
    suggested_source_id: inferSubmittedSourceId(host, suggestedName, shopToken),
    suggested_collection_method: collectionMethod,
    suggested_collector_kind: collectorKind,
    support_status:
      collectorKind === "browser"
        ? "needs_browser_probe"
        : "supported",
    support_reason:
      collectorKind === "browser"
        ? "暂未识别到公开接口，建议先试采集；失败后加入采集器待办。"
        : `已识别 ${collectorKind} 采集器，可通过自动采集拉取商品。`,
  };
}

async function resolveSubmittedSource(
  parsed: URL,
  parsedTitle: string | null,
  html: string | null = null,
  context: SubmissionParseContext = {},
): Promise<Record<string, unknown>> {
  const host = normalizeHostname(parsed.hostname);
  const baseMeta = analyzeSubmissionUrl(parsed, parsedTitle);
  const knownSourceMeta = await resolveSourceFromKnownOffer(parsed, parsedTitle, baseMeta);
  if (knownSourceMeta) return knownSourceMeta;

  const goodsKey = getSubmittedGoodsKey(parsed);
  if ((host !== "pay.ldxp.cn" && host !== "pay.qxvx.cn") || !goodsKey || getShopToken(parsed.pathname)) {
    return baseMeta;
  }

  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const tokenFromHtml = getShopTokenFromHtml(html);
  const goodsLookup = tokenFromHtml
    ? null
    : await fetchShopGoodsFromGoods(baseUrl, parsed.toString(), goodsKey);
  const tokenFromApi = goodsLookup?.token || null;
  const productMeta = goodsLookup ? shopGoodsLookupMeta(goodsLookup) : {};
  const sourceToken = tokenFromHtml || tokenFromApi;
  if (!sourceToken) {
    const peerSourceMeta = await resolveSourceFromPeerSubmission(parsed, parsedTitle, baseMeta, productMeta, context);
    if (peerSourceMeta) return peerSourceMeta;

    const detail = goodsLookup?.apiMessage || goodsLookup?.error;
    return {
      ...baseMeta,
      ...productMeta,
      submitted_url_type: "product",
      canonical_source_status: "unresolved",
      canonical_source_reason: detail
        ? `商品接口未返回店铺入口：${detail}`
        : "商品链接暂未反查到店铺入口；请重新解析，或手动填写真实店铺入口后再通过。",
    };
  }

  const shopUrl = goodsLookup?.sourceUrl || `${baseUrl}/shop/${encodeURIComponent(sourceToken)}`;
  const suggestedName = goodsLookup?.sourceName || inferSubmittedSourceName(host, parsedTitle, sourceToken);
  return {
    ...baseMeta,
    ...productMeta,
    submitted_url_type: "product",
    canonical_source_status: "resolved",
    canonical_source_reason: "已从商品链接反查到店铺入口，审核通过时会按渠道入口入库。",
    canonical_source_url: shopUrl,
    shop_token: sourceToken,
    suggested_source_name: suggestedName,
    suggested_source_id: inferSubmittedSourceId(host, suggestedName, sourceToken),
  };
}

async function enrichSubmissionReviewMeta(
  meta: Record<string, unknown>,
  context: SubmissionParseContext = {},
): Promise<Record<string, unknown>> {
  const next = { ...meta };
  const canonicalSourceUrl = stringValue(meta.canonical_source_url);
  const reviewUrl = canonicalSourceUrl || stringValue(meta.normalized_url);
  delete next.matched_existing_source;
  delete next.existing_source_id;
  delete next.existing_source_name;
  delete next.duplicate_pending_submission_id;
  delete next.duplicate_pending_submission_name;
  delete next.duplicate_pending_submission_url;
  delete next.duplicate_pending_reason;

  if (canonicalSourceUrl) {
    const existing = await findSourceRowByEntryUrl(canonicalSourceUrl);
    if (existing?.id) {
      next.matched_existing_source = true;
      next.existing_source_id = String(existing.id);
      next.existing_source_name = existing.name ? String(existing.name) : String(existing.id);
    }
  }

  if (!reviewUrl) return next;

  const duplicate = await findNewerPendingSubmissionByCanonicalUrl(reviewUrl, context);
  if (duplicate) {
    next.duplicate_pending_submission_id = duplicate.id;
    next.duplicate_pending_submission_name = duplicate.name || duplicate.parsedTitle || duplicate.suggestedSourceName || duplicate.url;
    next.duplicate_pending_submission_url = duplicate.url;
    next.duplicate_pending_reason = "same_canonical_source_url";
  }

  return next;
}

async function findNewerPendingSubmissionByCanonicalUrl(
  canonicalSourceUrl: string,
  context: SubmissionParseContext = {},
): Promise<{
  id: string;
  url: string;
  name: string | null;
  parsedTitle: string | null;
  suggestedSourceName: string | null;
  createdAt: string | null;
} | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const normalizedCanonical = normalizeSourceEntryUrl(canonicalSourceUrl);
  const normalizedSubmission = normalizeSubmissionUrlForReview(canonicalSourceUrl);
  if (!normalizedCanonical && !normalizedSubmission) return null;

  const submittedAt = context.submittedAt ? Date.parse(context.submittedAt) : NaN;
  const { data, error } = await supabase
    .from("channel_submissions")
    .select("id,url,name,parsed_title,parsed_meta,created_at,status")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  for (const row of data || []) {
    if (context.submissionId && row.id === context.submissionId) continue;

    const rowMeta = row.parsed_meta && typeof row.parsed_meta === "object" && !Array.isArray(row.parsed_meta)
      ? row.parsed_meta as Record<string, unknown>
      : {};
    const rowCanonicalUrl = stringValue(rowMeta.canonical_source_url) || stringValue(row.url);
    if (!rowCanonicalUrl) continue;
    const normalizedRowCanonical = normalizeSourceEntryUrl(rowCanonicalUrl);
    const normalizedRowSubmission = normalizeSubmissionUrlForReview(rowCanonicalUrl);
    const canonicalMatches = Boolean(normalizedCanonical && normalizedRowCanonical === normalizedCanonical);
    const submissionMatches = Boolean(normalizedSubmission && normalizedRowSubmission === normalizedSubmission);
    if (!canonicalMatches && !submissionMatches) {
      continue;
    }

    const rowCreatedAt = row.created_at ? String(row.created_at) : null;
    const rowCreatedMs = rowCreatedAt ? Date.parse(rowCreatedAt) : NaN;
    if (Number.isFinite(submittedAt) && Number.isFinite(rowCreatedMs) && rowCreatedMs <= submittedAt) continue;

    return {
      id: String(row.id),
      url: String(row.url || ""),
      name: row.name ? String(row.name) : null,
      parsedTitle: row.parsed_title ? String(row.parsed_title) : null,
      suggestedSourceName: stringValue(rowMeta.suggested_source_name),
      createdAt: rowCreatedAt,
    };
  }

  return null;
}

function normalizeSubmissionUrlForReview(value: string | null | undefined): string | null {
  const parsed = safeUrl(value);
  if (!parsed) return null;

  const host = normalizeHostname(parsed.hostname);
  const goodsKey = getSubmittedGoodsKey(parsed);
  if (goodsKey && isSharedShopApiPlatformHost(host)) {
    return `${parsed.protocol}//${host}/item/${encodeURIComponent(goodsKey)}`;
  }

  parsed.hostname = host;
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
}

async function resolveSourceFromPeerSubmission(
  parsed: URL,
  parsedTitle: string | null,
  baseMeta: Record<string, unknown>,
  productMeta: Record<string, unknown>,
  context: SubmissionParseContext,
): Promise<Record<string, unknown> | null> {
  const submittedName = context.submittedName || parsedTitle;
  if (!submittedName || isGenericSubmissionSourceName(submittedName)) return null;

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const host = normalizeHostname(parsed.hostname);
  const submittedAt = context.submittedAt ? Date.parse(context.submittedAt) : NaN;
  const since = Number.isFinite(submittedAt)
    ? new Date(submittedAt - 3 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("channel_submissions")
    .select("id,url,name,parsed_title,parsed_meta,created_at,status")
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;

  for (const row of data || []) {
    if (context.submissionId && row.id === context.submissionId) continue;

    const rowMeta = row.parsed_meta && typeof row.parsed_meta === "object" && !Array.isArray(row.parsed_meta)
      ? row.parsed_meta as Record<string, unknown>
      : {};
    const sourceUrl = stringValue(rowMeta.canonical_source_url) || stringValue(row.url);
    const source = safeUrl(sourceUrl);
    if (!source || normalizeHostname(source.hostname) !== host) continue;

    const shopToken = getShopToken(source.pathname);
    if (!shopToken) continue;

    const rowCreatedAt = row.created_at ? Date.parse(String(row.created_at)) : NaN;
    if (Number.isFinite(submittedAt) && Number.isFinite(rowCreatedAt)) {
      const diffMs = Math.abs(submittedAt - rowCreatedAt);
      if (diffMs > 3 * 24 * 60 * 60 * 1000) continue;
    }

    if (!matchesPeerSubmissionName(submittedName, [
      stringValue(row.name),
      stringValue(row.parsed_title),
      stringValue(rowMeta.suggested_source_name),
    ])) {
      continue;
    }

    const canonicalSourceUrl = normalizeSourceEntryUrl(source.toString()) || source.toString();
    const sourceName =
      stringValue(rowMeta.suggested_source_name) ||
      stringValue(row.name) ||
      inferSubmittedSourceName(host, parsedTitle, shopToken);

    return {
      ...baseMeta,
      ...productMeta,
      submitted_url_type: "product",
      canonical_source_status: "resolved",
      canonical_source_reason: "商品接口未返回店铺入口，已按同名待审店铺链接补齐渠道入口。",
      canonical_source_url: canonicalSourceUrl,
      shop_token: shopToken,
      suggested_source_name: sourceName,
      suggested_source_id: inferSubmittedSourceId(host, sourceName, shopToken),
      duplicate_submission_id: String(row.id),
      duplicate_submission_reason: "same_pending_shop_submission",
    };
  }

  return null;
}

function matchesPeerSubmissionName(submittedName: string, candidates: Array<string | null>): boolean {
  const normalized = normalizeSubmissionNameForMatch(submittedName);
  if (!normalized || normalized.length < 2) return false;
  return candidates.some((candidate) => normalizeSubmissionNameForMatch(candidate) === normalized);
}

function normalizeSubmissionNameForMatch(value: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fa5]+/gu, "")
    .trim();
}

function isGenericSubmissionSourceName(value: string): boolean {
  const normalized = normalizeSubmissionNameForMatch(value);
  return new Set([
    "ai",
    "openai",
    "chatgpt",
    "gpt",
    "gptplus",
    "plus",
    "claude",
    "gemini",
    "账号",
    "卡网",
    "商店",
    "小店",
  ]).has(normalized);
}

async function resolveSourceFromKnownOffer(
  parsed: URL,
  parsedTitle: string | null,
  baseMeta: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  if (getSubmittedUrlType(parsed) !== "product") return null;

  const source = await findSourceFromKnownOfferUrl(parsed.toString());
  if (!source) return null;

  const canonicalSourceUrl = normalizeSourceEntryUrl(source.entryUrl) || source.entryUrl;
  const sourceUrl = safeUrl(canonicalSourceUrl);
  const sourceHost = sourceUrl ? normalizeHostname(sourceUrl.hostname) : normalizeHostname(parsed.hostname);
  const shopToken = sourceUrl ? getShopToken(sourceUrl.pathname) : null;

  return {
    ...baseMeta,
    submitted_url_type: "product",
    canonical_source_status: "resolved",
    canonical_source_reason: "已从历史报价反查到店铺入口，审核通过时会合并到已有渠道。",
    canonical_source_url: canonicalSourceUrl,
    shop_token: shopToken,
    suggested_source_name: source.name || inferSubmittedSourceName(sourceHost, parsedTitle, shopToken),
    suggested_source_id: source.id,
    suggested_collection_method: source.collectionMethod,
    suggested_collector_kind: source.collectorKind || inferCollectorKind(sourceHost),
  };
}

function inferCollectorKind(host: string): string {
  return inferCollectorKindFromHost(host, host, "browser") || "browser";
}

function refineSubmissionCollectorFromHtml(
  parsed: URL,
  html: string,
  currentMeta: Record<string, unknown>,
): Record<string, unknown> {
  const currentKind = normalizeCollectorKind(currentMeta.suggested_collector_kind);
  if (currentKind && currentKind !== "browser" && currentKind !== "unsupported") return {};

  const detectedKind = inferCollectorKindFromSubmissionFingerprint(parsed, html);
  if (!detectedKind || detectedKind === "browser" || detectedKind === "unsupported") return {};

  return {
    suggested_collection_method: "http",
    suggested_collector_kind: detectedKind,
    support_status: "fingerprint_supported",
    support_reason: `页面指纹识别到 ${detectedKind} 采集器，建议试采集确认后入库。`,
  };
}

function inferCollectorKindFromSubmissionFingerprint(parsed: URL, html: string): CollectorKind | null {
  const hostKind = inferCollectorKindFromHost(parsed.hostname);
  if (hostKind) return hostKind;

  const lower = html.toLowerCase();
  if (lower.includes("/user/api/index/commodity") || (lower.includes("commodity_name") && lower.includes("/assets/static/acg.js"))) {
    return "kami";
  }
  if (lower.includes("/api/v1/public/products") || lower.includes("dujiaoka")) return "dujiao";
  if (lower.includes("/shop/user/products")) return "shopUserProductsApi";
  if (lower.includes("mooncake_catalog") || lower.includes("mooncake-official-media/catalog")) return "mooncakeCatalog";
  if (lower.includes("/api/shop/products")) return "ikunloveApi";
  if (lower.includes("/api/products")) return "publicProductsApi";
  if (/card position-relative/i.test(html) && /card-title/i.test(html) && /\/buy\/\d+/i.test(html)) return "unicornHtml";
  if (/atelier-catalog-card/i.test(html)) return "beibeiHtml";
  if (parsed.pathname.match(/\/(?:product|products|goods|item)\//i) && CURRENCY_PRICE_RE.test(html)) return "genericHtml";
  return null;
}

function inferSubmittedSourceName(host: string, parsedTitle: string | null, shopToken: string | null): string {
  if (host === "ai666.dnxb.cc") return "T佬的gmail批发渠道";
  if (host === "pay.ldxp.cn" && shopToken) return `LDXP / ${shopToken}`;
  if (host === "pay.qxvx.cn" && shopToken) return `QXVX / ${shopToken}`;
  if (host === "kapay.shop") return "Auto Subscribe / kapay.shop";
  if (host === "shop.auto-subscribe.com") return "Auto Subscribe";
  if (host === "zhang520.store") return "zhang520.store";
  if (host === "shopcardai.click") return "购物 - DN发卡网";
  if (host === "ldxp.cn" && shopToken) return `LDXP / ${shopToken}`;
  if (host === "ldxp.cn") return "ldxp.cn";
  if (host === "ikunlove.best") return "AI 商品站";
  if (host === "getgpt.pro") return parsedTitle || "ChatGPT Plus 充值服务|GPT Pro官方充值|GPT5代充|Codex充值";
  if (host === "aifk.opensora.de") return "AUTO FK";
  if (host === "aisou.pro") return "Aisou智充";
  if (host === "caowo.store") return "GPT专卖-cw";
  if (host === "makerich.club") return "AI创富俱乐部";
  if (parsedTitle) return parsedTitle;
  return host;
}

function getSubmittedUrlType(parsed: URL): "source" | "product" | "unknown" {
  if (getShopToken(parsed.pathname)) return "source";
  if (getSubmittedGoodsKey(parsed)) return "product";
  if (parsed.pathname.match(/\/products\/[^/?#]+/i)) return "product";
  return parsed.pathname === "/" || parsed.pathname === "" ? "source" : "unknown";
}

function inferSubmittedSourceId(host: string, sourceName: string, shopToken: string | null): string {
  if (host === "ai666.dnxb.cc") return "ai666-gmail-wholesale";
  if (host === "pay.ldxp.cn") return `ldxp-${slugify(shopToken || sourceName) || stableId(host, sourceName)}`;
  if (host === "pay.qxvx.cn") return `qxvx-${slugify(shopToken || sourceName) || stableId(host, sourceName)}`;
  if (host === "shop.auto-subscribe.com") return "auto-subscribe";
  if (host === "zhang520.store") return "zhang520-store";
  if (host === "shopcardai.click") return "购物-dn发卡网";
  if (host === "ldxp.cn") return "ldxp-cn";
  if (host === "ikunlove.best") return "ai-商品站";
  if (host === "getgpt.pro") return "chatgpt-plus-充值服务-gpt-pro官方充值-gpt5代充-codex充值";
  if (host === "aifk.opensora.de") return "opensora-aifk";
  if (host === "aisou.pro") return "aisou-pro";
  if (host === "caowo.store") return "caowo-store";
  if (host === "makerich.club") return "makerich-club";
  return slugify(sourceName) || slugify(host) || stableId(host, sourceName);
}

function getShopToken(pathname: string): string | null {
  const match = pathname.match(/\/shop\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getGoodsKey(pathname: string): string | null {
  const match = pathname.match(/\/item\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getSubmittedGoodsKey(parsed: URL): string | null {
  const raw = getGoodsKey(parsed.pathname) || parsed.searchParams.get("commodity") || parsed.searchParams.get("id");
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function getShopTokenFromHtml(html: string | null): string | null {
  if (!html) return null;
  const hrefMatch = html.match(/href=["'][^"']*\/shop\/([^"'/?#]+)[^"']*["']/i);
  if (hrefMatch?.[1]) return decodeURIComponent(hrefMatch[1]);
  const tokenMatch = html.match(/["']token["']\s*:\s*["']([^"']+)["']/i);
  if (tokenMatch?.[1]) return tokenMatch[1];
  return null;
}

async function fetchShopGoodsFromGoods(baseUrl: string, itemUrl: string, goodsKey: string): Promise<ShopGoodsLookupResult | null> {
  if (!goodsKey) return null;

  let lastResult: ShopGoodsLookupResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(`${baseUrl}/shopApi/Shop/goodsInfo`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/plain, */*",
          "user-agent": attempt === 0
            ? "AIPriceHubBot/1.0 (+https://priceai.cc)"
            : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          origin: baseUrl,
          referer: itemUrl,
          visitorid: `review${Math.random().toString(36).slice(2, 10)}`,
        },
        body: JSON.stringify({ goods_key: goodsKey, trade_no: "" }),
        signal: AbortSignal.timeout(SHOP_API_TIMEOUT_MS),
      });
      const payload = await response.json().catch(() => null);
      lastResult = getShopGoodsLookupResult(payload, {
        baseUrl,
        goodsKey,
        checkedAt,
        httpStatus: response.status,
      });
      if (lastResult.token) return lastResult;
    } catch (error) {
      lastResult = {
        checkedAt,
        goodsKey,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return lastResult;
}

function getShopGoodsLookupResult(
  payload: unknown,
  context: { baseUrl: string; goodsKey: string; checkedAt: string; httpStatus?: number },
): ShopGoodsLookupResult {
  const result: ShopGoodsLookupResult = {
    checkedAt: context.checkedAt,
    goodsKey: context.goodsKey,
    httpStatus: context.httpStatus,
  };
  if (!payload || typeof payload !== "object") {
    return { ...result, error: "商品接口未返回 JSON。" };
  }

  const record = payload as Record<string, unknown>;
  result.apiCode = stringValue(record.code) || numberValue(record.code);
  result.apiMessage = stringValue(record.msg) || stringValue(record.message);

  const data = record.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  const dataRecord = data as Record<string, unknown>;
  const user = dataRecord.user && typeof dataRecord.user === "object" && !Array.isArray(dataRecord.user)
    ? dataRecord.user as Record<string, unknown>
    : {};

  const token = stringValue(user.token) || shopTokenFromUserLink(user.link);
  result.token = token;
  result.sourceUrl = token
    ? stringValue(user.link) || `${context.baseUrl}/shop/${encodeURIComponent(token)}`
    : stringValue(user.link);
  result.sourceName = stringValue(user.nickname);
  result.title = stringValue(dataRecord.name);
  result.price = numberValue(dataRecord.price);
  result.realPrice = numberValue(dataRecord.real_price);
  result.status = stringValue(dataRecord.status) || (numberValue(dataRecord.status) !== null ? String(numberValue(dataRecord.status)) : null);
  result.descriptionPreview = summarizeHtmlText(stringValue(dataRecord.description));

  const category = dataRecord.category;
  if (category && typeof category === "object" && !Array.isArray(category)) {
    result.category = stringValue((category as Record<string, unknown>).name);
  } else {
    result.category = stringValue(category);
  }

  return result;
}

function shopTokenFromUserLink(value: unknown): string | null {
  const link = stringValue(value);
  if (!link) return null;
  const parsed = safeUrl(link);
  return parsed ? getShopToken(parsed.pathname) : null;
}

function shopGoodsLookupMeta(lookup: ShopGoodsLookupResult): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    shop_api_checked_at: lookup.checkedAt,
    shop_api_goods_key: lookup.goodsKey,
  };
  if (typeof lookup.httpStatus === "number") meta.shop_api_http_status = lookup.httpStatus;
  if (lookup.apiCode !== undefined && lookup.apiCode !== null) meta.shop_api_code = lookup.apiCode;
  if (lookup.apiMessage) meta.shop_api_message = lookup.apiMessage;
  if (lookup.error) meta.shop_api_error = lookup.error;

  const preview: Record<string, unknown> = {
    checkedAt: lookup.checkedAt,
    goodsKey: lookup.goodsKey,
    currency: "CNY",
  };
  if (lookup.title) preview.title = lookup.title;
  if (lookup.sourceName) preview.sourceName = lookup.sourceName;
  if (lookup.sourceUrl) preview.sourceUrl = lookup.sourceUrl;
  if (typeof lookup.price === "number") preview.price = lookup.price;
  if (typeof lookup.realPrice === "number") preview.realPrice = lookup.realPrice;
  if (lookup.status) {
    preview.status = lookup.status;
    preview.statusText = shopGoodsStatusLabel(lookup.status);
  }
  if (lookup.category) preview.category = lookup.category;
  if (lookup.descriptionPreview) preview.descriptionPreview = lookup.descriptionPreview;
  if (lookup.apiMessage) preview.apiMessage = lookup.apiMessage;

  if (Object.keys(preview).length > 3) meta.submitted_product_preview = preview;
  return meta;
}

function shopGoodsStatusLabel(value: string): string {
  if (value === "1" || value.toLowerCase() === "available") return "上架";
  if (value === "0" || value.toLowerCase() === "unavailable") return "未上架";
  return value;
}

function summarizeHtmlText(value: string | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 260) : null;
}

async function findSourceFromKnownOfferUrl(itemUrl: string): Promise<Source | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const candidates = knownOfferUrlCandidates(itemUrl);
  if (!candidates.length) return null;

  const { data: exactRows, error: exactError } = await supabase
    .from("raw_offers")
    .select("source_id,url,last_seen_at,captured_at")
    .in("url", candidates)
    .not("source_id", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(1);
  if (exactError) throw exactError;

  const exactSourceId = exactRows?.[0]?.source_id ? String(exactRows[0].source_id) : null;
  if (exactSourceId) return getSourceById(exactSourceId);

  const parsed = safeUrl(itemUrl);
  if (!parsed) return null;

  const pathPattern = `%://${parsed.host}${parsed.pathname}%`;
  const { data: pathRows, error: pathError } = await supabase
    .from("raw_offers")
    .select("source_id,url,last_seen_at,captured_at")
    .ilike("url", pathPattern)
    .not("source_id", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(1);
  if (pathError) throw pathError;

  const pathSourceId = pathRows?.[0]?.source_id ? String(pathRows[0].source_id) : null;
  return pathSourceId ? getSourceById(pathSourceId) : null;
}

function knownOfferUrlCandidates(value: string): string[] {
  const parsed = safeUrl(value);
  if (!parsed) return [value];

  const candidates = new Set<string>([parsed.toString()]);
  parsed.hash = "";
  candidates.add(parsed.toString());
  parsed.search = "";
  candidates.add(parsed.toString());
  return [...candidates].filter(Boolean);
}

function safeUrl(value: string | null | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function isSharedShopApiPlatformHost(host: string): boolean {
  return host === "pay.ldxp.cn" || host === "pay.qxvx.cn" || host === "ldxp.cn" || host === "catfk.com";
}

function normalizeCollectorKind(value: unknown): CollectorKind | null {
  return normalizeRegisteredCollectorKind(value);
}

function isRuntimeCollectionIssue(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("验证") ||
    text.includes("风控") ||
    text.includes("captcha") ||
    text.includes("challenge") ||
    text.includes("waf") ||
    text.includes("安全")
  );
}

export async function createSubmission(input: {
  url: string;
  name?: string | null;
  contact?: string | null;
  notes?: string | null;
  honeypot?: string | null;
  submitterIp?: string | null;
  rateLimitPerHour?: number;
}): Promise<{ id: string; status: SubmissionStatus } | { ignored: true }> {
  if (input.honeypot) {
    return { ignored: true };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法接受提交。");

  let normalizedUrl: string;
  try {
    const parsed = new URL(input.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("仅支持 http/https。");
    }
    normalizedUrl = parsed.toString();
  } catch {
    throw new Error("URL 格式不正确。");
  }

  const ip = input.submitterIp || null;
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: dupRows } = await supabase
    .from("channel_submissions")
    .select("id")
    .eq("url", normalizedUrl)
    .gte("created_at", fiveMinAgo)
    .limit(1);
  if (dupRows && dupRows.length) {
    throw new Error("该链接刚刚被提交过，请稍后再试。");
  }

  if (ip) {
    const rateLimitPerHour = input.rateLimitPerHour ?? 5;
    const { count } = await supabase
      .from("channel_submissions")
      .select("id", { count: "exact", head: true })
      .eq("submitter_ip", ip)
      .gte("created_at", oneHourAgo);
    if ((count || 0) >= rateLimitPerHour) {
      throw new Error("提交过于频繁，请稍后再试。");
    }
  }

  let parsedTitle: string | null = null;
  let parsedMeta: Record<string, unknown> = {};
  try {
    const parsed = await parseSubmissionMetadata(normalizedUrl, {
      submittedName: input.name?.trim() || null,
    });
    parsedTitle = parsed.parsedTitle || submittedProductTitleFromMeta(parsed.parsedMeta);
    parsedMeta = parsed.parsedMeta;
  } catch (error) {
    parsedMeta = buildFallbackSubmissionMeta(normalizedUrl, error);
  }

  const canonicalSourceUrl = stringValue(parsedMeta.canonical_source_url) || stringValue(parsedMeta.normalized_url) || normalizedUrl;
  const duplicatePending = await findNewerPendingSubmissionByCanonicalUrl(canonicalSourceUrl);
  if (duplicatePending) {
    throw new Error("该渠道已有待审记录，请勿重复提交。");
  }

  const id = stableId("submission", normalizedUrl, ip || "", Date.now().toString());
  const { error } = await supabase.from("channel_submissions").insert({
    id,
    url: normalizedUrl,
    name: input.name?.trim() || null,
    contact: input.contact?.trim() || null,
    notes: input.notes?.trim() || null,
    parsed_title: parsedTitle,
    parsed_meta: parsedMeta,
    status: "pending",
    submitter_ip: ip,
  });
  if (error) throw error;

  return { id, status: "pending" };
}

export async function createOfferFeedback(input: {
  productId?: string | null;
  productSlug?: string | null;
  productName?: string | null;
  offerId?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  sourceTitle?: string | null;
  offerUrl?: string | null;
  offerPrice?: number | null;
  offerCurrency?: string | null;
  offerStatus?: OfferStatus | null;
  offerCapturedAt?: string | null;
  offerSourceUpdatedAt?: string | null;
  offerLastSeenAt?: string | null;
  reason: OfferFeedbackReason;
  userExpectedAction?: OfferFeedbackUserExpectedAction | null;
  suggestedAction?: OfferFeedbackSuggestedAction | null;
  evidenceText?: string | null;
  evidenceUrls?: string[] | null;
  notes?: string | null;
  contact?: string | null;
  submitterIp?: string | null;
  rateLimitPerHour?: number;
}): Promise<{ id: string; status: "pending" }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法接受反馈。");

  const ip = input.submitterIp || null;
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  if (input.offerId) {
    const { data: dupRows } = await supabase
      .from("offer_feedback")
      .select("id")
      .eq("offer_id", input.offerId)
      .eq("reason", input.reason)
      .gte("created_at", fiveMinAgo)
      .limit(1);
    if (dupRows && dupRows.length) {
      throw new Error("这条问题刚刚被反馈过，请稍后再试。");
    }
  }

  if (ip) {
    const rateLimitPerHour = input.rateLimitPerHour ?? 10;
    const { count } = await supabase
      .from("offer_feedback")
      .select("id", { count: "exact", head: true })
      .eq("submitter_ip", ip)
      .gte("created_at", oneHourAgo);
    if ((count || 0) >= rateLimitPerHour) {
      throw new Error("反馈过于频繁，请稍后再试。");
    }
  }

  const id = stableId("offer-feedback", input.offerId || "", input.reason, ip || "", Date.now().toString());
  const userExpectedAction = normalizeOfferFeedbackUserExpectedAction(input.userExpectedAction);
  const suggestedAction = input.suggestedAction
    ? normalizeOfferFeedbackSuggestedAction(input.suggestedAction, input.reason)
    : inferOfferFeedbackSuggestedAction(input.reason);
  const { error } = await supabase.from("offer_feedback").insert({
    id,
    product_id: input.productId || null,
    product_slug: input.productSlug || null,
    product_name: input.productName || null,
    offer_id: input.offerId || null,
    source_id: input.sourceId || null,
    source_name: input.sourceName || null,
    source_title: input.sourceTitle || null,
    offer_url: input.offerUrl || null,
    offer_price: input.offerPrice ?? null,
    offer_currency: input.offerCurrency || null,
    offer_status: input.offerStatus || null,
    offer_captured_at: input.offerCapturedAt || null,
    offer_source_updated_at: input.offerSourceUpdatedAt || null,
    offer_last_seen_at: input.offerLastSeenAt || null,
    reason: input.reason,
    user_expected_action: userExpectedAction,
    suggested_action: suggestedAction,
    evidence_text: input.evidenceText?.trim() || null,
    evidence_urls: sanitizeFeedbackEvidenceUrls(input.evidenceUrls || []),
    notes: input.notes?.trim() || null,
    contact: input.contact?.trim() || null,
    status: "pending",
    submitter_ip: ip,
  });
  if (error) throw error;

  return { id, status: "pending" };
}

export async function listOfferFeedback(status: OfferFeedbackStatus = "pending"): Promise<OfferFeedback[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("offer_feedback")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).map(mapOfferFeedbackRow);
}

export async function updateOfferFeedbackStatus(input: {
  id: string;
  status: OfferFeedbackStatus;
  reviewerNote?: string | null;
}): Promise<OfferFeedback> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const reviewedAt = input.status === "pending" ? null : new Date().toISOString();
  const { data, error } = await supabase
    .from("offer_feedback")
    .update({
      status: input.status,
      reviewer_note: input.reviewerNote?.trim() || null,
      reviewed_at: reviewedAt,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("反馈记录不存在。");

  return mapOfferFeedbackRow(data);
}

export async function createSiteFeedback(input: {
  type: SiteFeedbackType;
  message: string;
  contact?: string | null;
  pageUrl?: string | null;
  submitterIp?: string | null;
  rateLimitPerHour?: number;
}): Promise<{ id: string; status: "pending" }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法接受反馈。");

  const ip = input.submitterIp || null;
  const message = input.message.trim();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  if (!message) throw new Error("请填写反馈内容。");

  let duplicateQuery = supabase
    .from("site_feedback")
    .select("id")
    .eq("type", input.type)
    .eq("message", message)
    .gte("created_at", fiveMinAgo)
    .limit(1);
  if (ip) duplicateQuery = duplicateQuery.eq("submitter_ip", ip);

  const { data: dupRows } = await duplicateQuery;
  if (dupRows && dupRows.length) {
    throw new Error("这条意见刚刚提交过，请稍后再试。");
  }

  if (ip) {
    const rateLimitPerHour = input.rateLimitPerHour ?? 8;
    const { count } = await supabase
      .from("site_feedback")
      .select("id", { count: "exact", head: true })
      .eq("submitter_ip", ip)
      .gte("created_at", oneHourAgo);
    if ((count || 0) >= rateLimitPerHour) {
      throw new Error("反馈过于频繁，请稍后再试。");
    }
  }

  const id = stableId("site-feedback", input.type, ip || "", Date.now().toString());
  const { error } = await supabase.from("site_feedback").insert({
    id,
    type: input.type,
    message,
    contact: input.contact?.trim() || null,
    page_url: input.pageUrl || null,
    status: "pending",
    submitter_ip: ip,
  });
  if (error) throw error;

  return { id, status: "pending" };
}

export async function listSiteFeedback(status: SiteFeedbackStatus = "pending"): Promise<SiteFeedback[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("site_feedback")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).map(mapSiteFeedbackRow);
}

export async function updateSiteFeedbackStatus(input: {
  id: string;
  status: SiteFeedbackStatus;
  reviewerNote?: string | null;
}): Promise<SiteFeedback> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const reviewedAt = input.status === "pending" ? null : new Date().toISOString();
  const { data, error } = await supabase
    .from("site_feedback")
    .update({
      status: input.status,
      reviewer_note: input.reviewerNote?.trim() || null,
      reviewed_at: reviewedAt,
    })
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("反馈记录不存在。");

  return mapSiteFeedbackRow(data);
}

function buildFallbackSubmissionMeta(url: string, error: unknown): Record<string, unknown> {
  try {
    const parsed = new URL(url);
    return {
      domain: parsed.host,
      ...analyzeSubmissionUrl(parsed, null),
      parse_error: error instanceof Error ? error.message : String(error),
    };
  } catch {
    return { parse_error: error instanceof Error ? error.message : String(error) };
  }
}

export async function listSubmissions(status: SubmissionStatus = "pending"): Promise<ChannelSubmission[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("channel_submissions")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).map(mapSubmissionRow);
}

export async function reparseSubmission(id: string): Promise<ChannelSubmission> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const { data: row, error } = await supabase
    .from("channel_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("提交记录不存在。");
  if (row.status !== "pending") throw new Error("该提交已被处理。");

  const submission = mapSubmissionRow(row);
  let parsedTitle: string | null = null;
  let parsedMeta: Record<string, unknown> = {};
  try {
    const parsed = await parseSubmissionMetadata(submission.url, {
      submissionId: submission.id,
      submittedName: submission.name,
      submittedAt: submission.createdAt,
    });
    parsedTitle = parsed.parsedTitle || submittedProductTitleFromMeta(parsed.parsedMeta);
    parsedMeta = parsed.parsedMeta;
  } catch (parseError) {
    parsedMeta = buildFallbackSubmissionMeta(submission.url, parseError);
  }

  const previousMeta = submission.parsedMeta || {};
  const nextMeta = {
    ...parsedMeta,
    probe_result: previousMeta.probe_result,
    probe_checked_at: previousMeta.probe_checked_at,
    reparsed_at: new Date().toISOString(),
  };
  if (!nextMeta.probe_result) delete nextMeta.probe_result;
  if (!nextMeta.probe_checked_at) delete nextMeta.probe_checked_at;

  const { data: updated, error: updateError } = await supabase
    .from("channel_submissions")
    .update({
      parsed_title: parsedTitle,
      parsed_meta: nextMeta,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error("提交记录不存在或已被处理。");

  return mapSubmissionRow(updated);
}

export async function recordSubmissionProbeResult(
  id: string,
  result: SubmissionProbeResult,
): Promise<ChannelSubmission> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const { data: row, error } = await supabase
    .from("channel_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("提交记录不存在。");
  if (row.status !== "pending") throw new Error("该提交已被处理。");

  const submission = mapSubmissionRow(row);
  const checkedAt = new Date().toISOString();
  const success = result.status === "success" && Number(result.offerCount || 0) > 0;
  const collectorKind = normalizeCollectorKind(result.kind) || normalizeCollectorKind(submission.parsedMeta.suggested_collector_kind);
  const runtimeIssue = !success && isRuntimeCollectionIssue(result.message || "");
  const knownCollector = collectorKind && collectorKind !== "browser" && collectorKind !== "unsupported";
  const supportStatus = success
    ? "probe_success"
    : runtimeIssue && knownCollector
      ? "known_collector_probe_failed"
      : knownCollector
        ? "known_collector_probe_failed"
        : "needs_collector";
  const supportReason = success
    ? `试采集成功，识别到 ${Number(result.offerCount || 0)} 条报价。`
    : runtimeIssue && knownCollector
      ? `已识别 ${collectorKind} 采集器，但本次运行触发验证或风控；可先确认解析器入库，后续云端和本地采集脚本都会继续尝试。`
      : result.message || "当前采集器暂不支持，需要加入采集器待办后补解析脚本。";
  const resolvedSourceMeta = success
    ? resolveSubmissionSourceFromProbeResult(submission, result, collectorKind)
    : {};
  const nextMeta = await enrichSubmissionReviewMeta({
    ...submission.parsedMeta,
    ...resolvedSourceMeta,
    probe_result: result,
    probe_checked_at: checkedAt,
    suggested_collector_kind: collectorKind || submission.parsedMeta.suggested_collector_kind,
    review_stage: success ? "ready_to_approve" : knownCollector ? "known_collector_probe_failed" : "needs_collector_review",
    support_status: supportStatus,
    support_reason: supportReason,
  });

  const { data: updated, error: updateError } = await supabase
    .from("channel_submissions")
    .update({ parsed_meta: nextMeta })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error("提交记录不存在或已被处理。");

  return mapSubmissionRow(updated);
}

export async function markSubmissionCollectorTodo(id: string, note?: string | null): Promise<ChannelSubmission> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const { data: row, error } = await supabase
    .from("channel_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("提交记录不存在。");
  if (row.status !== "pending") throw new Error("该提交已被处理。");

  const submission = mapSubmissionRow(row);
  const todoAt = new Date().toISOString();
  const reason = note?.trim() || "当前没有可用自动采集器，需要补解析脚本后重新试采集。";
  const nextMeta = {
    ...submission.parsedMeta,
    review_stage: "collector_todo",
    collector_todo_at: todoAt,
    collector_todo_reason: reason,
    support_status: "needs_collector",
    support_reason: reason,
  };

  const { data: updated, error: updateError } = await supabase
    .from("channel_submissions")
    .update({
      parsed_meta: nextMeta,
      reviewer_note: reason,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error("提交记录不存在或已被处理。");

  return mapSubmissionRow(updated);
}

export async function approveSubmission(
  id: string,
  overrides: {
    name?: string | null;
    sourceUrl?: string | null;
    collectionMethod?: CollectionMethod;
    collectorKind?: CollectorKind | null;
  } = {},
): Promise<{ submission: ChannelSubmission; source: Source; importedOfferCount: number; matchedExistingSource: boolean }> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const { data: row, error } = await supabase
    .from("channel_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("提交记录不存在。");
  if (row.status !== "pending") throw new Error("该提交已被处理。");

  const submission = mapSubmissionRow(row);
  const manualSourceUrl = normalizeOverrideSourceUrl(overrides.sourceUrl);
  const canonicalSourceUrl = manualSourceUrl || getCanonicalSourceUrl(submission.parsedMeta) || submission.url;
  const duplicatePending = await findNewerPendingSubmissionByCanonicalUrl(canonicalSourceUrl, {
    submissionId: submission.id,
    submittedName: submission.name,
    submittedAt: submission.createdAt,
  });
  if (duplicatePending) {
    throw new Error(`该渠道已有更新的待审记录：${duplicatePending.name || duplicatePending.parsedTitle || duplicatePending.url}。请处理主记录或拒绝重复提交。`);
  }
  const baseUrl = deriveBaseUrl(canonicalSourceUrl);
  const suggestedMethod = getSuggestedCollectionMethod(submission.parsedMeta);
  const suggestedCollectorKind = getSuggestedCollectorKind(submission.parsedMeta);
  const selectedCollectorKind = overrides.collectorKind || suggestedCollectorKind;
  const suggestedId = getSuggestedSourceId(submission.parsedMeta);
  const existingSourceId = getExistingSourceId(submission.parsedMeta);
  const existingSource = await findExistingSourceForApproval(existingSourceId || suggestedId, canonicalSourceUrl);
  const fallbackName =
    overrides.name?.trim() ||
    submission.name ||
    getSuggestedSourceName(submission.parsedMeta) ||
    submission.parsedTitle ||
    (baseUrl ? new URL(baseUrl).host : submission.url);

  let source =
    existingSource ||
    await upsertSource({
      id: suggestedId,
      name: fallbackName,
      entryUrl: canonicalSourceUrl,
      baseUrl,
      collectionMethod: overrides.collectionMethod || suggestedMethod || "http",
      collectorKind: selectedCollectorKind,
      enabled: true,
      notes: submission.notes ? `用户提交：${submission.notes}` : "由用户提交渠道入口审核通过。",
    });

  if (existingSource && selectedCollectorKind) {
    source = await upsertSource({
      id: existingSource.id,
      name: existingSource.name || fallbackName,
      entryUrl: canonicalSourceUrl,
      baseUrl,
      collectionMethod: overrides.collectionMethod || existingSource.collectionMethod || suggestedMethod || "http",
      collectorKind: selectedCollectorKind || existingSource.collectorKind || null,
      enabled: true,
      notes: existingSource.notes,
    });
  }

  const importedOffers = getProbeOffersForImport(submission.parsedMeta, source, canonicalSourceUrl);
  const hasRunnableCollector =
    selectedCollectorKind &&
    selectedCollectorKind !== "auto" &&
    selectedCollectorKind !== "browser" &&
    selectedCollectorKind !== "unsupported";
  if (!existingSource && !importedOffers.length && !hasRunnableCollector) {
    throw new Error("请先试采集成功；或手动指定一个已支持采集器后再通过。");
  }

  const importedOfferResult = importedOffers.length
    ? await upsertRawOffers(importedOffers, { collectionMethod: source.collectionMethod === "manual" ? "http" : source.collectionMethod })
    : { receivedCount: 0, writtenCount: 0, unchangedCount: 0, refreshedCount: 0 };
  const importedOfferCount = importedOfferResult.receivedCount;

  const reviewedAt = new Date().toISOString();
  if (importedOfferCount) {
    const { error: logError } = await supabase.from("crawl_runs").insert({
      id: stableId(source.name, submission.url, reviewedAt),
      source_id: source.id,
      source_name: source.name,
      mode: source.collectionMethod === "manual" ? "http" : source.collectionMethod,
      status: "success",
      started_at: reviewedAt,
      finished_at: reviewedAt,
      success_count: importedOfferCount,
      failure_count: 0,
      message: `审核通过时从试采集结果读取 ${importedOfferCount} 条报价，写入 ${importedOfferResult.writtenCount} 条，刷新 ${importedOfferResult.refreshedCount} 条。`,
      details: {
        review_action: "submission_approve",
        submission_id: submission.id,
        matched_existing_source: Boolean(existingSource),
        collector: selectedCollectorKind || null,
        writeStats: {
          receivedCount: importedOfferResult.receivedCount,
          writtenCount: importedOfferResult.writtenCount,
          unchangedCount: importedOfferResult.unchangedCount,
          refreshedCount: importedOfferResult.refreshedCount,
        },
      },
    });
    if (logError) throw logError;
    await pruneOperationalLogs(supabase);
  }

  const nextMeta = {
    ...submission.parsedMeta,
    review_stage: "approved",
    approved_at: reviewedAt,
    approved_source_id: source.id,
    approved_offer_count: importedOfferCount,
    matched_existing_source: Boolean(existingSource),
    approved_collector_kind: selectedCollectorKind || null,
    approved_source_url: canonicalSourceUrl,
    manual_source_url: manualSourceUrl,
  };
  const { data: updated, error: updateError } = await supabase
    .from("channel_submissions")
    .update({
      status: "approved",
      approved_source_id: source.id,
      parsed_meta: nextMeta,
      reviewed_at: reviewedAt,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;

  return {
    submission: updated ? mapSubmissionRow(updated) : { ...submission, status: "approved", approvedSourceId: source.id, reviewedAt },
    source,
    importedOfferCount,
    matchedExistingSource: Boolean(existingSource),
  };
}

export async function rejectSubmission(id: string, note?: string | null): Promise<ChannelSubmission> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const { data, error } = await supabase
    .from("channel_submissions")
    .update({
      status: "rejected",
      reviewer_note: note?.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("提交记录不存在或已被处理。");

  return mapSubmissionRow(data);
}

async function getSourceById(id: string): Promise<Source | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("sources")
    .select("id,name,base_url,entry_url,collection_method,collector_kind,enabled,notes,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSourceRow(data) : null;
}

async function findExistingSourceForApproval(suggestedId: string | null, sourceUrl: string): Promise<Source | null> {
  const byEntryUrl = await findSourceRowByEntryUrl(sourceUrl);
  if (byEntryUrl) return mapSourceRow(byEntryUrl);

  const byId = suggestedId ? await getSourceById(suggestedId) : null;
  return byId;
}

function getProbeOffersForImport(
  meta: Record<string, unknown>,
  source: Source,
  fallbackUrl: string,
): OfferInput[] {
  const probe = getStoredProbeResult(meta);
  if (!probe || probe.status !== "success" || !Array.isArray(probe.offers)) return [];

  const offers: OfferInput[] = [];
  for (const offer of probe.offers) {
    const sourceTitle = stringValue(offer.sourceTitle) || stringValue(offer.title);
    const url = stringValue(offer.url) || fallbackUrl;
    if (!sourceTitle || !url) continue;

    offers.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.entryUrl || fallbackUrl,
      sourceStoreName: stringValue(offer.sourceStoreName) || source.name,
      sourceTitle,
      price: numberValue(offer.price),
      currency: stringValue(offer.currency) || "CNY",
      status: normalizeStatus(stringValue(offer.status)),
      url,
      tags: Array.isArray(offer.tags) ? offer.tags.map(String).filter(Boolean) : [],
      stockCount: numberValue(offer.stockCount),
    });
  }

  return offers;
}

function getStoredProbeResult(meta: Record<string, unknown>): SubmissionProbeResult | null {
  const value = meta.probe_result;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SubmissionProbeResult)
    : null;
}

function resolveSubmissionSourceFromProbeResult(
  submission: ChannelSubmission,
  result: SubmissionProbeResult,
  collectorKind: CollectorKind | null,
): Record<string, unknown> {
  const sourceUrl =
    firstProbeOfferSourceUrl(result) ||
    stringValue(result.sourceUrl) ||
    stringValue(submission.parsedMeta.canonical_source_url);
  const parsed = safeUrl(sourceUrl);
  if (!parsed) return {};

  const host = normalizeHostname(parsed.hostname);
  const shopToken = getShopToken(parsed.pathname);
  if (isSharedShopApiPlatformHost(host) && !shopToken) return {};

  const sourceName =
    firstProbeOfferSourceName(result) ||
    stringValue(result.sourceName) ||
    submission.name ||
    getSuggestedSourceName(submission.parsedMeta) ||
    inferSubmittedSourceName(host, submission.parsedTitle, shopToken);
  const normalizedSourceUrl = normalizeSourceEntryUrl(parsed.toString()) || parsed.toString();

  return {
    canonical_source_status: "resolved",
    canonical_source_reason: "已通过试采集结果反查到真实店铺入口，审核通过时会按该渠道入口入库。",
    canonical_source_url: normalizedSourceUrl,
    shop_token: shopToken,
    suggested_source_name: sourceName,
    suggested_source_id: inferSubmittedSourceId(host, sourceName, shopToken),
    suggested_collection_method: "http",
    suggested_collector_kind: collectorKind || submission.parsedMeta.suggested_collector_kind,
  };
}

function firstProbeOfferSourceUrl(result: SubmissionProbeResult): string | null {
  if (!Array.isArray(result.offers)) return null;
  for (const offer of result.offers) {
    if (!offer || typeof offer !== "object" || Array.isArray(offer)) continue;
    const sourceUrl = stringValue((offer as Record<string, unknown>).sourceUrl);
    if (sourceUrl) return sourceUrl;
  }
  return null;
}

function firstProbeOfferSourceName(result: SubmissionProbeResult): string | null {
  if (!Array.isArray(result.offers)) return null;
  for (const offer of result.offers) {
    if (!offer || typeof offer !== "object" || Array.isArray(offer)) continue;
    const record = offer as Record<string, unknown>;
    const sourceName = stringValue(record.sourceStoreName) || stringValue(record.sourceName);
    if (sourceName) return sourceName;
  }
  return null;
}

function getSuggestedSourceName(meta: Record<string, unknown>): string | null {
  return typeof meta.suggested_source_name === "string" && meta.suggested_source_name.trim()
    ? meta.suggested_source_name.trim()
    : null;
}

function getSuggestedSourceId(meta: Record<string, unknown>): string | null {
  return typeof meta.suggested_source_id === "string" && meta.suggested_source_id.trim()
    ? meta.suggested_source_id.trim()
    : null;
}

function getExistingSourceId(meta: Record<string, unknown>): string | null {
  return typeof meta.existing_source_id === "string" && meta.existing_source_id.trim()
    ? meta.existing_source_id.trim()
    : null;
}

function getCanonicalSourceUrl(meta: Record<string, unknown>): string | null {
  return typeof meta.canonical_source_url === "string" && meta.canonical_source_url.trim()
    ? meta.canonical_source_url.trim()
    : null;
}

function normalizeOverrideSourceUrl(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("手动渠道入口 URL 格式不正确。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("手动渠道入口仅支持 http/https。");
  }

  return parsed.toString();
}

function getSuggestedCollectionMethod(meta: Record<string, unknown>): CollectionMethod | null {
  const value = typeof meta.suggested_collection_method === "string" ? meta.suggested_collection_method : "";
  return value === "public_json" || value === "browser" || value === "http" || value === "manual"
    ? value
    : null;
}

function getSuggestedCollectorKind(meta: Record<string, unknown>): CollectorKind | null {
  return normalizeCollectorKind(meta.suggested_collector_kind);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
