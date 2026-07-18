"use client";

import { CheckCircle2, ExternalLink, ShieldCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { SUBMISSION_FLOATER_STATE_EVENT } from "@/lib/site-notice-events";
import { siteNotices, type SiteNoticeConfig } from "@/lib/site-notices";

const STORAGE_PREFIX = "priceai.siteNotice";

export function SiteNoticePrompt() {
  const pathname = usePathname();
  const isGuidePage = pathname.startsWith("/guides/self-host-api-transit");
  const titleId = useId();
  const descriptionId = useId();
  const [openNotice, setOpenNotice] = useState<SiteNoticeConfig | null>(null);
  const [submissionFloaterOpen, setSubmissionFloaterOpen] = useState(false);

  const candidateNotice = useMemo(() => {
    if (isGuidePage) return null;
    const now = new Date();
    return siteNotices.find((notice) => shouldConsiderNotice(notice, pathname, now)) ?? null;
  }, [isGuidePage, pathname]);

  useEffect(() => {
    function onSubmissionFloaterState(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setSubmissionFloaterOpen(Boolean(detail?.open));
      if (detail?.open) setOpenNotice(null);
    }

    window.addEventListener(SUBMISSION_FLOATER_STATE_EVENT, onSubmissionFloaterState);
    return () => window.removeEventListener(SUBMISSION_FLOATER_STATE_EVENT, onSubmissionFloaterState);
  }, []);

  useEffect(() => {
    if (!candidateNotice || submissionFloaterOpen) return;
    const notice = candidateNotice;
    const previewMode = isDevelopmentNoticePreview(notice);
    if (!previewMode && !canShowNoticeToday(notice)) return;

    function showNotice() {
      if (document.visibilityState !== "visible") return;
      if (!previewMode && !canShowNoticeToday(notice)) return;
      if (!previewMode) markNoticeShown(notice);
      setOpenNotice(notice);
      trackAnalyticsEvent("site_notice_impression", {
        notice_id: notice.id,
        surface: notice.surface,
        pathname,
      });
    }

    const delayMs = Math.max(0, notice.delayMs ?? 0);
    if (delayMs === 0) {
      showNotice();
      return;
    }

    const timer = window.setTimeout(showNotice, delayMs);

    return () => window.clearTimeout(timer);
  }, [candidateNotice, pathname, submissionFloaterOpen]);

  useEffect(() => {
    if (!openNotice) return;
    const notice = openNotice;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismissNotice(notice, pathname);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openNotice, pathname]);

  if (isGuidePage) return null;

  if (!openNotice) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#202829]/30 px-3 py-4 backdrop-blur-[2px] sm:items-center sm:px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismissNotice(openNotice, pathname);
      }}
    >
      <div className="max-h-[calc(100dvh-32px)] w-full max-w-[680px] overflow-hidden rounded-lg bg-[#f9f9f9] shadow-[0_30px_80px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/35">
        <div className="max-h-[calc(100dvh-32px)] overflow-y-auto">
          <div className="flex items-start justify-between gap-5 px-5 py-5 sm:px-6 sm:py-6">
            <div className="min-w-0">
              {openNotice.eyebrow ? (
                <p className="inline-flex h-7 items-center rounded-full bg-[#dde4e5] px-3 text-xs font-semibold text-[#2d3435]">
                  {openNotice.eyebrow}
                </p>
              ) : null}
              <h2 id={titleId} className="mt-4 text-xl font-bold leading-7 text-[#202829] sm:text-2xl sm:leading-8">
                {openNotice.title}
              </h2>
              <p id={descriptionId} className="mt-3 max-w-[68ch] text-sm leading-6 text-[#2d3435]">
                {openNotice.body}
              </p>
            </div>
            <button
              type="button"
              onClick={() => dismissNotice(openNotice, pathname)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#5a6061] transition hover:bg-[#edf0f1] hover:text-[#202829] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202829]"
              aria-label="关闭公告，今天不再提示"
            >
              <X size={18} />
            </button>
          </div>

          {openNotice.highlights?.length ? (
            <div className="border-t border-[#adb3b4]/25 px-5 py-1 sm:px-6">
              {openNotice.highlights.map((highlight) => (
                <div
                  key={highlight.label}
                  className="flex gap-3 border-b border-[#adb3b4]/20 py-3.5 last:border-b-0"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#2f7a4b]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-5 text-[#202829]">{highlight.label}</p>
                    <p className="mt-1 text-sm leading-6 text-[#5a6061]">{highlight.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {openNotice.note ? (
            <div className="border-t border-[#adb3b4]/25 px-5 py-4 sm:px-6">
              <div className="flex gap-3 rounded-lg bg-[#eef3f8] px-3.5 py-3 text-[#47657a]">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-sm leading-6">{openNotice.note}</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-[#adb3b4]/25 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            {openNotice.footnote ? (
              <p className="max-w-[32rem] text-xs leading-5 text-[#5a6061]">{openNotice.footnote}</p>
            ) : (
              <span />
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => dismissNotice(openNotice, pathname)}
                className="inline-flex h-11 min-w-[8.5rem] flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold text-[#5a6061] transition hover:bg-[#edf0f1] hover:text-[#202829] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202829] sm:flex-none"
              >
                {openNotice.secondaryActionLabel}
              </button>
              <a
                href={openNotice.primaryAction.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => completeNotice(openNotice, pathname)}
                className="inline-flex h-11 min-w-[10rem] flex-1 items-center justify-center gap-2 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202829] sm:flex-none"
              >
                {openNotice.primaryAction.label}
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function dismissNotice(notice: SiteNoticeConfig, currentPathname: string) {
    writeStorage(storageKey(notice.id, "dismissedDate"), getShanghaiDateKey());
    setOpenNotice(null);
    trackAnalyticsEvent("site_notice_dismiss", {
      notice_id: notice.id,
      surface: notice.surface,
      pathname: currentPathname,
    });
  }

  function completeNotice(notice: SiteNoticeConfig, currentPathname: string) {
    writeStorage(storageKey(notice.id, "clickedAt"), new Date().toISOString());
    setOpenNotice(null);
    trackAnalyticsEvent("site_notice_click_primary", {
      notice_id: notice.id,
      surface: notice.surface,
      pathname: currentPathname,
    });
  }
}

function shouldConsiderNotice(notice: SiteNoticeConfig, pathname: string, now: Date) {
  if (notice.surface !== "modal") return false;
  if (now < new Date(notice.startsAt) || now >= new Date(notice.endsAt)) return false;
  if (!matchesRouteRule(pathname, notice.routeRule)) return false;
  return true;
}

function matchesRouteRule(pathname: string, routeRule?: SiteNoticeConfig["routeRule"]) {
  if (!routeRule) return true;
  if (routeRule.exclude?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return false;
  }
  if (!routeRule.include?.length) return true;
  return routeRule.include.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function canShowNoticeToday(notice: SiteNoticeConfig) {
  if (readStorage(storageKey(notice.id, "clickedAt"))) return false;

  const today = getShanghaiDateKey();
  const lastShownDate = readStorage(storageKey(notice.id, "shownDate"));
  const dismissedDate = readStorage(storageKey(notice.id, "dismissedDate"));

  return lastShownDate !== today && dismissedDate !== today;
}

function markNoticeShown(notice: SiteNoticeConfig) {
  writeStorage(storageKey(notice.id, "shownDate"), getShanghaiDateKey());
}

function isDevelopmentNoticePreview(notice: SiteNoticeConfig) {
  if (process.env.NODE_ENV === "production") return false;

  const params = new URLSearchParams(window.location.search);
  const previewValue = params.get("noticePreview");
  return previewValue === "1" || previewValue === notice.id;
}

function storageKey(id: string, field: string) {
  return `${STORAGE_PREFIX}.${id}.${field}`;
}

function getShanghaiDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Ignore storage failures; browsers with disabled storage may see the notice again later. */
  }
}
