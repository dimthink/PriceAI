import { z } from "zod";
import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import {
  countActiveUserDetectorJobs,
  countRecentUserDetectorJobs,
  createUserDetectorJob,
  updateUserDetectorJob,
} from "@/lib/account";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
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

  try {
    const payload = schema.parse(await request.json());
    const detectorServiceUrl = getRuntimeEnv("NEXT_PUBLIC_TRANSIT_DETECTOR_API_BASE_URL")?.trim().replace(/\/$/, "");
    if (!detectorServiceUrl) throw new Error("检测服务未配置。");

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentCount = await countRecentUserDetectorJobs(user.id, dayAgo);
    if (recentCount >= DAILY_DETECTOR_LIMIT) {
      return Response.json(
        { ok: false, code: "quota_exceeded", message: `今日检测次数已达上限（${DAILY_DETECTOR_LIMIT} 次）。` },
        { status: 429, headers: noStoreCacheHeaders() },
      );
    }

    const activeCount = await countActiveUserDetectorJobs(user.id);
    if (activeCount >= ACTIVE_DETECTOR_LIMIT) {
      return Response.json(
        { ok: false, code: "active_limit", message: "当前已有检测任务在运行，请稍后再试。" },
        { status: 429, headers: noStoreCacheHeaders() },
      );
    }

    const localJobId = crypto.randomUUID();
    await createUserDetectorJob({
      id: localJobId,
      userId: user.id,
      userEmail: user.email,
      protocol: payload.protocol,
      baseUrl: payload.baseUrl,
      targetModel: payload.model,
      intensity: payload.mode,
      includeLongContext: Boolean(payload.includeLongContext),
      upstreamType: payload.upstreamType || null,
    });

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
    const response = await fetch(`${detectorServiceUrl}/api/detect/${detectorProtocol}`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({})) as DetectorSubmitResponse;
    if (!response.ok) {
      const message = detectorSubmitErrorMessage(data) || "检测后端拒绝了这次请求。";
      await updateUserDetectorJob({ id: localJobId, status: "error", errorMessage: message });
      return Response.json(
        { ok: false, message, detail: data.detail, error: data.error },
        { status: response.status, headers: noStoreCacheHeaders() },
      );
    }
    if (!data.job_id || !data.status_url) {
      const message = "检测后端没有返回任务编号。";
      await updateUserDetectorJob({ id: localJobId, status: "error", errorMessage: message });
      return Response.json({ ok: false, message }, { status: 502, headers: noStoreCacheHeaders() });
    }

    const detectorStatusUrl = data.status_url.startsWith("http") ? data.status_url : `${detectorServiceUrl}${data.status_url}`;
    await updateUserDetectorJob({
      id: localJobId,
      status: data.status === "queued" ? "queued" : "running",
      detectorJobId: data.job_id,
      statusUrl: detectorStatusUrl,
      resultUrl: data.result_url || null,
      jsonUrl: data.json_url || null,
      imageUrl: data.image_url || null,
    });

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
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "检测参数格式不正确。" : error instanceof Error ? error.message : "检测提交失败。";
    return Response.json({ ok: false, message }, { status: 400, headers: noStoreCacheHeaders() });
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
