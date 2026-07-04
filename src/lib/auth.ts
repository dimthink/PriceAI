import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { noStoreCacheHeaders } from "@/lib/cache-headers";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { getSupabaseServerClient } from "@/lib/supabase";

export type PriceAiUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export function getAuthConfig(): { url: string; anonKey: string } | null {
  const url = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getRuntimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export async function createSupabaseAuthServerClient() {
  const config = getAuthConfig();
  if (!config) return null;

  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Server Components can read auth cookies but cannot refresh them.
          }
        });
      },
    },
  });
}

export async function getCurrentUser(): Promise<PriceAiUser | null> {
  const supabase = await createSupabaseAuthServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return normalizeSupabaseUser(data.user);
}

export async function requireCurrentUser(): Promise<PriceAiUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthRequiredError();
  return user;
}

export class AuthRequiredError extends Error {
  constructor(message = "请先登录后再继续。") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export function authRequiredResponse(message = "请先登录后再继续。"): Response {
  return Response.json({ ok: false, code: "auth_required", message }, { status: 401, headers: noStoreCacheHeaders() });
}

export async function upsertPublicUserProfile(user: PriceAiUser): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { error } = await supabase.from("public_user_profiles").upsert({
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    avatar_url: user.avatarUrl,
    provider: "google",
    last_sign_in_at: new Date().toISOString(),
  });

  if (error) {
    console.warn("Public user profile upsert failed:", error.message);
  }
}

export function normalizeSupabaseUser(user: User): PriceAiUser {
  const metadata = user.user_metadata || {};
  const displayName =
    stringValue(metadata.full_name) ||
    stringValue(metadata.name) ||
    stringValue(metadata.user_name) ||
    user.email?.split("@")[0] ||
    null;

  return {
    id: user.id,
    email: user.email || null,
    displayName,
    avatarUrl: stringValue(metadata.avatar_url) || stringValue(metadata.picture) || null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
