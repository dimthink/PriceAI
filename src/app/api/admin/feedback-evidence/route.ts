import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { requireAdminRequest } from "@/lib/env";
import { readFeedbackEvidenceImage } from "@/lib/feedback-evidence";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("ref") || "";
    const evidence = await readFeedbackEvidenceImage(reference);
    if (!evidence) {
      return Response.json({ ok: false, message: "图片证据不存在。" }, { status: 404 });
    }

    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": evidence.contentType,
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    });
    if (typeof evidence.size === "number") headers.set("Content-Length", String(evidence.size));

    return new Response(evidence.body, { headers });
  } catch (error) {
    logApiError("admin feedback evidence", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "加载图片证据失败。") },
      { status: error instanceof Error && /未授权/.test(error.message) ? 401 : 500 },
    );
  }
}
