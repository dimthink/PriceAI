import { logApiError, safeApiErrorMessage } from "@/lib/api-errors";
import {
  createPublicAssetCacheKey,
  readPublicAssetCache,
  writePublicAssetCache,
} from "@/lib/cloudflare-public-asset-cache";
import { readCommunityAssetImage } from "@/lib/community-asset-storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get("ref") || "";
    const cacheKey = createPublicAssetCacheKey(request, reference);
    const cachedResponse = await readPublicAssetCache(cacheKey);
    if (cachedResponse) return cachedResponse;

    const asset = await readCommunityAssetImage(reference);
    if (!asset) {
      return Response.json({ ok: false, message: "社群二维码图片不存在。" }, { status: 404 });
    }

    const headers = new Headers({
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": asset.contentType,
      "Content-Disposition": "inline",
      "X-Robots-Tag": "noindex",
    });
    if (typeof asset.size === "number") headers.set("Content-Length", String(asset.size));

    return writePublicAssetCache(cacheKey, new Response(asset.body, { headers }));
  } catch (error) {
    logApiError("community asset read", error);
    return Response.json(
      { ok: false, message: safeApiErrorMessage(error, "加载社群二维码图片失败。") },
      { status: 500 },
    );
  }
}
