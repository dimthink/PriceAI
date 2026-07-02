import { NextResponse } from "next/server";
import { publicPriceApiErrorResponse } from "@/lib/api-errors";
import { priceDataCacheHeadersForResult } from "@/lib/cache-headers";
import { getExplorerData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const result = await getExplorerData();

    return NextResponse.json(result, {
      headers: priceDataCacheHeadersForResult(result),
    });
  } catch (error) {
    return publicPriceApiErrorResponse("public explorer API", error);
  }
}
