import { NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeadersForResult } from "@/lib/cache-headers";
import { getExplorerData } from "@/lib/data";
import { withCloudflarePublicCache } from "@/lib/cloudflare-edge-cache";
import { PRICE_DATA_EDGE_SECONDS } from "@/lib/public-cache-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  return withCloudflarePublicCache(request, {
    namespace: "explorer-v4-read-model",
    ttlSeconds: PRICE_DATA_EDGE_SECONDS,
    cacheKeySearchParams: new URLSearchParams(),
    load: async () => {
      try {
        const result = await getExplorerData();
        return NextResponse.json(result, {
          headers: priceDataCacheHeadersForResult(result),
        });
      } catch (error) {
        return publicPriceApiErrorResponse("public explorer API", error);
      }
    },
  });
}
