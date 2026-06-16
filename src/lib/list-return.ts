export function listDetailHref(path: string, _returnQuery?: string): string {
  void _returnQuery;
  return path;
}

export function listDetailNavigationHref(
  path: string,
  returnQuery: string,
  extraParams: Record<string, string> = {},
): string {
  const params = new URLSearchParams();

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  if (returnQuery) params.set("back", returnQuery);

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function shouldHandleListDetailClick(event: {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}) {
  return !event.defaultPrevented
    && event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export function sanitizeListReturnHref(basePath: string, back: string | undefined, allowedKeys: readonly string[]): string {
  if (!back || back === "home") return basePath;

  const source = new URLSearchParams(back.replace(/^\?/, ""));
  const safe = new URLSearchParams();

  allowedKeys.forEach((key) => {
    const value = source.get(key);
    if (value) safe.set(key, value);
  });

  const query = safe.toString();
  return query ? `${basePath}?${query}` : basePath;
}
