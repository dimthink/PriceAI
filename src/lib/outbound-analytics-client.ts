"use client";

import type {
  OutboundAnalyticsEntityType,
  OutboundAnalyticsEventType,
} from "@/lib/types";

type TrackOutboundEventInput = {
  eventType: OutboundAnalyticsEventType;
  entityType: OutboundAnalyticsEntityType;
  entityId: string;
  offerId?: string | null;
  sourceId?: string | null;
  productId?: string | null;
  stationId?: string | null;
  placement?: string | null;
  creativeId?: string | null;
  campaignId?: string | null;
  targetUrl?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined> | null;
};

type UTMParams = {
  medium: string;
  campaign: string;
  content?: string | null;
};

const OUTBOUND_EVENT_ENDPOINT = "/api/outbound-events";
const OUTBOUND_SESSION_STORAGE_KEY = "priceai.outbound.session.v1";
let inMemorySessionId: string | null = null;

export function trackOutboundEvent(input: TrackOutboundEventInput): void {
  if (typeof window === "undefined") return;

  const payload = {
    ...input,
    sessionId: getOutboundSessionId(),
    pagePath: `${window.location.pathname}${window.location.search}`,
    referrerPath: sameOriginPath(document.referrer),
    metadata: compactMetadata(input.metadata),
  };
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon(OUTBOUND_EVENT_ENDPOINT, blob)) return;
  }

  void fetch(OUTBOUND_EVENT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // Tracking must not block navigation or primary user actions.
  });
}

export function withPriceAiUtm(value: string, params: UTMParams): string {
  if (!value || value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return value;
    url.searchParams.set("utm_source", "priceai");
    url.searchParams.set("utm_medium", params.medium);
    url.searchParams.set("utm_campaign", params.campaign);
    if (params.content) url.searchParams.set("utm_content", params.content);
    return url.toString();
  } catch {
    return value;
  }
}

function getOutboundSessionId(): string {
  if (inMemorySessionId) return inMemorySessionId;

  try {
    const existing = window.sessionStorage.getItem(OUTBOUND_SESSION_STORAGE_KEY);
    if (existing) {
      inMemorySessionId = existing;
      return existing;
    }
    const next = createSessionId();
    window.sessionStorage.setItem(OUTBOUND_SESSION_STORAGE_KEY, next);
    inMemorySessionId = next;
    return next;
  } catch {
    inMemorySessionId = createSessionId();
    return inMemorySessionId;
  }
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `s:${crypto.randomUUID()}`;
  }
  return `s:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

function sameOriginPath(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}`.slice(0, 500);
  } catch {
    return null;
  }
}

function compactMetadata(
  value: Record<string, string | number | boolean | null | undefined> | null | undefined,
): Record<string, string | number | boolean> {
  if (!value) return {};
  const output: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 16)) {
    if (typeof raw === "string") {
      output[key] = raw.slice(0, 300);
    } else if (typeof raw === "number" && Number.isFinite(raw)) {
      output[key] = raw;
    } else if (typeof raw === "boolean") {
      output[key] = raw;
    }
  }
  return output;
}
