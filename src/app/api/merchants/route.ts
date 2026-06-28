import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeaders } from "@/lib/cache-headers";
import { listPublicMerchants } from "@/lib/data";
import { PUBLIC_MERCHANT_PAGE_SIZE } from "@/lib/public-merchant-policy";
import { parsePublicOfferPaginationForRoute } from "@/lib/public-offer-route";
import { normalizePublicOfferQuery } from "@/lib/public-offer-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const pagination = parsePublicOfferPaginationForRoute(params);
    if (pagination instanceof NextResponse) return pagination;

    const result = await listPublicMerchants({
      ...pagination,
      limit: pagination.limit ?? PUBLIC_MERCHANT_PAGE_SIZE,
      query: normalizePublicOfferQuery(params.get("q")),
      platform: params.get("platform") || null,
      productType: params.get("type") || null,
      stock: params.get("stock") || null,
      sort: params.get("sort") || null,
      minPrice: parseNumberParam(params.get("min")),
      maxPrice: parseNumberParam(params.get("max")),
      collector: params.get("collector") || null,
      signal: params.get("signal") || null,
    });

    return NextResponse.json(result, {
      headers: priceDataCacheHeaders(),
    });
  } catch (error) {
    return publicPriceApiErrorResponse("public merchants API", error);
  }
}

function parseNumberParam(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
