import "server-only";

import { updateUserDetectorJob } from "@/lib/account";
import { fetchDetectorJson, normalizeDetectorServiceUrl, resolveDetectorStatusUrl } from "@/lib/detector-request";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { TransitDetectorJobStatus } from "@/lib/types";

const ACTIVE_JOB_MAX_AGE_MS = 20 * 60 * 1000;
const RECONCILE_CONCURRENCY = 5;
const ACTIVE_JOB_FIELDS = "id,user_id,status,detector_job_id,status_url,result_url,json_url,image_url,error_message,lease_expires_at,submitted_at,updated_at";

export type DetectorJobReconcileResult = {
  id: string;
  status: TransitDetectorJobStatus;
  changed: boolean;
  retryable: boolean;
  message: string | null;
  detectorJobId: string | null;
  resultUrl: string | null;
  jsonUrl: string | null;
  imageUrl: string | null;
};

export async function reconcileActiveDetectorJobs(input: { limit?: number } = {}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置。");

  const limit = boundedInteger(input.limit, 100, 1, 200);
  const { data, error } = await supabase
    .from("transit_detector_jobs")
    .select(ACTIVE_JOB_FIELDS)
    .in("status", ["queued", "running"])
    .order("submitted_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  const results = await mapWithConcurrency(
    (data || []) as DetectorJobRow[],
    RECONCILE_CONCURRENCY,
    reconcileDetectorJob,
  );

  return {
    scanned: results.length,
    changed: results.filter((item) => item.changed).length,
    done: results.filter((item) => item.status === "done").length,
    failed: results.filter((item) => item.status === "error").length,
    timedOut: results.filter((item) => item.status === "timed_out").length,
    active: results.filter((item) => item.status === "queued" || item.status === "running").length,
    retryable: results.filter((item) => item.retryable).length,
    results,
  };
}

export async function reconcileDetectorJob(row: DetectorJobRow): Promise<DetectorJobReconcileResult> {
  const id = stringValue(row.id);
  const userId = stringValue(row.user_id);
  const storedStatus = detectorJobStatus(row.status);
  const stored = resultFromRow(row, storedStatus);
  if (!id || !userId || storedStatus === "done" || storedStatus === "error" || storedStatus === "timed_out") {
    return stored;
  }

  const expired = isExpired(row.lease_expires_at);
  const tooOld = isOlderThan(row.submitted_at, ACTIVE_JOB_MAX_AGE_MS);
  const storedStatusUrl = stringValue(row.status_url);
  if (!storedStatusUrl) {
    if (expired || tooOld) return finishTimedOut(row, "检测服务未返回任务状态地址，任务已超时。");
    return { ...stored, retryable: true, message: "任务正在等待检测服务返回状态地址。" };
  }

  let statusUrl: string;
  try {
    const detectorServiceUrl = normalizeDetectorServiceUrl(getRuntimeEnv("NEXT_PUBLIC_TRANSIT_DETECTOR_API_BASE_URL"));
    statusUrl = resolveDetectorStatusUrl(detectorServiceUrl, storedStatusUrl);
  } catch (error) {
    return finishError(row, error instanceof Error ? error.message : "检测任务状态地址无效。");
  }

  let response: Response;
  let payload: DetectorStatusResponse;
  try {
    ({ response, data: payload } = await fetchDetectorJson<DetectorStatusResponse>(statusUrl, {
      cache: "no-store",
    }, { timeoutMs: 12_000, maxBytes: 512 * 1024 }));
  } catch (error) {
    if (expired || tooOld) return finishTimedOut(row, "检测服务长期不可达，任务已超时。");
    return {
      ...stored,
      retryable: true,
      message: error instanceof Error ? error.message : "检测服务暂时不可达。",
    };
  }

  if (!response.ok) {
    const message = payload.detail || payload.error || `检测服务返回 HTTP ${response.status}。`;
    if (response.status === 404) return finishError(row, "检测服务已找不到该任务，可能在服务重启时中断。");
    if (expired || tooOld) return finishTimedOut(row, message);
    if (response.status >= 500 || response.status === 429) return { ...stored, retryable: true, message };
    return finishError(row, message);
  }

  const nextStatus = remoteDetectorJobStatus(payload.status);
  if (!nextStatus) {
    return finishError(row, "检测服务返回了无法识别的任务状态。");
  }
  if (nextStatus === "done") {
    const persistedStatus = await updateUserDetectorJob({
      id,
      userId,
      status: "done",
      detectorJobId: payload.job_id || stringValue(row.detector_job_id) || null,
      statusUrl,
      resultUrl: payload.result_url || stringValue(row.result_url) || null,
      jsonUrl: payload.json_url || stringValue(row.json_url) || null,
      imageUrl: payload.image_url || stringValue(row.image_url) || null,
      errorMessage: null,
      allowedCurrentStatuses: ["queued", "running", "timed_out"],
    });
    if (persistedStatus !== "done") return currentResult(row, persistedStatus);
    return resultFromPayload(row, payload, "done", true, false, null);
  }

  if (nextStatus === "error") {
    return finishError(row, payload.error || "检测任务失败。", payload);
  }

  if (tooOld) return finishTimedOut(row, "检测任务超过 20 分钟仍未结束，已自动超时。", payload);

  const persistedStatus = await updateUserDetectorJob({
    id,
    userId,
    status: nextStatus,
    detectorJobId: payload.job_id || stringValue(row.detector_job_id) || null,
    statusUrl,
    resultUrl: payload.result_url || stringValue(row.result_url) || null,
    jsonUrl: payload.json_url || stringValue(row.json_url) || null,
    imageUrl: payload.image_url || stringValue(row.image_url) || null,
    errorMessage: null,
    allowedCurrentStatuses: ["queued", "running"],
  });
  if (persistedStatus !== nextStatus) return currentResult(row, persistedStatus);
  return resultFromPayload(row, payload, nextStatus, nextStatus !== storedStatus, false, null);
}

async function finishError(
  row: DetectorJobRow,
  message: string,
  payload: DetectorStatusResponse = {},
): Promise<DetectorJobReconcileResult> {
  const id = stringValue(row.id);
  const userId = stringValue(row.user_id);
  const persistedStatus = await updateUserDetectorJob({
    id,
    userId,
    status: "error",
    detectorJobId: payload.job_id || stringValue(row.detector_job_id) || null,
    resultUrl: payload.result_url || stringValue(row.result_url) || null,
    jsonUrl: payload.json_url || stringValue(row.json_url) || null,
    imageUrl: payload.image_url || stringValue(row.image_url) || null,
    errorMessage: message,
    allowedCurrentStatuses: payload.status === "error" ? ["queued", "running", "timed_out"] : ["queued", "running"],
  });
  if (persistedStatus !== "error") return currentResult(row, persistedStatus);
  return resultFromPayload(row, payload, "error", true, false, message);
}

async function finishTimedOut(
  row: DetectorJobRow,
  message: string,
  payload: DetectorStatusResponse = {},
): Promise<DetectorJobReconcileResult> {
  const persistedStatus = await updateUserDetectorJob({
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    status: "timed_out",
    detectorJobId: payload.job_id || stringValue(row.detector_job_id) || null,
    resultUrl: payload.result_url || stringValue(row.result_url) || null,
    jsonUrl: payload.json_url || stringValue(row.json_url) || null,
    imageUrl: payload.image_url || stringValue(row.image_url) || null,
    errorMessage: message,
    allowedCurrentStatuses: ["queued", "running"],
  });
  if (persistedStatus !== "timed_out") return currentResult(row, persistedStatus);
  return resultFromPayload(row, payload, "timed_out", true, false, message);
}

function currentResult(row: DetectorJobRow, status: TransitDetectorJobStatus | null): DetectorJobReconcileResult {
  return {
    ...resultFromRow(row, status || detectorJobStatus(row.status)),
    status: status || detectorJobStatus(row.status),
  };
}

function resultFromRow(row: DetectorJobRow, status: TransitDetectorJobStatus): DetectorJobReconcileResult {
  return {
    id: stringValue(row.id),
    status,
    changed: false,
    retryable: false,
    message: stringValue(row.error_message) || null,
    detectorJobId: stringValue(row.detector_job_id) || null,
    resultUrl: stringValue(row.result_url) || null,
    jsonUrl: stringValue(row.json_url) || null,
    imageUrl: stringValue(row.image_url) || null,
  };
}

function resultFromPayload(
  row: DetectorJobRow,
  payload: DetectorStatusResponse,
  status: TransitDetectorJobStatus,
  changed: boolean,
  retryable: boolean,
  message: string | null,
): DetectorJobReconcileResult {
  return {
    id: stringValue(row.id),
    status,
    changed,
    retryable,
    message,
    detectorJobId: payload.job_id || stringValue(row.detector_job_id) || null,
    resultUrl: payload.result_url || stringValue(row.result_url) || null,
    jsonUrl: payload.json_url || stringValue(row.json_url) || null,
    imageUrl: payload.image_url || stringValue(row.image_url) || null,
  };
}

function detectorJobStatus(value: unknown): TransitDetectorJobStatus {
  if (value === "running" || value === "done" || value === "error" || value === "timed_out") return value;
  return "queued";
}

function remoteDetectorJobStatus(value: unknown): "queued" | "running" | "done" | "error" | null {
  return value === "queued" || value === "running" || value === "done" || value === "error" ? value : null;
}

function isExpired(value: unknown): boolean {
  const timestamp = Date.parse(stringValue(value));
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function isOlderThan(value: unknown, ageMs: number): boolean {
  const timestamp = Date.parse(stringValue(value));
  return Number.isFinite(timestamp) && timestamp <= Date.now() - ageMs;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(Number(value), max));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

export type DetectorJobRow = Record<string, unknown>;

type DetectorStatusResponse = {
  job_id?: string;
  status?: "queued" | "running" | "done" | "error";
  result_url?: string;
  image_url?: string;
  json_url?: string;
  error?: string;
  detail?: string;
};
