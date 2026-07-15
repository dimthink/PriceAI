import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/auth";
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
  if (isJson) return Response.json({ ok: true, scope }, { headers: noStoreCacheHeaders() });
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
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
