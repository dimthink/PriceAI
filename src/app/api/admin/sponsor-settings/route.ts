import { z } from "zod";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { clearAdminDataCache } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";
import { prewarmPublicPaths, revalidateSponsorPublicPaths } from "@/lib/public-revalidation";
import { getSponsorSettingsSummary, updateSponsorSettings } from "@/lib/sponsor-settings";
import { SPONSOR_PLACEMENT_KINDS } from "@/lib/sponsor-settings-shared";

const sponsorToneSchema = z.enum(["green", "blue", "amber"]);
const creativeStatusSchema = z.enum(["draft", "live", "paused", "expired"]);

const creativeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  enabled: z.boolean().default(true),
  status: creativeStatusSchema.default("live"),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(""),
  targetUrl: z.string().trim().min(1).max(2048).default("/commercial#slots"),
  appendUtm: z.boolean().default(true),
  sponsorName: z.string().trim().max(80).nullable().optional(),
  campaignId: z.string().trim().max(120).nullable().optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  visualTitle: z.string().trim().max(80).nullable().optional(),
  visualMeta: z.string().trim().max(120).nullable().optional(),
  label: z.string().trim().max(40).nullable().optional(),
  tone: sponsorToneSchema.default("green"),
  startsAt: z.string().trim().max(80).nullable().optional(),
  endsAt: z.string().trim().max(80).nullable().optional(),
});

const placementSchema = z.object({
  enabled: z.boolean().default(false),
  creatives: z.array(creativeSchema).max(12).default([]),
});

const patchSchema = z.object({
  enabled: z.boolean().default(false),
  placements: z.object(Object.fromEntries(
    SPONSOR_PLACEMENT_KINDS.map((kind) => [kind, placementSchema.optional()]),
  )).default({}),
});

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return Response.json({ ok: true, settings: await getSponsorSettingsSummary() });
  } catch (error) {
    logApiError("admin sponsor settings get", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "加载赞助位配置失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = patchSchema.parse(await request.json());
    const settings = await updateSponsorSettings(payload);
    clearAdminDataCache();
    const publicPaths = revalidateSponsorPublicPaths();
    await prewarmPublicPaths(request, publicPaths);
    return Response.json({ ok: true, settings });
  } catch (error) {
    logApiError("admin sponsor settings update", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "保存赞助位配置失败。") },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
