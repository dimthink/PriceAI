export const defaultAuthNextPath = "/account";

export function safeAuthNextPath(value: string | null | undefined, fallback = defaultAuthNextPath): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function getBrowserAuthNextPath(fallback = defaultAuthNextPath): string {
  if (typeof window === "undefined") return fallback;
  return safeAuthNextPath(`${window.location.pathname}${window.location.search}`, fallback);
}

export function buildGoogleAuthHref(next?: string | null): string {
  const safeNext = safeAuthNextPath(next);
  return `/auth/google?next=${encodeURIComponent(safeNext)}`;
}
