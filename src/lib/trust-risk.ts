import type {
  OfferFeedbackReason,
  OfferFeedbackSuggestedAction,
  OfferFeedbackUserExpectedAction,
  RawOffer,
} from "@/lib/types";

export const AFTERSALES_FEEDBACK_REASON = "aftersales_shipping" satisfies OfferFeedbackReason;
export const HIGH_RISK_FEEDBACK_REASONS: ReadonlySet<OfferFeedbackReason> = new Set([
  AFTERSALES_FEEDBACK_REASON,
  "fraud",
  "bad_source",
]);
export const FEEDBACK_IMAGE_EVIDENCE_REQUIRED_REASONS: ReadonlySet<OfferFeedbackReason> = new Set([
  "description_mismatch",
  AFTERSALES_FEEDBACK_REASON,
  "fraud",
  "bad_source",
]);
export const FEEDBACK_EVIDENCE_REQUIRED_REASONS: ReadonlySet<OfferFeedbackReason> = new Set([
  "description_mismatch",
  AFTERSALES_FEEDBACK_REASON,
  "fraud",
  "bad_source",
]);
export const MODEL_PRECHECK_FEEDBACK_REASONS: ReadonlySet<OfferFeedbackReason> = new Set([
  "description_mismatch",
  AFTERSALES_FEEDBACK_REASON,
  "fraud",
  "bad_source",
]);
export const LOW_RISK_VERIFICATION_REASONS: ReadonlySet<OfferFeedbackReason> = new Set([
  "item_removed",
  "stock_mismatch",
]);

export const API_CDK_PLATFORM = "API/CDK";
export const API_CDK_PRODUCT_ID = "openai-api-cdk";
// Kept for old deploy environments; API/CDK is no longer restorable through public visibility flags.
export const API_CDK_PUBLIC_VISIBILITY_ENV = "NEXT_PUBLIC_PRICEAI_SHOW_API_CDK";
export const API_CDK_SERVER_VISIBILITY_ENV = "PRICEAI_SHOW_API_CDK";
export const OFFER_EXIT_NOTICE_MUTED_DATE_KEY = "priceai:offer-exit-notice-muted-date";
export const OFFER_HIGH_RISK_PRICE_THRESHOLD = 30;

export type RiskPrecheckScope = "offer" | "source" | "mixed";
export type RiskPrecheckCategory = "description_mismatch" | "fraud" | "bad_source" | "aftersales_shipping";
export type RiskPrecheckEvidenceQuality = "none" | "low" | "medium" | "high";
export type RiskPrecheckAbuseRisk = "low" | "medium" | "high";
export type PublicRiskPrecheck = {
  canShowPublicly: boolean;
  riskLevel: "low" | "medium" | "high";
  riskScope: RiskPrecheckScope;
  riskCategory: RiskPrecheckCategory;
  confidence: number;
  abuseRisk: RiskPrecheckAbuseRisk;
  evidenceQuality: RiskPrecheckEvidenceQuality;
  publicSummary: string;
  offerSummary: string | null;
  offerPublicSummary: string;
  sourceCanShowPublicly: boolean;
  sourcePublicSummary: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
};

export const RISK_PRECHECK_ENV = {
  apiKey: "PRICEAI_RISK_REVIEW_API_KEY",
  baseUrl: "PRICEAI_RISK_REVIEW_BASE_URL",
  model: "PRICEAI_RISK_REVIEW_MODEL",
  timeoutMs: "PRICEAI_RISK_REVIEW_TIMEOUT_MS",
} as const;

export const DEFAULT_RISK_REVIEW_BASE_URL = "https://opencode.ai/zen/go/v1";
export const DEFAULT_RISK_REVIEW_MODEL = "mimo-v2.5";
export const RISK_PRECHECK_PUBLIC_TTL_HOURS = 72;

export function feedbackRequiresEvidence(
  reason: OfferFeedbackReason | string,
  _userExpectedAction?: OfferFeedbackUserExpectedAction | string | null,
): boolean {
  void _userExpectedAction;
  return FEEDBACK_EVIDENCE_REQUIRED_REASONS.has(reason as OfferFeedbackReason);
}

export function feedbackRequiresImageEvidence(
  reason: OfferFeedbackReason | string,
  _userExpectedAction?: OfferFeedbackUserExpectedAction | string | null,
): boolean {
  void _userExpectedAction;
  return FEEDBACK_IMAGE_EVIDENCE_REQUIRED_REASONS.has(reason as OfferFeedbackReason);
}

export function hasFeedbackImageEvidenceReference(values: readonly string[] | null | undefined): boolean {
  return countFeedbackImageEvidenceReferences(values) > 0;
}

export function countFeedbackImageEvidenceReferences(values: readonly string[] | null | undefined): number {
  if (!values?.length) return 0;
  return values.filter(isFeedbackImageEvidenceReference).length;
}

export function isFeedbackImageEvidenceReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("r2://feedback-evidence/")) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "r2:" || parsed.hostname !== "feedback-evidence") return false;
    return /^\/(?:feedback\/\d{4}\/\d{2}\/[0-9a-f-]{36}|feedback-drafts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36})\.(?:jpg|png|webp)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function feedbackRequiresContact(reason: OfferFeedbackReason | string): boolean {
  return HIGH_RISK_FEEDBACK_REASONS.has(reason as OfferFeedbackReason);
}

export function inferSuggestedActionForFeedback(reason: OfferFeedbackReason): OfferFeedbackSuggestedAction {
  if (reason === "wrong_price" || reason === "stock_mismatch") return "recollect";
  if (reason === "item_removed") return "hide_offer";
  if (reason === "fraud") return "hide_offer";
  if (reason === "bad_source") return "hide_source";
  if (reason === "wrong_category") return "reclassify";
  if (reason === AFTERSALES_FEEDBACK_REASON) return "todo";
  return "todo";
}

export function shouldCreateFeedbackVerification(
  reason: OfferFeedbackReason,
  notes?: string | null,
  evidenceText?: string | null,
): boolean {
  if (LOW_RISK_VERIFICATION_REASONS.has(reason)) return true;

  if (reason !== "wrong_price" && reason !== "other") return false;
  const text = `${notes || ""} ${evidenceText || ""}`.toLowerCase();
  return /已下架|下架|无法下单|不能下单|不能购买|无法购买|链接打不开|404|失效|无货|缺货/.test(text);
}

function shouldTrackFeedbackRecollection(reason: OfferFeedbackReason): boolean {
  return reason === "wrong_price";
}

export function buildInitialFeedbackVerificationResult(input: {
  reason: OfferFeedbackReason;
  notes?: string | null;
  evidenceText?: string | null;
  offerStatus?: RawOffer["status"] | null;
  createdAt?: string;
}): Record<string, unknown> | null {
  const shouldVerifyLink = shouldCreateFeedbackVerification(input.reason, input.notes, input.evidenceText);
  if (!shouldVerifyLink && !shouldTrackFeedbackRecollection(input.reason)) return null;

  if (!shouldVerifyLink && shouldTrackFeedbackRecollection(input.reason)) {
    return {
      verificationStatus: "pending",
      verificationResult: null,
      verifiedAt: null,
      verificationMessage: "已进入价格待重采队列；默认不跑链接下架核验。",
      verificationReason: input.reason,
      verificationIntent: "price_recollection",
      createdCollectionJobId: null,
      currentOfferStatus: input.offerStatus || null,
      queuedAt: input.createdAt || new Date().toISOString(),
    };
  }

  return {
    verificationStatus: "pending",
    verificationResult: null,
    verifiedAt: null,
    verificationMessage: "已进入后台核验队列；前台提交未同步抓取原站。",
    verificationReason: input.reason,
    createdCollectionJobId: null,
    currentOfferStatus: input.offerStatus || null,
    queuedAt: input.createdAt || new Date().toISOString(),
  };
}

export function apiCdkPublicVisible(): boolean {
  void API_CDK_SERVER_VISIBILITY_ENV;
  void API_CDK_PUBLIC_VISIBILITY_ENV;
  return false;
}

export function apiCdkPublicVisibleForClient(): boolean {
  void API_CDK_PUBLIC_VISIBILITY_ENV;
  return false;
}

export function isApiCdkProductLike(product: { id?: string | null; platform?: string | null } | null | undefined): boolean {
  return product?.platform === API_CDK_PLATFORM || product?.id === API_CDK_PRODUCT_ID;
}

export function isPublicCatalogProduct(product: { id?: string | null; platform?: string | null }): boolean {
  return !isApiCdkProductLike(product);
}

export function isShopApiOffer(
  offer: Pick<RawOffer, "sourceId" | "sourceName" | "sourceStoreName" | "collectorKind" | "sourceTitle" | "url" | "tags">,
): boolean {
  if (offer.collectorKind === "shopApi") return true;

  const haystack = [
    offer.sourceId || "",
    offer.sourceName || "",
    offer.sourceStoreName || "",
    offer.sourceTitle || "",
    offer.url || "",
    ...(Array.isArray(offer.tags) ? offer.tags : []),
  ].join(" ").toLowerCase();

  return /shopapi|shop api|shop-api|liandong|链动|鏈動|ldxp|pay\.ldxp\.cn|pay\.qxvx\.cn|catfk\.com/.test(haystack);
}

export type OfferRiskHint = {
  id: "feedback_risk";
  label: "提示与风险";
  detail: string;
  tone: "warn";
};

export function getOfferRiskHints(offer: RawOffer): OfferRiskHint[] {
  if (!offer.riskFeedback?.count) return [];

  const summary = offer.riskFeedback.offerSummaries?.[0] ||
    offer.riskFeedback.summaries?.[0] ||
    "有用户反馈该报价存在需要核验的问题。购买前建议先联系商家确认商品细节、交付方式和售后处理规则。";

  return [{
    id: "feedback_risk",
    label: "提示与风险",
    detail: summary,
    tone: "warn",
  }];
}

export function getPublicRiskPrecheck(
  value: unknown,
  now: Date = new Date(),
): PublicRiskPrecheck | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const raw = record.riskPrecheck && typeof record.riskPrecheck === "object"
    ? record.riskPrecheck as Record<string, unknown>
    : null;
  if (!raw) return null;
  if (raw.publicHidden === true) return null;
  if (raw.status !== "ready" || raw.canShowPublicly !== true) return null;

  const expiresAt = stringOrNull(raw.expiresAt);
  if (expiresAt) {
    const expiresAtMs = new Date(expiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= now.getTime()) return null;
  }

  const riskCategory = normalizeRiskPrecheckCategory(raw.riskCategory);
  const publicSummary = normalizePublicRiskSummary(raw.offerPublicSummary) ||
    normalizePublicRiskSummary(raw.publicSummary);
  const sourcePublicSummary = raw.sourceCanShowPublicly === true
    ? normalizePublicRiskSummary(raw.sourcePublicSummary) || publicSummary
    : null;
  const confidence = clampNumber(raw.confidence, 0, 1, 0);

  if (!riskCategory || !publicSummary || confidence < 0.45) return null;

  return {
    canShowPublicly: true,
    riskLevel: normalizeRiskLevel(raw.riskLevel),
    riskScope: sourcePublicSummary ? "mixed" : "offer",
    riskCategory,
    confidence,
    abuseRisk: normalizeAbuseRisk(raw.abuseRisk),
    evidenceQuality: normalizeEvidenceQuality(raw.evidenceQuality),
    publicSummary,
    offerSummary: stringOrNull(raw.offerSummary),
    offerPublicSummary: publicSummary,
    sourceCanShowPublicly: Boolean(sourcePublicSummary),
    sourcePublicSummary,
    reviewedAt: stringOrNull(raw.reviewedAt),
    expiresAt,
  };
}

export function isHighRiskOutboundOffer(offer: RawOffer): boolean {
  return !isShopApiOffer(offer) || isHighPriceOffer(offer);
}

function isHighPriceOffer(offer: Pick<RawOffer, "price">): boolean {
  return typeof offer.price === "number" && Number.isFinite(offer.price) && offer.price >= OFFER_HIGH_RISK_PRICE_THRESHOLD;
}

function normalizeRiskLevel(value: unknown): PublicRiskPrecheck["riskLevel"] {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function normalizeRiskPrecheckCategory(value: unknown): RiskPrecheckCategory | null {
  if (value === "description_mismatch" || value === "fraud" || value === "bad_source" || value === AFTERSALES_FEEDBACK_REASON) return value;
  return null;
}

function normalizeAbuseRisk(value: unknown): RiskPrecheckAbuseRisk {
  return value === "medium" || value === "high" || value === "low" ? value : "medium";
}

function normalizeEvidenceQuality(value: unknown): RiskPrecheckEvidenceQuality {
  return value === "none" || value === "low" || value === "medium" || value === "high" ? value : "low";
}

function normalizePublicRiskSummary(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\s+/g, " ")
    .replace(/(微信|VX|QQ|手机号|电话|邮箱)[:：]?\s*[A-Za-z0-9_@.+-]{4,}/gi, "$1已脱敏")
    .trim();
  if (text.length < 8) return null;
  return text.slice(0, 160);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
