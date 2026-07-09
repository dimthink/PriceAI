import "server-only";

import { parseBeijingDateTimeLocalValue } from "@/lib/beijing-time";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isSponsorAssetReference } from "@/lib/sponsor-asset-storage";
import {
  createDefaultSponsorSettingsSummary,
  defaultSponsorCreativesByPlacement,
  SPONSOR_DISCLOSURE_LABEL_MAX_LENGTH,
  SPONSOR_PLACEMENT_KINDS,
  type SponsorCreative,
  type SponsorCreativeStatus,
  type SponsorPlacementConfig,
  type SponsorPlacementKind,
  type SponsorSettingsSummary,
  type SponsorTone,
} from "@/lib/sponsor-settings-shared";

export const SPONSOR_SETTINGS_ID = "sponsor_placements";

export type SponsorSettingsInput = {
  enabled?: boolean | null;
  placements?: Partial<Record<SponsorPlacementKind, Partial<SponsorPlacementConfig>>> | null;
};

type RuntimeSettingsRow = {
  id: string;
  settings?: unknown;
  updated_at?: string | null;
};

export async function getSponsorSettingsSummary(): Promise<SponsorSettingsSummary> {
  let row: RuntimeSettingsRow | null = null;
  try {
    row = await getSponsorSettingsRow();
  } catch (error) {
    if (isMissingSponsorSettingsColumnError(error)) {
      return getFallbackSponsorSettingsSummary("赞助位配置字段尚未迁移，请先应用 Supabase migration 后再保存。");
    }
    throw error;
  }

  if (!row) {
    return createDefaultSponsorSettingsSummary({
      tableReady: true,
      message: "赞助位配置尚未保存，前台默认不展示。",
    });
  }

  return normalizeSponsorSettings(row.settings, {
    configured: true,
    tableReady: true,
    updatedAt: row.updated_at || null,
  });
}

export function getFallbackSponsorSettingsSummary(message = "赞助位配置表尚未初始化。"): SponsorSettingsSummary {
  return createDefaultSponsorSettingsSummary({
    configured: false,
    tableReady: false,
    message,
  });
}

export async function updateSponsorSettings(input: SponsorSettingsInput): Promise<SponsorSettingsSummary> {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new Error("Supabase 尚未配置，无法保存赞助位配置。");

  let existing: RuntimeSettingsRow | null = null;
  try {
    existing = await getSponsorSettingsRow();
  } catch (error) {
    if (isMissingSponsorSettingsColumnError(error)) {
      throw new Error("赞助位配置字段尚未迁移，请先应用 Supabase migration 后再保存。");
    }
    throw error;
  }

  const base = existing
    ? normalizeSponsorSettings(existing.settings, { configured: true, tableReady: true, updatedAt: existing.updated_at || null })
    : createDefaultSponsorSettingsSummary({ configured: true, tableReady: true });
  const next = normalizeSponsorSettings({
    enabled: typeof input.enabled === "boolean" ? input.enabled : base.enabled,
    placements: mergePlacementInputs(base.placements, input.placements || {}),
  }, {
    configured: true,
    tableReady: true,
    updatedAt: new Date().toISOString(),
  });

  const { error } = await supabase
    .from("app_runtime_settings")
    .upsert({
      id: SPONSOR_SETTINGS_ID,
      provider: "priceai",
      base_url: "https://priceai.cc/commercial",
      model: "sponsor-settings",
      timeout_ms: 12000,
      settings: serializeSponsorSettings(next),
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
  if (error) {
    if (isMissingSponsorSettingsColumnError(error)) {
      throw new Error("赞助位配置字段尚未迁移，请先应用 Supabase migration 后再保存。");
    }
    throw error;
  }

  return getSponsorSettingsSummary();
}

async function getSponsorSettingsRow(): Promise<RuntimeSettingsRow | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("app_runtime_settings")
    .select("id,settings,updated_at")
    .eq("id", SPONSOR_SETTINGS_ID)
    .maybeSingle();
  if (error) throw error;
  return data as RuntimeSettingsRow | null;
}

function isMissingSponsorSettingsColumnError(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; details?: unknown } : {};
  const message = [record.message, record.details]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return record.code === "42703" ||
    record.code === "PGRST204" ||
    Boolean(message.includes("app_runtime_settings.settings") || /settings.*does not exist/i.test(message));
}

function normalizeSponsorSettings(
  value: unknown,
  meta: Pick<SponsorSettingsSummary, "configured" | "tableReady"> & Partial<Pick<SponsorSettingsSummary, "updatedAt" | "message">>,
): SponsorSettingsSummary {
  const record = isRecord(value) ? value : {};
  const defaults = createDefaultSponsorSettingsSummary({
    configured: meta.configured,
    tableReady: meta.tableReady,
    enabled: readBoolean(record.enabled, false),
    updatedAt: meta.updatedAt || null,
    message: meta.message || null,
  });

  const placementsValue = isRecord(record.placements) ? record.placements : {};
  const placements = SPONSOR_PLACEMENT_KINDS.reduce((acc, kind) => {
    const fallback = defaults.placements[kind];
    const placementValue = isRecord(placementsValue[kind]) ? placementsValue[kind] : {};
    const defaultCreatives = defaultSponsorCreativesByPlacement[kind];
    acc[kind] = {
      enabled: readBoolean(placementValue.enabled, fallback.enabled),
      creatives: normalizeCreatives(placementValue.creatives, defaultCreatives),
    };
    return acc;
  }, {} as Record<SponsorPlacementKind, SponsorPlacementConfig>);

  return {
    ...defaults,
    placements,
  };
}

function serializeSponsorSettings(settings: SponsorSettingsSummary) {
  return {
    enabled: settings.enabled,
    placements: settings.placements,
  };
}

function mergePlacementInputs(
  base: Record<SponsorPlacementKind, SponsorPlacementConfig>,
  input: Partial<Record<SponsorPlacementKind, Partial<SponsorPlacementConfig>>>,
): Record<SponsorPlacementKind, SponsorPlacementConfig> {
  return SPONSOR_PLACEMENT_KINDS.reduce((acc, kind) => {
    const next = input[kind];
    acc[kind] = {
      enabled: typeof next?.enabled === "boolean" ? next.enabled : base[kind].enabled,
      creatives: Array.isArray(next?.creatives) ? next.creatives : base[kind].creatives,
    };
    return acc;
  }, {} as Record<SponsorPlacementKind, SponsorPlacementConfig>);
}

function normalizeCreatives(value: unknown, fallback: SponsorCreative[]): SponsorCreative[] {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .map((item, index) => normalizeCreative(item, fallback[index], index))
    .filter((item): item is SponsorCreative => Boolean(item));
}

function normalizeCreative(value: unknown, fallback: SponsorCreative | undefined, index: number): SponsorCreative | null {
  const record = isRecord(value) ? value : {};
  const title = cleanText(record.title, fallback?.title || "");
  if (!title) return null;

  return {
    id: cleanId(record.id, fallback?.id || `sponsor-${index + 1}`),
    enabled: readBoolean(record.enabled, fallback?.enabled ?? true),
    status: readStatus(record.status, fallback?.status || "live"),
    title,
    description: cleanText(record.description, fallback?.description || ""),
    targetUrl: cleanTargetUrl(record.targetUrl, fallback?.targetUrl || "/commercial#slots"),
    appendUtm: readBoolean(record.appendUtm, fallback?.appendUtm ?? true),
    sponsorName: cleanText(record.sponsorName, fallback?.sponsorName || null, 80),
    campaignId: cleanIdOrNull(record.campaignId, fallback?.campaignId || null),
    imageUrl: cleanAssetUrl(record.imageUrl, fallback?.imageUrl || null),
    visualTitle: cleanText(record.visualTitle, fallback?.visualTitle || title),
    visualMeta: cleanText(record.visualMeta, fallback?.visualMeta || ""),
    label: cleanText(record.label, fallback?.label || null, SPONSOR_DISCLOSURE_LABEL_MAX_LENGTH),
    tone: readTone(record.tone, fallback?.tone || "green"),
    startsAt: cleanDate(record.startsAt, fallback?.startsAt || null),
    endsAt: cleanDate(record.endsAt, fallback?.endsAt || null),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readTone(value: unknown, fallback: SponsorTone): SponsorTone {
  return value === "blue" || value === "amber" || value === "green" ? value : fallback;
}

function readStatus(value: unknown, fallback: SponsorCreativeStatus): SponsorCreativeStatus {
  return value === "draft" || value === "live" || value === "paused" || value === "expired" ? value : fallback;
}

function cleanId(value: unknown, fallback: string): string {
  const text = cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return text || fallback;
}

function cleanIdOrNull(value: unknown, fallback: string | null): string | null {
  const text = cleanText(value, fallback, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return text || null;
}

function cleanText(value: unknown, fallback: string | null, maxLength = 240): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return (text || fallback || "").slice(0, maxLength);
}

function cleanDate(value: unknown, fallback: string | null): string | null {
  const text = cleanText(value, null, 80);
  if (!text) return fallback;
  const beijingIso = parseBeijingDateTimeLocalValue(text);
  if (beijingIso) return beijingIso;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
}

function cleanTargetUrl(value: unknown, fallback: string): string {
  const text = cleanText(value, fallback, 2048);
  if (text.startsWith("/")) return text;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function cleanAssetUrl(value: unknown, fallback: string | null): string | null {
  const text = cleanText(value, fallback, 2048);
  if (!text) return null;
  if (isSponsorAssetReference(text)) return text;
  if (text.startsWith("/")) return text;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}
