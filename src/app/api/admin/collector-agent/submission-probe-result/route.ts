import { recordSubmissionProbeResult } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { requireAdminOrCronRequest } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const probeOfferSchema = z.object({
  sourceId: z.string().optional(),
  sourceName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceStoreName: z.string().nullable().optional(),
  sourceTitle: z.string().min(1),
  price: z.number().nullable().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
  stockCount: z.number().int().nullable().optional(),
}).passthrough();

const probeResultSchema = z.object({
  sourceId: z.string().optional(),
  sourceName: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  baseUrl: z.string().url().optional(),
  kind: z.string().nullable().optional(),
  status: z.enum(["success", "empty", "failed", "unsupported"]),
  offerCount: z.number().int().min(0),
  offers: z.array(probeOfferSchema).max(50).default([]),
  attempts: z.array(z.unknown()).optional(),
  ms: z.number().int().min(0).optional(),
  message: z.string().max(1000).optional(),
  finishedAt: z.string().datetime().optional(),
}).passthrough();

const schema = z.object({
  submissionId: z.string().min(1),
  collectionJobId: z.string().min(1).optional().nullable(),
  result: probeResultSchema,
});

export async function POST(request: Request) {
  try {
    await requireAdminOrCronRequest(request);

    const payload = schema.parse(await request.json());
    const submission = await recordSubmissionProbeResult(payload.submissionId, payload.result);
    if (payload.collectionJobId) {
      await finishSubmissionProbeJob(payload.collectionJobId, payload.submissionId, payload.result);
    }

    return Response.json({ ok: true, submission });
  } catch (error) {
    logApiError("collector submission probe result", error);
    const rawMessage = error instanceof Error ? error.message : "记录提交试采集结果失败。";
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "记录提交试采集结果失败。") },
      { status: error instanceof z.ZodError ? 400 : errorStatus(rawMessage) },
    );
  }
}

function errorStatus(message: string): number {
  if (message.includes("未授权")) return 401;
  if (message.includes("已被处理")) return 409;
  if (message.includes("不存在")) return 404;
  return 500;
}

async function finishSubmissionProbeJob(
  jobId: string,
  submissionId: string,
  result: z.infer<typeof probeResultSchema>,
): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法更新试采集任务。");

  const now = result.finishedAt || new Date().toISOString();
  const success = result.status === "success" || result.status === "empty" || result.status === "unsupported";
  const { error } = await supabase
    .from("collection_jobs")
    .update({
      status: success ? "success" : "failed",
      finished_at: now,
      locked_by: null,
      locked_until: null,
      last_error: success ? null : result.message || "试采集失败。",
      result: {
        intent: "submission_probe",
        submissionId,
        sourceId: result.sourceId || null,
        sourceName: result.sourceName || null,
        sourceUrl: result.sourceUrl || null,
        baseUrl: result.baseUrl || null,
        collectorKind: result.kind || null,
        probeStatus: result.status,
        offerCount: result.offerCount,
        message: result.message || null,
        finishedAt: now,
        noWriteBack: true,
      },
      updated_at: now,
    })
    .eq("id", jobId)
    .eq("requested_by", "submission_probe");

  if (error) throw error;
}
