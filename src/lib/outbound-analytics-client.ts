"use client";

type TrackOutboundEventInput = {
  eventType: "sponsor_click";
  entityType: "sponsor";
  entityId: string;
  placement?: string | null;
  creativeId?: string | null;
  campaignId?: string | null;
  targetUrl?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined> | null;
};

type UTMParams = { medium: string; campaign: string; content?: string | null };

const OUTBOUND_EVENT_ENDPOINT = "/api/outbound-events";
const OUTBOUND_SESSION_STORAGE_KEY = "priceai.outbound.session.v1";
let inMemorySessionId: string | null = null;

export function trackOutboundEvent(input: TrackOutboundEventInput): void {
  if (typeof window === "undefined") return;

  const body = JSON.stringify({
    ...input,
    sessionId: getOutboundSessionId(),
    pagePath: window.location.pathname,
    referrerPath: sameOriginPath(document.referrer),
    metadata: compactMetadata(input.metadata),
  });

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
    // Analytics must never block navigation or the user's primary action.
  });
}

export function withPriceAiUtm(value: string, params: UTMParams): string {
  if (!value || value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return value;
    if (hasSensitiveQueryParameter(url.searchParams)) return value;
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "priceai");
    if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", params.medium);
    if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", params.campaign);
    if (params.content && !url.searchParams.has("utm_content")) url.searchParams.set("utm_content", params.content);
    return url.toString();
  } catch {
    return value;
  }
}

function getOutboundSessionId(): string {
  if (inMemorySessionId) return inMemorySessionId;
  try {
    const existing = window.sessionStorage.getItem(OUTBOUND_SESSION_STORAGE_KEY);
    if (existing) return (inMemorySessionId = existing);
    const next = createSessionId();
    window.sessionStorage.setItem(OUTBOUND_SESSION_STORAGE_KEY, next);
    return (inMemorySessionId = next);
  } catch {
    return (inMemorySessionId = createSessionId());
  }
}

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `s:${crypto.randomUUID()}`;
  return `s:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 12)}`;
}

function sameOriginPath(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === window.location.origin ? url.pathname.slice(0, 500) : null;
  } catch {
    return null;
  }
}

function hasSensitiveQueryParameter(searchParams: URLSearchParams): boolean {
  return Array.from(searchParams.keys()).some((key) =>
    /(^|[-_])(sig(nature)?|token|auth|key|secret|expires?|x-amz)([-_]|$)/i.test(key),
  );
}

function compactMetadata(
  value: Record<string, string | number | boolean | null | undefined> | null | undefined,
): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(value || {}).slice(0, 16)) {
    if (typeof raw === "string") output[key.slice(0, 80)] = raw.slice(0, 300);
    else if (typeof raw === "number" && Number.isFinite(raw)) output[key.slice(0, 80)] = raw;
    else if (typeof raw === "boolean") output[key.slice(0, 80)] = raw;
  }
  return output;
}
