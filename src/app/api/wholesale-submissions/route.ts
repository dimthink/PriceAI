import { z } from "zod";
import {
  createWholesaleSubmission,
  type WholesaleSubmissionDirection,
  type WholesaleSubmissionRole,
} from "@/lib/wholesale-submissions";
import {
  checkPublicWriteRateLimit,
  getPublicClientFingerprint,
  getPublicRequestErrorStatus,
  readJsonWithLimit,
} from "@/lib/public-request";

const PUBLIC_WHOLESALE_SUBMISSION_RATE_LIMIT_PER_HOUR = 20;

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).optional().nullable();

const optionalHttpUrlSchema = optionalText(2048).refine(
  (value) => !value || isHttpUrl(value),
  { message: "链接仅支持 http 或 https。" },
);

const schema = z.object({
  role: z.enum(["buyer", "seller"]),
  direction: z.enum(["api_transit", "subscription_channel", "other"]),
  title: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(2).max(200),
  details: z.string().trim().min(10).max(4000),
  identityType: optionalText(80),
  target: optionalText(1000),
  volume: optionalText(200),
  budget: optionalText(200),
  acceptableSources: optionalText(500),
  sourceDescription: optionalText(1000),
  minimumOrder: optionalText(200),
  pricing: optionalText(300),
  testRequirement: optionalText(300),
  afterSales: optionalText(300),
  evidenceSummary: optionalText(1000),
  proofUrl: optionalHttpUrlSchema,
  notes: optionalText(4000),
  website: z.string().max(200).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const submitterIp = getPublicClientFingerprint(request);
    checkPublicWriteRateLimit({
      scope: "wholesale-submissions",
      key: submitterIp,
      limit: PUBLIC_WHOLESALE_SUBMISSION_RATE_LIMIT_PER_HOUR,
    });

    const payload = schema.parse(await readJsonWithLimit(request));
    if (payload.website) return Response.json({ ok: true });

    const result = await createWholesaleSubmission({
      role: payload.role as WholesaleSubmissionRole,
      direction: payload.direction as WholesaleSubmissionDirection,
      title: payload.title,
      contact: payload.contact,
      identityType: payload.identityType ?? null,
      target: payload.target || payload.details,
      volume: payload.volume ?? null,
      budget: payload.budget ?? null,
      acceptableSources: payload.acceptableSources ?? null,
      sourceDescription: payload.sourceDescription ?? null,
      minimumOrder: payload.minimumOrder ?? null,
      pricing: payload.pricing ?? null,
      testRequirement: payload.testRequirement ?? null,
      afterSales: payload.afterSales ?? null,
      evidenceSummary: payload.evidenceSummary ?? null,
      proofUrl: payload.proofUrl ?? null,
      notes: payload.notes || payload.details,
      submitterIp,
      userAgent: request.headers.get("user-agent"),
    });

    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = getErrorStatus(error, message);
    if (status >= 500) console.error("[wholesale-submissions] failed", error);
    return Response.json({ ok: false, message }, { status });
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return "提交内容格式不正确，请检查必填项和链接。";
  }
  if (error instanceof Error) return error.message;
  return "提交失败，请稍后再试。";
}

function getErrorStatus(error: unknown, message: string): number {
  const publicRequestStatus = getPublicRequestErrorStatus(error);
  if (publicRequestStatus) return publicRequestStatus;
  if (error instanceof z.ZodError) return 400;
  if (message.includes("尚未配置")) return 503;
  if (message.includes("过于频繁")) return 429;
  if (message.includes("链接仅支持")) return 400;
  return 500;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
