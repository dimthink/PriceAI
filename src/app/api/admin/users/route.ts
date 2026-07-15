import { z } from "zod";
import { listAdminUsers } from "@/lib/admin-users";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { requireAdminRequest } from "@/lib/env";

const querySchema = z.object({
  q: z.string().trim().max(160).catch(""),
  limit: z.coerce.number().int().min(10).max(150).catch(80),
});

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const { searchParams } = new URL(request.url);
    const payload = querySchema.parse({
      q: searchParams.get("q") || "",
      limit: searchParams.get("limit") || "80",
    });
    const result = await listAdminUsers({
      query: payload.q,
      limit: payload.limit,
    });

    return Response.json({ ok: true, ...result }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    logApiError("admin users list", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "加载用户列表失败。") },
      { status: error instanceof z.ZodError ? 400 : 500, headers: noStoreCacheHeaders() },
    );
  }
}
