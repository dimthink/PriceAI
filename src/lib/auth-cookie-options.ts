import type { CookieOptions } from "@supabase/ssr";

const AUTH_CODE_VERIFIER_MAX_AGE_SECONDS = 10 * 60;

export function getAuthCookieOptions(): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  };
}

export function getAuthCookieWriteOptions(name: string, options: CookieOptions = {}): CookieOptions {
  const isRemoval = options.maxAge === 0;
  return {
    ...options,
    ...getAuthCookieOptions(),
    ...(isAuthCodeVerifierCookieName(name) && !isRemoval
      ? { maxAge: AUTH_CODE_VERIFIER_MAX_AGE_SECONDS }
      : {}),
    ...(isRemoval ? { maxAge: 0 } : {}),
  };
}

export function isAuthCodeVerifierCookieName(name: string): boolean {
  return /-code-verifier(?:\.\d+)?$/.test(name);
}
