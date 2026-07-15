import { authRequiredResponse, getCurrentUser } from "@/lib/auth";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { listUserDetectorJobs } from "@/lib/account";
import { accountApiErrorResponse } from "@/lib/account-api-errors";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return authRequiredResponse();

  try {
    const jobs = await listUserDetectorJobs(user.id);
    return Response.json({ ok: true, jobs }, { headers: noStoreCacheHeaders() });
  } catch (error) {
    return accountApiErrorResponse(error, "读取检测记录失败。");
  }
}
