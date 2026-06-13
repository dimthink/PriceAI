import "server-only";

import crypto from "node:crypto";
import { getRuntimeEnv } from "@/lib/runtime-env";

export const ADMIN_SESSION_COOKIE = "priceai_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getAdminSessionVersion(): string {
  return getRuntimeEnv("ADMIN_SESSION_VERSION") || "1";
}

export function getAdminPassword(): string {
  const pwd = getRuntimeEnv("ADMIN_PASSWORD");
  if (!pwd) {
    throw new Error(
      "ADMIN_PASSWORD is not configured. Set it in .env.local for local dev or in your deployment environment.",
    );
  }
  return pwd;
}

export function createAdminSessionToken(): string {
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = [getAdminSessionVersion(), String(expiresAt), nonce].join(".");
  return `${payload}.${signAdminSessionPayload(payload)}`;
}

export function verifyAdminSessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 4) return false;
  const [version, expiresAtText, nonce, signature] = parts;
  if (!version || !expiresAtText || !nonce || !signature) return false;
  if (version !== getAdminSessionVersion()) return false;

  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

  const payload = [version, expiresAtText, nonce].join(".");
  const expected = signAdminSessionPayload(payload);
  return timingSafeEqual(signature, expected);
}

function signAdminSessionPayload(payload: string): string {
  return crypto
    .createHmac("sha256", getAdminSessionSecret())
    .update(payload)
    .digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getAdminSessionSecret(): string {
  return getRuntimeEnv("ADMIN_SESSION_SECRET") || getAdminPassword();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL") && getRuntimeEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function requireAdminPassword(value: string | null): void {
  if (!value || !timingSafeEqual(value, getAdminPassword())) {
    throw new Error("未授权，请检查后台密码。");
  }
}

export function requireAdminOrCronPassword(value: string | null): void {
  const adminPassword = getRuntimeEnv("ADMIN_PASSWORD");
  const cronSecret = getRuntimeEnv("CRON_SECRET");

  if (value && adminPassword && timingSafeEqual(value, adminPassword)) return;
  if (value && cronSecret && timingSafeEqual(value, cronSecret)) return;

  throw new Error("未授权，请检查后台密码或定时采集密钥。");
}

export function verifyAdminPassword(value: string | null | undefined): boolean {
  return Boolean(value && timingSafeEqual(value, getAdminPassword()));
}
