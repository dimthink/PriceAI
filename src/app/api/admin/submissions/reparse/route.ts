import { z } from "zod";
import { getAdminPasswordFromRequest, reparseSubmission } from "@/lib/admin";
import { requireAdminPassword } from "@/lib/env";

const schema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = schema.parse(await request.json());
    const submission = await reparseSubmission(payload.id);
    return Response.json({ ok: true, submission });
  } catch (error) {
    const message = error instanceof Error ? error.message : "重新解析失败。";
    return Response.json(
      { ok: false, message },
      { status: error instanceof z.ZodError ? 400 : errorStatus(message) },
    );
  }
}

function errorStatus(message: string): number {
  if (message.includes("未授权")) return 401;
  if (message.includes("已被处理")) return 409;
  if (message.includes("不存在")) return 404;
  return 500;
}
