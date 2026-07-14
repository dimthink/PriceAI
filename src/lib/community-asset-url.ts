export const COMMUNITY_ASSET_BUCKET_HOST = "community-assets";
export const COMMUNITY_ASSET_URL_PREFIX = `r2://${COMMUNITY_ASSET_BUCKET_HOST}/`;

const communityAssetKeyPattern = /^community-assets\/qq-group-qr-code\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;

export function communityAssetDisplayUrl(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (parseCommunityAssetKey(text)) {
    return `/api/community-assets?ref=${encodeURIComponent(text)}`;
  }
  return text;
}

export function communityAssetReferenceForKey(key: string): string {
  return `${COMMUNITY_ASSET_URL_PREFIX}${key}`;
}

export function isCommunityAssetReference(value: string | null | undefined): boolean {
  return Boolean(parseCommunityAssetKey(String(value || "").trim()));
}

export function parseCommunityAssetKey(reference: string): string | null {
  if (!reference.startsWith(COMMUNITY_ASSET_URL_PREFIX)) return null;

  try {
    const parsed = new URL(reference);
    if (parsed.protocol !== "r2:" || parsed.hostname !== COMMUNITY_ASSET_BUCKET_HOST) return null;

    const key = parsed.pathname.replace(/^\/+/, "");
    return communityAssetKeyPattern.test(key) ? key : null;
  } catch {
    return null;
  }
}
