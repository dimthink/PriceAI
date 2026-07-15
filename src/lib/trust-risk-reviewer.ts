import "server-only";

import { readFeedbackEvidenceImage } from "@/lib/feedback-evidence";
import { claimExternalApiDailyBudget } from "@/lib/external-api-budget";
import { getRiskReviewRuntimeConfig, type RiskReviewRuntimeConfig } from "@/lib/risk-review-settings";
import {
  AFTERSALES_FEEDBACK_REASON,
  MODEL_PRECHECK_FEEDBACK_REASONS,
  RISK_PRECHECK_PUBLIC_TTL_HOURS,
  countFeedbackImageEvidenceReferences,
  feedbackRequiresImageEvidence,
  getPublicRiskPrecheck,
  isFeedbackImageEvidenceReference,
  type RiskPrecheckCategory,
  type RiskPrecheckScope,
} from "@/lib/trust-risk";
import type { OfferFeedbackReason, OfferFeedbackUserExpectedAction, OfferStatus } from "@/lib/types";

export type RiskFeedbackReviewInput = {
  id: string;
  productName?: string | null;
  offerId?: string | null;
  sourceId?: string | null;
  sourceName?: string | null;
  sourceTitle?: string | null;
  offerUrl?: string | null;
  offerPrice?: number | null;
  offerStatus?: OfferStatus | null;
  reason: OfferFeedbackReason;
  userExpectedAction: OfferFeedbackUserExpectedAction;
  evidenceText?: string | null;
  evidenceUrls?: string[] | null;
  notes?: string | null;
  submitterIp?: string | null;
};

export type RiskFeedbackReviewResult = {
  status: "ready" | "skipped" | "failed";
  provider: string;
  model: string;
  reviewedAt: string;
  canShowPublicly: boolean;
  riskLevel: "low" | "medium" | "high";
  riskScope: RiskPrecheckScope;
  riskCategory: RiskPrecheckCategory;
  confidence: number;
  abuseRisk: "low" | "medium" | "high";
  evidenceQuality: "none" | "low" | "medium" | "high";
  publicSummary: string;
  offerSummary?: string;
  offerPublicSummary?: string;
  sourceCanShowPublicly?: boolean;
  sourcePublicSummary?: string;
  imageEvidenceCount?: number;
  imageEvidenceUsedCount?: number;
  publicHidden?: boolean;
  publicHiddenAt?: string | null;
  publicHiddenReason?: string | null;
  privateReason: string;
  expiresAt: string | null;
  error?: string;
};

type ModelRiskReviewJson = {
  risk_level?: string;
  risk_scope?: string;
  risk_category?: string;
  confidence?: number;
  abuse_risk?: string;
  evidence_quality?: string;
  can_show_publicly?: boolean;
  public_summary?: string;
  product_summary?: string;
  offer_alert?: {
    can_show_publicly?: boolean;
    public_summary?: string;
    product_summary?: string;
  };
  merchant_alert?: {
    can_show_publicly?: boolean;
    public_summary?: string;
    reason?: string;
  };
  private_reason?: string;
  expires_in_hours?: number;
};

const RISK_REVIEW_PROVIDER = "opencode";
const MAX_MULTIMODAL_EVIDENCE_IMAGES = 4;
const MAX_MULTIMODAL_EVIDENCE_BYTES = 4 * 1024 * 1024;

export function shouldRunRiskPrecheck(input: Pick<RiskFeedbackReviewInput, "reason" | "userExpectedAction" | "evidenceUrls">): boolean {
  if (!MODEL_PRECHECK_FEEDBACK_REASONS.has(input.reason)) return false;
  if (feedbackRequiresImageEvidence(input.reason, input.userExpectedAction)) {
    return countFeedbackImageEvidenceReferences(input.evidenceUrls) > 0;
  }
  return true;
}

export function buildSkippedRiskPrecheck(
  input: RiskFeedbackReviewInput,
  reason: string,
  config?: Pick<RiskReviewRuntimeConfig, "provider" | "model">,
): RiskFeedbackReviewResult {
  const reviewedAt = new Date().toISOString();
  return {
    status: "skipped",
    provider: config?.provider || RISK_REVIEW_PROVIDER,
    model: config?.model || "not_required",
    reviewedAt,
    canShowPublicly: false,
    riskLevel: "low",
    riskScope: inferFallbackRiskScope(input),
    riskCategory: normalizeRiskCategory(input.reason),
    confidence: 0,
    abuseRisk: "medium",
    evidenceQuality: evidenceQualityFromInput(input),
    publicSummary: "",
    privateReason: feedbackRequiresImageEvidence(input.reason, input.userExpectedAction) && countFeedbackImageEvidenceReferences(input.evidenceUrls) === 0
      ? "需要预审的反馈缺少站内图片证据，不进入前台临时风险预警。"
      : reason,
    expiresAt: null,
  };
}

export async function reviewRiskFeedback(input: RiskFeedbackReviewInput): Promise<RiskFeedbackReviewResult> {
  const config = await getRiskReviewRuntimeConfig();

  if (!shouldRunRiskPrecheck(input)) {
    return buildSkippedRiskPrecheck(input, "非模型预审类反馈或缺少证据，不进入前台临时风险预警。", config);
  }

  if (!config.apiKey) {
    return buildFailedRiskPrecheck(input, "风险预审模型 API Key 未配置。", config);
  }

  const budget = await claimExternalApiDailyBudget("risk_review", config.dailyLimit).catch(() => null);
  if (!budget) {
    return buildFailedRiskPrecheck(input, "风险预审预算服务暂时不可用，已停止第三方调用。", config);
  }
  if (!budget.allowed) {
    return buildSkippedRiskPrecheck(input, `风险预审今日预算已用完（${budget.used}/${budget.limit}），暂不调用第三方模型。`, config);
  }

  const reviewedAt = new Date().toISOString();
  const model = config.model;

  try {
    const evidenceImages = await loadRiskReviewEvidenceImages(input.evidenceUrls || []);
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: config.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: riskReviewSystemPrompt(),
          },
          {
            role: "user",
            content: buildRiskReviewUserContent(input, evidenceImages),
          },
        ],
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    const text = await readLimitedResponseText(response, config.maxResponseBytes);
    if (!response.ok) throw new Error(`模型预审请求失败：${response.status} ${text.slice(0, 240)}`);

    const json = JSON.parse(text) as Record<string, unknown>;
    const content = extractChatCompletionContent(json);
    const parsed = parseModelRiskReviewContent(content);
    return normalizeModelRiskReview(input, parsed, reviewedAt, config, evidenceImages);
  } catch (error) {
    return buildFailedRiskPrecheck(input, error instanceof Error ? error.message : "风险预审模型调用失败。", config);
  }
}

async function readLimitedResponseText(response: Response, maxBytes: number): Promise<string> {
  const declaredBytes = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    throw new Error("风险预审响应超过大小上限。");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error("风险预审响应超过大小上限。");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function mergeRiskPrecheckResult(
  current: Record<string, unknown> | null | undefined,
  result: RiskFeedbackReviewResult,
): Record<string, unknown> {
  return {
    ...(current || {}),
    riskPrecheck: result,
  };
}

function normalizeModelRiskReview(
  input: RiskFeedbackReviewInput,
  parsed: ModelRiskReviewJson,
  reviewedAt: string,
  config: Pick<RiskReviewRuntimeConfig, "provider" | "model">,
  evidenceImages: RiskReviewEvidenceImage[],
): RiskFeedbackReviewResult {
  const riskCategory = normalizeRiskCategory(parsed.risk_category || input.reason);
  const confidence = clampNumber(parsed.confidence, 0, 1, 0);
  const abuseRisk = normalizeEnum(parsed.abuse_risk, ["low", "medium", "high"] as const, "medium");
  const evidenceImageUsedCount = evidenceImages.filter((image) => Boolean(image.dataUrl)).length;
  const requiresImageEvidence = feedbackRequiresImageEvidence(input.reason, input.userExpectedAction);
  const evidenceQuality = normalizeEnum(parsed.evidence_quality, ["none", "low", "medium", "high"] as const, evidenceQualityFromInput(input, evidenceImageUsedCount));
  const inferredOfferSummary = inferProductSummary(input);
  const offerSummary = sanitizeProductSummary(parsed.offer_alert?.product_summary || parsed.product_summary, inferredOfferSummary);
  const offerPublicSummary = sanitizeOfferPublicSummary(parsed.offer_alert?.public_summary || parsed.public_summary, offerSummary);
  const sourcePublicSummary = sanitizeSourcePublicSummary(parsed.merchant_alert?.public_summary, offerSummary);
  const canShowPublicly = Boolean(parsed.offer_alert?.can_show_publicly ?? parsed.can_show_publicly) &&
    confidence >= 0.55 &&
    abuseRisk !== "high" &&
    evidenceQuality !== "none" &&
    (!requiresImageEvidence || evidenceImageUsedCount > 0) &&
    Boolean(offerPublicSummary);
  const sourceCanShowPublicly = canShowPublicly &&
    Boolean(parsed.merchant_alert?.can_show_publicly) &&
    confidence >= 0.7 &&
    Boolean(sourcePublicSummary || offerPublicSummary);
  const riskScope: RiskPrecheckScope = sourceCanShowPublicly ? "mixed" : "offer";
  const expiresInHours = clampNumber(parsed.expires_in_hours, 1, 168, RISK_PRECHECK_PUBLIC_TTL_HOURS);
  const result: RiskFeedbackReviewResult = {
    status: "ready",
    provider: config.provider,
    model: config.model,
    reviewedAt,
    canShowPublicly,
    riskLevel: normalizeEnum(parsed.risk_level, ["low", "medium", "high"] as const, input.reason === "bad_source" ? "high" : "medium"),
    riskScope,
    riskCategory,
    confidence,
    abuseRisk,
    evidenceQuality,
    publicSummary: offerPublicSummary,
    offerSummary,
    offerPublicSummary,
    sourceCanShowPublicly,
    sourcePublicSummary: sourcePublicSummary || (sourceCanShowPublicly ? offerPublicSummary : ""),
    imageEvidenceCount: countFeedbackImageEvidenceReferences(input.evidenceUrls),
    imageEvidenceUsedCount: evidenceImageUsedCount,
    privateReason: sanitizePrivateReason(parsed.private_reason),
    expiresAt: canShowPublicly ? new Date(new Date(reviewedAt).getTime() + expiresInHours * 60 * 60 * 1000).toISOString() : null,
  };

  return getPublicRiskPrecheck({ riskPrecheck: result }) ? result : { ...result, canShowPublicly: false, expiresAt: null };
}

function buildFailedRiskPrecheck(
  input: RiskFeedbackReviewInput,
  error: string,
  config?: Pick<RiskReviewRuntimeConfig, "provider" | "model">,
): RiskFeedbackReviewResult {
  const reviewedAt = new Date().toISOString();
  return {
    status: "failed",
    provider: config?.provider || RISK_REVIEW_PROVIDER,
    model: config?.model || "unconfigured",
    reviewedAt,
    canShowPublicly: false,
    riskLevel: "medium",
    riskScope: inferFallbackRiskScope(input),
    riskCategory: normalizeRiskCategory(input.reason),
    confidence: 0,
    abuseRisk: "medium",
    evidenceQuality: evidenceQualityFromInput(input),
    publicSummary: "",
    privateReason: "模型预审失败，暂不公开到前台。",
    expiresAt: null,
    error: error.slice(0, 500),
  };
}

function riskReviewSystemPrompt(): string {
  return [
    "你是 PriceAI 的用户反馈风险预审助手，不是最终裁决者。",
    "任务：根据用户反馈文字和图片证据，判断是否生成前台临时风险预警，并输出脱敏中文摘要。",
    "前台展示的是“用户反馈摘要”，不是平台最终判定。摘要必须以“有用户反馈”开头或保持同等语气。",
    "基础规则：只要可临时公开，优先生成商品/报价级提醒；商家级提醒只是额外升级，不要二选一。",
    "分类规则：标题夸大、标题承诺和详情/实际交付不一致，使用 description_mismatch；账号到手不能用、卡密错误、邮箱接不了码、虚拟卡错误、封号、token 失效、售后、发货、退款和交付争议使用 aftersales_shipping；渠道来源、店铺可信度问题使用 bad_source；明确疑似虚假或欺诈使用 fraud。",
    "商品名要用短中文概括，例如“Gemini 成品号”“ChatGPT Plus 月卡”“iCloud 邮箱号”。禁止写“某特定商品”“某资源站”“渠道”等别扭词。",
    "商品级摘要格式建议：有用户反馈，购买「短商品名」后遇到……。购买前建议先向商家确认……。",
    "商家级摘要格式建议：有用户反馈，在该商家购买「短商品名」时遇到……。建议购买前先确认……。",
    "严禁输出联系方式、订单号、QQ、微信、手机号、邮箱、截图原文隐私信息。",
    "不要使用骗子、跑路、诈骗犯等最终定性词。只能写“有用户反馈/购买前请确认”。",
    "如证据不足、疑似恶意同行攻击、广告、辱骂、无法判断，则 offer_alert.can_show_publicly=false。",
    "商家级风险要更谨慎；只有证据显示商家交付/售后模式可能影响其他商品，或同商家明显有泛化问题时，merchant_alert.can_show_publicly=true。",
    "只返回 JSON，不要 Markdown。",
  ].join("\n");
}

function buildRiskReviewPromptPayload(input: RiskFeedbackReviewInput, evidenceImages: RiskReviewEvidenceImage[]): Record<string, unknown> {
  return {
    feedback_id: input.id,
    product_name: input.productName || null,
    offer_id: input.offerId || null,
    source_id: input.sourceId || null,
    source_name: input.sourceName || null,
    source_title: input.sourceTitle || null,
    offer_url_host: safeUrlHost(input.offerUrl),
    offer_price: input.offerPrice ?? null,
    offer_status: input.offerStatus || null,
    reason: input.reason,
    user_expected_action: input.userExpectedAction,
    notes: input.notes || null,
    evidence_text: input.evidenceText || null,
    evidence_url_count: input.evidenceUrls?.length || 0,
    image_evidence_used_count: evidenceImages.filter((image) => Boolean(image.dataUrl)).length,
    image_evidence_read_errors: evidenceImages.flatMap((image) => image.error ? [image.error] : []),
    submitter_ip_present: Boolean(input.submitterIp),
    output_schema: {
      risk_level: "low | medium | high",
      risk_scope: "offer | mixed；基础商品级提醒请使用 offer，商品+商家级提醒请使用 mixed",
      risk_category: "description_mismatch | fraud | bad_source | aftersales_shipping",
      confidence: "0..1",
      abuse_risk: "low | medium | high；只表示这条反馈是否像恶意举报、广告、辱骂或同行攻击，不表示商品交易风险",
      evidence_quality: "none | low | medium | high；只表示用户证据质量",
      offer_alert: {
        can_show_publicly: "boolean；是否展示商品/报价级用户反馈摘要",
        product_summary: "中文短商品名，例如 Gemini 成品号",
        public_summary: "中文，40-120字，必须是用户反馈摘要，脱敏，不作最终裁定",
      },
      merchant_alert: {
        can_show_publicly: "boolean；是否额外升级为商家级提醒",
        public_summary: "中文，40-120字，只有商家级风险成立时填写",
        reason: "中文，说明为什么需要或不需要升级到商家级",
      },
      private_reason: "中文，给管理员看的判断原因",
      expires_in_hours: "建议 24-72，最多 168",
    },
  };
}

type RiskReviewEvidenceImage = {
  dataUrl?: string;
  contentType?: string;
  error?: string;
};

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

function buildRiskReviewUserContent(
  input: RiskFeedbackReviewInput,
  evidenceImages: RiskReviewEvidenceImage[],
): string | ChatContentPart[] {
  const text = JSON.stringify(buildRiskReviewPromptPayload(input, evidenceImages));
  const imageParts = evidenceImages
    .filter((image): image is RiskReviewEvidenceImage & { dataUrl: string } => Boolean(image.dataUrl))
    .map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }));

  if (!imageParts.length) return text;
  return [{ type: "text", text }, ...imageParts];
}

async function loadRiskReviewEvidenceImages(urls: string[]): Promise<RiskReviewEvidenceImage[]> {
  const refs = urls.filter(isFeedbackImageEvidenceReference).slice(0, MAX_MULTIMODAL_EVIDENCE_IMAGES);
  const images = await Promise.all(refs.map((url) => loadRiskReviewEvidenceImage(url)));
  return images;
}

async function loadRiskReviewEvidenceImage(url: string): Promise<RiskReviewEvidenceImage> {
  try {
    const evidence = await readFeedbackEvidenceImage(url);
    if (!evidence) return { error: "图片证据不存在或不是站内证据。" };
    if (!evidence.contentType.startsWith("image/")) return { error: "证据文件不是图片。" };
    if (typeof evidence.size === "number" && evidence.size > MAX_MULTIMODAL_EVIDENCE_BYTES) {
      return { error: "图片证据超过模型预审大小限制。" };
    }

    const bytes = new Uint8Array(await new Response(evidence.body).arrayBuffer());
    if (bytes.byteLength > MAX_MULTIMODAL_EVIDENCE_BYTES) {
      return { error: "图片证据超过模型预审大小限制。" };
    }

    return {
      contentType: evidence.contentType,
      dataUrl: `data:${evidence.contentType};base64,${bytesToBase64(bytes)}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "图片证据读取失败。" };
  }
}

function extractChatCompletionContent(value: Record<string, unknown>): string {
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const first = choices[0];
  if (!first || typeof first !== "object") throw new Error("模型响应缺少 choices。");
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== "object") throw new Error("模型响应缺少 message。");
  const content = (message as Record<string, unknown>).content;
  if (typeof content !== "string" || !content.trim()) throw new Error("模型响应内容为空。");
  return content.trim();
}

function parseModelRiskReviewContent(content: string): ModelRiskReviewJson {
  try {
    return JSON.parse(content) as ModelRiskReviewJson;
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) return JSON.parse(fenced) as ModelRiskReviewJson;
    const objectText = content.match(/\{[\s\S]*\}/)?.[0];
    if (objectText) return JSON.parse(objectText) as ModelRiskReviewJson;
    throw new Error("模型响应不是合法 JSON。");
  }
}

function normalizeRiskCategory(value: unknown): RiskPrecheckCategory {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (
      normalized === "description_mismatch" ||
      normalized.includes("description") ||
      normalized.includes("title") ||
      normalized.includes("misleading") ||
      normalized.includes("mismatch") ||
      normalized.includes("标题") ||
      normalized.includes("描述") ||
      normalized.includes("误导") ||
      normalized.includes("不符")
    ) {
      return "description_mismatch";
    }
    if (normalized.includes("source") || normalized.includes("channel") || normalized.includes("seller") || normalized.includes("store")) {
      return "bad_source";
    }
    if (
      normalized.includes("after") ||
      normalized.includes("service") ||
      normalized.includes("shipping") ||
      normalized.includes("delivery") ||
      normalized.includes("fulfillment") ||
      normalized.includes("refund")
    ) {
      return AFTERSALES_FEEDBACK_REASON;
    }
  }
  if (value === "description_mismatch") return "description_mismatch";
  if (value === "bad_source") return "bad_source";
  if (value === AFTERSALES_FEEDBACK_REASON) return AFTERSALES_FEEDBACK_REASON;
  return "fraud";
}

function inferFallbackRiskScope(input: Pick<RiskFeedbackReviewInput, "reason" | "userExpectedAction">): RiskPrecheckScope {
  return input.reason === "bad_source" || input.userExpectedAction === "hide_source" ? "source" : "offer";
}

function evidenceQualityFromInput(
  input: Pick<RiskFeedbackReviewInput, "evidenceText" | "evidenceUrls">,
  usedImageCount = countFeedbackImageEvidenceReferences(input.evidenceUrls),
): "none" | "low" | "medium" | "high" {
  if (usedImageCount) return "medium";
  const textLength = input.evidenceText?.trim().length || 0;
  if (textLength >= 80) return "medium";
  if (textLength >= 8) return "low";
  return "none";
}

function sanitizePublicSummary(value: unknown): string {
  if (typeof value !== "string") return "";
  return sanitizeRiskText(value).slice(0, 160);
}

function sanitizeOfferPublicSummary(value: unknown, offerSummary: string): string {
  const summary = sanitizePublicSummary(value);
  if (!summary) return "";
  return normalizePublicSummaryProduct(summary, offerSummary);
}

function sanitizeSourcePublicSummary(value: unknown, offerSummary: string): string {
  const summary = sanitizePublicSummary(value).replace(/在某资源站|某资源站|资源站/g, "在该商家");
  if (!summary) return "";
  return normalizePublicSummaryProduct(summary, offerSummary);
}

function sanitizePrivateReason(value: unknown): string {
  if (typeof value !== "string") return "模型未提供判断原因。";
  return sanitizeRiskText(value).slice(0, 500);
}

function sanitizeRiskText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/(微信|VX|QQ|手机号|电话|邮箱|订单号)[:：]?\s*[A-Za-z0-9_@.+-]{4,}/gi, "$1已脱敏")
    .replace(/骗子|诈骗犯|跑路/gi, "存在风险")
    .trim();
}

function normalizePublicSummaryProduct(value: string, offerSummary: string): string {
  const product = offerSummary || "相关商品";
  const cleaned = value
    .replace(/在某资源站|某资源站|资源站/g, "")
    .replace(/某特定商品账号|某特定商品|特定产品账号|特定产品|特定商品|相关商品账号/g, `「${product}」`)
    .replace(/购买的?「/g, "购买「")
    .replace(/购买\s+「/g, "购买「")
    .replace(/，\s*，/g, "，")
    .replace(/^有用户反馈，?\s*/, "有用户反馈，")
    .trim()
    .slice(0, 160);

  if (cleaned.includes(product)) return cleaned;
  const body = cleaned.replace(/^有用户反馈，?\s*/, "").trim();
  return buildProductScopedSummary(product, body).slice(0, 160);
}

function buildProductScopedSummary(product: string, body: string): string {
  if (!body) {
    return `有用户反馈，购买「${product}」后遇到需要确认的问题。购买前建议先向商家确认商品细节、交付方式和售后规则。`;
  }
  if (body.startsWith("购买后")) return `有用户反馈，购买「${product}」后${body.slice(3)}`;
  if (body.startsWith("遇到")) return `有用户反馈，购买「${product}」后${body}`;
  if (body.startsWith("购买前") || body.startsWith("请")) {
    return `有用户反馈，购买「${product}」后遇到需要确认的问题。${body}`;
  }
  return `有用户反馈，购买「${product}」后${body}`;
}

function sanitizeProductSummary(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const sanitized = sanitizeRiskText(value)
    .replace(/^购买的?/, "")
    .replace(/账号商品|商品账号/g, "账号")
    .slice(0, 40);
  if (!sanitized || /某|特定|相关商品|未知/.test(sanitized)) return fallback;
  return sanitized;
}

function inferProductSummary(input: Pick<RiskFeedbackReviewInput, "productName" | "sourceTitle">): string {
  const text = `${input.productName || ""} ${input.sourceTitle || ""}`.toLowerCase();
  if (/gemini/.test(text)) return "Gemini 成品号";
  if (/chatgpt|gpt/.test(text) && /plus/.test(text)) return "ChatGPT Plus";
  if (/chatgpt|gpt/.test(text) && /team|business/.test(text)) return "ChatGPT Team";
  if (/claude/.test(text)) return "Claude 账号";
  if (/icloud|邮箱|email|mail/.test(text)) return "邮箱账号";
  if (/接码|验证码|sms/.test(text)) return "接码服务";
  return sanitizeProductSummary(input.productName || input.sourceTitle || "相关商品") || "相关商品";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function safeUrlHost(value?: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function normalizeEnum<const T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (options.includes(normalized as T[number])) return normalized as T[number];
    if (normalized.includes("none") || normalized.includes("empty") || normalized.includes("missing")) {
      const none = "none" as T[number];
      if (options.includes(none)) return none;
    }
    if (normalized.includes("low") || normalized.includes("weak") || normalized.includes("potential")) {
      const low = "low" as T[number];
      if (options.includes(low)) return low;
    }
    if (normalized.includes("medium") || normalized.includes("moderate") || normalized.includes("user_report")) {
      const medium = "medium" as T[number];
      if (options.includes(medium)) return medium;
    }
    if (normalized.includes("high") || normalized.includes("strong") || normalized.includes("scam")) {
      const high = "high" as T[number];
      if (options.includes(high)) return high;
    }
  }
  return options.includes(value as T[number]) ? value as T[number] : fallback;
}
