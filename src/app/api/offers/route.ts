import { NextRequest, NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeadersForResult } from "@/lib/cache-headers";
import { listPublicOffers } from "@/lib/data";
import { parsePublicOfferPaginationForRoute } from "@/lib/public-offer-route";
import { normalizePublicOfferQuery } from "@/lib/public-offer-query";
import { withCloudflarePublicCache } from "@/lib/cloudflare-edge-cache";
import { cacheSearchParams } from "@/lib/cloudflare-cache-key";
import { PRICE_DATA_EDGE_SECONDS } from "@/lib/public-cache-policy";
import { PUBLIC_OFFER_DEFAULT_LIMIT } from "@/lib/public-offer-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const normalized = {
    query: normalizePublicOfferQuery(params.get("q")),
    platform: normalizeTextParam(params.get("platform"), 80),
    productType: normalizeTextParam(params.get("type"), 80),
    stock: normalizeTextParam(params.get("stock"), 32),
    sort: normalizeTextParam(params.get("sort"), 32),
    minPrice: parseNumberParam(params.get("min")),
    maxPrice: parseNumberParam(params.get("max")),
  };
  const cachePagination = cachePaginationParams(params);

  return withCloudflarePublicCache(request, {
    namespace: "offers-v4-read-model",
    ttlSeconds: PRICE_DATA_EDGE_SECONDS,
    cacheKeySearchParams: cacheSearchParams({
      q: normalized.query,
      platform: normalized.platform,
      type: normalized.productType,
      stock: normalized.stock,
      sort: normalized.sort,
      min: normalized.minPrice,
      max: normalized.maxPrice,
      limit: cachePagination.limit,
      offset: cachePagination.offset,
    }),
    load: async () => {
      try {
        const pagination = parsePublicOfferPaginationForRoute(params);
        if (pagination instanceof NextResponse) return pagination;

        const result = await listPublicOffers({
          query: normalized.query,
          platform: normalized.platform,
          productType: normalized.productType,
          stock: normalized.stock,
          sort: normalized.sort,
          minPrice: normalized.minPrice,
          maxPrice: normalized.maxPrice,
          ...pagination,
        });

        return NextResponse.json(result, {
          headers: priceDataCacheHeadersForResult(result),
        });
      } catch (error) {
        return publicPriceApiErrorResponse("public offers API", error);
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
