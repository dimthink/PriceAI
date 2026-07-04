import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { listUserDetectorJobs } from "@/lib/account";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();

  try {
    const jobs = await listUserDetectorJobs(user.id);
    return Response.json({ ok: true, jobs }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "读取检测记录失败。" },
      { status: 500, headers: noStoreCacheHeaders() },
    );
  }
}
