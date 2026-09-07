import { revalidatePath } from "next/cache";
import { authorizeCronRequest, cronMethodNotAllowed } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return cronMethodNotAllowed("刷新部署页面缓存");
}

export async function POST(request: Request) {
  const authError = authorizeCronRequest(request, "刷新部署页面缓存");
  if (authError) return authError;

  revalidatePath("/", "layout");
  return Response.json({ ok: true, revalidated: true, path: "/", type: "layout" });
}
