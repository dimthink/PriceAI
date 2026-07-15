export type FeedbackResumeKind = "offer" | "merchant";

const DRAFT_PREFIX = "priceai:feedback-draft:v1";
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;

export function feedbackDraftKey(kind: FeedbackResumeKind, id: string): string {
  return `${DRAFT_PREFIX}:${kind}:${id}`;
}

export function writeFeedbackDraft(kind: FeedbackResumeKind, id: string, fields: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(feedbackDraftKey(kind, id), JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      fields,
    }));
  } catch {
    // Draft restoration is best-effort and must not block login.
  }
}

export function readFeedbackDraft(kind: FeedbackResumeKind, id: string): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(feedbackDraftKey(kind, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; savedAt?: unknown; fields?: unknown };
    if (parsed.version !== 1 || typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      window.sessionStorage.removeItem(feedbackDraftKey(kind, id));
      return null;
    }
    return parsed.fields && typeof parsed.fields === "object" ? parsed.fields as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function clearFeedbackDraft(kind: FeedbackResumeKind, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(feedbackDraftKey(kind, id));
  } catch {
    // Ignore storage failures after successful submission.
  }
}

export function buildFeedbackResumePath(kind: FeedbackResumeKind, id: string): string {
  if (typeof window === "undefined") return "/channels";
  const url = new URL(window.location.href);
  url.searchParams.set("feedback", kind);
  url.searchParams.set("feedbackId", id);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function getFeedbackResumeRequest(): { kind: FeedbackResumeKind; id: string } | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const kind = url.searchParams.get("feedback");
  const id = url.searchParams.get("feedbackId")?.trim();
  if ((kind !== "offer" && kind !== "merchant") || !id) return null;
  return { kind, id };
}

export function clearFeedbackResumeRequest(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("feedback");
  url.searchParams.delete("feedbackId");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
