import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { refreshPublicApiSnapshotsIfDue } from "@/lib/data";
import { requireAdminOrCronRequest } from "@/lib/env";
import { revalidatePublicOfferPaths } from "@/lib/public-revalidation";
import { claimRuntimeLease, createRuntimeLeaseOwner, releaseRuntimeLease } from "@/lib/runtime-lease";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const leaseKey = "public-api-snapshot-refresh";
  const leaseOwner = createRuntimeLeaseOwner("snapshot-refresh");
  let leaseAcquired = false;
  try {
    await requireAdminOrCronRequest(request);
    const lease = await claimRuntimeLease({
      leaseKey,
      owner: leaseOwner,
      leaseSeconds: 300,
      metadata: { source: "route", url: new URL(request.url).pathname },
    });
    if (!lease.acquired) {
      return Response.json({
        ok: true,
        refreshed: false,
        skipped: true,
        reason: "lease_busy",
        retryAfter: lease.expiresAt,
      }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    leaseAcquired = true;
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
  } finally {
    if (leaseAcquired) {
      await releaseRuntimeLease(leaseKey, leaseOwner).catch((error) => {
        logApiError("admin public api snapshots lease release", error);
      });
    }
  }
}
