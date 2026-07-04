import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient, normalizeSupabaseUser, upsertPublicUserProfile } from "@/lib/auth";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const origin = requestUrl.origin;

  if (code) {
    const supabase = await createSupabaseAuthServerClient();
    if (supabase) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.user) {
        await upsertPublicUserProfile(normalizeSupabaseUser(data.user));
      }
    }
  }

  return NextResponse.redirect(new URL(next, origin));
}

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  return value;
}
