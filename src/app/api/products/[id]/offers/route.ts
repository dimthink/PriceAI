import { NextRequest, NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeadersForResult } from "@/lib/cache-headers";
import { listPublicProductOffers } from "@/lib/data";
import { parsePublicOfferPaginationForRoute } from "@/lib/public-offer-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const pagination = parsePublicOfferPaginationForRoute(request.nextUrl.searchParams);
    if (pagination instanceof NextResponse) return pagination;

    const result = await listPublicProductOffers(id, {
      ...pagination,
      filterTags: request.nextUrl.searchParams.get("tags")?.split(/[,，\s]+/) ?? [],
      query: request.nextUrl.searchParams.get("q"),
      excludeQuery: request.nextUrl.searchParams.get("exclude"),
      collector: request.nextUrl.searchParams.get("collector"),
      minPrice: parseNumberParam(request.nextUrl.searchParams.get("min")),
      maxPrice: parseNumberParam(request.nextUrl.searchParams.get("max")),
    });

    return NextResponse.json(result, {
      headers: priceDataCacheHeadersForResult(result),
    });
  } catch (error) {
    return publicPriceApiErrorResponse("public product offers API", error);
  }
}

function parseNumberParam(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
