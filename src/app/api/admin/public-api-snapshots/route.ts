import { getAdminPasswordFromRequest } from "@/lib/admin";
import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { refreshPublicApiSnapshotsIfDue } from "@/lib/data";
import { requireAdminOrCronPassword } from "@/lib/env";
import { revalidatePublicOfferPaths } from "@/lib/public-revalidation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requireAdminOrCronPassword(getAdminPasswordFromRequest(request));
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1" || url.searchParams.get("mode") === "force";
    const result = await refreshPublicApiSnapshotsIfDue({ force });
    if (result.refreshed) {
      revalidatePublicOfferPaths();
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    logApiError("admin public api snapshots", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "刷新公开 API 快照失败。") },
      { status: 500 },
    );
  }
}
