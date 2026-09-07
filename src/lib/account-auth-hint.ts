// Client-readable performance hint only; authorization always uses the server session.
export const ACCOUNT_AUTH_HINT_COOKIE = "priceai_account_auth_hint";
export const ACCOUNT_AUTH_HINT_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export type AccountAuthHint = "authenticated" | "anonymous";
