import { NextResponse } from "next/server";
import { priceDataCacheHeaders } from "@/lib/cache-headers";
import { getExplorerData } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const result = await getExplorerData();

  return NextResponse.json(result, {
    headers: priceDataCacheHeaders(),
  });
}
