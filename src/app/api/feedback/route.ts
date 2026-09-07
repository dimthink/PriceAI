import { z } from "zod";
import { after } from "next/server";
import { createOfferFeedback, runOfferFeedbackRiskPrecheck } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import {
  OFFER_CLASSIFICATION_VERSION,
  classifyOffer,
  findCanonicalCatalogProduct,
} from "@/lib/catalog";
import {
  closePendingTransientOfferFeedback,
  runOfferFeedbackAutoVerification,
  runOfferFeedbackMultiFeedbackEscalation,
} from "@/lib/feedback-auto-verification";
import {
  assertFeedbackEvidenceOwnership,
  bindFeedbackEvidenceReferences,
  isFeedbackEvidenceReference,
} from "@/lib/feedback-evidence";
import {
  checkPublicWriteRateLimit,
  getPublicClientFingerprint,
  getPublicRequestErrorStatus,
  readJsonWithLimit,
} from "@/lib/public-request";
import { feedbackRequiresContact, HIGH_RISK_FEEDBACK_REASONS, MODEL_PRECHECK_FEEDBACK_REASONS, shouldCreateFeedbackVerification } from "@/lib/trust-risk";
import { offerFeedbackReasonValues } from "@/lib/types";
import {
  OFFER_FILTER_TAG_BY_ID,
  deriveOfferFilterTags,
  offerFilterTagAppliesToProduct,
  parseOfferFilterTagsForProduct,
  type OfferFilterTagId,
} from "@/lib/offer-filter-tags";
import { getSupabaseServerClient } from "@/lib/supabase";

const PUBLIC_OFFER_FEEDBACK_RATE_LIMIT_PER_HOUR = 20;
const reasonSchema = z.enum(offerFeedbackReasonValues);
const userExpectedActionSchema = z.enum(["recheck", "hide_offer", "hide_source", "unsure"]);
const feedbackScopeSchema = z.enum(["offer", "merchant"]);
const issueDimensionSchema = z.enum(["product_category", "filter_tag", "source_placement", "unsure"]);

const schema = z.object({
  feedbackScope: feedbackScopeSchema.default("offer"),
  publicConsent: z.boolean().optional(),
  productId: z.string().max(200).nullable().optional(),
  productSlug: z.string().max(200).nullable().optional(),
  productName: z.string().max(200).nullable().optional(),
  offerId: z.string().max(200).nullable().optional(),
  sourceId: z.string().max(200).nullable().optional(),
  sourceName: z.string().max(300).nullable().optional(),
  sourceTitle: z.string().max(1000).nullable().optional(),
  offerUrl: z.string().url().max(2048).nullable().optional(),
  offerPrice: z.number().nullable().optional(),
  offerCurrency: z.string().max(20).nullable().optional(),
  offerStatus: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]).nullable().optional(),
  offerCapturedAt: z.string().max(100).nullable().optional(),
  offerSourceUpdatedAt: z.string().max(100).nullable().optional(),
  offerLastSeenAt: z.string().max(100).nullable().optional(),
  offerTags: z.array(z.string().max(200)).max(50).nullable().optional(),
  reason: reasonSchema,
  issueDimension: issueDimensionSchema.nullable().optional(),
  expectedProductId: z.string().trim().max(200).nullable().optional(),
  reportedFilterTagId: z.string().trim().max(100).nullable().optional(),
  expectedFilterTagId: z.string().trim().max(100).nullable().optional(),
  userExpectedAction: userExpectedActionSchema.nullable().optional(),
  evidenceText: z.string().trim().max(1000).nullable().optional(),
  evidenceUrls: z.array(
    z.string().max(2048).refine((value) => isAllowedEvidenceUrl(value), "证据链接格式不正确。"),
  ).max(10).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  contact: z.string().trim().max(200).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
}).superRefine((value, context) => {
  if (value.reason !== "wrong_category") return;
  if (!value.issueDimension) {
    context.addIssue({ code: "custom", path: ["issueDimension"], message: "请选择具体是哪一类分类问题。" });
    return;
  }
  if (value.feedbackScope === "offer" && !value.offerId) {
    context.addIssue({ code: "custom", path: ["offerId"], message: "缺少报价 ID，请刷新页面后重试。" });
  }
  if (value.issueDimension === "product_category" && !value.expectedProductId) {
    context.addIssue({ code: "custom", path: ["expectedProductId"], message: "请选择正确分类。" });
  }
  if (value.issueDimension === "product_category" && value.expectedProductId === value.productId) {
    context.addIssue({ code: "custom", path: ["expectedProductId"], message: "期望分类不能与当前分类相同。" });
  }
  if (value.issueDimension === "filter_tag" && !value.reportedFilterTagId && !value.expectedFilterTagId) {
    context.addIssue({ code: "custom", path: ["reportedFilterTagId"], message: "请选择错误标签，或选择应该补充的标签。" });
  }
  if (
    value.issueDimension === "filter_tag" &&
    value.reportedFilterTagId &&
    value.reportedFilterTagId === value.expectedFilterTagId
  ) {
    context.addIssue({ code: "custom", path: ["expectedFilterTagId"], message: "错误标签与期望标签不能相同。" });
  }
});

function isAllowedEvidenceUrl(value: string): boolean {
  if (value.startsWith("r2:")) return isFeedbackEvidenceReference(value);
  if (isFeedbackEvidenceReference(value)) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "反馈内容格式不正确。";
  if (error instanceof Error) return error.message;
  return "反馈提交失败。";
}

function getErrorStatus(error: unknown, message: string): number {
  const publicRequestStatus = getPublicRequestErrorStatus(error);
  if (publicRequestStatus) return publicRequestStatus;
  if (error instanceof z.ZodError) return 400;
  if (message.includes("刚刚被反馈过") || message.includes("商家问题刚刚")) return 409;
  if (message.includes("反馈过于频繁")) return 429;
  if (message.includes("需要提交") || message.includes("需要至少上传")) return 400;
  if (message.includes("需要留下")) return 400;
  return 500;
}

export async function POST(request: Request) {
  try {
    const submitterIp = getPublicClientFingerprint(request);
    checkPublicWriteRateLimit({
      scope: "offer-feedback",
      key: submitterIp,
      limit: PUBLIC_OFFER_FEEDBACK_RATE_LIMIT_PER_HOUR,
    });

    const payload = schema.parse(await readJsonWithLimit(request));
    const feedbackScope = payload.feedbackScope;

    if (payload.website) {
      return Response.json({ ok: true });
    }

    const user = await getCurrentUser();
    if ((feedbackScope === "merchant" || HIGH_RISK_FEEDBACK_REASONS.has(payload.reason)) && !user) {
      return Response.json(
        { ok: false, code: "auth_required", message: "这类反馈可能影响公开展示和商家声誉，需要登录后提交。" },
        { status: 401, headers: noStoreCacheHeaders() },
      );
    }
    const evidenceUrls = payload.evidenceUrls || [];
    const hasManagedEvidence = evidenceUrls.some((value) => value.startsWith("r2://feedback-evidence/feedback-drafts/"));
    if (hasManagedEvidence && !user) {
      return Response.json(
        { ok: false, code: "auth_required", message: "登录后才能提交已上传的图片证据。" },
        { status: 401, headers: noStoreCacheHeaders() },
      );
    }
    if (user) await assertFeedbackEvidenceOwnership(evidenceUrls, user.id);

    if (feedbackRequiresContact(payload.reason) && !payload.contact?.trim()) {
      return Response.json(
        { ok: false, message: "这类反馈需要留下 QQ、微信或 Telegram，方便后台核验和追问证据。" },
        { status: 400 },
      );
    }

    let authoritativeOffer: {
      canonical_product_id: string | null;
      source_title: string | null;
      tags: unknown;
      public_filter_tags: unknown;
    } | null = null;
    if (payload.reason === "wrong_category" && feedbackScope === "offer") {
      const supabase = getSupabaseServerClient();
      if (!supabase) {
        return Response.json({ ok: false, message: "反馈服务暂不可用，请稍后重试。" }, { status: 503 });
      }
      const { data, error } = await supabase
        .from("raw_offers")
        .select("canonical_product_id,source_title,tags,public_filter_tags")
        .eq("id", payload.offerId || "")
        .maybeSingle();
      if (error || !data) {
        return Response.json({ ok: false, message: "报价不存在或已更新，请刷新页面后重试。" }, { status: 400 });
      }
      authoritativeOffer = data;
    }

    const authoritativeProductId = authoritativeOffer?.canonical_product_id || payload.productId || null;
    const authoritativeSourceTitle = authoritativeOffer?.source_title || payload.sourceTitle || "";
    const authoritativeOfferTags = Array.isArray(authoritativeOffer?.tags)
      ? authoritativeOffer.tags.filter((tag): tag is string => typeof tag === "string")
      : payload.offerTags || [];
    const storedFilterTags = Array.isArray(authoritativeOffer?.public_filter_tags)
      ? authoritativeOffer.public_filter_tags.filter((tag): tag is string => typeof tag === "string")
      : [];

    const feedbackId = crypto.randomUUID();
    const classifiedProduct = payload.reason === "wrong_category"
      ? classifyOffer(authoritativeSourceTitle, {
        tags: authoritativeOfferTags,
      })
      : null;
    const expectedProduct = payload.expectedProductId
      ? findCanonicalCatalogProduct(payload.expectedProductId)
      : null;
    if (payload.expectedProductId && !expectedProduct) {
      return Response.json({ ok: false, message: "期望分类不存在，请刷新页面后重试。" }, { status: 400 });
    }
    if (payload.issueDimension === "product_category" && expectedProduct?.id === authoritativeProductId) {
      return Response.json({ ok: false, message: "期望分类与当前分类相同；如果是标签不对，请选择筛选标签错误。" }, { status: 400 });
    }
    const reportedFilterTag = payload.reportedFilterTagId
      ? OFFER_FILTER_TAG_BY_ID.get(payload.reportedFilterTagId as OfferFilterTagId)
      : null;
    const expectedFilterTag = payload.expectedFilterTagId
      ? OFFER_FILTER_TAG_BY_ID.get(payload.expectedFilterTagId as OfferFilterTagId)
      : null;
    if (payload.reportedFilterTagId && !reportedFilterTag) {
      return Response.json({ ok: false, message: "错误标签不存在，请刷新页面后重试。" }, { status: 400 });
    }
    if (payload.expectedFilterTagId && !expectedFilterTag) {
      return Response.json({ ok: false, message: "期望标签不存在，请刷新页面后重试。" }, { status: 400 });
    }
    if (
      payload.issueDimension === "filter_tag" &&
      authoritativeProductId &&
      reportedFilterTag &&
      !offerFilterTagAppliesToProduct(authoritativeProductId, reportedFilterTag.id)
    ) {
      return Response.json({ ok: false, message: "错误标签不适用于当前商品，请刷新页面后重试。" }, { status: 400 });
    }
    if (
      payload.issueDimension === "filter_tag" &&
      authoritativeProductId &&
      expectedFilterTag &&
      !offerFilterTagAppliesToProduct(authoritativeProductId, expectedFilterTag.id)
    ) {
      return Response.json({ ok: false, message: "期望标签不适用于当前商品，请刷新页面后重试。" }, { status: 400 });
    }
    const currentFilterTags = authoritativeProductId
      ? parseOfferFilterTagsForProduct(
          authoritativeProductId,
          storedFilterTags.length
            ? storedFilterTags
            : deriveOfferFilterTags({ sourceTitle: authoritativeSourceTitle, tags: authoritativeOfferTags }),
        )
      : [];
    if (reportedFilterTag && !currentFilterTags.includes(reportedFilterTag.id)) {
      return Response.json({ ok: false, message: "所报错误标签已不在当前报价中，请刷新页面后重试。" }, { status: 400 });
    }
    if (expectedFilterTag && currentFilterTags.includes(expectedFilterTag.id)) {
      return Response.json({ ok: false, message: "期望标签已存在于当前报价，请刷新页面后重试。" }, { status: 400 });
    }
    const result = await createOfferFeedback({
      id: feedbackId,
      feedbackScope,
      publicStatus: payload.publicConsent === false ? "not_public" : undefined,
      productId: authoritativeProductId,
      productSlug: payload.productSlug || null,
      productName: payload.productName || null,
      offerId: payload.offerId || null,
      sourceId: payload.sourceId || null,
      sourceName: payload.sourceName || null,
      sourceTitle: authoritativeSourceTitle || null,
      offerUrl: payload.offerUrl || null,
      offerPrice: payload.offerPrice ?? null,
      offerCurrency: payload.offerCurrency || null,
      offerStatus: payload.offerStatus || null,
      offerCapturedAt: payload.offerCapturedAt || null,
      offerSourceUpdatedAt: payload.offerSourceUpdatedAt || null,
      offerLastSeenAt: payload.offerLastSeenAt || null,
      reason: payload.reason,
      issueDimension: payload.reason === "wrong_category" ? payload.issueDimension || "unsure" : null,
      expectedProductId: payload.issueDimension === "product_category" ? expectedProduct?.id || null : null,
      classificationVersion: classifiedProduct ? OFFER_CLASSIFICATION_VERSION : null,
      classificationResult: classifiedProduct ? {
        productId: classifiedProduct.id,
        platform: classifiedProduct.platform,
        productType: classifiedProduct.productType,
        sourceTitle: authoritativeSourceTitle || null,
        tags: authoritativeOfferTags,
        reportedFilterTagId: payload.issueDimension === "filter_tag" ? reportedFilterTag?.id || null : null,
        expectedFilterTagId: payload.issueDimension === "filter_tag" ? expectedFilterTag?.id || null : null,
      } : null,
      userExpectedAction: payload.userExpectedAction || "unsure",
      evidenceText: payload.evidenceText || null,
      evidenceUrls,
      notes: payload.notes || null,
      contact: payload.contact || null,
      submitterIp,
      userId: user?.id || null,
      userEmail: user?.email || null,
      userDisplayName: user?.displayName || null,
    });

    if (user && hasManagedEvidence) {
      try {
        await bindFeedbackEvidenceReferences({ references: evidenceUrls, userId: user.id, feedbackId: result.id });
      } catch (bindError) {
        await getSupabaseServerClient()?.from("offer_feedback").delete().eq("id", result.id);
        throw bindError;
      }
    }

    after(async () => {
      try {
        const snapshotScope = emptyFeedbackSnapshotScope();
        if (shouldCreateFeedbackVerification(payload.reason, payload.notes, payload.evidenceText)) {
          const verification = await runOfferFeedbackAutoVerification(result.id);
          mergeFeedbackSnapshotScope(snapshotScope, verification.snapshotScope);
        } else if (payload.offerId) {
          const escalation = await runOfferFeedbackMultiFeedbackEscalation(result.id);
          mergeFeedbackSnapshotScope(snapshotScope, escalation.snapshotScope);
        }

        if (MODEL_PRECHECK_FEEDBACK_REASONS.has(payload.reason) && payload.publicConsent !== false) {
          const feedback = await runOfferFeedbackRiskPrecheck(result.id);
          clearPublicDataCache();
          await markPublicApiSnapshotsDirty("public feedback precheck", {
            productIds: [feedback.productId, feedback.productSlug],
            offerIds: [feedback.offerId],
            sourceIds: [feedback.sourceId],
          });
        }

        if (payload.offerId) {
          const closeup = await closePendingTransientOfferFeedback({ offerIds: [payload.offerId], limit: 100 });
          mergeFeedbackSnapshotScope(snapshotScope, closeup.snapshotScope);
        }

        if (hasFeedbackSnapshotScope(snapshotScope)) {
          clearPublicDataCache();
          await markPublicApiSnapshotsDirty("public feedback closeup", snapshotScope);
        }
      } catch (error) {
        console.warn("Offer feedback background verification failed:", error instanceof Error ? error.message : error);
      }
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = getErrorMessage(error);
    return Response.json({ ok: false, message }, { status: getErrorStatus(error, message) });
  }
}

function emptyFeedbackSnapshotScope() {
  return {
    productIds: [] as string[],
    offerIds: [] as string[],
    sourceIds: [] as string[],
  };
}

function mergeFeedbackSnapshotScope(
  target: ReturnType<typeof emptyFeedbackSnapshotScope>,
  source: ReturnType<typeof emptyFeedbackSnapshotScope> | null,
): void {
  if (!source) return;
  target.productIds = Array.from(new Set([...target.productIds, ...source.productIds].filter(Boolean)));
  target.offerIds = Array.from(new Set([...target.offerIds, ...source.offerIds].filter(Boolean)));
  target.sourceIds = Array.from(new Set([...target.sourceIds, ...source.sourceIds].filter(Boolean)));
}

function hasFeedbackSnapshotScope(scope: ReturnType<typeof emptyFeedbackSnapshotScope>): boolean {
  return Boolean(scope.productIds.length || scope.offerIds.length || scope.sourceIds.length);
}
