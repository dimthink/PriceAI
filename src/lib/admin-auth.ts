import "server-only";

import crypto from "node:crypto";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSupabaseServerClient } from "@/lib/supabase";

export const ADMIN_SESSION_COOKIE = "priceai_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const ADMIN_PASSWORD_SETTINGS_ID = "admin_password";

const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_HASH_ITERATIONS = 210_000;
const PASSWORD_HASH_KEY_LENGTH = 32;
const PASSWORD_SALT_BYTES = 16;
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const ADMIN_PASSWORD_CACHE_TTL_MS = 30_000;

type StoredAdminPasswordSettings = {
  hash?: unknown;
  salt?: unknown;
  iterations?: unknown;
  algorithm?: unknown;
  sessionVersion?: unknown;
  updatedAt?: unknown;
};

type ParsedAdminPasswordSettings = {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: string;
  sessionVersion: string | null;
  updatedAt: string | null;
};

type PasswordHashSettings = Pick<ParsedAdminPasswordSettings, "hash" | "salt" | "iterations" | "algorithm">;

type AdminPasswordRow = {
  settings?: unknown;
  updated_at?: string | null;
};

export type AdminPasswordStatus = {
  configured: boolean;
  tableReady: boolean;
  source: "database" | "environment" | "unconfigured";
  minLength: number;
  updatedAt: string | null;
  message: string | null;
};

let adminPasswordCache: {
  expiresAt: number;
  row: AdminPasswordRow | null;
} | null = null;

export async function createAdminSessionToken(): Promise<string> {
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = crypto.randomBytes(16).toString("base64url");
  const version = await getAdminSessionVersion();
  const payload = [version, String(expiresAt), nonce].join(".");
  return `${payload}.${signAdminSessionPayload(payload)}`;
}

export async function verifyAdminSessionToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, expiresAtText, nonce, signature] = parts;
  if (!version || !expiresAtText || !nonce || !signature) return false;
  const expectedVersion = await getAdminSessionVersion().catch(() => null);
  if (!expectedVersion || version !== expectedVersion) return false;

  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const payload = [version, expiresAtText, nonce].join(".");
  const expected = signAdminSessionPayload(payload, { throwOnMissingSecret: false });
  if (!expected) return false;
  return timingSafeEqual(signature, expected);
}

export async function verifyAdminPassword(value: string | null | undefined): Promise<boolean> {
  if (!value) return false;
  try {
    const stored = await readStoredAdminPasswordSettings();
    const settings = parseStoredAdminPasswordSettings(stored?.settings);
    if (settings) {
      return verifyPasswordHash(value, settings) || verifyBreakGlassPassword(value);
    }

    const bootstrapPassword = getRuntimeEnv("ADMIN_PASSWORD");
    return Boolean(
      (bootstrapPassword && timingSafeEqual(value, bootstrapPassword)) ||
      verifyBreakGlassPassword(value)
    );
  } catch {
    return verifyBreakGlassPassword(value);
  }
}

export async function requireAdminRequest(request: Request): Promise<void> {
  if (await isAdminRequest(request)) return;
  throw new Error("未授权，请检查后台登录状态。");
}

export async function requireAdminOrCronRequest(request: Request): Promise<void> {
  const cronSecret = getRuntimeEnv("CRON_SECRET");
  const token = getBearerTokenFromRequest(request) ||
    request.headers.get("x-cron-secret")?.trim() ||
    request.headers.get("x-admin-password")?.trim() ||
    null;
  if (token && cronSecret && timingSafeEqual(token, cronSecret)) return;
  if (await isAdminRequest(request)) return;
  throw new Error("未授权，请检查后台登录状态或定时采集密钥。");
}

export async function isAdminRequest(request: Request): Promise<boolean> {
  const cookieToken = getAdminSessionTokenFromRequest(request);
  if (cookieToken && await verifyAdminSessionToken(cookieToken)) return true;

  const headerPassword = request.headers.get("x-admin-password")?.trim();
  if (headerPassword && await verifyAdminPassword(headerPassword)) return true;

  const bearer = getBearerTokenFromRequest(request);
  return Boolean(bearer && await verifyAdminPassword(bearer));
}

export async function updateAdminPassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<AdminPasswordStatus> {
  const currentPassword = cleanPassword(input.currentPassword);
  const newPassword = cleanPassword(input.newPassword);
  if (!currentPassword) throw new Error("请填写当前后台密码。");
  if (!await verifyAdminPassword(currentPassword)) throw new Error("当前后台密码不正确。");
  validateAdminPassword(newPassword);
  if (timingSafeEqual(currentPassword, newPassword)) throw new Error("新密码不能与当前密码相同。");

  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，暂时无法在后台保存新密码。");

  const now = new Date().toISOString();
  const settings = {
    ...hashAdminPassword(newPassword),
    sessionVersion: crypto.randomBytes(12).toString("base64url"),
    updatedAt: now,
  };
  const { error } = await supabase
    .from("app_runtime_settings")
    .upsert({
      id: ADMIN_PASSWORD_SETTINGS_ID,
      provider: "priceai",
      base_url: "https://priceai.cc/admin",
      model: "admin-password",
      timeout_ms: 12000,
      settings,
      updated_at: now,
    }, { onConflict: "id" });
  if (error) throw error;

  clearAdminPasswordCache();
  return getAdminPasswordStatus();
}

export async function getAdminPasswordStatus(): Promise<AdminPasswordStatus> {
  const envConfigured = Boolean(getRuntimeEnv("ADMIN_PASSWORD"));
  const breakGlassEnabled = isBreakGlassEnabled();
  try {
    const row = await readStoredAdminPasswordSettings();
    const parsed = parseStoredAdminPasswordSettings(row?.settings);
    if (parsed) {
      return {
        configured: true,
        tableReady: true,
        source: "database",
        minLength: MIN_ADMIN_PASSWORD_LENGTH,
        updatedAt: cleanText(row?.updated_at) || cleanText(parsed.updatedAt),
        message: breakGlassEnabled
          ? "数据库密码已生效；旧 ADMIN_PASSWORD 不再参与认证，独立 break-glass 已启用。"
          : "数据库密码已生效；旧 ADMIN_PASSWORD 不再参与认证。",
      };
    }

    return {
      configured: envConfigured || breakGlassEnabled,
      tableReady: true,
      source: envConfigured || breakGlassEnabled ? "environment" : "unconfigured",
      minLength: MIN_ADMIN_PASSWORD_LENGTH,
      updatedAt: null,
      message: envConfigured
        ? "当前使用 ADMIN_PASSWORD 作为首次初始化密码；保存数据库密码后它会自动失效。"
        : breakGlassEnabled
          ? "数据库密码尚未配置，当前仅允许独立 break-glass 登录。"
          : "尚未配置后台密码。",
    };
  } catch (error) {
    return {
      configured: breakGlassEnabled,
      tableReady: false,
      source: breakGlassEnabled ? "environment" : "unconfigured",
      minLength: MIN_ADMIN_PASSWORD_LENGTH,
      updatedAt: null,
      message: breakGlassEnabled
        ? `后台密码配置表暂不可用，当前仅允许独立 break-glass：${errorMessage(error)}`
        : `后台密码配置表暂不可用，已拒绝使用旧 ADMIN_PASSWORD：${errorMessage(error)}`,
    };
  }
}

function getAdminSessionTokenFromRequest(request: Request): string | null {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  return cookie ? decodeURIComponent(cookie) : null;
}

function getBearerTokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim() || null;
}

async function getAdminSessionVersion(): Promise<string> {
  const stored = await readStoredAdminPasswordSettings().catch(() => null);
  const parsed = parseStoredAdminPasswordSettings(stored?.settings);
  return cleanText(parsed?.sessionVersion) || getRuntimeEnv("ADMIN_SESSION_VERSION") || "1";
}

function signAdminSessionPayload(
  payload: string,
  { throwOnMissingSecret = true }: { throwOnMissingSecret?: boolean } = {},
): string | null {
  const secret = getAdminSessionSecret({ throwOnMissingSecret });
  if (!secret) return null;
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function getAdminSessionSecret(
  { throwOnMissingSecret = true }: { throwOnMissingSecret?: boolean } = {},
): string | null {
  const secret = getRuntimeEnv("ADMIN_SESSION_SECRET");
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    if (!throwOnMissingSecret) return null;
    throw new Error("ADMIN_SESSION_SECRET is not configured.");
  }
  const fallback = getRuntimeEnv("ADMIN_PASSWORD");
  if (fallback) return fallback;
  if (!throwOnMissingSecret) return null;
  throw new Error("ADMIN_SESSION_SECRET is not configured.");
}

function isBreakGlassEnabled(): boolean {
  return getRuntimeEnv("ADMIN_BREAK_GLASS_ENABLED")?.trim().toLowerCase() === "true" &&
    Boolean(getRuntimeEnv("ADMIN_BREAK_GLASS_PASSWORD"));
}

function verifyBreakGlassPassword(value: string): boolean {
  if (!isBreakGlassEnabled()) return false;
  const password = getRuntimeEnv("ADMIN_BREAK_GLASS_PASSWORD");
  return Boolean(password && timingSafeEqual(value, password));
}

async function readStoredAdminPasswordSettings(): Promise<AdminPasswordRow | null> {
  const now = Date.now();
  if (adminPasswordCache && adminPasswordCache.expiresAt > now) return adminPasswordCache.row;

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_runtime_settings")
    .select("settings,updated_at")
    .eq("id", ADMIN_PASSWORD_SETTINGS_ID)
    .maybeSingle();
  if (error) throw error;

  const row = data as AdminPasswordRow | null;
  adminPasswordCache = {
    expiresAt: Date.now() + ADMIN_PASSWORD_CACHE_TTL_MS,
    row,
  };
  return row;
}

function clearAdminPasswordCache(): void {
  adminPasswordCache = null;
}

function hashAdminPassword(password: string): PasswordHashSettings {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("base64url");
  const hash = crypto.pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_KEY_LENGTH, "sha256").toString("base64url");
  return {
    algorithm: PASSWORD_HASH_ALGORITHM,
    iterations: PASSWORD_HASH_ITERATIONS,
    salt,
    hash,
  };
}

function verifyPasswordHash(
  password: string,
  settings: PasswordHashSettings,
): boolean {
  if (settings.algorithm !== PASSWORD_HASH_ALGORITHM) return false;
  const iterations = Number(settings.iterations);
  if (!Number.isSafeInteger(iterations) || iterations < 100_000) return false;
  const expected = String(settings.hash);
  const actual = crypto.pbkdf2Sync(password, String(settings.salt), iterations, PASSWORD_HASH_KEY_LENGTH, "sha256").toString("base64url");
  return timingSafeEqual(actual, expected);
}

function parseStoredAdminPasswordSettings(value: unknown): ParsedAdminPasswordSettings | null {
  if (!value || typeof value !== "object") return null;
  const settings = value as StoredAdminPasswordSettings;
  if (
    typeof settings.hash !== "string" ||
    typeof settings.salt !== "string" ||
    typeof settings.algorithm !== "string" ||
    typeof settings.iterations !== "number"
  ) {
    return null;
  }
  return {
    hash: settings.hash,
    salt: settings.salt,
    algorithm: settings.algorithm,
    iterations: settings.iterations,
    sessionVersion: cleanText(settings.sessionVersion),
    updatedAt: cleanText(settings.updatedAt),
  };
}

function validateAdminPassword(password: string): void {
  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new Error(`新密码至少需要 ${MIN_ADMIN_PASSWORD_LENGTH} 个字符。`);
  }
  if (password.length > 200) {
    throw new Error("新密码过长，请控制在 200 个字符以内。");
  }
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if ([hasLetter, hasNumber, hasSymbol].filter(Boolean).length < 2) {
    throw new Error("新密码至少需要包含字母、数字、符号中的两类。");
  }
}

function cleanPassword(value: string | null | undefined): string {
  return String(value || "").trim();
}

function cleanText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "未知错误";
}
