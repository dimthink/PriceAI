import { z } from "zod";
import { createOfferFeedback } from "@/lib/admin";
import { isFeedbackEvidenceReference } from "@/lib/feedback-evidence";
import { offerFeedbackReasonValues } from "@/lib/types";

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

function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "反馈内容格式不正确。";
  if (error instanceof Error) return error.message;
  return "反馈提交失败。";
}

function getErrorStatus(error: unknown, message: string): number {
  if (error instanceof z.ZodError) return 400;
  if (message.includes("刚刚被反馈过")) return 409;
  if (message.includes("反馈过于频繁")) return 429;
  return 500;
}

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());

    if (payload.website) {
      return Response.json({ ok: true });
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
      submitterIp: getClientIp(request),
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = getErrorMessage(error);
    return Response.json({ ok: false, message }, { status: getErrorStatus(error, message) });
  }
}
