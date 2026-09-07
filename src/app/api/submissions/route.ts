import { z } from "zod";
import { createSubmission } from "@/lib/admin";
import { clearAdminDataCache } from "@/lib/data";
import {
  checkPublicWriteRateLimit,
  getPublicClientFingerprint,
  getPublicRequestErrorStatus,
  readJsonWithLimit,
} from "@/lib/public-request";

const PUBLIC_SUBMISSION_RATE_LIMIT_PER_HOUR = 20;

const schema = z.object({
  url: z.string().url().max(2048).optional().nullable(),
  urls: z.array(z.string().url().max(2048)).max(10).optional(),
  name: z.string().trim().max(200).optional().nullable(),
  contact: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  website: z.string().max(200).optional().nullable(),
});

function getErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) return "提交内容格式不正确，请检查链接。";
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || "提交失败。");
  }
  return "提交失败。";
}

function getErrorStatus(error: unknown, message: string): number {
  const publicRequestStatus = getPublicRequestErrorStatus(error);
  if (publicRequestStatus) return publicRequestStatus;
  if (error instanceof z.ZodError) return 400;
  if (message.includes("刚刚被提交过") || message.includes("已有信息更完整的待审记录")) return 409;
  if (message.includes("提交过于频繁")) return 429;
  if (
    message.includes("URL 格式") ||
    message.includes("一次只能申请") ||
    message.includes("仅支持") ||
    message.includes("不允许") ||
    message.includes("无法解析")
  ) {
    return 400;
  }
  return 500;
}

function uniqueUrls(payload: z.infer<typeof schema>): string[] {
  const urls = payload.urls?.length ? payload.urls : payload.url ? [payload.url] : [];
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)));
}

export async function POST(request: Request) {
  try {
    const submitterIp = getPublicClientFingerprint(request);
    checkPublicWriteRateLimit({
      scope: "channel-submissions",
      key: submitterIp,
      limit: PUBLIC_SUBMISSION_RATE_LIMIT_PER_HOUR,
    });

    const json = await readJsonWithLimit(request);
    const payload = schema.parse(json);

    if (payload.website) {
      return Response.json({ ok: true });
    }

    const urls = uniqueUrls(payload);
    if (!urls.length) {
      return Response.json({ ok: false, message: "请填写店铺入口。" }, { status: 400 });
    }
    if (urls.length > 1) {
      return Response.json({ ok: false, message: "一次只能申请一个店铺。" }, { status: 400 });
    }
    const results = [];

    for (const url of urls) {
      try {
        const result = await createSubmission({
          url,
          name: payload.name ?? null,
          contact: payload.contact?.trim() || null,
          notes: payload.notes ?? null,
          honeypot: null,
          submitterIp,
        });
        if ("ignored" in result) {
          results.push({ url, ok: true, ignored: true });
        } else {
          results.push({ url, ok: true, id: result.id, merged: Boolean(result.merged) });
        }
      } catch (error) {
        results.push({ url, ok: false, message: getErrorMessage(error) });
      }
    }

    const accepted = results.filter((result) => result.ok).length;
    const failed = results.length - accepted;

    if (!accepted) {
      return Response.json(
        {
          ok: false,
          message: results[0]?.message || "提交失败，请稍后再试。",
          results,
          summary: { accepted, failed, total: results.length },
        },
        { status: getErrorStatus(new Error(results[0]?.message || ""), results[0]?.message || "") },
      );
    }

    clearAdminDataCache();
    return Response.json({
      ok: true,
      results,
      summary: { accepted, failed, total: results.length },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = getErrorStatus(error, message);

    if (status >= 500) {
      console.error("[submissions] failed", error);
    }

    return Response.json({ ok: false, message }, { status });
  }
}
