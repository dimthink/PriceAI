export const PUBLIC_OFFER_DEFAULT_LIMIT = 30;
export const PUBLIC_OFFER_MAX_LIMIT = 200;
export const PUBLIC_OFFER_MAX_OFFSET = 5000;
export const PUBLIC_OFFER_MAX_QUERY_LENGTH = 80;

export type PublicOfferPaginationParams = {
  limit?: number;
  offset?: number;
};

export type PublicOfferQueryErrorCode =
  | "invalid_limit"
  | "limit_too_large"
  | "invalid_offset"
  | "offset_too_large";

export class PublicOfferQueryError extends Error {
  readonly code: PublicOfferQueryErrorCode;
  readonly status = 400;

  constructor(code: PublicOfferQueryErrorCode, message: string) {
    super(message);
    this.name = "PublicOfferQueryError";
    this.code = code;
  }
}

export function parsePublicOfferPaginationParams(
  params: URLSearchParams,
): PublicOfferPaginationParams {
  return {
    limit: parsePositiveIntegerParam(params.get("limit"), {
      field: "limit",
      min: 1,
      max: PUBLIC_OFFER_MAX_LIMIT,
      invalidCode: "invalid_limit",
      tooLargeCode: "limit_too_large",
    }),
    offset: parsePositiveIntegerParam(params.get("offset"), {
      field: "offset",
      min: 0,
      max: PUBLIC_OFFER_MAX_OFFSET,
      invalidCode: "invalid_offset",
      tooLargeCode: "offset_too_large",
    }),
  };
}

export function normalizePublicOfferLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return PUBLIC_OFFER_DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(value), 1), PUBLIC_OFFER_MAX_LIMIT);
}

export function normalizePublicOfferOffset(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;

  return Math.min(Math.max(Math.trunc(value), 0), PUBLIC_OFFER_MAX_OFFSET);
}

export function normalizePublicOfferQuery(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  return trimmed.slice(0, PUBLIC_OFFER_MAX_QUERY_LENGTH);
}

function parsePositiveIntegerParam(
  value: string | null,
  {
    field,
    min,
    max,
    invalidCode,
    tooLargeCode,
  }: {
    field: "limit" | "offset";
    min: number;
    max: number;
    invalidCode: PublicOfferQueryErrorCode;
    tooLargeCode: PublicOfferQueryErrorCode;
  },
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) {
    throw new PublicOfferQueryError(invalidCode, buildIntegerErrorMessage(field));
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new PublicOfferQueryError(invalidCode, buildIntegerErrorMessage(field));
  }

  if (parsed > max) {
    throw new PublicOfferQueryError(tooLargeCode, `${field} 超出公开接口允许范围。`);
  }

  return parsed;
}

function buildIntegerErrorMessage(field: "limit" | "offset"): string {
  return field === "limit" ? "limit 必须是正整数。" : "offset 必须是非负整数。";
}
