import { NextResponse } from "next/server";
import { ACCOUNT_AUTH_HINT_COOKIE } from "@/lib/account-auth-hint";
import { createSupabaseAuthServerClient } from "@/lib/auth";
import { getAccountAuthHintCookieOptions, getAccountAuthHintCookieValue } from "@/lib/auth-cookie-options";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { isSameOriginMutation, sameOriginRequiredResponse } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginRequiredResponse();
  const isJson = Boolean(request.headers.get("content-type")?.includes("application/json"));
  const scope = await readSignOutScope(request, isJson);
  const supabase = await createSupabaseAuthServerClient();
  const { error } = supabase ? await supabase.auth.signOut({ scope }) : { error: null };
  if (error) {
    return Response.json(
      { ok: false, message: "退出失败，请刷新页面后重试。" },
      { status: 500, headers: noStoreCacheHeaders() },
    );
  }
  const response = isJson
    ? NextResponse.json({ ok: true, scope }, { headers: noStoreCacheHeaders() })
    : NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.set(
    ACCOUNT_AUTH_HINT_COOKIE,
    getAccountAuthHintCookieValue(false),
    getAccountAuthHintCookieOptions(),
  );
  return response;
}

async function readSignOutScope(request: Request, isJson: boolean): Promise<"local" | "global"> {
  try {
    const value = isJson
      ? (await request.json() as { scope?: unknown }).scope
      : (await request.formData()).get("scope");
    return value === "global" ? "global" : "local";
  } catch {
    return "local";
  }
}
