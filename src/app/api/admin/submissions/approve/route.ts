import { z } from "zod";
import { approveSubmission, getAdminPasswordFromRequest } from "@/lib/admin";
import { requireAdminPassword } from "@/lib/env";

const collectorKindSchema = z.enum([
  "auto",
  "kami",
  "dujiao",
  "shopApi",
  "xiaoheiwan",
  "opensoraHtml",
  "makerichHtml",
  "beibeiHtml",
  "ikunloveApi",
  "getgptApi",
  "browser",
  "unsupported",
]);

const schema = z.object({
  id: z.string().min(1),
  name: z.string().trim().max(200).optional().nullable(),
  sourceUrl: z.string().url().max(2048).optional().nullable(),
  collectionMethod: z.enum(["public_json", "browser", "http", "manual"]).optional(),
  collectorKind: collectorKindSchema.nullable().optional(),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = schema.parse(await request.json());
    const result = await approveSubmission(payload.id, {
      name: payload.name ?? null,
      sourceUrl: payload.sourceUrl ?? null,
      collectionMethod: payload.collectionMethod,
      collectorKind: payload.collectorKind,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "审核失败。";
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
