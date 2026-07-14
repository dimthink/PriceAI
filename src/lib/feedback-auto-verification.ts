import "server-only";

import { inferCollectorKindFromHost, normalizeCollectorKind } from "./collector-registry";
import { safeFetch } from "./safe-fetch";
import { getSupabaseServerClient } from "./supabase";
import { LOW_RISK_VERIFICATION_REASONS, shouldCreateFeedbackVerification } from "./trust-risk";
import type { OfferFeedbackReason, OfferFeedbackVerificationResult } from "./types";
import { stableId } from "./utils";

const AUTO_RECHECK_STALE_MS = 30 * 60 * 1000;
const INDEPENDENT_FEEDBACK_WINDOW_MS = 24 * 60 * 60 * 1000;
const INDEPENDENT_FEEDBACK_HIDE_THRESHOLD = 2;
const FEEDBACK_RECHECK_JOB_PRIORITY = 80;
const FEEDBACK_RECHECK_JOB_MAX_ATTEMPTS = 1;
const FEEDBACK_RECHECK_FETCH_TIMEOUT_MS = 8_000;
const FEEDBACK_RECHECK_MAX_HTML_BYTES = 128 * 1024;
const TRANSIENT_FEEDBACK_REASONS: ReadonlySet<OfferFeedbackReason> = new Set([
  "wrong_price",
  "item_removed",
  "stock_mismatch",
]);
const TRANSIENT_FEEDBACK_REASON_VALUES = Array.from(TRANSIENT_FEEDBACK_REASONS);
const AUTO_HIDE_FAILURE_REASON =
  "用户反馈后自动复核：源站商品已下架；如源站后续重新返回会自动恢复展示。";
const MULTI_FEEDBACK_HIDE_REASON =
  "24小时内多个独立用户反馈该报价不可买或信息不一致，自动临时下架；如源站后续重新返回会自动恢复展示。";

type SupabaseServerClient = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

type FeedbackRow = Record<string, unknown> & {
  id: string;
  reason: string;
  offer_id: string | null;
  source_id: string | null;
  product_id: string | null;
  product_slug: string | null;
  offer_price: number | string | null;
  offer_url: string | null;
  offer_status: string | null;
  source_title: string | null;
  offer_last_seen_at: string | null;
  offer_source_updated_at: string | null;
  notes: string | null;
  evidence_text: string | null;
  submitter_ip: string | null;
  ai_review_result: Record<string, unknown> | null;
  created_collection_job_id: string | null;
};

type RawOfferRow = {
  id: string;
  source_id: string | null;
  source_name: string | null;
  source_store_name: string | null;
  source_title: string | null;
  price: number | string | null;
  url: string | null;
  status: string | null;
  hidden: boolean | null;
  effective_status: string | null;
  verified_at: string | null;
  last_seen_at: string | null;
  source_updated_at: string | null;
  updated_at: string | null;
};

type SourceRow = {
  id: string;
  name: string | null;
  entry_url: string | null;
  base_url: string | null;
  collector_kind: string | null;
  health_status: string | null;
  last_success_at: string | null;
  last_checked_at: string | null;
};

type ProbeResult = {
  result: OfferFeedbackVerificationResult;
  message: string;
  checkedAt: string;
  details: Record<string, unknown>;
};

export type OfferFeedbackAutoVerificationResult = {
  feedbackId: string;
  status: "skipped" | "auto_fixed" | "recollection_created" | "manual_review" | "failed";
  verificationResult: OfferFeedbackVerificationResult | null;
  message: string;
  changedOfferCount: number;
  createdCollectionJobId: string | null;
  snapshotScope: {
    productIds: string[];
    offerIds: string[];
    sourceIds: string[];
  } | null;
};

export type OfferFeedbackCloseupResult = {
  checkedFeedbackCount: number;
  closedFeedbackCount: number;
  closedFeedbackIds: string[];
  snapshotScope: {
    productIds: string[];
    offerIds: string[];
    sourceIds: string[];
  } | null;
};

export type OfferFeedbackMultiFeedbackEscalationResult = {
  feedbackId: string;
  status: "skipped" | "auto_hidden" | "already_unavailable";
  independentFeedbackCount: number;
  changedOfferCount: number;
  createdCollectionJobId: string | null;
  closedFeedbackCount: number;
  message: string;
  snapshotScope: {
    productIds: string[];
    offerIds: string[];
    sourceIds: string[];
  } | null;
};

export type OfferFeedbackMultiFeedbackScanResult = {
  checkedFeedbackCount: number;
  checkedOfferCount: number;
  autoHiddenOfferCount: number;
  alreadyUnavailableOfferCount: number;
  changedOfferCount: number;
  closedFeedbackCount: number;
  createdCollectionJobIds: string[];
  results: OfferFeedbackMultiFeedbackEscalationResult[];
  snapshotScope: {
    productIds: string[];
    offerIds: string[];
    sourceIds: string[];
  } | null;
};

export async function runOfferFeedbackAutoVerification(feedbackId: string): Promise<OfferFeedbackAutoVerificationResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法自动核验反馈。");

  const feedback = await getFeedbackRow(supabase, feedbackId);
  if (!feedback) throw new Error("反馈记录不存在。");

  if (!shouldAutoVerifyFeedback(feedback)) {
    return {
      feedbackId,
      status: "skipped",
      verificationResult: null,
      message: "这类反馈不进入自动链接核验。",
      changedOfferCount: 0,
      createdCollectionJobId: null,
      snapshotScope: null,
    };
  }

  const now = new Date().toISOString();
  await updateFeedbackVerification(supabase, feedback, {
    verificationStatus: "running",
    verificationResult: null,
    verificationMessage: "正在自动复核源站商品状态。",
    checkedAt: now,
    autoVerification: {
      status: "running",
      checkedAt: now,
    },
  });

  const offer = feedback.offer_id ? await getRawOfferRow(supabase, feedback.offer_id) : null;
  const sourceId = offer?.source_id || feedback.source_id || null;
  const source = sourceId ? await getSourceRow(supabase, sourceId) : null;
  const offerUrl = offer?.url || feedback.offer_url;

  if (!offerUrl) {
    return await finishManualReview(supabase, feedback, {
      result: "inconclusive",
      message: "这条反馈没有可复核的报价链接，已转人工核验。",
      details: { reason: "missing_offer_url" },
    });
  }

  let probe: ProbeResult;
  try {
    probe = await probeOfferUrl(offerUrl, source);
  } catch (error) {
    probe = {
      result: "blocked",
      message: error instanceof Error ? error.message : "源站复核失败。",
      checkedAt: new Date().toISOString(),
      details: { error: error instanceof Error ? error.message : String(error) },
    };
  }

  if (probe.result === "item_removed" || probe.result === "out_of_stock") {
    return await autoHideFeedbackOffer(supabase, feedback, offer, {
      result: probe.result,
      message: probe.message,
      reason: AUTO_HIDE_FAILURE_REASON,
      probe,
      source,
    });
  }

  const independentFeedback = await countIndependentTransientFeedback(supabase, feedback);
  if (independentFeedback.count >= INDEPENDENT_FEEDBACK_HIDE_THRESHOLD) {
    const jobId = await createForcedRecollectionJob(supabase, feedback, source, "multi_feedback_auto_hide", {
      independentFeedbackCount: independentFeedback.count,
      independentFeedbackReasons: independentFeedback.reasonCounts,
    });
    return await autoHideFeedbackOffer(supabase, feedback, offer, {
      result: "item_removed",
      message: `24小时内已有 ${independentFeedback.count} 个独立用户反馈该报价不可买或信息不一致，已临时下架并创建强制重采。`,
      reason: MULTI_FEEDBACK_HIDE_REASON,
      probe,
      source,
      createdCollectionJobId: jobId,
      independentFeedbackCount: independentFeedback.count,
      independentFeedbackReasons: independentFeedback.reasonCounts,
    });
  }

  if (probe.result === "still_available") {
    return await finishManualReview(supabase, feedback, {
      result: "still_available",
      message: "源站复核仍返回可售状态，已保留前台报价并转人工确认。",
      details: { probe },
    });
  }

  if (shouldCreateForcedRecollection(feedback, offer, source)) {
    const jobId = await createForcedRecollectionJob(supabase, feedback, source, "stale_feedback_recheck");
    return await finishRecollectionCreated(supabase, feedback, {
      jobId,
      result: "recollection_created",
      message: jobId
        ? "自动复核未能确认下架，且报价更新时间已超过30分钟，已创建高优先级来源重采。"
        : "自动复核未能确认下架，但缺少可重采的来源信息，已转人工核验。",
      details: { probe, independentFeedbackCount: independentFeedback.count },
    });
  }

  return await finishManualReview(supabase, feedback, {
    result: probe.result,
    message: "自动复核未能确认下架，且报价近期刚更新；已保留前台报价并转人工确认。",
    details: { probe, independentFeedbackCount: independentFeedback.count },
  });
}

function shouldAutoVerifyFeedback(feedback: FeedbackRow): boolean {
  const reason = feedback.reason as OfferFeedbackReason;
  if (LOW_RISK_VERIFICATION_REASONS.has(reason)) return true;
  return shouldCreateFeedbackVerification(reason, feedback.notes, feedback.evidence_text);
}

export async function closePendingTransientOfferFeedback(input: {
  feedbackIds?: string[];
  offerIds?: string[];
  sourceIds?: string[];
  limit?: number;
} = {}): Promise<OfferFeedbackCloseupResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法收口报价反馈。");

  let query = supabase
    .from("offer_feedback")
    .select("*")
    .eq("status", "pending")
    .in("reason", TRANSIENT_FEEDBACK_REASON_VALUES)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(input.limit ?? 300, 1000)));

  if (input.feedbackIds?.length) query = query.in("id", input.feedbackIds);
  if (input.offerIds?.length) query = query.in("offer_id", compactStrings(input.offerIds));
  if (input.sourceIds?.length) query = query.in("source_id", compactStrings(input.sourceIds));

  const { data, error } = await query;
  if (error) throw error;

  const feedbackRows = ((data || []) as FeedbackRow[]).filter((row) =>
    TRANSIENT_FEEDBACK_REASONS.has(row.reason as OfferFeedbackReason)
  );
  if (!feedbackRows.length) {
    return {
      checkedFeedbackCount: 0,
      closedFeedbackCount: 0,
      closedFeedbackIds: [],
      snapshotScope: null,
    };
  }

  const offerIds = compactStrings(feedbackRows.map((row) => row.offer_id));
  const offersById = await getRawOfferRowsById(supabase, offerIds);
  const checkedAt = new Date().toISOString();
  const closedFeedbackIds: string[] = [];
  const scope = emptySnapshotScope();

  for (const feedback of feedbackRows) {
    const offer = feedback.offer_id ? offersById.get(feedback.offer_id) || null : null;
    const outcome = buildFeedbackCloseupOutcome(feedback, offer);
    if (!outcome) continue;

    await updateFeedbackVerification(supabase, feedback, {
      feedbackStatus: "resolved",
      verificationStatus: "auto_fixed",
      verificationResult: outcome.result,
      verificationMessage: outcome.message,
      checkedAt,
      reviewedAt: checkedAt,
      autoVerification: {
        status: "auto_fixed",
        result: outcome.result,
        message: outcome.message,
        checkedAt,
        closeup: outcome.details,
      },
    });

    closedFeedbackIds.push(feedback.id);
    mergeSnapshotScope(scope, feedbackSnapshotScope(feedback, offer, null));
  }

  return {
    checkedFeedbackCount: feedbackRows.length,
    closedFeedbackCount: closedFeedbackIds.length,
    closedFeedbackIds,
    snapshotScope: closedFeedbackIds.length ? scope : null,
  };
}

export async function runOfferFeedbackMultiFeedbackEscalation(
  feedbackId: string,
): Promise<OfferFeedbackMultiFeedbackEscalationResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法检查重复反馈。");

  const feedback = await getFeedbackRow(supabase, feedbackId);
  if (!feedback) throw new Error("反馈记录不存在。");

  if (!TRANSIENT_FEEDBACK_REASONS.has(feedback.reason as OfferFeedbackReason) || !feedback.offer_id) {
    return buildSkippedEscalation(feedback, 0, "这条反馈不属于报价临时数据聚合处理范围。");
  }

  const independentFeedback = await countIndependentTransientFeedback(supabase, feedback);
  if (independentFeedback.count < INDEPENDENT_FEEDBACK_HIDE_THRESHOLD) {
    return buildSkippedEscalation(
      feedback,
      independentFeedback.count,
      `24小时内独立反馈数 ${independentFeedback.count}，未达到自动临时下架阈值。`,
    );
  }

  const offer = await getRawOfferRow(supabase, feedback.offer_id);
  const sourceId = offer?.source_id || feedback.source_id || null;
  const source = sourceId ? await getSourceRow(supabase, sourceId) : null;
  const existingCloseup = buildFeedbackCloseupOutcome(feedback, offer);

  if (existingCloseup) {
    const closeup = await closePendingTransientOfferFeedback({ offerIds: [feedback.offer_id], limit: 100 });
    return {
      feedbackId: feedback.id,
      status: "already_unavailable",
      independentFeedbackCount: independentFeedback.count,
      changedOfferCount: 0,
      createdCollectionJobId: feedback.created_collection_job_id || null,
      closedFeedbackCount: closeup.closedFeedbackCount,
      message: "当前报价已经不可售或已被采集修正，已自动收口相关待处理反馈。",
      snapshotScope: closeup.snapshotScope,
    };
  }

  const checkedAt = new Date().toISOString();
  const jobId = await createForcedRecollectionJob(supabase, feedback, source, "multi_transient_feedback_auto_hide", {
    independentFeedbackCount: independentFeedback.count,
    independentFeedbackReasons: independentFeedback.reasonCounts,
  });
  const hidden = await autoHideFeedbackOffer(supabase, feedback, offer, {
    result: "item_removed",
    message: `24小时内已有 ${independentFeedback.count} 个独立用户反馈该报价不可买或信息不一致，已临时下架并创建强制重采。`,
    reason: MULTI_FEEDBACK_HIDE_REASON,
    probe: {
      result: "inconclusive",
      message: "多用户反馈达到自动临时下架阈值。",
      checkedAt,
      details: {
        kind: "multi_feedback",
        independentFeedbackCount: independentFeedback.count,
        independentFeedbackReasons: independentFeedback.reasonCounts,
      },
    },
    source,
    createdCollectionJobId: jobId,
    independentFeedbackCount: independentFeedback.count,
    independentFeedbackReasons: independentFeedback.reasonCounts,
  });
  const closeup = feedback.offer_id
    ? await closePendingTransientOfferFeedback({ offerIds: [feedback.offer_id], limit: 100 })
    : { closedFeedbackCount: 0, snapshotScope: null };

  const scope = emptySnapshotScope();
  mergeSnapshotScope(scope, hidden.snapshotScope);
  mergeSnapshotScope(scope, closeup.snapshotScope);

  return {
    feedbackId: feedback.id,
    status: "auto_hidden",
    independentFeedbackCount: independentFeedback.count,
    changedOfferCount: hidden.changedOfferCount,
    createdCollectionJobId: jobId,
    closedFeedbackCount: closeup.closedFeedbackCount + 1,
    message: hidden.message,
    snapshotScope: hasSnapshotScope(scope) ? scope : null,
  };
}

export async function runPendingTransientFeedbackEscalations(input: {
  limit?: number;
} = {}): Promise<OfferFeedbackMultiFeedbackScanResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法扫描重复反馈。");

  const limit = Math.max(1, Math.min(input.limit ?? 300, 1000));
  const { data, error } = await supabase
    .from("offer_feedback")
    .select("id,offer_id")
    .eq("status", "pending")
    .in("reason", TRANSIENT_FEEDBACK_REASON_VALUES)
    .not("offer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const rows = (data || []) as Array<Pick<FeedbackRow, "id" | "offer_id">>;
  const processedOfferIds = new Set<string>();
  const results: OfferFeedbackMultiFeedbackEscalationResult[] = [];
  const scope = emptySnapshotScope();

  for (const row of rows) {
    const offerId = row.offer_id;
    if (!offerId || processedOfferIds.has(offerId)) continue;
    processedOfferIds.add(offerId);

    const result = await runOfferFeedbackMultiFeedbackEscalation(row.id);
    results.push(result);
    mergeSnapshotScope(scope, result.snapshotScope);
  }

  return {
    checkedFeedbackCount: rows.length,
    checkedOfferCount: processedOfferIds.size,
    autoHiddenOfferCount: results.filter((result) => result.status === "auto_hidden").length,
    alreadyUnavailableOfferCount: results.filter((result) => result.status === "already_unavailable").length,
    changedOfferCount: results.reduce((sum, result) => sum + result.changedOfferCount, 0),
    closedFeedbackCount: results.reduce((sum, result) => sum + result.closedFeedbackCount, 0),
    createdCollectionJobIds: compactStrings(results.map((result) => result.createdCollectionJobId)),
    results,
    snapshotScope: hasSnapshotScope(scope) ? scope : null,
  };
}

async function getFeedbackRow(supabase: SupabaseServerClient, feedbackId: string): Promise<FeedbackRow | null> {
  const { data, error } = await supabase
    .from("offer_feedback")
    .select("*")
    .eq("id", feedbackId)
    .maybeSingle();
  if (error) throw error;
  return data ? data as FeedbackRow : null;
}

async function getRawOfferRow(supabase: SupabaseServerClient, offerId: string): Promise<RawOfferRow | null> {
  const { data, error } = await supabase
    .from("raw_offers")
    .select("id,source_id,source_name,source_store_name,source_title,price,url,status,hidden,effective_status,verified_at,last_seen_at,source_updated_at,updated_at")
    .eq("id", offerId)
    .maybeSingle();
  if (error) throw error;
  return data ? data as RawOfferRow : null;
}

async function getRawOfferRowsById(supabase: SupabaseServerClient, offerIds: string[]): Promise<Map<string, RawOfferRow>> {
  const output = new Map<string, RawOfferRow>();
  if (!offerIds.length) return output;

  for (const ids of chunks(Array.from(new Set(offerIds)), 100)) {
    const { data, error } = await supabase
      .from("raw_offers")
      .select("id,source_id,source_name,source_store_name,source_title,price,url,status,hidden,effective_status,verified_at,last_seen_at,source_updated_at,updated_at")
      .in("id", ids);
    if (error) throw error;
    for (const row of data || []) {
      output.set(String((row as Record<string, unknown>).id), row as RawOfferRow);
    }
  }

  return output;
}

async function getSourceRow(supabase: SupabaseServerClient, sourceId: string): Promise<SourceRow | null> {
  const { data, error } = await supabase
    .from("sources")
    .select("id,name,entry_url,base_url,collector_kind,health_status,last_success_at,last_checked_at")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw error;
  return data ? data as SourceRow : null;
}

function buildFeedbackCloseupOutcome(
  feedback: FeedbackRow,
  offer: RawOfferRow | null,
): {
  result: OfferFeedbackVerificationResult;
  message: string;
  details: Record<string, unknown>;
} | null {
  if (!offer) return null;

  const currentStatus = stringValue(offer.status) || "";
  const currentEffectiveStatus = stringValue(offer.effective_status) || "";
  const currentHidden = offer.hidden === true;
  const baseDetails = {
    reason: feedback.reason,
    offerId: feedback.offer_id,
    currentStatus,
    currentEffectiveStatus,
    currentHidden,
  };

  if (currentHidden || currentEffectiveStatus === "unavailable" || currentStatus === "out_of_stock") {
    return {
      result: currentStatus === "out_of_stock" ? "out_of_stock" : "item_removed",
      message: currentHidden
        ? "当前报价已隐藏或临时下架，自动标记该反馈已处理。"
        : currentStatus === "out_of_stock"
          ? "当前报价已显示缺货，自动标记该反馈已处理。"
          : "当前报价已不可用，自动标记该反馈已处理。",
      details: { ...baseDetails, outcome: "current_unavailable" },
    };
  }

  const reason = feedback.reason as OfferFeedbackReason;
  if (reason === "wrong_price") {
    const snapshotPrice = numberValue(feedback.offer_price);
    const currentPrice = numberValue(offer.price);
    if (snapshotPrice !== null && currentPrice !== null && Math.abs(snapshotPrice - currentPrice) >= 0.01) {
      return {
        result: "offer_changed",
        message: `当前报价价格已从 ¥${snapshotPrice} 变为 ¥${currentPrice}，自动标记该反馈已处理。`,
        details: { ...baseDetails, outcome: "price_changed", snapshotPrice, currentPrice },
      };
    }
  }

  if (reason === "stock_mismatch") {
    const snapshotStatus = stringValue(feedback.offer_status);
    if (snapshotStatus && currentStatus && snapshotStatus !== currentStatus) {
      return {
        result: "offer_changed",
        message: `当前库存状态已从「${snapshotStatus}」变为「${currentStatus}」，自动标记该反馈已处理。`,
        details: { ...baseDetails, outcome: "status_changed", snapshotStatus },
      };
    }
  }

  return null;
}

function buildSkippedEscalation(
  feedback: FeedbackRow,
  independentFeedbackCount: number,
  message: string,
): OfferFeedbackMultiFeedbackEscalationResult {
  return {
    feedbackId: feedback.id,
    status: "skipped",
    independentFeedbackCount,
    changedOfferCount: 0,
    createdCollectionJobId: feedback.created_collection_job_id || null,
    closedFeedbackCount: 0,
    message,
    snapshotScope: null,
  };
}

async function probeOfferUrl(rawUrl: string, source: SourceRow | null): Promise<ProbeResult> {
  const parsed = safeUrl(rawUrl);
  const checkedAt = new Date().toISOString();
  if (!parsed) {
    return {
      result: "inconclusive",
      message: "报价链接格式无效，无法自动复核。",
      checkedAt,
      details: { url: rawUrl },
    };
  }

  const host = normalizeHostname(parsed.hostname);
  const collectorKind = normalizeCollectorKind(source?.collector_kind) ||
    inferCollectorKindFromHost(host, source?.name || "", null);
  if (collectorKind === "shopApi" || isShopApiOfferUrl(parsed)) return probeShopApiOffer(parsed, checkedAt);
  if (collectorKind === "kami" || isKamiOfferUrl(parsed)) return probeKamiOffer(parsed, checkedAt);
  return probeGenericOfferPage(parsed, checkedAt);
}

async function probeShopApiOffer(parsed: URL, checkedAt: string): Promise<ProbeResult> {
  const goodsKey = goodsKeyFromUrl(parsed);
  if (!goodsKey) {
    return {
      result: "inconclusive",
      message: "未能从报价链接识别商品编号，无法调用商品接口。",
      checkedAt,
      details: { kind: "shopApi", url: parsed.toString() },
    };
  }

  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  const response = await safeFetch(`${baseUrl}/shopApi/Shop/goodsInfo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      "user-agent": "AIPriceHubBot/1.0 (+https://priceai.cc)",
      origin: baseUrl,
      referer: parsed.toString(),
      visitorid: `feedback${Math.random().toString(36).slice(2, 10)}`,
    },
    body: JSON.stringify({ goods_key: goodsKey, trade_no: "" }),
    signal: AbortSignal.timeout(FEEDBACK_RECHECK_FETCH_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  const record = objectRecord(payload);
  const message = stringValue(record?.msg) || stringValue(record?.message) || "";
  const apiCode = stringValue(record?.code) || numberValue(record?.code);
  const data = objectRecord(record?.data);
  const details = {
    kind: "shopApi",
    httpStatus: response.status,
    apiCode,
    apiMessage: message,
    goodsKey,
  };

  if (!response.ok) {
    return {
      result: response.status === 404 || response.status === 410 ? "item_removed" : "blocked",
      message: response.status === 404 || response.status === 410
        ? `源站商品接口返回 HTTP ${response.status}，判断为商品已下架。`
        : `源站商品接口返回 HTTP ${response.status}，暂无法自动确认。`,
      checkedAt,
      details,
    };
  }

  if (!data) {
    if (isShopClosedMessage(message)) {
      return {
        result: "out_of_stock",
        message: message || "源站返回店铺已打烊，当前不可购买。",
        checkedAt,
        details,
      };
    }
    if (isRemovedMessage(message)) {
      return {
        result: "item_removed",
        message: message || "源站商品接口返回未上架。",
        checkedAt,
        details,
      };
    }
    return {
      result: "inconclusive",
      message: message || "源站商品接口没有返回商品详情，暂无法自动确认。",
      checkedAt,
      details,
    };
  }

  const status = stringValue(data.status) || stringValue(data.state) || String(numberValue(data.status) ?? "");
  if (isUnavailableStatus(status) || isRemovedMessage(message)) {
    return {
      result: "item_removed",
      message: message || `源站商品状态为 ${status || "未上架"}。`,
      checkedAt,
      details: { ...details, itemStatus: status },
    };
  }

  const stock = numberValue(data.stock) ?? numberValue(data.inventory);
  if (stock === 0) {
    return {
      result: "out_of_stock",
      message: "源站商品仍存在，但库存为 0。",
      checkedAt,
      details: { ...details, itemStatus: status, stock },
    };
  }

  if (isAvailableStatus(status) || data.name || data.goods_name) {
    return {
      result: "still_available",
      message: "源站商品接口仍返回商品详情。",
      checkedAt,
      details: { ...details, itemStatus: status, stock },
    };
  }

  return {
    result: "inconclusive",
    message: "源站商品接口返回了详情，但状态字段不明确。",
    checkedAt,
    details: { ...details, itemStatus: status, stock },
  };
}

function isShopClosedMessage(value: string | null | undefined): boolean {
  return /店铺已打烊|店铺打烊|已打烊|暂停营业|停止营业|暂不营业/.test(String(value || ""));
}

async function probeKamiOffer(parsed: URL, checkedAt: string): Promise<ProbeResult> {
  const itemId = kamiItemIdFromUrl(parsed);
  if (!itemId) {
    return probeGenericOfferPage(parsed, checkedAt);
  }

  const baseUrl = `${parsed.protocol}//${parsed.host}`;
  for (let page = 1; page <= 10; page += 1) {
    const response = await safeFetch(`${baseUrl}/user/api/index/commodity?limit=100&page=${page}`, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent": "AIPriceHubBot/1.0 (+https://priceai.cc)",
      },
      signal: AbortSignal.timeout(FEEDBACK_RECHECK_FETCH_TIMEOUT_MS),
    });
    if (response.status === 403 || response.status === 429) {
      return {
        result: "blocked",
        message: `Kami 商品列表接口返回 HTTP ${response.status}，暂无法自动确认。`,
        checkedAt,
        details: { kind: "kami", httpStatus: response.status, itemId, page },
      };
    }
    if (!response.ok) {
      return {
        result: response.status === 404 || response.status === 410 ? "item_removed" : "inconclusive",
        message: `Kami 商品列表接口返回 HTTP ${response.status}。`,
        checkedAt,
        details: { kind: "kami", httpStatus: response.status, itemId, page },
      };
    }

    const payload = await response.json().catch(() => null);
    const record = objectRecord(payload);
    const items = Array.isArray(record?.data) ? record.data : [];
    const match = items
      .map((item) => objectRecord(item))
      .find((item) => String(item?.id ?? "") === itemId);
    if (match) {
      const hidden = Number(match.hide || 0) !== 0;
      const status = String(match.status ?? "1");
      const stock = numberValue(match.stock);
      if (hidden || isUnavailableStatus(status)) {
        return {
          result: "item_removed",
          message: "Kami 商品列表中该商品已隐藏或停用。",
          checkedAt,
          details: { kind: "kami", itemId, status, hidden, stock },
        };
      }
      if (stock === 0) {
        return {
          result: "out_of_stock",
          message: "Kami 商品列表中该商品库存为 0。",
          checkedAt,
          details: { kind: "kami", itemId, status, hidden, stock },
        };
      }
      return {
        result: "still_available",
        message: "Kami 商品列表仍返回该商品。",
        checkedAt,
        details: { kind: "kami", itemId, status, hidden, stock },
      };
    }
    if (items.length < 100) break;
  }

  return {
    result: "item_removed",
    message: "Kami 商品列表已不再返回该商品。",
    checkedAt,
    details: { kind: "kami", itemId },
  };
}

async function probeGenericOfferPage(parsed: URL, checkedAt: string): Promise<ProbeResult> {
  const response = await safeFetch(parsed.toString(), {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "AIPriceHubBot/1.0 (+https://priceai.cc)",
    },
    signal: AbortSignal.timeout(FEEDBACK_RECHECK_FETCH_TIMEOUT_MS),
  });

  if (response.status === 404 || response.status === 410) {
    return {
      result: "item_removed",
      message: `商品页返回 HTTP ${response.status}。`,
      checkedAt,
      details: { kind: "generic", httpStatus: response.status },
    };
  }
  if (response.status === 403 || response.status === 429) {
    return {
      result: "blocked",
      message: `商品页返回 HTTP ${response.status}，暂无法自动确认。`,
      checkedAt,
      details: { kind: "generic", httpStatus: response.status },
    };
  }
  if (!response.ok) {
    return {
      result: "inconclusive",
      message: `商品页返回 HTTP ${response.status}，暂无法自动确认。`,
      checkedAt,
      details: { kind: "generic", httpStatus: response.status },
    };
  }

  const html = await readLimitedText(response, FEEDBACK_RECHECK_MAX_HTML_BYTES);
  if (isRemovedMessage(html)) {
    return {
      result: "item_removed",
      message: "商品页文本显示商品已下架或不存在。",
      checkedAt,
      details: { kind: "generic", httpStatus: response.status },
    };
  }

  return {
    result: "inconclusive",
    message: "商品页可访问，但没有明确上架/下架信号。",
    checkedAt,
    details: { kind: "generic", httpStatus: response.status },
  };
}

async function autoHideFeedbackOffer(
  supabase: SupabaseServerClient,
  feedback: FeedbackRow,
  offer: RawOfferRow | null,
  input: {
    result: Extract<OfferFeedbackVerificationResult, "item_removed" | "out_of_stock">;
    message: string;
    reason: string;
    probe: ProbeResult;
    source: SourceRow | null;
    createdCollectionJobId?: string | null;
    independentFeedbackCount?: number;
    independentFeedbackReasons?: Record<string, number>;
  },
): Promise<OfferFeedbackAutoVerificationResult> {
  const now = new Date().toISOString();
  let changedOfferCount = 0;
  const offerId = offer?.id || feedback.offer_id;

  if (offerId) {
    const { count, error } = await supabase
      .from("raw_offers")
      .update({
        hidden: true,
        status: "out_of_stock",
        source_status: "out_of_stock",
        effective_status: "unavailable",
        freshness_status: "fresh",
        verified_at: now,
        last_failed_at: null,
        failure_reason: input.reason,
        updated_at: now,
      }, { count: "exact" })
      .eq("id", offerId)
      .or("failure_reason.is.null,failure_reason.not.ilike.管理员手动下架%");
    if (error) throw error;
    changedOfferCount = count || 0;
  }

  await updateFeedbackVerification(supabase, feedback, {
    feedbackStatus: "resolved",
    verificationStatus: "auto_fixed",
    verificationResult: input.result,
    verificationMessage: input.message,
    checkedAt: now,
    reviewedAt: now,
    createdCollectionJobId: input.createdCollectionJobId || feedback.created_collection_job_id || null,
    autoVerification: {
      status: "auto_fixed",
      result: input.result,
      message: input.message,
      checkedAt: now,
      probe: input.probe,
      independentFeedbackCount: input.independentFeedbackCount,
      independentFeedbackReasons: input.independentFeedbackReasons,
      createdCollectionJobId: input.createdCollectionJobId || feedback.created_collection_job_id || null,
    },
  });

  return {
    feedbackId: feedback.id,
    status: "auto_fixed",
    verificationResult: input.result,
    message: input.message,
    changedOfferCount,
    createdCollectionJobId: input.createdCollectionJobId || feedback.created_collection_job_id || null,
    snapshotScope: changedOfferCount > 0
      ? feedbackSnapshotScope(feedback, offer, input.source)
      : null,
  };
}

async function finishRecollectionCreated(
  supabase: SupabaseServerClient,
  feedback: FeedbackRow,
  input: {
    jobId: string | null;
    result: OfferFeedbackVerificationResult;
    message: string;
    details: Record<string, unknown>;
  },
): Promise<OfferFeedbackAutoVerificationResult> {
  const checkedAt = new Date().toISOString();
  await updateFeedbackVerification(supabase, feedback, {
    verificationStatus: input.jobId ? "recollection_created" : "manual_review",
    verificationResult: input.jobId ? "recollection_created" : "inconclusive",
    verificationMessage: input.message,
    checkedAt,
    createdCollectionJobId: input.jobId,
    autoVerification: {
      status: input.jobId ? "recollection_created" : "manual_review",
      result: input.result,
      message: input.message,
      checkedAt,
      createdCollectionJobId: input.jobId,
      ...input.details,
    },
  });

  return {
    feedbackId: feedback.id,
    status: input.jobId ? "recollection_created" : "manual_review",
    verificationResult: input.jobId ? "recollection_created" : "inconclusive",
    message: input.message,
    changedOfferCount: 0,
    createdCollectionJobId: input.jobId,
    snapshotScope: null,
  };
}

async function finishManualReview(
  supabase: SupabaseServerClient,
  feedback: FeedbackRow,
  input: {
    result: OfferFeedbackVerificationResult;
    message: string;
    details: Record<string, unknown>;
  },
): Promise<OfferFeedbackAutoVerificationResult> {
  const checkedAt = new Date().toISOString();
  await updateFeedbackVerification(supabase, feedback, {
    verificationStatus: "manual_review",
    verificationResult: input.result,
    verificationMessage: input.message,
    checkedAt,
    autoVerification: {
      status: "manual_review",
      result: input.result,
      message: input.message,
      checkedAt,
      ...input.details,
    },
  });

  return {
    feedbackId: feedback.id,
    status: "manual_review",
    verificationResult: input.result,
    message: input.message,
    changedOfferCount: 0,
    createdCollectionJobId: feedback.created_collection_job_id || null,
    snapshotScope: null,
  };
}

async function updateFeedbackVerification(
  supabase: SupabaseServerClient,
  feedback: FeedbackRow,
  input: {
    feedbackStatus?: "pending" | "resolved" | "ignored";
    verificationStatus: "pending" | "running" | "auto_fixed" | "recollection_created" | "manual_review" | "failed";
    verificationResult?: OfferFeedbackVerificationResult | null;
    verificationMessage: string;
    checkedAt: string;
    reviewedAt?: string | null;
    createdCollectionJobId?: string | null;
    autoVerification: Record<string, unknown>;
  },
): Promise<void> {
  const current = objectRecord(feedback.ai_review_result) || {};
  const patch: Record<string, unknown> = {
    verification_status: input.verificationStatus,
    verification_result: input.verificationResult || null,
    verification_message: input.verificationMessage,
    verification_checked_at: input.checkedAt,
    ai_review_result: {
      ...current,
      verificationStatus: input.verificationStatus,
      verificationResult: input.verificationResult || null,
      verifiedAt: input.checkedAt,
      verificationMessage: input.verificationMessage,
      createdCollectionJobId: input.createdCollectionJobId ?? feedback.created_collection_job_id ?? null,
      autoVerification: input.autoVerification,
    },
  };

  if (input.feedbackStatus) patch.status = input.feedbackStatus;
  if (input.reviewedAt !== undefined) patch.reviewed_at = input.reviewedAt;
  if (input.createdCollectionJobId !== undefined) patch.created_collection_job_id = input.createdCollectionJobId;

  const { error } = await supabase
    .from("offer_feedback")
    .update(patch)
    .eq("id", feedback.id);
  if (error) throw error;
}

async function createForcedRecollectionJob(
  supabase: SupabaseServerClient,
  feedback: FeedbackRow,
  source: SourceRow | null,
  intent: string,
  extraResult: Record<string, unknown> = {},
): Promise<string | null> {
  const sourceId = source?.id || feedback.source_id;
  if (!sourceId) return null;
  if (feedback.created_collection_job_id) return feedback.created_collection_job_id;

  const now = new Date().toISOString();
  const jobId = stableId("feedback-forced-recollection", feedback.id, sourceId);
  const { error } = await supabase
    .from("collection_jobs")
    .upsert({
      id: jobId,
      job_type: "source",
      source_id: sourceId,
      source_name: source?.name || feedback.source_id || sourceId,
      status: "pending",
      priority: FEEDBACK_RECHECK_JOB_PRIORITY,
      attempts: 0,
      max_attempts: FEEDBACK_RECHECK_JOB_MAX_ATTEMPTS,
      requested_by: "feedback",
      locked_by: null,
      locked_until: null,
      started_at: null,
      finished_at: null,
      last_error: null,
      result: {
        feedbackId: feedback.id,
        reason: feedback.reason,
        offerId: feedback.offer_id,
        verificationIntent: intent,
        force: true,
        noCooldown: true,
        ...extraResult,
      },
      created_at: now,
      updated_at: now,
    }, { onConflict: "id" });
  if (error) throw error;
  return jobId;
}

async function countIndependentTransientFeedback(
  supabase: SupabaseServerClient,
  feedback: FeedbackRow,
): Promise<{ count: number; reasonCounts: Record<string, number> }> {
  const offerId = feedback.offer_id;
  if (!offerId) return { count: 0, reasonCounts: {} };

  const since = new Date(Date.now() - INDEPENDENT_FEEDBACK_WINDOW_MS).toISOString();
  const { data, error } = await supabase
    .from("offer_feedback")
    .select("id,reason,submitter_ip")
    .eq("offer_id", offerId)
    .in("reason", TRANSIENT_FEEDBACK_REASON_VALUES)
    .neq("status", "ignored")
    .gte("created_at", since)
    .limit(50);
  if (error) throw error;

  const fingerprints = new Set<string>();
  const reasonCounts: Record<string, number> = {};
  for (const row of data || []) {
    const record = row as Record<string, unknown>;
    const reason = stringValue(record.reason) || "other";
    const ip = stringValue(record.submitter_ip);
    fingerprints.add(ip || `feedback:${String(record.id || "")}`);
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  return { count: fingerprints.size, reasonCounts };
}

function shouldCreateForcedRecollection(
  feedback: FeedbackRow,
  offer: RawOfferRow | null,
  source: SourceRow | null,
): boolean {
  const sourceId = source?.id || offer?.source_id || feedback.source_id;
  if (!sourceId) return false;
  if (source && source.health_status && source.health_status !== "healthy") return true;

  const timestamp = firstTimestamp(
    offer?.verified_at,
    offer?.last_seen_at,
    offer?.source_updated_at,
    feedback.offer_last_seen_at,
    feedback.offer_source_updated_at,
  );
  if (!timestamp) return true;
  return Date.now() - timestamp.getTime() >= AUTO_RECHECK_STALE_MS;
}

function feedbackSnapshotScope(feedback: FeedbackRow, offer: RawOfferRow | null, source: SourceRow | null) {
  return {
    productIds: compactStrings([feedback.product_id, feedback.product_slug]),
    offerIds: compactStrings([offer?.id, feedback.offer_id]),
    sourceIds: compactStrings([source?.id, offer?.source_id, feedback.source_id]),
  };
}

function emptySnapshotScope() {
  return {
    productIds: [] as string[],
    offerIds: [] as string[],
    sourceIds: [] as string[],
  };
}

function mergeSnapshotScope(
  target: ReturnType<typeof emptySnapshotScope>,
  source: ReturnType<typeof emptySnapshotScope> | null,
): void {
  if (!source) return;
  target.productIds = compactStrings([...target.productIds, ...source.productIds]);
  target.offerIds = compactStrings([...target.offerIds, ...source.offerIds]);
  target.sourceIds = compactStrings([...target.sourceIds, ...source.sourceIds]);
}

function hasSnapshotScope(scope: ReturnType<typeof emptySnapshotScope>): boolean {
  return Boolean(scope.productIds.length || scope.offerIds.length || scope.sourceIds.length);
}

function chunks<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function firstTimestamp(...values: Array<string | null | undefined>): Date | null {
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();

  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let text = "";
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function isShopApiOfferUrl(parsed: URL): boolean {
  const host = normalizeHostname(parsed.hostname);
  return ["catfk.com", "ldxp.cn", "pay.ldxp.cn", "pay.qxvx.cn"].includes(host) && Boolean(goodsKeyFromUrl(parsed));
}

function isKamiOfferUrl(parsed: URL): boolean {
  return Boolean(kamiItemIdFromUrl(parsed));
}

function goodsKeyFromUrl(parsed: URL): string | null {
  const pathGoodsKey = parsed.pathname.match(/^\/item\/([^/?#]+)/i)?.[1] || null;
  const raw = pathGoodsKey || parsed.searchParams.get("commodity") || parsed.searchParams.get("id");
  return decodeUrlComponent(raw);
}

function kamiItemIdFromUrl(parsed: URL): string | null {
  const pathId = parsed.pathname.match(/^\/item\/([^/?#]+)/i)?.[1] || null;
  return decodeUrlComponent(pathId || parsed.searchParams.get("commodity") || parsed.searchParams.get("id"));
}

function isRemovedMessage(value: string | null | undefined): boolean {
  return /商品(?:暂未|未)?上架|暂未上架|已下架|商品不存在|商品已删除|已删除|停售|404\s*not\s*found|not\s*found/i.test(String(value || ""));
}

function isUnavailableStatus(value: string | null | undefined): boolean {
  const text = String(value || "").trim().toLowerCase();
  return text === "0" || text === "false" || text === "unavailable" || text === "offline" || text === "hidden" || text === "disabled";
}

function isAvailableStatus(value: string | null | undefined): boolean {
  const text = String(value || "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "available" || text === "online" || text === "上架";
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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

function safeUrl(value: string | null | undefined): URL | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^www\./, "");
}

function decodeUrlComponent(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}
