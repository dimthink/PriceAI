import { z } from "zod";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { clearAdminDataCache } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";
import { prewarmPublicPaths, revalidateCommunityPublicPaths } from "@/lib/public-revalidation";
import { getCommunitySettingsSummary, updateCommunitySettings } from "@/lib/community-settings";
import { isCommunityAssetReference } from "@/lib/community-asset-url";

const httpUrlSchema = z.string().trim().max(2048).refine((value) => isHttpUrl(value), {
  message: "请输入有效的 http(s) 地址。",
});
const httpUrlOrPathSchema = z.string().trim().max(2048).refine((value) => isHttpUrl(value) || isRootRelativePath(value) || isCommunityAssetReference(value), {
  message: "请输入有效的 http(s) 地址、站内路径或已上传图片引用。",
});

const patchSchema = z.object({
  qqGroupEnabled: z.boolean().default(true),
  qqGroupNumber: z.string().trim().min(1).max(32),
  qqGroupUrl: httpUrlSchema,
  qqGroupQrCodeUrl: httpUrlOrPathSchema,
  telegramEnabled: z.boolean().default(true),
  telegramUrl: httpUrlSchema,
});

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return Response.json({ ok: true, settings: await getCommunitySettingsSummary() });
  } catch (error) {
    logApiError("admin community settings get", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "加载社群配置失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = patchSchema.parse(await request.json());
    const settings = await updateCommunitySettings(payload);
    clearAdminDataCache();
    const publicPaths = revalidateCommunityPublicPaths();
    await prewarmPublicPaths(request, publicPaths);
    return Response.json({ ok: true, settings });
  } catch (error) {
    logApiError("admin community settings update", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "保存社群配置失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRootRelativePath(value: string) {
  return value.startsWith("/") && !value.startsWith("//");
}
