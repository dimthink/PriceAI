import "server-only";

import { getSupabaseServerClient } from "@/lib/supabase";
import { normalizeTransitSubmissionUrl } from "@/lib/api-transit-normalization";
import { stableId } from "@/lib/utils";

export type WholesaleSubmissionRole = "buyer" | "seller";
export type WholesaleSubmissionDirection =
  | "api_transit"
  | "subscription_channel"
  | "other";

export type WholesaleSubmissionInput = {
  role: WholesaleSubmissionRole;
  direction: WholesaleSubmissionDirection;
  title: string;
  contact: string;
  identityType?: string | null;
  target?: string | null;
  volume?: string | null;
  budget?: string | null;
  acceptableSources?: string | null;
  sourceDescription?: string | null;
  minimumOrder?: string | null;
  pricing?: string | null;
  testRequirement?: string | null;
  afterSales?: string | null;
  evidenceSummary?: string | null;
  proofUrl?: string | null;
  notes?: string | null;
  submitterIp?: string | null;
  userAgent?: string | null;
};

type InsertableWholesaleSubmission = {
  id: string;
  submission_type: "user" | "merchant";
  submitted_url: string;
  submitted_name: string;
  submitted_note: string | null;
  submitted_models: string[] | null;
  submitted_contact: string | null;
  submitted_meta: Record<string, unknown>;
  submitter_ip: string | null;
  submitter_user_agent: string | null;
  normalized_url: string | null;
  normalized_host: string | null;
  parse_status: "pending";
  probe_status: "pending";
  review_status: "pending";
};

const ROLE_LABEL: Record<WholesaleSubmissionRole, string> = {
  buyer: "买方需求",
  seller: "源头供给",
};

const DIRECTION_LABEL: Record<WholesaleSubmissionDirection, string> = {
  api_transit: "API 中转批发",
  subscription_channel: "卡网/订阅渠道批发",
  other: "其他源头",
};

const MAX_WHOLESALE_SUBMISSIONS_PER_HOUR_BY_IP = 10;

export async function createWholesaleSubmission(input: WholesaleSubmissionInput) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase 尚未配置，暂时无法接收批发线索。");
  }

  const now = new Date();
  const roleLabel = ROLE_LABEL[input.role];
  const directionLabel = DIRECTION_LABEL[input.direction];
  const proofUrl = normalizeOptionalUrl(input.proofUrl);
  const id = stableId(
    "wholesale-submission",
    input.role,
    input.direction,
    input.contact,
    input.title,
    now.toISOString(),
  );

  if (input.submitterIp) {
    await assertWholesaleSubmitterRateLimit(supabase, input.submitterIp);
  }

  const submittedUrl = proofUrl ?? `https://priceai.cc/wholesale/leads/${id}`;
  const normalized = proofUrl
    ? normalizeTransitSubmissionUrl(proofUrl)
    : { normalizedUrl: null, normalizedHost: null };
  const target = cleanText(input.target, 1000);
  const sourceDescription = cleanText(input.sourceDescription, 1000);
  const evidenceSummary = cleanText(input.evidenceSummary, 1000);
  const title = cleanText(input.title, 120) ?? `${roleLabel} - ${directionLabel}`;
  const notes = cleanText(input.notes, 4000);

  const meta: Record<string, unknown> = {
    workflow: "wholesale",
    wholesaleRole: input.role,
    wholesaleRoleLabel: roleLabel,
    wholesaleDirection: input.direction,
    wholesaleDirectionLabel: directionLabel,
    identityType: cleanText(input.identityType, 80),
    target,
    volume: cleanText(input.volume, 200),
    budget: cleanText(input.budget, 200),
    acceptableSources: cleanText(input.acceptableSources, 500),
    sourceDescription,
    minimumOrder: cleanText(input.minimumOrder, 200),
    pricing: cleanText(input.pricing, 300),
    testRequirement: cleanText(input.testRequirement, 300),
    afterSales: cleanText(input.afterSales, 300),
    evidenceSummary,
    proofUrl,
    receivedAt: now.toISOString(),
    wholesaleTags: compactList([
      roleLabel,
      directionLabel,
      cleanText(input.identityType, 80),
    ]),
  };

  const row: InsertableWholesaleSubmission = {
    id,
    submission_type: input.role === "seller" ? "merchant" : "user",
    submitted_url: submittedUrl,
    submitted_name: title,
    submitted_note: notes,
    submitted_models: compactList([
      target,
      sourceDescription,
      evidenceSummary,
    ]).slice(0, 8),
    submitted_contact: cleanText(input.contact, 200),
    submitted_meta: stripEmptyMeta(meta),
    submitter_ip: input.submitterIp ?? null,
    submitter_user_agent: cleanText(input.userAgent, 500),
    normalized_url: normalized.normalizedUrl,
    normalized_host: normalized.normalizedHost,
    parse_status: "pending",
    probe_status: "pending",
    review_status: "pending",
  };

  const { error } = await supabase.from("api_transit_submissions").insert(row);
  if (error) {
    if (isMissingColumnError(error)) {
      const fallbackRow: Partial<InsertableWholesaleSubmission> = { ...row };
      delete fallbackRow.normalized_url;
      delete fallbackRow.normalized_host;
      const { error: fallbackError } = await supabase
        .from("api_transit_submissions")
        .insert(fallbackRow);
      if (!fallbackError) {
        return { id };
      }
      throw fallbackError;
    }
    throw error;
  }

  return { id };
}

async function assertWholesaleSubmitterRateLimit(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>,
  submitterIp: string,
) {
  const since = new Date(
    Date.now() - 60 * 60 * 1000,
  ).toISOString();
  const { count, error } = await supabase
    .from("api_transit_submissions")
    .select("id", { count: "exact", head: true })
    .eq("submitter_ip", submitterIp)
    .gte("created_at", since);

  if (error) {
    throw error;
  }

  if ((count ?? 0) >= MAX_WHOLESALE_SUBMISSIONS_PER_HOUR_BY_IP) {
    throw new Error("提交过于频繁，请稍后再试。");
  }
}

function cleanText(value: string | null | undefined, maxLength: number) {
  const text = value?.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeOptionalUrl(value: string | null | undefined) {
  const text = cleanText(value, 2048);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function compactList(values: Array<string | null | undefined>) {
  return values
    .flatMap((value) =>
      (value ?? "")
        .split(/[\n,，;；、]/)
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .filter((value, index, list) => list.indexOf(value) === index);
}

function stripEmptyMeta(meta: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(meta).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === "string") return value.trim().length > 0;
      return true;
    }),
  );
}

function isMissingColumnError(error: { code?: string; message?: string }) {
  if (error.code === "42703" || error.code === "PGRST204") return true;
  return /column .* does not exist|Could not find .* column/i.test(
    error.message ?? "",
  );
}
