import { isCommunityAssetReference } from "@/lib/community-asset-url";

export type CommunitySettingsSummary = {
  configured: boolean;
  tableReady: boolean;
  qqGroupEnabled: boolean;
  qqGroupNumber: string;
  qqGroupUrl: string;
  qqGroupQrCodeUrl: string;
  telegramEnabled: boolean;
  telegramUrl: string;
  updatedAt: string | null;
  message: string | null;
};

export const DEFAULT_COMMUNITY_SETTINGS: CommunitySettingsSummary = {
  configured: false,
  tableReady: false,
  qqGroupEnabled: true,
  qqGroupNumber: "761822700",
  qqGroupUrl: "https://qm.qq.com/q/ze2W6ADwKk",
  qqGroupQrCodeUrl: "/community/priceai-qq-group.png",
  telegramEnabled: true,
  telegramUrl: "https://t.me/priceaicc",
  updatedAt: null,
  message: null,
};

export function createDefaultCommunitySettingsSummary(
  overrides: Partial<CommunitySettingsSummary> = {},
): CommunitySettingsSummary {
  return {
    ...DEFAULT_COMMUNITY_SETTINGS,
    ...overrides,
  };
}

export function normalizeCommunitySettingsSummary(
  value: unknown,
  meta: Partial<Pick<CommunitySettingsSummary, "configured" | "tableReady" | "updatedAt" | "message">> = {},
): CommunitySettingsSummary {
  const record = isRecord(value) ? value : {};
  const defaults = createDefaultCommunitySettingsSummary(meta);

  return {
    ...defaults,
    qqGroupEnabled: readBoolean(record.qqGroupEnabled, defaults.qqGroupEnabled),
    qqGroupNumber: cleanText(record.qqGroupNumber, defaults.qqGroupNumber, 32),
    qqGroupUrl: cleanHttpUrl(record.qqGroupUrl, defaults.qqGroupUrl),
    qqGroupQrCodeUrl: cleanHttpUrlOrPath(record.qqGroupQrCodeUrl, defaults.qqGroupQrCodeUrl),
    telegramEnabled: readBoolean(record.telegramEnabled, defaults.telegramEnabled),
    telegramUrl: cleanHttpUrl(record.telegramUrl, defaults.telegramUrl),
  };
}

export function serializeCommunitySettings(settings: CommunitySettingsSummary) {
  return {
    qqGroupEnabled: settings.qqGroupEnabled,
    qqGroupNumber: settings.qqGroupNumber,
    qqGroupUrl: settings.qqGroupUrl,
    qqGroupQrCodeUrl: settings.qqGroupQrCodeUrl,
    telegramEnabled: settings.telegramEnabled,
    telegramUrl: settings.telegramUrl,
  };
}

export function isCommunitySettingsSummary(value: unknown): value is CommunitySettingsSummary {
  const record = isRecord(value) ? value : null;
  if (!record) return false;
  if (typeof record.configured !== "boolean") return false;
  if (typeof record.tableReady !== "boolean") return false;
  if (typeof record.qqGroupEnabled !== "boolean") return false;
  if (typeof record.qqGroupNumber !== "string") return false;
  if (typeof record.qqGroupUrl !== "string") return false;
  if (typeof record.qqGroupQrCodeUrl !== "string") return false;
  if (typeof record.telegramEnabled !== "boolean") return false;
  if (typeof record.telegramUrl !== "string") return false;
  return isNullableString(record.updatedAt) && isNullableString(record.message);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  return text ? text.slice(0, maxLength) : fallback;
}

function cleanHttpUrl(value: unknown, fallback: string): string {
  const text = cleanText(value, "", 2048);
  if (!text) return fallback;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function cleanHttpUrlOrPath(value: unknown, fallback: string): string {
  const text = cleanText(value, "", 2048);
  if (!text) return fallback;
  if (isCommunityAssetReference(text)) return text;
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  return cleanHttpUrl(text, fallback);
}

function isNullableString(value: unknown) {
  return value === null || value === undefined || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
