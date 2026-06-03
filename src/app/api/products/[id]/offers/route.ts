import { NextRequest, NextResponse } from "next/server";
import { listPublicProductOffers } from "@/lib/data";

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
  });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function parseIntegerParam(value: string | null): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}
