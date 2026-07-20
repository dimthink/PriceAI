import { NextRequest, NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeaders } from "@/lib/cache-headers";
import { cacheSearchParams } from "@/lib/cloudflare-cache-key";
import { withCloudflarePublicCache } from "@/lib/cloudflare-edge-cache";
import { parsePriceChartPoints, parsePriceHistoryInterval } from "@/lib/price-history";
import { getProductPriceChartSummaries } from "@/lib/price-history-db";
import { PRICE_DATA_EDGE_SECONDS } from "@/lib/public-cache-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const interval = parsePriceHistoryInterval(request.nextUrl.searchParams.get("interval") || "1d");
  if (!interval) return NextResponse.json({ message: "K 线周期仅支持 1h 或 1d。" }, { status: 400 });
  const points = parsePriceChartPoints(interval, request.nextUrl.searchParams.get("points"));
  if (!points) return NextResponse.json({ message: "points 仅支持 24 或 30。" }, { status: 400 });

  const platform = normalizedFilter(request.nextUrl.searchParams.get("platform"));
  const productType = normalizedFilter(request.nextUrl.searchParams.get("productType"));
  if (platform === null || productType === null) {
    return NextResponse.json({ message: "筛选参数不能超过 80 个字符。" }, { status: 400 });
  }

  return withCloudflarePublicCache(request, {
    namespace: "price-chart-summaries-v1",
    ttlSeconds: PRICE_DATA_EDGE_SECONDS,
    cacheKeySearchParams: cacheSearchParams({ interval, points, platform, productType }),
    load: async () => {
      try {
        const result = await getProductPriceChartSummaries({ interval, points, platform, productType });
        return NextResponse.json(result, { headers: priceDataCacheHeaders() });
      } catch (error) {
        return publicPriceApiErrorResponse("public price chart summaries API", error);
      }
    },
  });
}

function normalizedFilter(value: string | null): string | null | undefined {
  const normalized = value?.trim();
  if (!normalized || normalized === "全部") return undefined;
  return normalized.length <= 80 ? normalized : null;
}
