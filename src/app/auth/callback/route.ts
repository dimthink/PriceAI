import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAuthServerClient, normalizeSupabaseUser, upsertPublicUserProfile } from "@/lib/auth";
import { getAuthCookieWriteOptions, isAuthCodeVerifierCookieName } from "@/lib/auth-cookie-options";
import { getCanonicalAuthOrigin, safeAuthNextPath } from "@/lib/auth-paths";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeAuthNextPath(requestUrl.searchParams.get("next"));
  const origin = getCanonicalAuthOrigin(requestUrl);
  const providerError = requestUrl.searchParams.get("error");

  if (providerError) {
    return redirectToLoginResult(request, origin, next, providerError === "access_denied" ? "oauth_cancelled" : "oauth_provider_failed");
  }

  if (!code) return redirectToLoginResult(request, origin, next, "callback_missing_code");

  const supabase = await createSupabaseAuthServerClient();
  if (!supabase) return redirectToLoginResult(request, origin, next, "auth_config");

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user) return redirectToLoginResult(request, origin, next, "callback_exchange_failed");
    await upsertPublicUserProfile(normalizeSupabaseUser(data.user));
    const response = NextResponse.redirect(new URL(next, origin), { status: 303 });
    clearAuthCodeVerifierCookies(request, response);
    return response;
  } catch {
    return redirectToLoginResult(request, origin, next, "callback_network_failed");
  }
}

function redirectToLoginResult(request: NextRequest, origin: string, next: string, error: string): NextResponse {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("error", error);
  const response = NextResponse.redirect(loginUrl, { status: 303 });
  clearAuthCodeVerifierCookies(request, response);
  return response;
}

function clearAuthCodeVerifierCookies(request: NextRequest, response: NextResponse): void {
  request.cookies.getAll().forEach(({ name }) => {
    if (!isAuthCodeVerifierCookieName(name)) return;
    response.cookies.set(name, "", getAuthCookieWriteOptions(name, { maxAge: 0 }));
  });
}
