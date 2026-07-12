import { z } from "zod";
import { after } from "next/server";
import { createOfferFeedback, runOfferFeedbackRiskPrecheck } from "@/lib/admin";
import { clearPublicDataCache, markPublicApiSnapshotsDirty } from "@/lib/data";
import {
  closePendingTransientOfferFeedback,
  runOfferFeedbackAutoVerification,
  runOfferFeedbackMultiFeedbackEscalation,
} from "@/lib/feedback-auto-verification";
import { isFeedbackEvidenceReference } from "@/lib/feedback-evidence";
import {
  checkPublicWriteRateLimit,
  getPublicClientFingerprint,
  getPublicRequestErrorStatus,
  readJsonWithLimit,
} from "@/lib/public-request";
import { feedbackRequiresContact, HIGH_RISK_FEEDBACK_REASONS, shouldCreateFeedbackVerification } from "@/lib/trust-risk";
import { offerFeedbackReasonValues } from "@/lib/types";

const PUBLIC_OFFER_FEEDBACK_RATE_LIMIT_PER_HOUR = 20;
const reasonSchema = z.enum(offerFeedbackReasonValues);
const userExpectedActionSchema = z.enum(["recheck", "hide_offer", "hide_source", "unsure"]);

const schema = z.object({
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
  reason: reasonSchema,
  userExpectedAction: userExpectedActionSchema.nullable().optional(),
  evidenceText: z.string().trim().max(1000).nullable().optional(),
  evidenceUrls: z.array(
    z.string().max(2048).refine((value) => isAllowedEvidenceUrl(value), "证据链接格式不正确。"),
  ).max(10).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  contact: z.string().trim().max(200).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
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
  if (message.includes("刚刚被反馈过")) return 409;
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

    if (payload.website) {
      return Response.json({ ok: true });
    }

    if (feedbackRequiresContact(payload.reason) && !payload.contact?.trim()) {
      return Response.json(
        { ok: false, message: "这类反馈需要留下 QQ、微信或 Telegram，方便后台核验和追问证据。" },
        { status: 400 },
      );
    }

    const result = await createOfferFeedback({
      productId: payload.productId || null,
      productSlug: payload.productSlug || null,
      productName: payload.productName || null,
      offerId: payload.offerId || null,
      sourceId: payload.sourceId || null,
      sourceName: payload.sourceName || null,
      sourceTitle: payload.sourceTitle || null,
      offerUrl: payload.offerUrl || null,
      offerPrice: payload.offerPrice ?? null,
      offerCurrency: payload.offerCurrency || null,
      offerStatus: payload.offerStatus || null,
      offerCapturedAt: payload.offerCapturedAt || null,
      offerSourceUpdatedAt: payload.offerSourceUpdatedAt || null,
      offerLastSeenAt: payload.offerLastSeenAt || null,
      reason: payload.reason,
      userExpectedAction: payload.userExpectedAction || "recheck",
      evidenceText: payload.evidenceText || null,
      evidenceUrls: payload.evidenceUrls || [],
      notes: payload.notes || null,
      contact: payload.contact || null,
      submitterIp,
    });

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

        if (HIGH_RISK_FEEDBACK_REASONS.has(payload.reason)) {
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
