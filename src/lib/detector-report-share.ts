import crypto from "node:crypto";

export function createDetectorReportShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashDetectorReportShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isValidDetectorReportShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function detectorReportSharePath(token: string): string {
  return `/api-transit/detector/shared/${encodeURIComponent(token)}`;
}
