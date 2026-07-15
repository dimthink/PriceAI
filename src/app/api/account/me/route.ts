import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json({ ok: true, user }, { headers: noStoreCacheHeaders() });
}
