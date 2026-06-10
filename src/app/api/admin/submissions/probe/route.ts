import { z } from "zod";
import { probeSource } from "../../../../../../scripts/collect-prices.mjs";
import { getAdminPasswordFromRequest, recordSubmissionProbeResult } from "@/lib/admin";
import { requireAdminPassword } from "@/lib/env";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    requireAdminPassword(getAdminPasswordFromRequest(request));
    const payload = schema.parse(await request.json());
    const supabase = getSupabaseServerClient();
    if (!supabase) throw new Error("Supabase 尚未配置。");

    const { data: submission, error } = await supabase
      .from("channel_submissions")
      .select("id,url,name,parsed_title,parsed_meta,status")
      .eq("id", payload.id)
      .maybeSingle();

    if (error) throw error;
    if (!submission) throw new Error("提交记录不存在。");
    if (submission.status !== "pending") throw new Error("该提交已被处理。");

    const meta = asRecord(submission.parsed_meta);
    const canonicalSourceUrl = stringMeta(meta, "canonical_source_url");
    const sourceUrl = isMisleadingSharedShopApiPlatformUrl(canonicalSourceUrl, submission.url, meta)
      ? submission.url
      : canonicalSourceUrl || submission.url;
    const result = await probeSource({
      sourceId: stringMeta(meta, "suggested_source_id") || undefined,
      sourceName:
        submission.name ||
        stringMeta(meta, "suggested_source_name") ||
        submission.parsed_title ||
        undefined,
      sourceUrl,
      baseUrl: stringMeta(meta, "base_url") || undefined,
      collectorKind: stringMeta(meta, "suggested_collector_kind") || undefined,
      rawOffers: [{ url: submission.url }],
      limit: 12,
      fallbackDetect: true,
    });
    const updated = await recordSubmissionProbeResult(payload.id, result);

    return Response.json({ ok: true, result, submission: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "试采集失败。";
    return Response.json(
      { ok: false, message },
      { status: error instanceof z.ZodError ? 400 : errorStatus(message) },
    );
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringMeta(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMisleadingSharedShopApiPlatformUrl(
  sourceUrl: string | null,
  submittedUrl: string,
  meta: Record<string, unknown>,
): boolean {
  if (!sourceUrl || stringMeta(meta, "submitted_url_type") !== "product") return false;
  const source = safeUrl(sourceUrl);
  if (!source || !isSharedShopApiPlatformHost(source.hostname)) return false;
  if (source.pathname.match(/\/shop\/[^/?#]+/i)) return false;

  const submitted = safeUrl(submittedUrl);
  return Boolean(submitted && isSharedShopApiPlatformHost(submitted.hostname));
}

function isSharedShopApiPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return host === "pay.ldxp.cn" || host === "pay.qxvx.cn" || host === "ldxp.cn" || host === "catfk.com";
}

function safeUrl(value: string | null | undefined): URL | null {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function errorStatus(message: string): number {
  if (message.includes("未授权")) return 401;
  if (message.includes("已被处理")) return 409;
  if (message.includes("不存在")) return 404;
  return 500;
}
