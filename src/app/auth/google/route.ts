import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/auth";
import { safeAuthNextPath } from "@/lib/auth-paths";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const next = safeAuthNextPath(requestUrl.searchParams.get("next"));
  const callback = new URL("/auth/callback", requestUrl.origin);
  callback.searchParams.set("next", next);

  const supabase = await createSupabaseAuthServerClient();
  if (!supabase) return redirectToLoginError(requestUrl, next, "auth_config");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) return redirectToLoginError(requestUrl, next, "google_start_failed");

  return NextResponse.redirect(data.url);
}

function redirectToLoginError(requestUrl: URL, next: string, error: string): NextResponse {
  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("next", next);
  loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}
