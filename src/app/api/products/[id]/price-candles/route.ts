import { NextRequest, NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeaders } from "@/lib/cache-headers";
import { cacheSearchParams } from "@/lib/cloudflare-cache-key";
import { withCloudflarePublicCache } from "@/lib/cloudflare-edge-cache";
import {
  parseExclusiveBefore,
  parsePriceHistoryInterval,
  parsePriceHistoryLimit,
} from "@/lib/price-history";
import { getProductPriceCandles, resolvePriceHistoryProduct } from "@/lib/price-history-db";
import { PRICE_DATA_EDGE_SECONDS } from "@/lib/public-cache-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const product = resolvePriceHistoryProduct(id);
  if (!product) return NextResponse.json({ message: "标准商品不存在。" }, { status: 404 });

  const interval = parsePriceHistoryInterval(request.nextUrl.searchParams.get("interval") || "1d");
  if (!interval) return NextResponse.json({ message: "K 线周期仅支持 1h 或 1d。" }, { status: 400 });

  const limit = parsePriceHistoryLimit(interval, request.nextUrl.searchParams.get("limit"));
  if (limit === null) {
    return NextResponse.json(
      { message: `limit 必须是 1 到 ${interval === "1h" ? 720 : 365} 之间的整数。` },
      { status: 400 },
    );
  }
  const before = parseExclusiveBefore(request.nextUrl.searchParams.get("before"));
  if (before === null) return NextResponse.json({ message: "before 必须是带时区的 ISO 时间。" }, { status: 400 });

  return withCloudflarePublicCache(request, {
    namespace: "product-price-candles-v1",
    ttlSeconds: PRICE_DATA_EDGE_SECONDS,
    cacheKeySearchParams: cacheSearchParams({ interval, limit, before }),
    load: async () => {
      try {
        const result = await getProductPriceCandles({
          productId: product.id,
          interval,
          limit,
          before,
        });
        return NextResponse.json(result, { headers: priceDataCacheHeaders() });
      } catch (error) {
        return publicPriceApiErrorResponse("public product price candles API", error);
      }
    },
  });
}
