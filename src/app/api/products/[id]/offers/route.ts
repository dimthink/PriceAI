import { NextRequest, NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeadersForResult } from "@/lib/cache-headers";
import { listPublicProductOffers } from "@/lib/data";
import { parsePublicOfferPaginationForRoute } from "@/lib/public-offer-route";
import { withCloudflarePublicCache } from "@/lib/cloudflare-edge-cache";
import { cacheSearchParams } from "@/lib/cloudflare-cache-key";
import { parseMerchantCollectorFilter } from "@/lib/merchant-collectors";
import { parseOfferFilterTags } from "@/lib/offer-filter-tags";
import { PRICE_DATA_EDGE_SECONDS } from "@/lib/public-cache-policy";
import { normalizePublicOfferQuery, PUBLIC_OFFER_DEFAULT_LIMIT } from "@/lib/public-offer-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const normalized = {
    filterTags: parseOfferFilterTags(searchParams.get("tags")?.split(/[,，\s]+/) ?? []),
    query: normalizePublicOfferQuery(searchParams.get("q")),
    excludeQuery: normalizeTextParam(searchParams.get("exclude"), 160),
    collector: parseMerchantCollectorFilter(searchParams.get("collector")),
    minPrice: parseNumberParam(searchParams.get("min")),
    maxPrice: parseNumberParam(searchParams.get("max")),
  };
  const cachePagination = cachePaginationParams(searchParams);

  return withCloudflarePublicCache(request, {
    namespace: "product-offers-v1",
    ttlSeconds: PRICE_DATA_EDGE_SECONDS,
    cacheKeySearchParams: cacheSearchParams({
      tags: normalized.filterTags.join(","),
      q: normalized.query,
      exclude: normalized.excludeQuery,
      collector: normalized.collector === "all" ? null : normalized.collector,
      min: normalized.minPrice,
      max: normalized.maxPrice,
      limit: cachePagination.limit,
      offset: cachePagination.offset,
    }),
    load: async () => {
      try {
        const pagination = parsePublicOfferPaginationForRoute(searchParams);
        if (pagination instanceof NextResponse) return pagination;

        const result = await listPublicProductOffers(id, {
          ...pagination,
          filterTags: normalized.filterTags,
          query: normalized.query,
          excludeQuery: normalized.excludeQuery,
          collector: normalized.collector,
          minPrice: normalized.minPrice,
          maxPrice: normalized.maxPrice,
        });

        return NextResponse.json(result, {
          headers: priceDataCacheHeadersForResult(result),
        });
      } catch (error) {
        return publicPriceApiErrorResponse("public product offers API", error);
      }
    },
  });
}

function parseNumberParam(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeTextParam(value: string | null, maxLength: number): string | null {
  const normalized = value?.trim().slice(0, maxLength);
  return normalized || null;
}

function cachePaginationParams(params: URLSearchParams): { limit: number | string; offset: number | string } {
  const pagination = parsePublicOfferPaginationForRoute(params);
  if (pagination instanceof NextResponse) {
    return {
      limit: normalizeInvalidPaginationMarker(params.get("limit"), PUBLIC_OFFER_DEFAULT_LIMIT),
      offset: normalizeInvalidPaginationMarker(params.get("offset"), 0),
    };
  }
  return {
    limit: pagination.limit ?? PUBLIC_OFFER_DEFAULT_LIMIT,
    offset: pagination.offset ?? 0,
  };
}

function normalizeInvalidPaginationMarker(value: string | null, fallback: number): number | string {
  const normalized = value?.trim().slice(0, 32);
  return normalized ? `invalid:${normalized}` : fallback;
}
