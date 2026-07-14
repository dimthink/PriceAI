import "server-only";

import crypto from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  communityAssetReferenceForKey,
  parseCommunityAssetKey,
} from "@/lib/community-asset-url";

export const COMMUNITY_ASSET_MAX_BYTES = 2 * 1024 * 1024;

const COMMUNITY_ASSET_BINDING = "FEEDBACK_EVIDENCE_BUCKET";
const allowedCommunityAssetTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

type CommunityAssetBucket = {
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
  get: (key: string) => Promise<CommunityAssetObject | null>;
};

type CommunityAssetObject = {
  body: ReadableStream;
  size?: number;
  httpMetadata?: {
    contentType?: string;
  };
};

type CommunityAssetEnv = CloudflareEnv & {
  FEEDBACK_EVIDENCE_BUCKET?: CommunityAssetBucket;
};

export type CommunityAssetUploadResult = {
  url: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
};

export type CommunityAssetReadResult = {
  body: ReadableStream;
  contentType: string;
  size?: number;
};

export async function uploadCommunityQrCodeImage(file: File): Promise<CommunityAssetUploadResult> {
  validateCommunityAssetImage(file);

  const bucket = await getCommunityAssetBucket();
  const key = buildCommunityAssetKey(file.type);
  const body = await file.arrayBuffer();

  await bucket.put(key, body, {
    httpMetadata: {
      contentType: file.type,
      contentDisposition: `inline; filename="${safeFilename(file.name || "qq-group-qr-code")}"`,
    },
    customMetadata: {
      purpose: "qq-group-qr-code",
      originalName: safeFilename(file.name || "qq-group-qr-code"),
      uploadedAt: new Date().toISOString(),
    },
  });

  return {
    url: communityAssetReferenceForKey(key),
    key,
    name: file.name || "qq-group-qr-code",
    mimeType: file.type,
    size: file.size,
  };
}

export async function readCommunityAssetImage(reference: string): Promise<CommunityAssetReadResult | null> {
  const key = parseCommunityAssetKey(reference);
  if (!key) return null;

  const bucket = await getCommunityAssetBucket();
  const object = await bucket.get(key);
  if (!object) return null;

  return {
    body: object.body,
    contentType: object.httpMetadata?.contentType || mimeTypeFromKey(key),
    size: object.size,
  };
}

function validateCommunityAssetImage(file: File): void {
  if (!allowedCommunityAssetTypes.has(file.type)) {
    throw new Error("不支持这种二维码图片格式，请上传 PNG、JPG 或 WebP。");
  }

  if (file.size <= 0) {
    throw new Error("二维码图片文件无效，请重新选择。");
  }

  if (file.size > COMMUNITY_ASSET_MAX_BYTES) {
    throw new Error("二维码图片不能超过 2MB。");
  }
}

async function getCommunityAssetBucket(): Promise<CommunityAssetBucket> {
  try {
    const context = await getCloudflareContext({ async: true });
    const bucket = (context.env as CommunityAssetEnv)[COMMUNITY_ASSET_BINDING];
    if (!bucket) throw new Error("社群二维码上传暂不可用：R2 存储尚未配置。");
    return bucket;
  } catch (error) {
    if (error instanceof Error && error.message.includes("R2 存储尚未配置")) throw error;
    throw new Error("社群二维码上传暂不可用：R2 存储尚未配置。");
  }
}

function buildCommunityAssetKey(mimeType: string): string {
  const extension = allowedCommunityAssetTypes.get(mimeType) || "bin";
  return `community-assets/qq-group-qr-code/${crypto.randomUUID()}.${extension}`;
}

function mimeTypeFromKey(key: string): string {
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function safeFilename(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").slice(0, 120) || "qq-group-qr-code";
}
