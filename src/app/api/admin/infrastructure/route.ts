import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/env";
import { getInfrastructureOverview } from "@/lib/infrastructure-overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const overview = await getInfrastructureOverview();

    return Response.json(
      { ok: true, overview },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    logApiError("admin infrastructure overview", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "读取基础设施总览失败。") },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  }
}
