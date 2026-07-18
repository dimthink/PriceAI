import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { createWholesaleMatch, updateWholesaleMatch } from "@/lib/api-transit-admin";
import { clearAdminDataCache } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";

const statusSchema = z.enum(["draft", "consent_pending", "connected", "trial", "deal", "closed"]);

const createSchema = z.object({
  demandSubmissionId: z.string().min(1),
  supplySubmissionId: z.string().min(1),
  matchScore: z.number().int().min(0).max(100),
  matchReasons: z.array(z.string().trim().min(1).max(120)).max(10),
  adminNote: z.string().trim().max(1000).nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  status: statusSchema,
  adminNote: z.string().trim().max(1000).nullable().optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = createSchema.parse(await request.json());
    const match = await createWholesaleMatch(payload);
    clearCaches();
    return Response.json({ ok: true, match });
  } catch (error) {
    return errorResponse("创建批发撮合记录", error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminRequest(request);
    const payload = updateSchema.parse(await request.json());
    const match = await updateWholesaleMatch(payload);
    clearCaches();
    return Response.json({ ok: true, match });
  } catch (error) {
    return errorResponse("更新批发撮合记录", error);
  }
}

function clearCaches() {
  clearAdminDataCache();
  revalidatePath("/admin");
  revalidatePath("/admin/api-transit");
}

function errorResponse(label: string, error: unknown) {
  logApiError(label, error);
  const message = error instanceof Error ? error.message : "";
  const status = error instanceof z.ZodError ? 400 : message.includes("未授权") ? 401 : message.includes("不存在") ? 404 : 500;
  return Response.json(
    { ok: false, message: safeApiErrorMessage(error, `${label}失败。`) },
    { status },
  );
}
