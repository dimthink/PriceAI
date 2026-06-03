import { getAdminPasswordFromRequest, upsertRawOffer } from "@/lib/admin";
import { clearPublicDataCache } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";
import { z } from "zod";

const schema = z.object({
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceStoreName: z.string().optional(),
  sourceTitle: z.string().min(1),
  price: z.coerce.number().nonnegative().nullable().optional(),
  currency: z.string().default("CNY"),
  status: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]).default("unknown"),
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
  stockCount: z.coerce.number().int().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = schema.parse(await request.json());
    const offer = await upsertRawOffer(payload);
    clearPublicDataCache();

    return Response.json({ ok: true, offer });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "保存失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
