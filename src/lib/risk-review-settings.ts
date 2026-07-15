import "server-only";

import {
  DEFAULT_RISK_REVIEW_BASE_URL,
  DEFAULT_RISK_REVIEW_MODEL,
  RISK_PRECHECK_ENV,
} from "@/lib/trust-risk";
import { decryptJsonPayload, encryptJsonPayload } from "@/lib/secret-crypto";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { RiskReviewSettingsSummary } from "@/lib/types";

export const RISK_REVIEW_SETTING_ID = "risk_review";
export const DEFAULT_RISK_REVIEW_TIMEOUT_MS = 12_000;
export const DEFAULT_RISK_REVIEW_DAILY_LIMIT = 100;
export const DEFAULT_RISK_REVIEW_MAX_OUTPUT_TOKENS = 900;
export const DEFAULT_RISK_REVIEW_MAX_RESPONSE_BYTES = 256 * 1024;

export type RiskReviewRuntimeConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  dailyLimit: number;
  maxOutputTokens: number;
  maxResponseBytes: number;
  apiKey: string | null;
  source: RiskReviewSettingsSummary["source"];
};

export type RiskReviewSettingsInput = {
  provider?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  timeoutMs?: number | null;
  apiKey?: string | null;
};

type RuntimeSettingsRow = {
  id: string;
  provider?: string | null;
  base_url?: string | null;
  model?: string | null;
  timeout_ms?: number | null;
  encrypted_api_key?: unknown;
  api_key_hint?: string | null;
  updated_at?: string | null;
};

export async function getRiskReviewRuntimeConfig(): Promise<RiskReviewRuntimeConfig> {
  const envApiKey = getRuntimeEnv(RISK_PRECHECK_ENV.apiKey) || null;
  const row = await getRiskReviewSettingsRow().catch(() => null);
  if (row) {
    const storedApiKey = await decryptApiKey(row.encrypted_api_key).catch(() => null);
    const apiKey = storedApiKey || envApiKey;
    if (apiKey) {
      return {
        provider: cleanText(row.provider) || "opencode",
        baseUrl: normalizeBaseUrl(row.base_url) || environmentBaseUrl(),
        model: cleanText(row.model) || environmentModel(),
        timeoutMs: normalizeTimeoutMs(row.timeout_ms),
        dailyLimit: environmentDailyLimit(),
        maxOutputTokens: environmentMaxOutputTokens(),
        maxResponseBytes: environmentMaxResponseBytes(),
        apiKey,
        source: storedApiKey ? "database" : "environment",
      };
    }
  }

  return {
    provider: "opencode",
    baseUrl: environmentBaseUrl(),
    model: environmentModel(),
    timeoutMs: normalizeTimeoutMs(Number(getRuntimeEnv(RISK_PRECHECK_ENV.timeoutMs))),
    dailyLimit: environmentDailyLimit(),
    maxOutputTokens: environmentMaxOutputTokens(),
    maxResponseBytes: environmentMaxResponseBytes(),
    apiKey: envApiKey,
    source: envApiKey ? "environment" : "unconfigured",
  };
}

export async function getRiskReviewSettingsSummary(): Promise<RiskReviewSettingsSummary> {
  const row = await getRiskReviewSettingsRow();
  if (row) {
    const hasStoredApiKey = Boolean(row.encrypted_api_key);
    const hasEnvApiKey = Boolean(getRuntimeEnv(RISK_PRECHECK_ENV.apiKey));
    return {
      configured: hasStoredApiKey || hasEnvApiKey,
      tableReady: true,
      source: "database",
      provider: cleanText(row.provider) || "opencode",
      baseUrl: normalizeBaseUrl(row.base_url) || environmentBaseUrl(),
      model: cleanText(row.model) || environmentModel(),
      timeoutMs: normalizeTimeoutMs(row.timeout_ms),
      hasApiKey: hasStoredApiKey || hasEnvApiKey,
      apiKeyLast4: cleanText(row.api_key_hint),
      updatedAt: row.updated_at || null,
      message: hasStoredApiKey || !hasEnvApiKey ? null : "地址和模型使用后台配置，API Key 来自环境变量。",
    };
  }

  const hasEnvApiKey = Boolean(getRuntimeEnv(RISK_PRECHECK_ENV.apiKey));
  return {
    configured: hasEnvApiKey,
    tableReady: true,
    source: hasEnvApiKey ? "environment" : "default",
    provider: "opencode",
    baseUrl: environmentBaseUrl(),
    model: environmentModel(),
    timeoutMs: normalizeTimeoutMs(Number(getRuntimeEnv(RISK_PRECHECK_ENV.timeoutMs))),
    hasApiKey: hasEnvApiKey,
    apiKeyLast4: null,
    updatedAt: null,
    message: hasEnvApiKey ? "当前使用环境变量配置。" : "尚未配置风险预审 API Key。",
  };
}

export function getFallbackRiskReviewSettingsSummary(message = "风险预审配置表尚未初始化。"): RiskReviewSettingsSummary {
  const hasEnvApiKey = Boolean(getRuntimeEnv(RISK_PRECHECK_ENV.apiKey));
  return {
    configured: hasEnvApiKey,
    tableReady: false,
    source: hasEnvApiKey ? "environment" : "unconfigured",
    provider: "opencode",
    baseUrl: environmentBaseUrl(),
    model: environmentModel(),
    timeoutMs: normalizeTimeoutMs(Number(getRuntimeEnv(RISK_PRECHECK_ENV.timeoutMs))),
    hasApiKey: hasEnvApiKey,
    apiKeyLast4: null,
    updatedAt: null,
    message,
  };
}

export async function updateRiskReviewSettings(input: RiskReviewSettingsInput): Promise<RiskReviewSettingsSummary> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法保存风险预审配置。");

  const existing = await getRiskReviewSettingsRow();
  const provider = cleanText(input.provider) || existing?.provider || "opencode";
  const baseUrl = normalizeBaseUrl(input.baseUrl) || normalizeBaseUrl(existing?.base_url) || environmentBaseUrl();
  const model = cleanText(input.model) || existing?.model || environmentModel();
  const timeoutMs = normalizeTimeoutMs(input.timeoutMs ?? existing?.timeout_ms);
  const apiKey = cleanText(input.apiKey);
  const encryptedApiKey = apiKey ? await encryptJsonPayload({ api_key: apiKey }) : existing?.encrypted_api_key || null;
  const apiKeyHint = apiKey ? apiKey.slice(-4) : existing?.api_key_hint || null;

  const { error } = await supabase
    .from("app_runtime_settings")
    .upsert({
      id: RISK_REVIEW_SETTING_ID,
      provider,
      base_url: baseUrl,
      model,
      timeout_ms: timeoutMs,
      encrypted_api_key: encryptedApiKey,
      api_key_hint: apiKeyHint,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (error) throw error;

  return getRiskReviewSettingsSummary();
}

async function getRiskReviewSettingsRow(): Promise<RuntimeSettingsRow | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_runtime_settings")
    .select("id,provider,base_url,model,timeout_ms,encrypted_api_key,api_key_hint,updated_at")
    .eq("id", RISK_REVIEW_SETTING_ID)
    .maybeSingle();
  if (error) throw error;
  return data as RuntimeSettingsRow | null;
}

async function decryptApiKey(payload: unknown): Promise<string | null> {
  const decrypted = await decryptJsonPayload(payload);
  const value = decrypted?.api_key;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function environmentBaseUrl(): string {
  return (getRuntimeEnv(RISK_PRECHECK_ENV.baseUrl) || DEFAULT_RISK_REVIEW_BASE_URL).replace(/\/+$/, "");
}

function environmentModel(): string {
  return getRuntimeEnv(RISK_PRECHECK_ENV.model) || DEFAULT_RISK_REVIEW_MODEL;
}

function environmentDailyLimit(): number {
  return boundedInteger(getRuntimeEnv("PRICEAI_RISK_REVIEW_DAILY_LIMIT"), DEFAULT_RISK_REVIEW_DAILY_LIMIT, 1, 100000);
}

function environmentMaxOutputTokens(): number {
  return boundedInteger(getRuntimeEnv("PRICEAI_RISK_REVIEW_MAX_OUTPUT_TOKENS"), DEFAULT_RISK_REVIEW_MAX_OUTPUT_TOKENS, 128, 8000);
}

function environmentMaxResponseBytes(): number {
  return boundedInteger(getRuntimeEnv("PRICEAI_RISK_REVIEW_MAX_RESPONSE_BYTES"), DEFAULT_RISK_REVIEW_MAX_RESPONSE_BYTES, 16 * 1024, 2 * 1024 * 1024);
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("Base URL 不是有效地址。");
  }
}

function normalizeTimeoutMs(value: number | null | undefined): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 3_000 && numberValue <= 60_000
    ? Math.round(numberValue)
    : DEFAULT_RISK_REVIEW_TIMEOUT_MS;
}

function cleanText(value: string | number | null | undefined): string | null {
  const text = String(value || "").trim();
  return text ? text : null;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}
