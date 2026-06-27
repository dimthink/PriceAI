import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import {
  publishApiTransitStationWithOffers,
  updateApiTransitStation,
} from "@/lib/api-transit-admin";
import { clearAdminDataCache } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("publish"),
    id: z.string().min(1),
    offerIds: z.array(z.string().min(1)).max(800).optional(),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().min(1),
    name: z.string().trim().min(1).max(200).optional(),
    websiteUrl: z.string().url().max(2048).optional(),
    apiBaseUrl: z.string().url().max(2048).nullable().optional(),
    pricingUrl: z.string().url().max(2048).nullable().optional(),
    monitorUrl: z.string().url().max(2048).nullable().optional(),
    summary: z.string().trim().max(1000).nullable().optional(),
    sourceType: z.enum(["manual_collected", "user_submitted", "merchant_submitted"]).optional(),
    commercialRelation: z.enum(["none", "listed", "partner", "affiliate", "sponsored", "unknown"]).optional(),
    collectorKind: z.string().trim().min(1).max(80).optional(),
    collectionStatus: z.enum(["pending", "success", "partial", "failed", "manual_review"]).optional(),
    channelTypes: z.array(z.string().trim().max(80)).max(20).optional(),
    accountPools: z.array(z.string().trim().max(80)).max(20).optional(),
    paymentMethods: z.array(z.string().trim().max(80)).max(20).optional(),
    minimumTopUp: z.string().trim().max(120).nullable().optional(),
    balanceExpiry: z.string().trim().max(120).nullable().optional(),
    supportChannels: z.array(z.string().trim().max(80)).max(20).optional(),
    refundPolicy: z.string().trim().max(500).nullable().optional(),
    riskLabels: z.array(z.string().trim().max(80)).max(20).optional(),
    published: z.boolean().optional(),
    dataStatus: z.enum(["sample", "pending_review", "verified"]).optional(),
    usageAdvice: z.enum(["try_small", "cautious", "not_recommended", "pending"]).optional(),
    status: z.enum(["active", "limited", "unavailable", "unknown"]).optional(),
    adminNote: z.string().trim().max(1000).nullable().optional(),
    strengths: z.array(z.string().trim().max(120)).max(12).optional(),
    cautions: z.array(z.string().trim().max(160)).max(12).optional(),
    commercialOffers: z.array(z.object({
      id: z.string().trim().max(80),
      type: z.enum(["coupon", "affiliate", "sponsored"]),
      title: z.string().trim().max(120),
      listLabel: z.string().trim().max(40).nullable().optional(),
      description: z.string().trim().max(300).nullable(),
      code: z.string().trim().max(80).nullable(),
      url: z.string().url().max(2048).nullable(),
      validUntil: z.string().trim().max(80).nullable(),
      disclosure: z.string().trim().max(220).nullable(),
      enabled: z.boolean(),
    })).max(8).optional(),
    verificationEvents: z.array(z.object({
      id: z.string().trim().max(80),
      source: z.enum(["priceai", "official", "user", "merchant"]),
      status: z.enum(["success", "warning", "failed", "info"]),
      title: z.string().trim().max(120),
      description: z.string().trim().max(400).nullable(),
      happenedAt: z.string().trim().max(100),
    })).max(12).optional(),
  }),
]);

export async function PATCH(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = patchSchema.parse(await request.json());

    if (payload.action === "publish") {
      const result = await publishApiTransitStationWithOffers({
        stationId: payload.id,
        offerIds: payload.offerIds,
      });
      clearApiTransitAdminCaches();
      return Response.json({ ok: true, ...result });
    }

    const station = await updateApiTransitStation({
      id: payload.id,
      name: payload.name,
      websiteUrl: payload.websiteUrl,
      apiBaseUrl: payload.apiBaseUrl,
      pricingUrl: payload.pricingUrl,
      monitorUrl: payload.monitorUrl,
      summary: payload.summary,
      sourceType: payload.sourceType,
      commercialRelation: payload.commercialRelation,
      collectorKind: payload.collectorKind,
      collectionStatus: payload.collectionStatus,
      channelTypes: payload.channelTypes,
      accountPools: payload.accountPools,
      paymentMethods: payload.paymentMethods,
      minimumTopUp: payload.minimumTopUp,
      balanceExpiry: payload.balanceExpiry,
      supportChannels: payload.supportChannels,
      refundPolicy: payload.refundPolicy,
      riskLabels: payload.riskLabels,
      published: payload.published,
      dataStatus: payload.dataStatus,
      usageAdvice: payload.usageAdvice,
      status: payload.status,
      adminNote: payload.adminNote,
      strengths: payload.strengths,
      cautions: payload.cautions,
      commercialOffers: payload.commercialOffers,
      verificationEvents: payload.verificationEvents,
    });
    clearApiTransitAdminCaches();
    return Response.json({ ok: true, station });
  } catch (error) {
    logApiError("admin api transit station update", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "更新 API 中转站失败。") },
      { status: error instanceof z.ZodError ? 400 : errorStatus(error) },
    );
  }
}

function clearApiTransitAdminCaches(): void {
  clearAdminDataCache();
  revalidatePath("/admin");
  revalidatePath("/admin/api-transit");
  revalidatePath("/api-transit");
  revalidatePath("/api-transit/models");
  revalidatePath("/api-transit/[slug]", "page");
  revalidatePath("/sitemap.xml");
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("未授权")) return 401;
  if (message.includes("不存在")) return 404;
  return 500;
}
