import { z } from "zod";
import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import {
  claimUserDetectorJob,
  updateUserDetectorJob,
} from "@/lib/account";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { fetchDetectorJson, normalizeDetectorServiceUrl, resolveDetectorStatusUrl } from "@/lib/detector-request";
import { getRuntimeEnv } from "@/lib/runtime-env";

const DAILY_DETECTOR_LIMIT = 8;
const ACTIVE_DETECTOR_LIMIT = 2;

const schema = z.object({
  protocol: z.enum(["openai_chat", "openai_responses", "claude", "gemini"]),
  baseUrl: z.string().trim().url().max(2048),
  apiKey: z.string().trim().min(4).max(4096),
  model: z.string().trim().min(1).max(200),
  mode: z.enum(["quick", "standard", "full"]),
  includeLongContext: z.boolean().optional(),
  turnstileToken: z.string().trim().max(4096).optional(),
  upstreamType: z.string().trim().max(80).optional(),
  force: z.boolean().optional(),
  requestId: z.string().uuid().optional(),
});

const detectorProtocolEndpoints: Record<z.infer<typeof schema>["protocol"], string> = {
  openai_chat: "openai-chat",
  openai_responses: "openai-responses",
  claude: "claude",
  gemini: "gemini",
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse("登录后才能发起模型检测。");

  let claimedJobId: string | null = null;
  try {
    const payload = schema.parse(await request.json());
    const detectorServiceUrl = normalizeDetectorServiceUrl(getRuntimeEnv("NEXT_PUBLIC_TRANSIT_DETECTOR_API_BASE_URL"));
    const requestId = payload.requestId || crypto.randomUUID();
    const localJobId = requestId;
    const claim = await claimUserDetectorJob({
      id: localJobId,
      userId: user.id,
      userEmail: user.email,
      protocol: payload.protocol,
      baseUrl: payload.baseUrl,
      targetModel: payload.model,
      intensity: payload.mode,
      includeLongContext: Boolean(payload.includeLongContext),
      upstreamType: payload.upstreamType || null,
      idempotencyKey: requestId,
      dailyLimit: DAILY_DETECTOR_LIMIT,
      activeLimit: ACTIVE_DETECTOR_LIMIT,
      leaseSeconds: 900,
    });

    if (claim.outcome === "quota_exceeded") {
      return Response.json(
        { ok: false, code: "quota_exceeded", message: `今日检测次数已达上限（${DAILY_DETECTOR_LIMIT} 次）。` },
        { status: 429, headers: noStoreCacheHeaders() },
      );
    }

    if (claim.outcome === "active_limit") {
      return Response.json(
        { ok: false, code: "active_limit", message: "当前已有检测任务在运行，请稍后再试。" },
        { status: 429, headers: noStoreCacheHeaders() },
      );
    }

    claimedJobId = claim.jobId || localJobId;
    if (claim.outcome === "existing") {
      return Response.json({
        ok: true,
        resumed: true,
        localJobId: claimedJobId,
        local_job_id: claimedJobId,
        job_id: claimedJobId,
        status: claim.status || "queued",
        status_url: `/api/api-transit/detector/status/${encodeURIComponent(claimedJobId)}`,
        report_url: `/api-transit/detector/reports/${encodeURIComponent(claimedJobId)}`,
      }, { status: 202, headers: noStoreCacheHeaders() });
    }

    const formData = new FormData();
    formData.set("base_url", payload.baseUrl);
    formData.set("api_key", payload.apiKey);
    formData.set("model", payload.model);
    formData.set("mode", payload.mode);
    if (payload.force) formData.set("force", "1");
    if (payload.turnstileToken) formData.set("turnstile_token", payload.turnstileToken);
    if (payload.protocol !== "gemini") {
      formData.set("include_long_context", payload.includeLongContext ? "true" : "false");
      formData.set("include_long_context_extreme", "false");
    }

    const detectorProtocol = detectorProtocolEndpoints[payload.protocol];
    const { response, data } = await fetchDetectorJson<DetectorSubmitResponse>(`${detectorServiceUrl}/api/detect/${detectorProtocol}`, {
      method: "POST",
      body: formData,
    }, { timeoutMs: 20_000, maxBytes: 256 * 1024 });
    if (!response.ok) {
      const message = detectorSubmitErrorMessage(data) || "检测后端拒绝了这次请求。";
      await updateUserDetectorJob({ id: localJobId, userId: user.id, status: "error", errorMessage: message });
      claimedJobId = null;
      return Response.json(
        { ok: false, message, detail: data.detail, error: data.error },
        { status: response.status, headers: noStoreCacheHeaders() },
      );
    }
    if (!data.job_id || !data.status_url) {
      const message = "检测后端没有返回任务编号。";
      await updateUserDetectorJob({ id: localJobId, userId: user.id, status: "error", errorMessage: message });
      claimedJobId = null;
      return Response.json({ ok: false, message }, { status: 502, headers: noStoreCacheHeaders() });
    }

    const detectorStatusUrl = resolveDetectorStatusUrl(detectorServiceUrl, data.status_url);
    await updateUserDetectorJob({
      id: localJobId,
      userId: user.id,
      status: data.status === "queued" ? "queued" : "running",
      detectorJobId: data.job_id,
      statusUrl: detectorStatusUrl,
      resultUrl: data.result_url || null,
      jsonUrl: data.json_url || null,
      imageUrl: data.image_url || null,
    });
    claimedJobId = null;

    return Response.json(
      {
        ok: true,
        localJobId,
        local_job_id: localJobId,
        job_id: data.job_id,
        status: data.status || "queued",
        status_url: `/api/api-transit/detector/status/${encodeURIComponent(localJobId)}`,
        report_url: `/api-transit/detector/reports/${encodeURIComponent(localJobId)}`,
      },
      { headers: noStoreCacheHeaders() },
    );
  } catch (error) {
    const failure = detectorSubmitFailure(error);
    if (claimedJobId) {
      await updateUserDetectorJob({
        id: claimedJobId,
        userId: user.id,
        status: "error",
        errorMessage: failure.message,
      }).catch(() => null);
    }
    return Response.json(
      { ok: false, code: failure.code, message: failure.message },
      { status: failure.status, headers: noStoreCacheHeaders() },
    );
  }
}

type DetectorSubmitResponse = {
  job_id?: string;
  status?: "queued" | "running" | "done" | "error";
  status_url?: string;
  result_url?: string;
  image_url?: string;
  json_url?: string;
  error?: unknown;
  detail?: unknown;
};

function detectorSubmitErrorMessage(data: DetectorSubmitResponse): string {
  const detailMessage = detailToMessage(data.detail);
  if (detailMessage) return detailMessage;
  const errorMessage = detailToMessage(data.error);
  if (errorMessage) return errorMessage;
  return "";
}

function detailToMessage(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && "msg" in item && typeof item.msg === "string") return item.msg.trim();
      return "";
    }).find(Boolean) || "";
  }
  if (value && typeof value === "object") {
    if ("message" in value && typeof value.message === "string") return value.message.trim();
    if ("upstream_error" in value && typeof value.upstream_error === "string") return value.upstream_error.trim();
  }
  return "";
}

function detectorSubmitFailure(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof z.ZodError) {
    return { status: 400, code: "invalid_request", message: error.issues[0]?.message || "检测参数格式不正确。" };
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "检测服务响应超时。") return { status: 504, code: "detector_timeout", message };
  if (message.startsWith("检测服务")) return { status: 502, code: "detector_unavailable", message };
  return { status: 500, code: "detector_submit_failed", message: "检测任务暂时无法创建，请稍后再试。" };
}
