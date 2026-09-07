import { classifyOffer } from "./catalog";
import type { CollectorKind, OfferStatus } from "./types";

export const SUBMISSION_CLASSIFICATION_VERSION = "2026-07-18.v1";

export type SubmissionReviewStage =
  | "submitted"
  | "parsed"
  | "probe_queued"
  | "probe_running"
  | "ready_to_approve"
  | "needs_collector_review"
  | "known_collector_probe_failed"
  | "collector_todo"
  | "approval_in_progress"
  | "approval_failed"
  | "approved"
  | "rejected";

export type SubmissionQualityKind =
  | "priority_approve"
  | "valuable_lead"
  | "needs_review"
  | "low_quality"
  | "duplicate"
  | "environment_issue";

export type SubmissionQualityTone = "default" | "info" | "warn" | "success" | "danger" | "muted";

export type SubmissionProbeOffer = {
  sourceTitle: string;
  price: number | null;
  currency?: string | null;
  status?: OfferStatus | string | null;
  url?: string | null;
  tags?: string[];
};

export type SubmissionProbeResult = {
  kind?: string | null;
  status: "queued" | "running" | "success" | "empty" | "failed" | "unsupported";
  offerCount: number;
  offers?: SubmissionProbeOffer[];
  message?: string | null;
};

export type SubmissionPriceBenchmark = {
  productId: string;
  offerCount: number;
  minPrice: number;
  top5Price: number;
};

export type SubmissionPriceEvidenceSample = {
  productId: string;
  productName: string;
  title: string;
  price: number;
  minPrice: number;
  top5Price: number;
  rank: number | null;
  gapToMin: number;
  gapToTop5: number;
};

export type SubmissionPriceEvidence = {
  comparableOfferCount: number;
  benchmarkScopeCount: number;
  lowestHitCount: number;
  top5HitCount: number;
  within10PctCount: number;
  within20PctCount: number;
  highGapCount: number;
  sampleScopes: SubmissionPriceEvidenceSample[];
};

export type SubmissionPreclassification = {
  kind: SubmissionQualityKind;
  label: string;
  tone: SubmissionQualityTone;
  reasons: string[];
  detail?: string;
  priceEvidence?: SubmissionPriceEvidence | null;
  version?: string;
  classifiedAt?: string;
};

const SHARED_SHOP_HOSTS = new Set(["catfk.com", "www.ldxp.cn", "pay.ldxp.cn", "ldxp.cn", "pay.qxvx.cn"]);

export function normalizeSubmissionUrl(value: string | null | undefined): string | null {
  try {
    if (!value) return null;
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.hash = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString();
  } catch {
    return null;
  }
}

export function channelSubmissionKey(value: string | null | undefined): string | null {
  const normalized = normalizeSubmissionUrl(value);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  let pathname = parsed.pathname === "/" ? "" : parsed.pathname;
  if (SHARED_SHOP_HOSTS.has(parsed.hostname) && /^\/shop\//i.test(pathname)) {
    pathname = pathname.toLowerCase();
  }
  return `${parsed.hostname}${pathname}${parsed.search}`;
}

export function buildSubmissionPriceEvidence(
  probe: SubmissionProbeResult | null | undefined,
  benchmarks: Map<string, SubmissionPriceBenchmark>,
): SubmissionPriceEvidence | null {
  if (!probe || probe.status !== "success" || !Array.isArray(probe.offers)) return null;

  const samples: SubmissionPriceEvidenceSample[] = [];
  const scopes = new Set<string>();
  let comparableOfferCount = 0;
  let lowestHitCount = 0;
  let top5HitCount = 0;
  let within10PctCount = 0;
  let within20PctCount = 0;
  let highGapCount = 0;

  for (const offer of probe.offers) {
    if (offer.status === "out_of_stock") continue;
    if (offer.currency && offer.currency.toUpperCase() !== "CNY") continue;
    if (typeof offer.price !== "number" || !Number.isFinite(offer.price) || offer.price <= 0) continue;

    const product = classifyOffer(offer.sourceTitle, { tags: offer.tags });
    if (product.id === "other-product") continue;
    const benchmark = benchmarks.get(product.id);
    if (!benchmark || benchmark.minPrice <= 0 || benchmark.top5Price <= 0) continue;

    const gapToMin = (offer.price - benchmark.minPrice) / benchmark.minPrice;
    const gapToTop5 = (offer.price - benchmark.top5Price) / benchmark.top5Price;
    comparableOfferCount += 1;
    scopes.add(product.id);
    if (offer.price <= benchmark.minPrice) lowestHitCount += 1;
    if (offer.price <= benchmark.top5Price) top5HitCount += 1;
    if (offer.price <= benchmark.minPrice * 1.1) within10PctCount += 1;
    if (offer.price <= benchmark.minPrice * 1.2) within20PctCount += 1;
    if (gapToMin >= 0.5 && offer.price > benchmark.top5Price) highGapCount += 1;
    samples.push({
      productId: product.id,
      productName: product.displayName,
      title: offer.sourceTitle,
      price: offer.price,
      minPrice: benchmark.minPrice,
      top5Price: benchmark.top5Price,
      rank: null,
      gapToMin,
      gapToTop5,
    });
  }

  if (!comparableOfferCount) return null;
  samples.sort((a, b) => Number(a.price > a.top5Price) - Number(b.price > b.top5Price) || a.gapToMin - b.gapToMin);
  return {
    comparableOfferCount,
    benchmarkScopeCount: scopes.size,
    lowestHitCount,
    top5HitCount,
    within10PctCount,
    within20PctCount,
    highGapCount,
    sampleScopes: samples.slice(0, 5),
  };
}

export function classifySubmission(input: {
  probe?: SubmissionProbeResult | null;
  suggestedCollector?: CollectorKind | string | null;
  duplicateName?: string | null;
  existingSourceName?: string | null;
  priceEvidence?: SubmissionPriceEvidence | null;
}): SubmissionPreclassification {
  const { probe, suggestedCollector, duplicateName, existingSourceName, priceEvidence = null } = input;
  if (existingSourceName || duplicateName) {
    return summary("duplicate", "重复/已存在", "warn", [
      existingSourceName ? `已有源：${existingSourceName}` : "同渠道已有待审主记录",
      duplicateName ? `保留主记录：${duplicateName}` : "合并或忽略重复项",
    ], "合并或忽略重复项", priceEvidence);
  }

  if (probe?.status === "queued" || probe?.status === "running") {
    return summary("environment_issue", probe.status === "queued" ? "已入队试采集" : "采集中", "info", [
      "shopApi 由低频采集节点执行",
      "等待节点回流结果前不按低质处理",
    ], undefined, priceEvidence);
  }

  if (probe && probe.status !== "success" && isProbeRuntimeIssue(probe)) {
    return summary("environment_issue", "采集环境问题", "info", [
      probe.message || "试采集触发风控或验证",
      "建议低频重试，不直接拒绝",
    ], undefined, priceEvidence);
  }

  if (probe?.status === "success") {
    const duplicateTitles = duplicateProbeTitleCount(probe.offers || []);
    const strongPrice = Boolean(priceEvidence && (
      priceEvidence.lowestHitCount > 0 || priceEvidence.top5HitCount >= 2 || priceEvidence.within10PctCount >= 2
    ));
    const noPriceAdvantage = Boolean(priceEvidence && priceEvidence.comparableOfferCount >= 3
      && priceEvidence.top5HitCount === 0 && priceEvidence.within20PctCount === 0);

    if ((strongPrice || probe.offerCount >= 8) && duplicateTitles <= Math.max(2, Math.floor(probe.offerCount * 0.5))) {
      return summary("priority_approve", "优先通过", "success", [
        `采到 ${probe.offerCount} 条报价`,
        pricePositiveReason(priceEvidence) || "覆盖样本相对充足",
      ], strongPrice ? "价格有前列证据" : "样本充足", priceEvidence);
    }
    if (noPriceAdvantage && probe.offerCount >= 3) {
      return summary("low_quality", "低质/无优势", "danger", [
        priceRiskReason(priceEvidence) || "可比报价暂无价格优势",
        `采到 ${probe.offerCount} 条报价`,
      ], undefined, priceEvidence);
    }
    if (probe.offerCount <= 2) {
      return summary("valuable_lead", "有价值线索", "info", [
        `仅采到 ${probe.offerCount} 条报价`,
        pricePositiveReason(priceEvidence) || "样本不足，先观察是否有独特低价",
      ], undefined, priceEvidence);
    }
    if (duplicateTitles > Math.max(2, Math.floor(probe.offerCount * 0.6))) {
      return summary("needs_review", "观察/待复核", "warn", ["商品标题重复度偏高", `采到 ${probe.offerCount} 条报价`], undefined, priceEvidence);
    }
    return summary("valuable_lead", "有价值线索", "info", [
      `采到 ${probe.offerCount} 条报价`,
      pricePositiveReason(priceEvidence) || "可入库，但仍需人工看价格优势",
    ], undefined, priceEvidence);
  }

  if (probe?.status === "empty") {
    return summary("low_quality", "低质/无优势", "danger", ["试采集完成但无可比价商品", "优先确认是否空店、非目标商品或解析不足"], undefined, priceEvidence);
  }
  if (probe?.status === "unsupported") {
    return summary("needs_review", "观察/待复核", "warn", ["暂未识别可用采集器", "可转采集器待办或拒绝"], undefined, priceEvidence);
  }
  if (probe?.status === "failed") {
    return summary("needs_review", "观察/待复核", "warn", [probe.message || "试采集失败", "失败原因不明确，先人工复核"], undefined, priceEvidence);
  }
  if (String(suggestedCollector || "").toLowerCase() === "shopapi") {
    return summary("environment_issue", "待低频试采集", "info", ["已识别 shopApi 类型", "点击试采集后会入队给轻量节点"], undefined, priceEvidence);
  }
  return summary("needs_review", "观察/待复核", "muted", ["已有基础解析，缺少试采集证据"], undefined, priceEvidence);
}

export function storedPreclassification(summaryValue: SubmissionPreclassification, classifiedAt = new Date().toISOString()): SubmissionPreclassification {
  return { ...summaryValue, version: SUBMISSION_CLASSIFICATION_VERSION, classifiedAt };
}

function summary(
  kind: SubmissionQualityKind,
  label: string,
  tone: SubmissionQualityTone,
  reasons: string[],
  detail?: string,
  priceEvidence?: SubmissionPriceEvidence | null,
): SubmissionPreclassification {
  return { kind, label, tone, reasons, ...(detail ? { detail } : {}), priceEvidence: priceEvidence || null };
}

function isProbeRuntimeIssue(probe: SubmissionProbeResult): boolean {
  return /验证|风控|captcha|challenge|waf|安全|http 403|verification/i.test(`${probe.message || ""} ${probe.kind || ""}`);
}

function duplicateProbeTitleCount(offers: SubmissionProbeOffer[]): number {
  const counts = new Map<string, number>();
  for (const offer of offers) {
    const key = offer.sourceTitle.trim().toLowerCase().replace(/\s+/g, " ");
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  }
  let duplicates = 0;
  for (const count of counts.values()) duplicates += Math.max(0, count - 1);
  return duplicates;
}

function pricePositiveReason(evidence: SubmissionPriceEvidence | null | undefined): string | null {
  if (!evidence?.comparableOfferCount) return null;
  const total = evidence.comparableOfferCount;
  if (evidence.lowestHitCount) return `命中库内最低价 ${evidence.lowestHitCount}/${total}`;
  if (evidence.top5HitCount) return `进入库内前五价 ${evidence.top5HitCount}/${total}`;
  if (evidence.within10PctCount) return `接近最低价 10% 内 ${evidence.within10PctCount}/${total}`;
  if (evidence.within20PctCount) return `接近最低价 20% 内 ${evidence.within20PctCount}/${total}`;
  return null;
}

function priceRiskReason(evidence: SubmissionPriceEvidence | null | undefined): string | null {
  if (!evidence?.comparableOfferCount) return null;
  if (evidence.highGapCount) return `可比 ${evidence.comparableOfferCount} 条，高价偏离 ${evidence.highGapCount} 条`;
  return `可比 ${evidence.comparableOfferCount} 条，未进前五价或最低价 20% 内`;
}
