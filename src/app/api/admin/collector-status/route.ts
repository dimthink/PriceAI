import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { getAdminCollectorStatus } from "@/lib/data";
import { requireAdminRequest } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const status = await getAdminCollectorStatus();
    return Response.json(
      { ok: true, ...status },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    logApiError("admin collector status", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "读取采集状态失败。") },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  }
}
