export function buildCloudflarePublicCacheKeyUrl(input: {
  requestUrl: string;
  namespace: string;
  searchParams?: URLSearchParams;
}): string {
  const url = new URL(input.requestUrl);
  const originalPathname = url.pathname;
  url.hash = "";
  if (input.searchParams) {
    url.search = input.searchParams.toString();
  }
  url.searchParams.sort();
  url.pathname = `/_priceai_edge_cache/${encodeURIComponent(input.namespace)}${originalPathname}`;
  return url.toString();
}

export function cacheSearchParams(
  entries: Record<string, string | number | null | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  params.sort();
  return params;
}
