import { fetchDetectorJson, normalizeDetectorServiceUrl } from "@/lib/detector-request";
import { formatDateMinute } from "@/lib/utils";

export type DetectorReportTone = "success" | "warning" | "danger" | "muted";

export interface DetectorReportMetric {
  label: string;
  value: string;
  helper: string;
  tone?: DetectorReportTone;
}

export interface DetectorReportCheck {
  name: string;
  label: string;
  status: string;
  tone: DetectorReportTone;
  scoreLabel: string;
  durationLabel: string;
  summary: string;
  details: Array<{ label: string; value: string }>;
}

export interface DetectorReportView {
  id: string;
  title: string;
  protocolLabel: string;
  model: string;
  modeLabel: string;
  baseUrl: string;
  apiKeyMasked: string;
  timestampLabel: string;
  score: number;
  scoreLabel: string;
  verdictLabel: string;
  verdictTone: DetectorReportTone;
  summary: string;
  tierTitle: string;
  tierMessage: string;
  runError?: string;
  metrics: DetectorReportMetric[];
  checks: DetectorReportCheck[];
  passCount: number;
  issueCount: number;
  skippedCount: number;
  raw: DetectorReportRaw;
}

export interface DetectorReportRaw {
  protocol?: string;
  tier?: string;
  tier_title?: string;
  tier_message?: string;
  base_url?: string;
  api_key_masked?: string;
  target_model?: string;
  mode?: string;
  timestamp?: string;
  total_score?: number;
  verdict?: string;
  summary?: string;
  run_error?: string | null;
  performance?: {
    total_latency_ms?: number | null;
    ttft_ms?: number | null;
    tokens_per_second?: number | null;
    request_count?: number | null;
    backoff_events?: number | null;
    usage?: {
      input_tokens?: number | null;
      output_tokens?: number | null;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
      server_tool_use?: number | null;
    } | null;
  } | null;
  results?: DetectorReportRawResult[];
  detected_non_anthropic_brands?: string[];
  self_reported_identity?: string | null;
}

interface DetectorReportRawResult {
  name?: string;
  display_name?: string;
  status?: string;
  score?: number | null;
  weight?: number | null;
  duration_ms?: number | null;
  error?: string | null;
  details?: unknown;
}

const protocolLabels: Record<string, string> = {
  openai: "OpenAI Chat Completions",
  openai_chat: "OpenAI Chat Completions",
  openai_responses: "OpenAI Responses",
  responses: "OpenAI Responses",
  anthropic: "Claude / Anthropic",
  claude: "Claude / Anthropic",
  gemini: "Gemini",
};

const modeLabels: Record<string, string> = {
  quick: "快速",
  standard: "标准",
  full: "深度",
  deep: "深度",
};

const resultLabels: Record<string, string> = {
  basic_request: "基础请求",
  model_consistency: "模型一致性",
  function_calling: "函数调用",
  structured_output: "结构化输出",
  protocol: "协议规范性",
  integrity: "流式一致性",
  token_billing: "Token 计费",
  long_context: "长上下文真实性",
  identity: "身份自述",
};

export function getDetectorServiceUrl(): string {
  return (process.env.NEXT_PUBLIC_TRANSIT_DETECTOR_API_BASE_URL ?? "").trim().replace(/\/$/, "");
}

export function buildPriceAiDetectorReportHref(jobId: string): string {
  return `/api-transit/detector/reports/${encodeURIComponent(jobId)}`;
}

export async function fetchDetectorReport(jobId: string, serviceUrl = getDetectorServiceUrl()): Promise<DetectorReportRaw> {
  const normalizedServiceUrl = normalizeDetectorServiceUrl(serviceUrl);
  const endpoint = `${normalizedServiceUrl}/api/result/${encodeURIComponent(jobId)}.json`;
  const { response, data } = await fetchDetectorJson<DetectorReportRaw>(endpoint, {
    cache: "no-store",
  }, { timeoutMs: 20_000, maxBytes: 2 * 1024 * 1024 });
  if (response.status === 404) throw new Error("报告还没有生成，或者任务编号不存在。");
  if (!response.ok) throw new Error("无法读取检测报告。");

  return data;
}

export function toDetectorReportView(jobId: string, report: DetectorReportRaw): DetectorReportView {
  const protocol = normalizeText(report.protocol, "unknown");
  const mode = normalizeText(report.mode, "standard");
  const score = clampScore(report.total_score);
  const verdict = normalizeText(report.verdict, "unknown");
  const checks = (report.results ?? []).map(toReportCheck);
  const passCount = checks.filter((item) => item.tone === "success").length;
  const issueCount = checks.filter((item) => item.tone === "warning" || item.tone === "danger").length;
  const skippedCount = checks.filter((item) => item.tone === "muted").length;
  const verdictTone = report.run_error ? "danger" : getVerdictTone(verdict, score);

  return {
    id: jobId,
    title: `报告 #${jobId}`,
    protocolLabel: protocolLabels[protocol] ?? protocol,
    model: normalizeText(report.target_model, "未记录"),
    modeLabel: modeLabels[mode] ?? mode,
    baseUrl: normalizeText(report.base_url, "未记录"),
    apiKeyMasked: normalizeText(report.api_key_masked, "未记录"),
    timestampLabel: formatDateMinute(report.timestamp),
    score,
    scoreLabel: `${Math.round(score)}%`,
    verdictLabel: getVerdictLabel(verdict, score, Boolean(report.run_error)),
    verdictTone,
    summary: getReportSummary(verdict, score, Boolean(report.run_error)),
    tierTitle: getTierTitle(protocol),
    tierMessage: getTierMessage(protocol),
    runError: report.run_error || undefined,
    metrics: toReportMetrics(report),
    checks,
    passCount,
    issueCount,
    skippedCount,
    raw: report,
  };
}

export function toPublicDetectorReportView(jobId: string, report: DetectorReportRaw): DetectorReportView {
  const view = toDetectorReportView(jobId, report);
  return {
    ...view,
    title: "已分享报告",
    baseUrl: "已由分享者隐藏",
    apiKeyMasked: "已隐藏",
    runError: view.runError ? "检测运行未完整完成，具体内部错误已隐藏。" : undefined,
    checks: view.checks.map((check) => ({
      ...check,
      summary: publicCheckSummary(check.tone),
      details: [],
    })),
    raw: sanitizePublicDetectorReportRaw(report),
  };
}

function toReportMetrics(report: DetectorReportRaw): DetectorReportMetric[] {
  const perf = report.performance ?? {};
  const usage = perf.usage ?? {};
  const totalLatencyMs = toFiniteNumber(perf.total_latency_ms);
  const outputTokens = toFiniteNumber(usage.output_tokens);
  const tokensPerSecond = toFiniteNumber(perf.tokens_per_second) ?? (
    totalLatencyMs && outputTokens ? (outputTokens * 1000) / totalLatencyMs : null
  );

  return [
    {
      label: "首 Token",
      value: formatMilliseconds(perf.ttft_ms),
      helper: "从请求发出到收到首个 token。",
      tone: getLatencyTone(perf.ttft_ms, 2000),
    },
    {
      label: "总耗时",
      value: formatMilliseconds(perf.total_latency_ms),
      helper: "整批检测任务的墙钟时间。",
      tone: getLatencyTone(perf.total_latency_ms, 30000),
    },
    {
      label: "吞吐",
      value: tokensPerSecond ? `${tokensPerSecond.toFixed(1)} T/S` : "未记录",
      helper: "按输出 token 和总耗时估算。",
    },
    {
      label: "输入 Tokens",
      value: formatCount(usage.input_tokens),
      helper: "本次检测累计输入用量。",
    },
    {
      label: "输出 Tokens",
      value: formatCount(usage.output_tokens),
      helper: "本次检测累计输出用量。",
    },
    {
      label: "请求数",
      value: formatCount(perf.request_count),
      helper: "检测器实际发起的请求数量。",
    },
  ];
}

function publicCheckSummary(tone: DetectorReportTone): string {
  if (tone === "success") return "这一项在本次检测中通过。";
  if (tone === "warning") return "这一项存在需要结合多次检测复核的信号。";
  if (tone === "danger") return "这一项在本次检测中未通过。";
  return "这一项未启用或没有形成有效结论。";
}

function sanitizePublicDetectorReportRaw(report: DetectorReportRaw): DetectorReportRaw {
  return {
    protocol: report.protocol,
    tier: report.tier,
    tier_title: report.tier_title,
    tier_message: report.tier_message,
    target_model: report.target_model,
    mode: report.mode,
    timestamp: report.timestamp,
    total_score: report.total_score,
    verdict: report.verdict,
    summary: report.summary,
    performance: report.performance,
    results: (report.results || []).map((result) => ({
      name: result.name,
      display_name: result.display_name,
      status: result.status,
      score: result.score,
      weight: result.weight,
      duration_ms: result.duration_ms,
    })),
  };
}

function toReportCheck(result: DetectorReportRawResult): DetectorReportCheck {
  const name = normalizeText(result.name, "unknown");
  const status = normalizeText(result.status, "");
  const score = clampScore(result.score);
  const tone = getResultTone(status, score);
  const error = normalizeText(result.error, "");
  const summary = error || summarizeDetails(result.details) || getDefaultCheckSummary(name, tone);

  return {
    name,
    label: normalizeText(result.display_name, resultLabels[name] ?? name),
    status: getResultStatusLabel(status, score),
    tone,
    scoreLabel: Number.isFinite(score) ? `${Math.round(score)}%` : "未记录",
    durationLabel: formatMilliseconds(result.duration_ms),
    summary,
    details: extractDetailRows(result.details),
  };
}

function extractDetailRows(details: unknown): Array<{ label: string; value: string }> {
  if (!isRecord(details)) return [];

  const rows: Array<{ label: string; value: string }> = [];
  addDetailRow(rows, "响应模型", details.response_model);
  addDetailRow(rows, "请求模型", details.request_model);
  addDetailRow(rows, "模型匹配", toBooleanLabel(details.model_match));
  addDetailRow(rows, "稳定性", details.stability_label);
  addDetailRow(rows, "结束原因", details.finish_reason);
  addDetailRow(rows, "结构化输出", toBooleanLabel(details.schema_match ?? details.json_parse));
  addDetailRow(rows, "文本一致", toBooleanLabel(details.text_match));
  addDetailRow(rows, "Usage 一致", toBooleanLabel(details.usage_match));
  addDetailRow(rows, "风险等级", details.risk_level);
  addDetailRow(rows, "评估", details.evaluation_zh);

  const issues = Array.isArray(details.issues) ? details.issues : [];
  if (issues.length) {
    rows.push({ label: "协议问题", value: `${issues.length} 条` });
    const firstIssue = issues.find(isRecord);
    if (firstIssue) addDetailRow(rows, "首个问题", firstIssue.message);
  }

  return rows.slice(0, 8);
}

function summarizeDetails(details: unknown): string {
  if (!isRecord(details)) return "";
  const evaluation = normalizeText(details.evaluation_zh, "");
  if (evaluation) return evaluation;

  const issues = Array.isArray(details.issues) ? details.issues : [];
  if (issues.length) {
    const critical = issues.filter((item) => isRecord(item) && item.severity === "critical").length;
    const major = issues.filter((item) => isRecord(item) && item.severity === "major").length;
    return `发现 ${issues.length} 条协议问题${critical ? `，其中 ${critical} 条严重` : ""}${major ? `，${major} 条主要问题` : ""}。`;
  }

  const responseText = normalizeText(details.response_text, "");
  if (responseText) return `响应摘要：${truncateText(responseText, 96)}`;
  return "";
}

function getDefaultCheckSummary(name: string, tone: DetectorReportTone): string {
  if (tone === "success") return `${resultLabels[name] ?? "该项"}未发现明显异常。`;
  if (tone === "muted") return "本次检测未启用该项，或后端没有返回有效结果。";
  return `${resultLabels[name] ?? "该项"}存在异常，需要结合证据明细复核。`;
}

function addDetailRow(rows: Array<{ label: string; value: string }>, label: string, value: unknown) {
  const text = formatDetailValue(value);
  if (text) rows.push({ label, value: text });
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return toBooleanLabel(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return truncateText(value, 140);
  if (Array.isArray(value)) return truncateText(value.map(formatDetailValue).filter(Boolean).join(", "), 140);
  if (isRecord(value)) return truncateText(JSON.stringify(value), 140);
  return "";
}

function getVerdictTone(verdict: string, score: number): DetectorReportTone {
  if (verdict === "passed" && score >= 85) return "success";
  if (verdict === "failed") return "danger";
  if (verdict === "marginal" || score < 85) return "warning";
  return "muted";
}

function getReportSummary(verdict: string, score: number, hasRunError: boolean): string {
  if (hasRunError) return "检测未完成，当前报告只保留已返回的错误和上下文。";
  if (verdict === "passed" && score >= 95) return "本次检测未发现明显异常，可作为一次高可信样本记录。";
  if (verdict === "passed") return "主要检测项通过，仍建议结合站点来源和后续样本判断。";
  if (verdict === "marginal") return "检测中出现需要复核的信号，建议不要只凭单次结果决策。";
  if (verdict === "failed") return "检测发现关键异常，需要回到证据项核验具体原因。";
  return "检测服务已返回结果，但当前结论口径不足，需要结合证据项复核。";
}

function getVerdictLabel(verdict: string, score: number, hasRunError: boolean): string {
  if (hasRunError) return "检测无效";
  if (verdict === "passed" && score >= 95) return "通过";
  if (verdict === "passed") return "基本通过";
  if (verdict === "marginal") return "存在风险";
  if (verdict === "failed") return "未通过";
  return "待判断";
}

function getResultTone(status: string, score: number): DetectorReportTone {
  if (status === "skip" || status === "skipped") return "muted";
  if (status === "pass" || score >= 90) return "success";
  if (status === "fail" || score < 70) return "danger";
  if (status === "warn" || score < 90) return "warning";
  return "muted";
}

function getResultStatusLabel(status: string, score: number): string {
  if (status === "pass") return "通过";
  if (status === "fail") return "未通过";
  if (status === "skip" || status === "skipped") return "未启用";
  if (status === "warn") return "需复核";
  if (score >= 90) return "通过";
  if (score >= 70) return "需复核";
  return "未通过";
}

function getTierTitle(protocol: string): string {
  if (protocol === "anthropic" || protocol === "claude") return "Claude 协议检测";
  if (protocol === "openai_responses" || protocol === "responses") return "OpenAI Responses 检测";
  if (protocol === "gemini") return "Gemini 协议检测";
  if (protocol === "openai" || protocol === "openai_chat") return "Chat Completions 检测";
  return "协议能力检测";
}

function getTierMessage(protocol: string): string {
  if (protocol === "anthropic" || protocol === "claude") {
    return "Claude 检测会结合协议行为、签名相关信号、用量返回和长上下文样本；不同中转线路仍可能因账号池或限流策略产生波动。";
  }
  if (protocol === "openai_responses" || protocol === "responses") {
    return "Responses 检测会关注工具调用、结构化输出、流式一致性和用量返回，适合核验兼容 OpenAI Responses 的中转线路。";
  }
  if (protocol === "gemini") {
    return "Gemini 检测会关注协议兼容、模型返回、结构化能力和用量表现，单次结果仍不能替代持续样本。";
  }
  return "这份报告用于整理协议、能力、来源和计费证据，不等同于 PriceAI 对商家做担保。";
}

function getLatencyTone(value: number | null | undefined, warnThreshold: number): DetectorReportTone | undefined {
  const parsed = toFiniteNumber(value);
  if (!parsed) return undefined;
  return parsed > warnThreshold ? "warning" : undefined;
}

function toBooleanLabel(value: unknown): string {
  if (value === true) return "是";
  if (value === false) return "否";
  return "";
}

function formatMilliseconds(value: number | null | undefined): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return "未记录";
  if (parsed >= 1000) return `${(parsed / 1000).toFixed(parsed >= 10000 ? 1 : 2)}s`;
  return `${Math.round(parsed)}ms`;
}

function formatCount(value: number | null | undefined): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return "未记录";
  return parsed.toLocaleString("zh-CN");
}

function clampScore(value: unknown): number {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, parsed));
}

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
