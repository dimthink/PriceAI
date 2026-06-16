import "server-only";

import crypto from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const FEEDBACK_EVIDENCE_BUCKET_HOST = "feedback-evidence";
export const FEEDBACK_EVIDENCE_URL_PREFIX = `r2://${FEEDBACK_EVIDENCE_BUCKET_HOST}/`;
export const FEEDBACK_EVIDENCE_MAX_IMAGES = 5;
export const FEEDBACK_EVIDENCE_MAX_BYTES = 4 * 1024 * 1024;

const FEEDBACK_EVIDENCE_BINDING = "FEEDBACK_EVIDENCE_BUCKET";
const allowedImageTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type FeedbackEvidenceBucket = {
  put: (
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: {
        contentType?: string;
        contentDisposition?: string;
      };
      customMetadata?: Record<string, string>;
    },
  ) => Promise<unknown>;
  get: (key: string) => Promise<FeedbackEvidenceObject | null>;
};

type FeedbackEvidenceObject = {
  body: ReadableStream;
  size?: number;
  httpMetadata?: {
    contentType?: string;
  };
};

type FeedbackEvidenceEnv = CloudflareEnv & {
  FEEDBACK_EVIDENCE_BUCKET?: FeedbackEvidenceBucket;
};

export type FeedbackEvidenceUploadResult = {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
};

export type FeedbackEvidenceReadResult = {
  body: ReadableStream;
  contentType: string;
  size?: number;
};

export async function uploadFeedbackEvidenceImage(file: File): Promise<FeedbackEvidenceUploadResult> {
  validateFeedbackEvidenceImage(file);

  const bucket = await getFeedbackEvidenceBucket();
  const key = buildFeedbackEvidenceKey(file.type);
  const body = await file.arrayBuffer();

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: file.type,
      contentDisposition: `inline; filename="${safeFilename(file.name || "evidence")}"`,
    },
    customMetadata: {
      originalName: safeFilename(file.name || "evidence"),
      uploadedAt: new Date().toISOString(),
    },
  });

  return {
    url: feedbackEvidenceReferenceForKey(key),
    key,
    name: file.name || "evidence",
    mimeType: file.type,
    size: file.size,
  };
}

export async function readFeedbackEvidenceImage(reference: string): Promise<FeedbackEvidenceReadResult | null> {
  const key = parseFeedbackEvidenceKey(reference);
  if (!key) return null;

  const bucket = await getFeedbackEvidenceBucket();
  const object = await bucket.get(key);
  if (!object) return null;

  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType || mimeTypeFromKey(key),
    size: object.size,
  };
}

export function isFeedbackEvidenceReference(value: string): boolean {
  return Boolean(parseFeedbackEvidenceKey(value));
}

export function feedbackEvidenceReferenceForKey(key: string): string {
  return `${FEEDBACK_EVIDENCE_URL_PREFIX}${key}`;
}

function validateFeedbackEvidenceImage(file: File): void {
  if (!allowedImageTypes.has(file.type)) {
    throw new Error("不支持这种图片格式，请上传 PNG、JPG 或 WebP。");
  }

  if (file.size <= 0) {
    throw new Error("图片文件无效，请重新选择。");
  }

  if (file.size > FEEDBACK_EVIDENCE_MAX_BYTES) {
    throw new Error("图片文件不能超过 4MB。");
  }
}

function parseFeedbackEvidenceKey(reference: string): string | null {
  if (!reference.startsWith(FEEDBACK_EVIDENCE_URL_PREFIX)) return null;

  try {
    const parsed = new URL(reference);
    if (parsed.protocol !== "r2:" || parsed.hostname !== FEEDBACK_EVIDENCE_BUCKET_HOST) return null;

    const key = parsed.pathname.replace(/^\/+/, "");
    if (!/^feedback\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(key)) return null;

    return key;
  } catch {
    return null;
  }
}

async function getFeedbackEvidenceBucket(): Promise<FeedbackEvidenceBucket> {
  try {
    const context = await getCloudflareContext({ async: true });
    const bucket = (context.env as FeedbackEvidenceEnv)[FEEDBACK_EVIDENCE_BINDING];
    if (!bucket) throw new Error("图片上传暂不可用：R2 存储尚未配置。");
    return bucket;
  } catch (error) {
    if (error instanceof Error && error.message.includes("R2 存储尚未配置")) throw error;
    throw new Error("图片上传暂不可用：R2 存储尚未配置。");
  }
}

function buildFeedbackEvidenceKey(mimeType: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const extension = allowedImageTypes.get(mimeType) || "bin";
  return `feedback/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

function mimeTypeFromKey(key: string): string {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function safeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 120) || "evidence";
}
