import { NextRequest, NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeadersForResult } from "@/lib/cache-headers";
import { listPublicOffers } from "@/lib/data";
import { parsePublicOfferPaginationForRoute } from "@/lib/public-offer-route";
import { normalizePublicOfferQuery } from "@/lib/public-offer-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const minPrice = parseNumberParam(params.get("min"));
    const maxPrice = parseNumberParam(params.get("max"));
    const pagination = parsePublicOfferPaginationForRoute(params);
    if (pagination instanceof NextResponse) return pagination;

    const result = await listPublicOffers({
      query: normalizePublicOfferQuery(params.get("q")),
      platform: params.get("platform"),
      productType: params.get("type"),
      stock: params.get("stock"),
      sort: params.get("sort"),
      minPrice,
      maxPrice,
      ...pagination,
    });

    return NextResponse.json(result, {
      headers: priceDataCacheHeadersForResult(result),
    });
  } catch (error) {
    return publicPriceApiErrorResponse("public offers API", error);
  }
}

function parseNumberParam(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
