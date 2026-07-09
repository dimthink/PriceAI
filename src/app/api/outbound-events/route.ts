import { z } from "zod";
import { recordOutboundAnalyticsEvent } from "@/lib/outbound-analytics";
import {
  checkPublicWriteRateLimit,
  getPublicClientFingerprint,
  getPublicRequestErrorStatus,
  readJsonWithLimit,
} from "@/lib/public-request";
import {
  outboundAnalyticsEntityTypes,
  outboundAnalyticsEventTypes,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OUTBOUND_EVENT_BODY_MAX_BYTES = 24 * 1024;
const OUTBOUND_EVENT_RATE_LIMIT_PER_HOUR = 240;

const eventSchema = z.object({
  eventType: z.enum(outboundAnalyticsEventTypes),
  entityType: z.enum(outboundAnalyticsEntityTypes),
  entityId: z.string().trim().min(1).max(200),
  offerId: z.string().trim().max(200).nullable().optional(),
  sourceId: z.string().trim().max(200).nullable().optional(),
  productId: z.string().trim().max(200).nullable().optional(),
  stationId: z.string().trim().max(200).nullable().optional(),
  placement: z.string().trim().max(160).nullable().optional(),
  creativeId: z.string().trim().max(200).nullable().optional(),
  campaignId: z.string().trim().max(200).nullable().optional(),
  targetUrl: z.string().trim().max(2048).nullable().optional(),
  pagePath: z.string().trim().max(500).nullable().optional(),
  referrerPath: z.string().trim().max(500).nullable().optional(),
  sessionId: z.string().trim().max(120).nullable().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional(),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return "点击事件格式不正确。";
  if (error instanceof Error) return error.message;
  return "点击事件记录失败。";
}

function getErrorStatus(error: unknown): number {
  const publicRequestStatus = getPublicRequestErrorStatus(error);
  if (publicRequestStatus) return publicRequestStatus;
  if (error instanceof z.ZodError) return 400;
  return 500;
}

export async function POST(request: Request) {
  try {
    const fingerprint = getPublicClientFingerprint(request);
    checkPublicWriteRateLimit({
      scope: "outbound-events",
      key: fingerprint,
      limit: OUTBOUND_EVENT_RATE_LIMIT_PER_HOUR,
    });

    const payload = eventSchema.parse(await readJsonWithLimit(request, OUTBOUND_EVENT_BODY_MAX_BYTES));
    const result = await recordOutboundAnalyticsEvent(payload, request);

    return Response.json(
      { ok: true, ...result },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    const message = getErrorMessage(error);
    const status = getErrorStatus(error);
    return Response.json(
      { ok: false, message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
