import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionToken,
  verifyAdminPassword,
} from "@/lib/env";
import {
  adminLoginRequestKey,
  readAdminLoginRateLimit,
  recordAdminLoginAttempt,
} from "@/lib/admin-login-rate-limit";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function POST(request: Request) {
  try {
    const requestKey = adminLoginRequestKey(request);
    const limit = await readAdminLoginRateLimit(requestKey);
    if (limit.retryAfterSeconds > 0) {
      return Response.json(
        { ok: false, message: "登录尝试过于频繁，请稍后再试。" },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(limit.retryAfterSeconds),
            "X-PriceAI-Rate-Limit": limit.persistent ? "persistent" : "local-fallback",
          },
        },
      );
    }

    const body = (await request.json().catch(() => null)) as { password?: string } | null;

    if (!await verifyAdminPassword(body?.password)) {
      const failure = await recordAdminLoginAttempt(requestKey, false);
      return Response.json(
        { ok: false, message: "后台密码不正确。" },
        {
          status: 401,
          headers: {
            ...NO_STORE_HEADERS,
            ...(failure.retryAfterSeconds > 0 ? { "Retry-After": String(failure.retryAfterSeconds) } : {}),
            "X-PriceAI-Rate-Limit": failure.persistent ? "persistent" : "local-fallback",
          },
        },
      );
    }

    const success = await recordAdminLoginAttempt(requestKey, true);
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return Response.json(
      { ok: true },
      {
        headers: {
          ...NO_STORE_HEADERS,
          "X-PriceAI-Rate-Limit": success.persistent ? "persistent" : "local-fallback",
          "Set-Cookie": `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(await createAdminSessionToken())}; Path=/; Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict${secure}`,
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.message === "ADMIN_SESSION_SECRET is not configured."
        ? "后台登录会话密钥未配置：请设置 ADMIN_SESSION_SECRET 后再登录。"
        : "后台登录失败，请稍后再试。";
    return Response.json(
      { ok: false, message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
