"use client";

import { ExternalLink, HeartHandshake, Star, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { githubStarUrl, supportPagePath } from "@/lib/support";

const STORAGE_KEY = "priceai.supportNudge.v1";
const MIN_VISIT_DAYS = 3;
const PROMPT_DELAY_MS = 20_000;
const DISMISS_DAYS = 30;
const COMPLETE_DAYS = 180;

const excludedPathPrefixes = [
  "/admin",
  "/api-transit/submit",
  "/api-transit/detector/reports",
  "/commercial",
  "/guides/self-host-api-transit",
  supportPagePath,
] as const;

type SupportNudgeState = {
  visitDays: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  lastShownAt?: string;
  dismissedUntil?: string;
  completedAt?: string;
};

export function SupportNudgePrompt() {
  const pathname = usePathname();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const dismissPrompt = useCallback(() => {
    const state = readState();
    writeState({
      ...state,
      dismissedUntil: addDays(new Date(), DISMISS_DAYS).toISOString(),
    });
    setOpen(false);
    trackAnalyticsEvent("support_nudge_dismiss", {
      pathname,
      visit_days: state.visitDays.length,
    });
  }, [pathname]);

  const completePrompt = useCallback((action: string) => {
    const state = readState();
    writeState({
      ...state,
      completedAt: new Date().toISOString(),
      dismissedUntil: addDays(new Date(), COMPLETE_DAYS).toISOString(),
    });
    setOpen(false);
    trackAnalyticsEvent("support_nudge_click", {
      action,
      pathname,
      visit_days: state.visitDays.length,
    });
  }, [pathname]);

  const openSupportPage = useCallback(() => {
    const state = readState();
    writeState({
      ...state,
      dismissedUntil: addDays(new Date(), DISMISS_DAYS).toISOString(),
    });
    setOpen(false);
    trackAnalyticsEvent("support_nudge_click", {
      action: "support_page",
      pathname,
      visit_days: state.visitDays.length,
    });
  }, [pathname]);

  useEffect(() => {
    if (matchesPathPrefix(pathname, excludedPathPrefixes)) return;

    const previewMode = isDevelopmentSupportNudgePreview();
    const state = previewMode ? readState() : recordVisit(readState());
    if (!previewMode) writeState(state);
    if (!previewMode && !shouldShowPrompt(state)) return;

    function showPrompt() {
      if (document.visibilityState !== "visible") return;
      if (document.querySelector('[role="dialog"]')) return;

      const latestState = readState();
      if (!previewMode && !shouldShowPrompt(latestState)) return;

      if (!previewMode) {
        writeState({
          ...latestState,
          lastShownAt: new Date().toISOString(),
        });
      }
      setOpen(true);
      trackAnalyticsEvent("support_nudge_impression", {
        pathname,
        visit_days: latestState.visitDays.length,
        preview: previewMode,
      });
    }

    const timer = window.setTimeout(showPrompt, previewMode ? 0 : PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissPrompt();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const isDialogFocused = activeElement === dialog;

      if (!event.shiftKey && isDialogFocused) {
        event.preventDefault();
        firstElement.focus();
        return;
      }

      if (event.shiftKey && (isDialogFocused || !activeElement || activeElement === firstElement || !dialog.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissPrompt, open]);

  useEffect(() => {
    if (!open) return;

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }));

    return () => {
      window.cancelAnimationFrame(frame);
      previousActiveElement?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-[var(--color-overlay)] px-3 py-4 backdrop-blur-[1px] sm:items-center sm:px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismissPrompt();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-[500px] rounded-lg bg-[var(--color-panel)] p-5 shadow-[var(--shadow-control)] ring-1 ring-[var(--color-border-soft)] focus:outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
              <HeartHandshake size={19} aria-hidden="true" />
            </div>
            <h2 id={titleId} className="mt-4 text-lg font-semibold leading-7 text-[var(--color-text-primary)]">
              PriceAI 帮你省过时间吗？
            </h2>
            <p id={descriptionId} className="mt-2 max-w-[46ch] text-sm leading-7 text-[var(--color-text-muted)]">
              如果它帮你少找几个渠道、少花一点冤枉钱，可以点个 GitHub Star，或<span className="whitespace-nowrap">给作者买杯咖啡</span>。
            </p>
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]"
            aria-label="关闭支持提示，30 天内不再提示"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <a
            href={githubStarUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => completePrompt("github_star")}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-text-on-primary)] transition hover:bg-[var(--color-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]"
          >
            去 GitHub 点 Star
            <Star size={15} />
            <ExternalLink size={14} />
          </a>
          <Link
            href={supportPagePath}
            onClick={openSupportPage}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-panel)] px-4 text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]"
          >
            买杯咖啡
            <HeartHandshake size={15} />
          </Link>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={dismissPrompt}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-3 text-xs font-semibold text-[var(--color-text-soft)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]"
            aria-label="30 天内不再提醒"
          >
            30 天内不再提醒
          </button>
        </div>
      </div>
    </div>
  );

}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && !element.getAttribute("aria-hidden"));
}

function shouldShowPrompt(state: SupportNudgeState) {
  const now = Date.now();
  if (state.visitDays.length < MIN_VISIT_DAYS) return false;
  if (state.completedAt) return false;
  if (state.dismissedUntil && Date.parse(state.dismissedUntil) > now) return false;
  if (state.lastShownAt && daysBetween(new Date(state.lastShownAt), new Date()) < DISMISS_DAYS) return false;
  return true;
}

function recordVisit(state: SupportNudgeState): SupportNudgeState {
  const now = new Date();
  const today = getShanghaiDateKey(now);
  const visitDays = Array.from(new Set([...state.visitDays, today])).slice(-20);

  return {
    ...state,
    visitDays,
    firstSeenAt: state.firstSeenAt || now.toISOString(),
    lastSeenAt: now.toISOString(),
  };
}

function readState(): SupportNudgeState {
  const fallback = initialState();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SupportNudgeState>;
    return {
      visitDays: Array.isArray(parsed.visitDays) ? parsed.visitDays.filter((value): value is string => typeof value === "string").slice(-20) : [],
      firstSeenAt: typeof parsed.firstSeenAt === "string" ? parsed.firstSeenAt : fallback.firstSeenAt,
      lastSeenAt: typeof parsed.lastSeenAt === "string" ? parsed.lastSeenAt : fallback.lastSeenAt,
      lastShownAt: typeof parsed.lastShownAt === "string" ? parsed.lastShownAt : undefined,
      dismissedUntil: typeof parsed.dismissedUntil === "string" ? parsed.dismissedUntil : undefined,
      completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined,
    };
  } catch {
    return fallback;
  }
}

function writeState(state: SupportNudgeState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Users with disabled storage may see the prompt again later. */
  }
}

function initialState(): SupportNudgeState {
  const now = new Date().toISOString();
  return {
    visitDays: [],
    firstSeenAt: now,
    lastSeenAt: now,
  };
}

function getShanghaiDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date) {
  const startMs = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endMs - startMs) / 86_400_000);
}

function matchesPathPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isDevelopmentSupportNudgePreview() {
  if (process.env.NODE_ENV === "production") return false;
  return new URLSearchParams(window.location.search).get("supportNudgePreview") === "1";
}
