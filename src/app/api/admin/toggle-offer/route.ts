import { getAdminPasswordFromRequest, setRawOfferHidden } from "@/lib/admin";
import { clearPublicDataCache } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const schema = z.object({
  id: z.string().min(1),
  hidden: z.boolean(),
  reason: z.string().max(500).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));

    const payload = schema.parse(await request.json());
    const result = await setRawOfferHidden(payload);
    clearPublicDataCache();
    revalidatePath("/");
    revalidatePath("/products/[id]", "page");

    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "更新失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
