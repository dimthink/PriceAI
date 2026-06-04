import { getAdminPasswordFromRequest } from "@/lib/admin";
import { requireAdminPassword } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";
import { stableId } from "@/lib/utils";
import { z } from "zod";

const schema = z.object({
  jobType: z.enum(["all", "source"]).default("source"),
  sourceIds: z.array(z.string().min(1)).optional(),
  priority: z.number().int().min(0).max(100).default(10),
  maxAttempts: z.number().int().min(1).max(5).default(1),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));

    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase 尚未配置，无法创建采集任务。");

    const payload = schema.parse(await request.json());
    const now = new Date().toISOString();

    const sourceIds = payload.jobType === "all"
      ? [null]
      : Array.from(new Set(payload.sourceIds || [])).filter(Boolean);

    if (payload.jobType === "source" && !sourceIds.length) {
      return Response.json({ ok: false, message: "请选择要重采的渠道。" }, { status: 400 });
    }

    const sourceById = new Map<string, { id: string; name: string }>();
    if (payload.jobType === "source") {
      const { data, error } = await supabase
        .from("sources")
        .select("id,name")
        .in("id", sourceIds as string[]);

      if (error) throw error;
      for (const row of data || []) {
        sourceById.set(String(row.id), { id: String(row.id), name: String(row.name || row.id) });
      }
    }

    const rows = sourceIds.map((sourceId) => {
      const source = sourceId ? sourceById.get(sourceId) : null;
      return {
        id: stableId("collection-job", payload.jobType, sourceId || "all", now),
        job_type: payload.jobType,
        source_id: sourceId,
        source_name: source?.name || (payload.jobType === "all" ? "全部渠道" : sourceId),
        status: "pending",
        priority: payload.priority,
        attempts: 0,
        max_attempts: payload.maxAttempts,
        requested_by: "admin",
        created_at: now,
        updated_at: now,
      };
    });

    const { data, error } = await supabase
      .from("collection_jobs")
      .insert(rows)
      .select("*");

    if (error) throw error;

    return Response.json({
      ok: true,
      jobCount: data?.length || rows.length,
      jobs: data || rows,
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "创建采集任务失败。" },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
