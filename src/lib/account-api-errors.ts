import { ZodError } from "zod";
import { noStoreCacheHeaders } from "@/lib/cache-headers";

export type AccountApiErrorCode = "validation" | "forbidden" | "not_found" | "conflict" | "rate_limited";

export class AccountApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 429,
    readonly code: AccountApiErrorCode,
  ) {
    super(message);
    this.name = "AccountApiError";
  }
}

export function accountNotFound(message = "没有找到这项账户资源。"): AccountApiError {
  return new AccountApiError(message, 404, "not_found");
}

export function accountConflict(message: string): AccountApiError {
  return new AccountApiError(message, 409, "conflict");
}

export function accountApiErrorResponse(error: unknown, fallbackMessage: string): Response {
  if (error instanceof ZodError) {
    return response(error.issues[0]?.message || "请求内容格式不正确。", 400, "validation");
  }
  if (error instanceof SyntaxError) {
    return response("请求内容不是有效的 JSON。", 400, "validation");
  }
  if (error instanceof AccountApiError) {
    return response(error.message, error.status, error.code);
  }

  return response(fallbackMessage, 500, "internal_error");
}

function response(message: string, status: number, code: string): Response {
  return Response.json(
    { ok: false, code, message },
    { status, headers: noStoreCacheHeaders() },
  );
}
