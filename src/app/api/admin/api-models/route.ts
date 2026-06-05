import { getAdminPasswordFromRequest } from "@/lib/admin";
import { clearApiModelDatasetCache } from "@/lib/api-models-db";
import { clearAdminDataCache } from "@/lib/data";
import { requireAdminPassword } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const patchSchema = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("provider"),
    id: z.string().min(1),
    enabled: z.boolean(),
  }),
  z.object({
    target: z.literal("offer"),
    id: z.string().min(1),
    status: z.enum(["active", "inactive", "needs_review"]),
  }),
]);

export async function PATCH(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = patchSchema.parse(await request.json());
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase 尚未配置，无法更新 API 模型数据。");

    if (payload.target === "provider") {
      const { data, error } = await supabase
        .from("api_providers")
        .update({
          enabled: payload.enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.id)
        .select("id,name,enabled")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("API 来源不存在。");
      clearApiModelCaches();
      return Response.json({ ok: true, provider: data });
    }

    const { data, error } = await supabase
      .from("api_model_offers")
      .update({
        status: payload.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.id)
      .select("id,status")
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error("API 模型报价不存在。");
    clearApiModelCaches();
    return Response.json({ ok: true, offer: data });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "更新 API 模型数据失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}

function clearApiModelCaches() {
  clearApiModelDatasetCache();
  clearAdminDataCache();
  revalidatePath("/api-models");
  revalidatePath("/api-models/[id]", "page");
  revalidatePath("/api-models/providers/[id]", "page");
  revalidatePath("/sitemap.xml");
}
