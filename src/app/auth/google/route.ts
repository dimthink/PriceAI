import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/auth";
import { getAuthCookieWriteOptions, isAuthCodeVerifierCookieName } from "@/lib/auth-cookie-options";
import { getCanonicalAuthOrigin, safeAuthNextPath } from "@/lib/auth-paths";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const next = safeAuthNextPath(requestUrl.searchParams.get("next"));
  const origin = getCanonicalAuthOrigin(requestUrl);
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", next);

  const supabase = await createSupabaseAuthServerClient();
  if (!supabase) return redirectToLoginError(request, origin, next, "auth_config");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) return redirectToLoginError(request, origin, next, "google_start_failed");

  return NextResponse.redirect(data.url);
}

function redirectToLoginError(request: NextRequest, origin: string, next: string, error: string): NextResponse {
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("error", error);
  const response = NextResponse.redirect(loginUrl);
  clearAuthCodeVerifierCookies(request, response);
  return response;
}

function clearAuthCodeVerifierCookies(request: NextRequest, response: NextResponse): void {
  request.cookies.getAll().forEach(({ name }) => {
    if (!isAuthCodeVerifierCookieName(name)) return;
    response.cookies.set(name, "", getAuthCookieWriteOptions(name, { maxAge: 0 }));
  });
}
