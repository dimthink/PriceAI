import { z } from "zod";
import { collectOfficialPrices } from "../../../../../../scripts/collect-official-prices.mjs";
import { getAdminPasswordFromRequest } from "@/lib/admin";
import { requireAdminPassword } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  app: z.string().trim().min(1).default("chatgpt"),
  regions: z.string().trim().min(1).default("US"),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = schema.parse(await request.json().catch(() => ({})));
    const result = await collectOfficialPrices({
      app: payload.app,
      regions: payload.regions,
      dryRun: true,
      post: true,
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "官方地区价试采集失败。";
    return Response.json(
      { ok: false, message },
      { status: error instanceof z.ZodError ? 400 : errorStatus(message) },
    );
  }
}

function errorStatus(message: string): number {
  if (message.includes("未授权")) return 401;
  return 500;
}
