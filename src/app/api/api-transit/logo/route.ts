import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import { readApiTransitLogoImage } from "@/lib/api-transit-logo-storage";
import {
  createPublicAssetCacheKey,
  readPublicAssetCache,
  writePublicAssetCache,
} from "@/lib/cloudflare-public-asset-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("ref") || "";
    const cacheKey = createPublicAssetCacheKey(request, reference);
    const cachedResponse = await readPublicAssetCache(cacheKey);
    if (cachedResponse) return cachedResponse;

    const logo = await readApiTransitLogoImage(reference);
    if (!logo) {
      return Response.json({ ok: false, message: "Logo 不存在。" }, { status: 404 });
    }

    const headers = new Headers({
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": logo.contentType,
      "Content-Disposition": "inline",
      "X-Robots-Tag": "noindex",
    });
    if (typeof logo.size === "number") headers.set("Content-Length", String(logo.size));

    return writePublicAssetCache(cacheKey, new Response(logo.body, { headers }));
  } catch (error) {
    logApiError("api transit logo read", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "加载 Logo 失败。") },
      { status: 500 },
    );
  }
}
