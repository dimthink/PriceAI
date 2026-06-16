import { z } from "zod";

export function logApiError(scope: string, error: unknown): void {
  if (error instanceof Error) {
    console.error(`${scope}:`, error.message);
    return;
  }

  console.error(`${scope}:`, error);
}

export function safeApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message || fallback;
  }

  if (isExpectedPublicError(error)) {
    return error.message;
  }

  return fallback;
}

function isExpectedPublicError(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;

  return /未授权|无权|尚未配置|缺少|无效|不存在|无法解析|不支持|暂不可用|不能超过|过于频繁/i.test(error.message);
}
