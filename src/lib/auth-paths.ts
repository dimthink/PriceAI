export const defaultAuthNextPath = "/account";
export const priceAiCanonicalOrigin = "https://priceai.cc";

const authPathBase = "https://priceai.invalid";
const encodedPathSeparatorPattern = /%(?:2f|5c)/i;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;

export function safeAuthNextPath(value: string | null | undefined, fallback = defaultAuthNextPath): string {
  return normalizeAuthNextPath(value) ?? normalizeAuthNextPath(fallback) ?? defaultAuthNextPath;
}

export function getBrowserAuthNextPath(fallback = defaultAuthNextPath): string {
  if (typeof window === "undefined") return fallback;
  return safeAuthNextPath(`${window.location.pathname}${window.location.search}${window.location.hash}`, fallback);
}

export function buildGoogleAuthHref(next?: string | null): string {
  const safeNext = safeAuthNextPath(next);
  return `/auth/google?next=${encodeURIComponent(safeNext)}`;
}

export function buildLoginHref(next?: string | null, error?: string | null): string {
  const search = new URLSearchParams({ next: safeAuthNextPath(next) });
  if (error) search.set("error", error);
  return `/login?${search.toString()}`;
}

export function getCanonicalAuthOrigin(requestUrl: URL): string {
  return requestUrl.hostname.toLowerCase() === "www.priceai.cc" ? priceAiCanonicalOrigin : requestUrl.origin;
}

function normalizeAuthNextPath(value: string | null | undefined): string | null {
  if (!value || value !== value.trim()) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || controlCharacterPattern.test(value)) return null;

  const pathEnd = firstDelimiterIndex(value, "?", "#");
  const rawPathname = pathEnd === -1 ? value : value.slice(0, pathEnd);
  if (encodedPathSeparatorPattern.test(rawPathname)) return null;

  try {
    decodeURIComponent(rawPathname);
    const parsed = new URL(value, authPathBase);
    if (parsed.origin !== authPathBase || parsed.username || parsed.password) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function firstDelimiterIndex(value: string, ...delimiters: string[]): number {
  const indexes = delimiters.map((delimiter) => value.indexOf(delimiter)).filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}
