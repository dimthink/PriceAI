import "server-only";

import { promises as dns } from "node:dns";
import net from "node:net";

import { canonicalCatalog, classifyOffer } from "./catalog";
import { freshnessFields } from "./freshness";
import { getSupabaseServerClient } from "./supabase";
import type {
  ChannelSubmission,
  CollectionMethod,
  CollectorKind,
  OfferInput,
  RawOffer,
  Source,
  SubmissionStatus,
} from "./types";
import { normalizeStatus, parseTags, slugify, stableId } from "./utils";

export const ADMIN_SOURCE_HIDE_REASON_PREFIX = "管理员手动下架渠道";
export const ADMIN_OFFER_HIDE_REASON_PREFIX = "管理员手动下架报价";
export const ADMIN_MANUAL_HIDE_REASON_PREFIX = "管理员手动下架";

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

export function getAdminPasswordFromRequest(request: Request): string | null {
  const header = request.headers.get("x-admin-password");
  if (header) return header;

  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) return authorization.slice("Bearer ".length);

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
  const { data: existing, error: existingError } = await supabase
    .from("sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (existingError) throw existingError;

  let matchedExisting = existing;
  const matchedByEntryUrl = !matchedExisting;
  if (!matchedExisting) {
    matchedExisting = await findSourceRowByEntryUrl(normalizedEntryUrl);
    if (matchedExisting?.id) id = String(matchedExisting.id);
  }
  const sourceName = matchedByEntryUrl && matchedExisting?.name
    ? String(matchedExisting.name)
    : input.name;

  const source: Source = {
    id,
    name: sourceName,
    baseUrl: input.baseUrl || deriveBaseUrl(normalizedEntryUrl),
    entryUrl: normalizedEntryUrl,
    collectionMethod: input.collectionMethod || String(matchedExisting?.collection_method || "manual") as CollectionMethod,
    collectorKind: input.collectorKind ?? normalizeCollectorKind(matchedExisting?.collector_kind),
    enabled: input.enabled ?? (matchedExisting ? Boolean(matchedExisting.enabled) : true),
    notes: input.notes || (matchedExisting?.notes ? String(matchedExisting.notes) : null),
    updatedAt: new Date().toISOString(),
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
  const canonical = classifyOffer(input.sourceTitle, { tags });
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
  options: { collectionMethod?: CollectionMethod } = {},
): Promise<number> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法保存报价。");

  await ensureCanonicalProducts(supabase);

  const rows = [];
  const collectionMethod = options.collectionMethod || "browser";

  for (const offer of offers) {
    const source = await upsertSource({
      id: offer.sourceId,
      name: offer.sourceName,
      entryUrl: offer.sourceUrl,
      collectionMethod,
      notes: collectionMethod === "http" ? "由自动价格采集脚本维护。" : "由半自动浏览器采集助手创建。",
    });
    const normalizedOffer = {
      ...offer,
      sourceName: source.name,
      sourceStoreName: offer.sourceStoreName || source.name,
    };
    const now = new Date().toISOString();
    const status = normalizeStatus(offer.status || "");
    const tags = parseTags(offer.tags || "");
    const canonical = classifyOffer(offer.sourceTitle, { tags });
    const trustFields = freshnessFields({ method: collectionMethod, status, verifiedAt: now });

    rows.push(
      toRawOfferRow({
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
        capturedAt: now,
        sourceUpdatedAt: now,
        lastSeenAt: now,
        verifiedAt: now,
        expiresAt: trustFields.expires_at,
        sourcePriority: trustFields.source_priority,
        confidence: trustFields.confidence,
        effectiveStatus: trustFields.effective_status,
        freshnessStatus: trustFields.freshness_status,
      }),
    );
  }

  if (!rows.length) return 0;

  const manualHiddenById = await getManualHiddenOffersById(rows.map((row) => String(row.id)));
  for (const row of rows) {
    const existing = manualHiddenById.get(String(row.id));
    if (!existing) continue;
    row.hidden = true;
    row.failure_reason = existing.failureReason;
    row.last_failed_at = existing.lastFailedAt;
  }

  const { error } = await supabase.from("raw_offers").upsert(rows);
  if (error) throw error;

  return rows.length;
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
  const { error } = await supabase.from("canonical_products").upsert(
    canonicalCatalog.map((product) => ({
      id: product.id,
      slug: product.slug,
      display_name: product.displayName,
      platform: product.platform,
      product_type: product.productType,
      spec: product.spec,
      summary: product.summary,
      aliases: product.aliases,
      is_active: true,
      updated_at: new Date().toISOString(),
    })),
  );

  if (error) throw error;
}

export function rawOfferInputId(offer: Pick<OfferInput, "sourceName" | "sourceStoreName" | "sourceTitle" | "url">): string {
  return stableId(offer.sourceName, offer.sourceStoreName, offer.sourceTitle, offer.url);
}

export async function recordSourceCollectionResult(input: {
  sourceId: string;
  status: "success" | "partial" | "failed";
  checkedAt: string;
  message?: string | null;
  seenOfferIds?: string[];
  fullSnapshot?: boolean;
}) {
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
    if (ageMs < 60 * 60 * 1000) return;
  }

  const previousFailures = Number(existing?.consecutive_failures || 0);
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
    await recordOfferCollectionFailure(input.sourceId, input.checkedAt, input.message || null, consecutiveFailures);
    return;
  }

  await clearOfferCollectionFailure(input.sourceId);

  if (input.status === "success" && input.fullSnapshot && input.seenOfferIds?.length) {
    await hideMissingOffersAsDelisted(input.sourceId, input.seenOfferIds, input.checkedAt);
  }
}

async function recordOfferCollectionFailure(
  sourceId: string,
  failedAt: string,
  message: string | null,
  consecutiveFailures: number,
) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const failureReason = message || "本次采集失败，旧报价暂不更新。";
  const { error: markError } = await supabase
    .from("raw_offers")
    .update({
      last_failed_at: failedAt,
      failure_reason: failureReason,
      updated_at: failedAt,
    })
    .eq("source_id", sourceId)
    .or(`failure_reason.is.null,failure_reason.not.ilike.${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`);

  if (markError) throw markError;

  const staleBefore = new Date(new Date(failedAt).getTime() - 24 * 60 * 60 * 1000).toISOString();
  if (consecutiveFailures < 3) return;

  const { error: expireError } = await supabase
    .from("raw_offers")
    .update({
      effective_status: "unavailable",
      freshness_status: "expired",
      last_failed_at: failedAt,
      failure_reason: `连续采集失败 ${consecutiveFailures} 次：${failureReason}`,
      updated_at: failedAt,
    })
    .eq("source_id", sourceId)
    .or(`failure_reason.is.null,failure_reason.not.ilike.${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`)
    .or(`verified_at.is.null,verified_at.lt.${staleBefore}`);

  if (expireError) throw expireError;
}

async function clearOfferCollectionFailure(sourceId: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { error } = await supabase
    .from("raw_offers")
    .update({
      last_failed_at: null,
      failure_reason: null,
    })
    .eq("source_id", sourceId)
    .or(`failure_reason.is.null,failure_reason.not.ilike.${ADMIN_MANUAL_HIDE_REASON_PREFIX}%`);

  if (error) throw error;
}

async function hideMissingOffersAsDelisted(sourceId: string, seenOfferIds: string[], checkedAt: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

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

  for (const ids of chunks(missingIds, 100)) {
    const { error: updateError } = await supabase
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
      })
      .in("id", ids);

    if (updateError) throw updateError;
  }
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
    url: offer.url,
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

function isPrivateAddress(address: string): boolean {
  if (!address) return true;
  const lower = address.toLowerCase();
  if (lower === "localhost") return true;

  const v4 = net.isIPv4(address);
  const v6 = net.isIPv6(address);
  if (!v4 && !v6) return false;

  if (v4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  // IPv6: block loopback, link-local, ULA, mapped private v4
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return isPrivateAddress(address.split(":").pop() || "");
  return false;
}

async function ensurePublicHost(hostname: string): Promise<void> {
  if (!hostname) throw new Error("URL 缺少主机名。");
  if (isPrivateAddress(hostname)) throw new Error("不允许的内部 IP。");

  let records: Array<{ address: string }> = [];
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("无法解析该主机名。");
  }
  if (!records.length) throw new Error("无法解析该主机名。");
  for (const record of records) {
    if (isPrivateAddress(record.address)) throw new Error("不允许的内部 IP。");
  }
}

const MAX_FETCH_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const SHOP_API_TIMEOUT_MS = 8000;
const KAMI_HOSTS = new Set([
  "ai666.dnxb.cc",
  "aisou.pro",
  "caowo.store",
  "faka.redeemgpt.com",
  "feifei.shop",
  "shopcardai.click",
  "talkai.cyou",
  "yh-mo.xyz",
  "zzshu.com",
]);
const DUJIAO_HOSTS = new Set([
  "burstpro-ai.online",
  "card.kxandyou.com",
  "kapay.shop",
  "shop.aitonse.com",
  "shop.auto-subscribe.com",
  "ultra.makelove.cloud",
  "zhang520.store",
]);

export async function parseSubmissionMetadata(rawUrl: string): Promise<{
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
  Object.assign(meta, analyzeSubmissionUrl(parsed, null));

  try {
    await ensurePublicHost(parsed.hostname);
  } catch (error) {
    meta.parse_error = error instanceof Error ? error.message : String(error);
    throw error;
  }

  Object.assign(meta, await resolveSubmittedSource(parsed, null));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AIPriceHubBot/1.0 (+https://priceai.cc)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    meta.http_status = response.status;
    if (!response.ok) {
      meta.parse_error = `HTTP ${response.status}`;
      return { url: parsed.toString(), parsedTitle: null, parsedMeta: meta };
    }
    const reader = response.body?.getReader();
    if (!reader) {
      return { url: parsed.toString(), parsedTitle: null, parsedMeta: meta };
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
      const canonical = classifyOffer(parsedTitle);
      meta.canonical_product_id = canonical.id;
      meta.platform = canonical.platform;
      meta.product_type = canonical.productType;
      Object.assign(meta, await resolveSubmittedSource(parsed, parsedTitle, html));
    }
  } catch (error) {
    meta.parse_error = error instanceof Error ? error.message : String(error);
  } finally {
    clearTimeout(timer);
  }

  return { url: parsed.toString(), parsedTitle, parsedMeta: meta };
}

function analyzeSubmissionUrl(parsed: URL, parsedTitle: string | null): Record<string, unknown> {
  const host = normalizeHostname(parsed.hostname);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const shopToken = getShopToken(parsed.pathname);
  const submittedUrlType = getSubmittedUrlType(parsed);
  const collectorKind = inferCollectorKind(host);
  const collectionMethod: CollectionMethod = collectorKind === "browser" ? "browser" : "http";
  const suggestedName = inferSubmittedSourceName(host, parsedTitle, shopToken);

  return {
    normalized_url: parsed.toString(),
    submitted_url_type: submittedUrlType,
    base_url: baseUrl,
    canonical_source_url: shopToken ? `${baseUrl}/shop/${encodeURIComponent(shopToken)}` : baseUrl,
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
): Promise<Record<string, unknown>> {
  const host = normalizeHostname(parsed.hostname);
  const baseMeta = analyzeSubmissionUrl(parsed, parsedTitle);
  const knownSourceMeta = await resolveSourceFromKnownOffer(parsed, parsedTitle, baseMeta);
  if (knownSourceMeta) return knownSourceMeta;

  if ((host !== "pay.ldxp.cn" && host !== "pay.qxvx.cn") || !getGoodsKey(parsed.pathname) || getShopToken(parsed.pathname)) {
    return baseMeta;
  }

  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const tokenFromHtml = getShopTokenFromHtml(html);
  const tokenFromApi = tokenFromHtml || await fetchShopTokenFromGoods(baseUrl, parsed.toString(), getGoodsKey(parsed.pathname) || "");
  if (!tokenFromApi) {
    return {
      ...baseMeta,
      submitted_url_type: "product",
      canonical_source_status: "unresolved",
      canonical_source_reason: "商品链接暂未反查到店铺入口，审核时会按域名兜底。",
    };
  }

  const shopUrl = `${baseUrl}/shop/${encodeURIComponent(tokenFromApi)}`;
  const suggestedName = inferSubmittedSourceName(host, parsedTitle, tokenFromApi);
  return {
    ...baseMeta,
    submitted_url_type: "product",
    canonical_source_status: "resolved",
    canonical_source_reason: "已从商品链接反查到店铺入口，审核通过时会按渠道入口入库。",
    canonical_source_url: shopUrl,
    shop_token: tokenFromApi,
    suggested_source_name: suggestedName,
    suggested_source_id: inferSubmittedSourceId(host, suggestedName, tokenFromApi),
  };
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
  if (KAMI_HOSTS.has(host)) return "kami";
  if (DUJIAO_HOSTS.has(host)) return "dujiao";
  if (host === "pay.qxvx.cn" || host === "pay.ldxp.cn" || host === "ldxp.cn") return "shopApi";
  if (host === "upgrade.xiaoheiwan.com") return "xiaoheiwan";
  if (host === "aifk.opensora.de") return "opensoraHtml";
  if (host === "makerich.club") return "makerichHtml";
  if (host === "bei-bei.shop") return "beibeiHtml";
  if (host === "ikunlove.best") return "ikunloveApi";
  if (host === "getgpt.pro") return "getgptApi";
  if (host.includes("burstpro")) return "dujiao";
  return "browser";
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
  if (getGoodsKey(parsed.pathname)) return "product";
  if (parsed.searchParams.has("commodity") || parsed.searchParams.has("id")) return "product";
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

function getShopTokenFromHtml(html: string | null): string | null {
  if (!html) return null;
  const hrefMatch = html.match(/href=["'][^"']*\/shop\/([^"'/?#]+)[^"']*["']/i);
  if (hrefMatch?.[1]) return decodeURIComponent(hrefMatch[1]);
  const tokenMatch = html.match(/["']token["']\s*:\s*["']([^"']+)["']/i);
  if (tokenMatch?.[1]) return tokenMatch[1];
  return null;
}

async function fetchShopTokenFromGoods(baseUrl: string, itemUrl: string, goodsKey: string): Promise<string | null> {
  if (!goodsKey) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
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
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      const token = getShopTokenFromGoodsPayload(payload);
      if (token) return token;
    } catch {
      /* retry once with a browser-like user agent */
    }
  }
  return null;
}

function getShopTokenFromGoodsPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const user = (data as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;

  const token = (user as { token?: unknown }).token;
  if (typeof token === "string" && token.trim()) return token.trim();

  const link = (user as { link?: unknown }).link;
  if (typeof link === "string" && link.trim()) {
    const parsed = safeUrl(link);
    const tokenFromLink = parsed ? getShopToken(parsed.pathname) : null;
    if (tokenFromLink) return tokenFromLink;
  }

  return null;
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

function normalizeCollectorKind(value: unknown): CollectorKind | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized === "auto" ||
    normalized === "kami" ||
    normalized === "dujiao" ||
    normalized === "shopApi" ||
    normalized === "xiaoheiwan" ||
    normalized === "opensoraHtml" ||
    normalized === "makerichHtml" ||
    normalized === "beibeiHtml" ||
    normalized === "ikunloveApi" ||
    normalized === "getgptApi" ||
    normalized === "browser" ||
    normalized === "unsupported"
  ) {
    return normalized;
  }
  return null;
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
    const parsed = await parseSubmissionMetadata(normalizedUrl);
    parsedTitle = parsed.parsedTitle;
    parsedMeta = parsed.parsedMeta;
  } catch (error) {
    parsedMeta = buildFallbackSubmissionMeta(normalizedUrl, error);
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
    const parsed = await parseSubmissionMetadata(submission.url);
    parsedTitle = parsed.parsedTitle;
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
  const nextMeta = {
    ...submission.parsedMeta,
    probe_result: result,
    probe_checked_at: checkedAt,
    suggested_collector_kind: collectorKind || submission.parsedMeta.suggested_collector_kind,
    review_stage: success ? "ready_to_approve" : knownCollector ? "known_collector_probe_failed" : "needs_collector_review",
    support_status: supportStatus,
    support_reason: supportReason,
  };

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
  const baseUrl = deriveBaseUrl(canonicalSourceUrl);
  const suggestedMethod = getSuggestedCollectionMethod(submission.parsedMeta);
  const suggestedCollectorKind = getSuggestedCollectorKind(submission.parsedMeta);
  const selectedCollectorKind = overrides.collectorKind || suggestedCollectorKind;
  const suggestedId = getSuggestedSourceId(submission.parsedMeta);
  const existingSource = await findExistingSourceForApproval(suggestedId, canonicalSourceUrl);
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

  const importedOfferCount = importedOffers.length
    ? await upsertRawOffers(importedOffers, { collectionMethod: source.collectionMethod === "manual" ? "http" : source.collectionMethod })
    : 0;

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
      message: `审核通过时从试采集结果入库 ${importedOfferCount} 条报价。`,
      details: {
        review_action: "submission_approve",
        submission_id: submission.id,
        matched_existing_source: Boolean(existingSource),
        collector: selectedCollectorKind || null,
      },
    });
    if (logError) throw logError;
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
  const byId = suggestedId ? await getSourceById(suggestedId) : null;
  if (byId) return byId;

  const byEntryUrl = await findSourceRowByEntryUrl(sourceUrl);
  return byEntryUrl ? mapSourceRow(byEntryUrl) : null;
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
