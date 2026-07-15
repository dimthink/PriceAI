import "server-only";

import crypto from "node:crypto";

export const PUBLIC_JSON_BODY_MAX_BYTES = 64 * 1024;
export const PUBLIC_FORM_BODY_MAX_BYTES = 6 * 1024 * 1024;
export const PUBLIC_WRITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const PUBLIC_WRITE_RATE_LIMIT_MAX_KEYS = 5000;
const publicWriteCounters = new Map<string, { count: number; resetAt: number }>();

export class PublicRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PublicRequestError";
    this.status = status;
  }
}

export async function readJsonWithLimit<T = unknown>(
  request: Request,
  maxBytes = PUBLIC_JSON_BODY_MAX_BYTES,
): Promise<T> {
  assertContentLengthWithinLimit(request, maxBytes, "提交内容");

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new PublicRequestError("提交内容过大，请删减后再试。", 413);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new PublicRequestError("提交内容不是有效 JSON。", 400);
  }
}

export async function readFormDataWithLimit(
  request: Request,
  maxBytes = PUBLIC_FORM_BODY_MAX_BYTES,
): Promise<FormData> {
  assertContentLengthWithinLimit(request, maxBytes, "上传内容");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new PublicRequestError("上传内容必须使用 multipart/form-data。", 400);
  }
  if (!request.body) throw new PublicRequestError("上传内容为空。", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new PublicRequestError("上传内容过大，请删减后再试。", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new PublicRequestError("上传内容无法解析。", 400);
  }
}

export function assertContentLengthWithinLimit(
  request: Request,
  maxBytes: number,
  label = "请求内容",
): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;

  const bytes = Number(contentLength);
  if (Number.isFinite(bytes) && bytes > maxBytes) {
    throw new PublicRequestError(`${label}过大，请删减后再试。`, 413);
  }
}

export function getPublicClientFingerprint(request: Request): string {
  const ip = getPublicClientIp(request);
  if (!ip) return "anonymous";

  const secret =
    process.env.IP_HASH_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    "priceai-public-request-v1";
  const digest = crypto
    .createHmac("sha256", secret)
    .update(ip)
    .digest("hex")
    .slice(0, 32);

  return `iphash:v1:${digest}`;
}

export function checkPublicWriteRateLimit({
  scope,
  key,
  limit,
  windowMs = PUBLIC_WRITE_RATE_LIMIT_WINDOW_MS,
}: {
  scope: string;
  key: string;
  limit: number;
  windowMs?: number;
}): void {
  if (limit <= 0) return;

  const now = Date.now();
  const counterKey = `${scope}:${key}`;
  const current = publicWriteCounters.get(counterKey);

  if (!current || current.resetAt <= now) {
    publicWriteCounters.set(counterKey, { count: 1, resetAt: now + windowMs });
    prunePublicWriteCounters(now);
    return;
  }

  if (current.count >= limit) {
    throw new PublicRequestError("提交过于频繁，请稍后再试。", 429);
  }

  current.count += 1;
}

export function getPublicRequestErrorStatus(error: unknown): number | null {
  if (error instanceof PublicRequestError) return error.status;
  return null;
}

function getPublicClientIp(request: Request): string | null {
  const cloudflareIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareIp) return cloudflareIp;

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return request.headers.get("x-real-ip")?.trim() || null;
}

function prunePublicWriteCounters(now: number): void {
  if (publicWriteCounters.size <= PUBLIC_WRITE_RATE_LIMIT_MAX_KEYS) return;

  for (const [key, value] of publicWriteCounters) {
    if (value.resetAt <= now) publicWriteCounters.delete(key);
  }
}
