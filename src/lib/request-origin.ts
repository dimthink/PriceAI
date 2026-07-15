export function isSameOriginMutation(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") return false;
  if (!origin) return true;

  try {
    return new URL(origin).origin === requestUrl.origin;
  } catch {
    return false;
  }
}

export function sameOriginRequiredResponse(): Response {
  return Response.json(
    { ok: false, code: "same_origin_required", message: "请求来源校验失败，请刷新页面后重试。" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}
