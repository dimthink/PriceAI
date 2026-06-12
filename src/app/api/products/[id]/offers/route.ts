import { NextRequest, NextResponse } from "next/server";
import { priceDataCacheHeaders } from "@/lib/cache-headers";
import { listPublicProductOffers } from "@/lib/data";
import { parseOfferFilterTags } from "@/lib/offer-filter-tags";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await listPublicProductOffers(id, {
    limit: parseIntegerParam(request.nextUrl.searchParams.get("limit")),
    offset: parseIntegerParam(request.nextUrl.searchParams.get("offset")),
    filterTags: parseOfferFilterTags(request.nextUrl.searchParams.get("tags")),
    query: request.nextUrl.searchParams.get("q"),
    excludeQuery: request.nextUrl.searchParams.get("exclude"),
  });

  return NextResponse.json(result, {
    headers: priceDataCacheHeaders(),
  });
}

function parseIntegerParam(value: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
