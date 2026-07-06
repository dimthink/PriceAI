"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Download, FileJson, ImageDown, X } from "lucide-react";
import type { DetectorReportCheck, DetectorReportMetric, DetectorReportTone } from "@/lib/transit-detector-report";

export interface TransitDetectorReportImageData {
  id: string;
  title: string;
  protocolLabel: string;
  model: string;
  modeLabel: string;
  baseUrl: string;
  apiKeyMasked: string;
  timestampLabel: string;
  scoreLabel: string;
  verdictLabel: string;
  verdictTone: DetectorReportTone;
  summary: string;
  passCount: number;
  issueCount: number;
  skippedCount: number;
  metrics: DetectorReportMetric[];
  checks: DetectorReportCheck[];
  raw: unknown;
}

interface TransitDetectorReportDownloadButtonsProps {
  report: TransitDetectorReportImageData;
}

const SHARE_CARD_WIDTH = 1600;
const SHARE_CARD_HEIGHT = 1000;
const previewImageAlt = "API 中转检测报告摘要图预览";
const twoLineClamp: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden",
};

export function TransitDetectorReportDownloadButtons({ report }: TransitDetectorReportDownloadButtonsProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const shareCardRef = useRef<HTMLDivElement>(null);
  const closePreviewButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isPreviewOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsPreviewOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    const previouslyFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closePreviewButtonRef.current?.focus(), 0);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      previouslyFocusedElement?.focus();
    };
  }, [isPreviewOpen]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleJsonDownload() {
    const json = JSON.stringify(report.raw, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, `priceai-transit-report-${safeFilePart(report.id)}.json`);
  }

  async function handleOpenPreview() {
    if (isPreparing) return;
    const shareCardNode = shareCardRef.current;
    if (!shareCardNode) return;

    setIsPreparing(true);
    setErrorMessage("");

    try {
      const blob = await renderReportImage(shareCardNode);
      const nextUrl = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewBlob(blob);
      setPreviewUrl(nextUrl);
      setIsPreviewOpen(true);
    } catch {
      setErrorMessage("预览生成失败，请稍后再试。");
    } finally {
      setIsPreparing(false);
    }
  }

  function handleClosePreview() {
    setIsPreviewOpen(false);
  }

  function handleDownloadImage() {
    if (!previewBlob) return;
    downloadBlob(previewBlob, `priceai-transit-report-${safeFilePart(report.id)}.jpg`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={handleJsonDownload}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#202829] ring-1 ring-[#adb3b4]/18 transition hover:bg-[#f5f7f7]"
        >
          <FileJson className="h-4 w-4" />
          JSON
        </button>
        <button
          type="button"
          onClick={handleOpenPreview}
          disabled={isPreparing}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#202829] px-4 text-sm font-semibold text-white transition hover:bg-[#2d3435] disabled:cursor-wait disabled:bg-[#adb3b4]"
        >
          <ImageDown className="h-4 w-4" />
          {isPreparing ? "生成中" : "预览图片"}
        </button>
      </div>
      {errorMessage ? <span className="text-xs font-semibold text-[#9b3328]">{errorMessage}</span> : null}

      <div aria-hidden="true" className="pointer-events-none fixed top-0 left-[-20000px]">
        <div
          ref={shareCardRef}
          data-testid="transit-report-share-card"
          className="h-[1000px] overflow-hidden bg-[#f9f9f9] p-16 text-[#2d3435]"
          style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
        >
          <TransitDetectorReportShareCard report={report} />
        </div>
      </div>

      {isPreviewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#202829]/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detector-report-image-preview-title"
        >
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-[0_30px_80px_rgba(45,52,53,0.22)] ring-1 ring-[#adb3b4]/25">
            <div className="flex flex-col gap-3 border-b border-[#edf0f1] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="detector-report-image-preview-title" className="text-lg font-semibold text-[#202829]">
                  图片预览
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#5a6061]">
                  这张图由页面里的报告卡片生成。确认没问题后再下载；完整证据仍以页面报告为准。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadImage}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#202829] px-4 text-sm font-semibold text-white transition hover:bg-[#2d3435] disabled:cursor-not-allowed disabled:bg-[#adb3b4]"
                  disabled={!previewBlob}
                >
                  <Download className="h-4 w-4" />
                  下载 JPG
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  ref={closePreviewButtonRef}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f2f4f4] text-[#5a6061] transition hover:bg-[#dfe4e5] hover:text-[#202829]"
                  aria-label="关闭图片预览"
                  title="关闭图片预览"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-[#f2f4f4] p-4">
              {previewUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- Blob preview URLs cannot be optimized by next/image. */}
                  <img
                    src={previewUrl}
                    alt={previewImageAlt}
                    className="mx-auto h-auto max-h-[calc(92vh-132px)] w-auto max-w-full rounded-lg bg-white object-contain shadow-[0_10px_28px_rgba(45,52,53,0.10)]"
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TransitDetectorReportShareCard({ report }: { report: TransitDetectorReportImageData }) {
  const tone = toneClasses(report.verdictTone);
  const highlightedChecks = pickHighlightedChecks(report.checks, 3);

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-8">
        <div className="flex items-center gap-4">
          <PriceAiMark />
          <div>
            <p className="text-[42px] leading-none font-extrabold tracking-normal text-[#202829]">PriceAI</p>
            <p className="mt-2 text-[15px] font-bold tracking-[0.18em] text-[#6b7374]">AI 比价雷达</p>
          </div>
        </div>
        <span className="inline-flex h-11 items-center rounded-full bg-white px-9 text-lg font-extrabold text-[#5a6061] shadow-[0_10px_30px_rgba(45,52,53,0.04)] ring-1 ring-[#adb3b4]/18">
          priceai.cc
        </span>
      </header>

      <div className="mt-8">
        <h1 className="font-serif text-[46px] leading-none font-semibold tracking-normal text-[#202829]">API 中转检测报告</h1>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-[17px] font-extrabold text-[#5a6061]">
          {[report.title, report.timestampLabel, report.protocolLabel].map((item) => (
            <span key={item} className="rounded-full bg-white px-4 py-2 shadow-[0_8px_18px_rgba(45,52,53,0.03)] ring-1 ring-[#adb3b4]/16">
              {item}
            </span>
          ))}
        </div>
        <p className="mt-4 max-w-[1160px] text-[19px] leading-[1.55] font-semibold text-[#5a6061]" style={twoLineClamp}>
          这张图是 PriceAI 报告页生成的摘要截图，用于快速分享结论。完整检测项、原始证据和异常明细请回到页面报告复核。
        </p>
      </div>

      <div className="mt-6 grid grid-cols-[500px_minmax(0,1fr)] gap-7">
        <div className="flex h-[300px] flex-col rounded-lg bg-white p-7 shadow-[0_16px_48px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/16">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="text-[22px] font-extrabold text-[#5a6061]">综合结论</p>
              <div className="mt-4 flex items-end gap-4">
                <span className="text-[78px] leading-none font-extrabold tracking-normal text-[#202829]">{report.scoreLabel}</span>
                <span className={`mb-2 inline-flex h-11 items-center rounded-full px-5 text-[18px] font-extrabold ring-1 ${tone.pill}`}>
                  {report.verdictLabel}
                </span>
              </div>
            </div>
            <span className={`grid h-12 w-12 place-items-center rounded-full ${tone.iconBg}`}>
              <span className={`h-5 w-5 rounded-full ${tone.dot}`} />
            </span>
          </div>
          <p className="mt-3 truncate text-[18px] font-bold text-[#2d3435]">
            {report.summary}
          </p>
          <div className="mt-auto grid grid-cols-3 gap-3 border-t border-[#edf0f1] pt-4">
            <ShareCount label="通过" value={report.passCount} tone="success" />
            <ShareCount label="需复核" value={report.issueCount} tone="warning" />
            <ShareCount label="未启用" value={report.skippedCount} tone="muted" />
          </div>
        </div>

        <div className="h-[300px] overflow-hidden rounded-lg bg-white shadow-[0_16px_48px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/16">
          <div className="border-b border-[#edf0f1] px-7 py-4">
            <h2 className="text-[24px] font-extrabold text-[#202829]">检测对象</h2>
          </div>
          <dl className="grid grid-cols-2">
            <ShareInfoCell label="模型" value={report.model} />
            <ShareInfoCell label="协议" value={report.protocolLabel} />
            <ShareInfoCell label="检测强度" value={report.modeLabel} />
            <ShareInfoCell label="接口地址" value={report.baseUrl} isCode />
            <ShareInfoCell label="Key" value={report.apiKeyMasked} isCode />
            <ShareInfoCell label="生成时间" value={report.timestampLabel} />
          </dl>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_500px] gap-7">
        <section className="h-[230px] rounded-lg bg-white p-6 shadow-[0_16px_48px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[26px] leading-none font-extrabold text-[#202829]">关键信号</h2>
              <p className="mt-2 text-[16px] font-semibold text-[#5a6061]">优先展示异常项，再展示通过项。</p>
            </div>
            <span className="text-[16px] font-extrabold text-[#5a6061]">{report.checks.length} 个检测项</span>
          </div>
          <div className="mt-4 grid gap-2">
            {highlightedChecks.map((check) => (
              <ShareSignalRow key={check.name} check={check} />
            ))}
            {!highlightedChecks.length ? (
              <p className="rounded-lg bg-[#f7f8f8] px-4 py-5 text-[18px] font-semibold text-[#5a6061]">
                本次报告没有可展示的检测项。请回到 PriceAI 页面查看原始报告是否完整返回。
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid h-[230px] grid-cols-2 gap-4">
          {report.metrics.slice(0, 4).map((metric) => (
            <ShareMetricTile key={metric.label} metric={metric} />
          ))}
        </section>
      </div>

      <footer className="mt-auto flex items-center justify-between border-t border-[#dfe4e5] pt-5 text-[17px] font-bold text-[#5a6061]">
        <span>PriceAI API 中转模型检测摘要 · 完整证据以页面报告为准</span>
        <span>{report.id} · {report.apiKeyMasked}</span>
      </footer>
    </section>
  );
}

function PriceAiMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-16 w-16 shrink-0 text-[#202829]">
      <circle cx="28" cy="28" r="20" fill="#ffffff" stroke="currentColor" strokeWidth="5" />
      <path d="M15 33L23 25L30 30L41 19" fill="none" stroke="#45bf78" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
      <circle cx="41" cy="19" r="3.6" fill="#45bf78" />
      <path d="M43 43L56 56" stroke="currentColor" strokeLinecap="round" strokeWidth="7" />
    </svg>
  );
}

function ShareCount({ label, value, tone }: { label: string; value: number; tone: DetectorReportTone }) {
  const styles = toneClasses(tone);
  return (
    <div className={`rounded-lg px-4 py-2.5 ring-1 ${styles.soft}`}>
      <p className="text-[14px] font-extrabold">{label}</p>
      <p className="mt-1 text-[24px] leading-none font-extrabold text-[#202829]">{value}</p>
    </div>
  );
}

function ShareInfoCell({ label, value, isCode = false }: { label: string; value: string; isCode?: boolean }) {
  return (
    <div className="h-[77px] min-w-0 border-b border-[#edf0f1] px-7 py-3 odd:border-r odd:border-[#edf0f1]">
      <dt className="text-[13px] font-extrabold text-[#5a6061]">{label}</dt>
      <dd className={`mt-1 truncate text-[17px] leading-tight font-extrabold text-[#202829] ${isCode ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function ShareSignalRow({ check }: { check: DetectorReportCheck }) {
  const styles = toneClasses(check.tone);
  return (
    <article className="min-w-0 rounded-lg bg-[#f9f9f9] px-4 py-2.5 ring-1 ring-[#adb3b4]/12">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={`h-3 w-3 shrink-0 rounded-full ${styles.dot}`} />
        <h3 className="min-w-0 truncate text-[17px] font-extrabold text-[#202829]">{check.label}</h3>
        <span className={`ml-auto inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-[13px] font-extrabold ring-1 ${styles.pill}`}>
          {check.status}
        </span>
      </div>
      <p className="mt-1 truncate text-[14px] font-bold text-[#5a6061]">
        {check.scoreLabel} · {check.durationLabel} · {shortSignalSummary(check)}
      </p>
    </article>
  );
}

function ShareMetricTile({ metric }: { metric: DetectorReportMetric }) {
  const styles = toneClasses(metric.tone ?? "muted");
  return (
    <div className={`rounded-lg bg-white px-5 py-4 shadow-[0_16px_48px_rgba(45,52,53,0.045)] ring-1 ${metric.tone ? styles.softRing : "ring-[#adb3b4]/16"}`}>
      <p className="text-[15px] font-extrabold text-[#5a6061]">{metric.label}</p>
      <p className="mt-2 truncate text-[28px] leading-none font-extrabold text-[#202829]">{metric.value}</p>
      <p className="mt-2 text-[13px] leading-[1.3] font-semibold text-[#5a6061]" style={twoLineClamp}>{metric.helper}</p>
    </div>
  );
}

async function renderReportImage(node: HTMLElement): Promise<Blob> {
  if ("fonts" in document) await document.fonts.ready;

  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    backgroundColor: "#f9f9f9",
    cacheBust: true,
    canvasHeight: SHARE_CARD_HEIGHT,
    canvasWidth: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    pixelRatio: 1,
    quality: 0.95,
    skipFonts: true,
    type: "image/jpeg",
    width: SHARE_CARD_WIDTH,
  });

  if (!blob) throw new Error("Image rendering failed");
  return blob;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toneClasses(tone: DetectorReportTone) {
  if (tone === "success") {
    return {
      dot: "bg-[#45bf78]",
      iconBg: "bg-[#e8f3ec]",
      pill: "bg-[#e8f3ec] text-[#2f7a4b] ring-[#45bf78]/25",
      soft: "bg-[#f4fbf7] text-[#2f7a4b] ring-[#45bf78]/20",
      softRing: "ring-[#45bf78]/20",
    };
  }
  if (tone === "danger") {
    return {
      dot: "bg-[#c64c3f]",
      iconBg: "bg-[#fbe9e7]",
      pill: "bg-[#fbe9e7] text-[#9b3328] ring-[#e6b8b1]",
      soft: "bg-[#fff4f2] text-[#9b3328] ring-[#e6b8b1]",
      softRing: "ring-[#e6b8b1]",
    };
  }
  if (tone === "warning") {
    return {
      dot: "bg-[#e7a33e]",
      iconBg: "bg-[#fff7e8]",
      pill: "bg-[#fff7e8] text-[#7a541b] ring-[#e7b65d]/30",
      soft: "bg-[#fffaf0] text-[#7a541b] ring-[#e7b65d]/30",
      softRing: "ring-[#e7b65d]/30",
    };
  }
  return {
    dot: "bg-[#adb3b4]",
    iconBg: "bg-[#f2f4f4]",
    pill: "bg-[#f2f4f4] text-[#5a6061] ring-[#dfe4e5]",
    soft: "bg-[#f7f8f8] text-[#5a6061] ring-[#dfe4e5]",
    softRing: "ring-[#dfe4e5]",
  };
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "report";
}

function pickHighlightedChecks(checks: DetectorReportCheck[], limit: number) {
  const issues = checks.filter((check) => check.tone === "danger" || check.tone === "warning");
  const passes = checks.filter((check) => check.tone === "success");
  const muted = checks.filter((check) => check.tone === "muted");
  return [...issues, ...passes, ...muted].slice(0, limit);
}

function shortSignalSummary(check: DetectorReportCheck) {
  if (check.tone === "success") return "该项未发现明显异常。";
  if (check.tone === "warning") return "该项需要结合证据明细复核。";
  if (check.tone === "danger") return "该项未通过，建议优先复核。";
  return "本次检测未启用或无有效结果。";
}
