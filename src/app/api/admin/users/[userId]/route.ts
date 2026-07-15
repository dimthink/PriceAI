import { z } from "zod";
import { getAdminUserDetail } from "@/lib/admin-users";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { requireAdminRequest } from "@/lib/env";

const paramsSchema = z.object({
  userId: z.string().trim().uuid("用户 ID 格式不正确。"),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    await requireAdminRequest(request);
    const { userId } = paramsSchema.parse(await params);
    const detail = await getAdminUserDetail(userId);
    return Response.json({ ok: true, detail }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    logApiError("admin user detail", error);
    const message = safeApiErrorMessage(error, "加载用户详情失败。");
    const status = error instanceof z.ZodError
      ? 400
      : message.includes("没有找到")
        ? 404
        : 500;
    return Response.json(
      { ok: false, message },
      { status, headers: noStoreCacheHeaders() },
    );
  }
}
