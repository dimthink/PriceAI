"use client";

import {
  CheckCircle2,
  Copy,
  ExternalLink,
  HeartHandshake,
  Loader2,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import Image from "next/image";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { communityAssetDisplayUrl } from "@/lib/community-asset-url";
import { useCommunitySettings } from "@/lib/community-settings-client";
import type { CommunitySettingsSummary } from "@/lib/community-settings-shared";
import { supportPagePath } from "@/lib/support";

const githubUrl = "https://github.com/physics-dimension/PriceAI";

type FeedbackType = "feature" | "data" | "channel" | "bug" | "ux" | "other";
type FeedbackTypeOption = { value: FeedbackType; label: string; id?: string };

const feedbackTypes: FeedbackTypeOption[] = [
  { value: "feature", label: "功能建议" },
  { value: "data", label: "数据问题" },
  { value: "channel", label: "渠道反馈" },
  { value: "bug", label: "Bug / 报错" },
  { value: "ux", label: "页面体验" },
  { value: "other", label: "其他" },
];

export const transitStationFeedbackTypes: FeedbackTypeOption[] = [
  { id: "transit-price-rate", value: "data", label: "价格/倍率不对" },
  { id: "transit-model-unavailable", value: "data", label: "模型不可用" },
  { id: "transit-source-mismatch", value: "channel", label: "渠道来源不实" },
  { id: "transit-pool-mismatch", value: "channel", label: "分组/号池不对" },
  { id: "transit-monitor-mismatch", value: "data", label: "监测结果不符" },
  { id: "transit-other", value: "other", label: "其他站点问题" },
];

function feedbackOptionKey(option: FeedbackTypeOption) {
  return option.id ?? option.value;
}

function getInitialFeedbackOptionId(
  options: FeedbackTypeOption[],
  initialType: FeedbackType,
) {
  return feedbackOptionKey(
    options.find((option) => option.value === initialType) ?? options[0] ?? { value: initialType, label: initialType },
  );
}

type HeaderActionLabelFrom = "sm" | "2xl" | "never";

function getLabelClassName(compact: boolean, labelFrom: HeaderActionLabelFrom) {
  if (!compact) return undefined;
  if (labelFrom === "never") return "hidden";
  return labelFrom === "2xl" ? "hidden 2xl:inline" : "hidden sm:inline";
}

function getExternalIconClassName(labelFrom: HeaderActionLabelFrom) {
  if (labelFrom === "never") return "hidden";
  return labelFrom === "2xl" ? "hidden 2xl:block" : "hidden sm:block";
}

function getCompactButtonClassName(
  labelFrom: HeaderActionLabelFrom,
  smExpandedPaddingClassName: string,
  ultraWideExpandedPaddingClassName: string,
) {
  if (labelFrom === "never") return "h-10 w-10 gap-0 px-0";
  return labelFrom === "2xl"
    ? `h-9 w-9 gap-0 px-0 2xl:h-10 2xl:w-auto 2xl:gap-2 ${ultraWideExpandedPaddingClassName}`
    : `h-9 w-9 gap-0 px-0 sm:h-10 sm:w-auto sm:gap-2 ${smExpandedPaddingClassName}`;
}

export function FeedbackLink({
  compact = false,
  labelFrom = "sm",
}: {
  compact?: boolean;
  labelFrom?: HeaderActionLabelFrom;
}) {
  const [open, setOpen] = useState(false);
  const labelClassName = getLabelClassName(compact, labelFrom);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829] ${
          compact ? getCompactButtonClassName(labelFrom, "sm:px-3", "2xl:px-3") : "h-10 gap-2 px-3"
        }`}
        aria-label="提交意见反馈"
      >
        <MessageCircle size={16} />
        <span className={labelClassName}>意见反馈</span>
      </button>
      {open ? <FeedbackDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function SupportLink({
  compact = false,
  labelFrom = "sm",
}: {
  compact?: boolean;
  labelFrom?: HeaderActionLabelFrom;
}) {
  return (
    <a
      href={supportPagePath}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829] ${
        compact ? getCompactButtonClassName(labelFrom, "sm:px-3", "2xl:px-3") : "h-10 gap-2 px-3.5"
      }`}
      aria-label="支持 PriceAI 继续维护"
    >
      <HeartHandshake size={16} />
      <span className={getLabelClassName(compact, labelFrom)}>支持维护</span>
    </a>
  );
}

export function GitHubLink({
  compact = false,
  labelFrom = "sm",
}: {
  compact?: boolean;
  labelFrom?: HeaderActionLabelFrom;
}) {
  return (
    <a
      href={githubUrl}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829] ${
        compact ? getCompactButtonClassName(labelFrom, "sm:px-3.5", "2xl:px-3.5") : "h-10 gap-2 px-3.5"
      }`}
      aria-label="打开 PriceAI GitHub 仓库"
    >
      <Image
        src="/brand-icons/github.svg"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="h-5 w-5 shrink-0 object-contain"
      />
      <span className={getLabelClassName(compact, labelFrom)}>GitHub 开源</span>
      <ExternalLink size={14} className={getExternalIconClassName(labelFrom)} />
    </a>
  );
}

export function QQGroupLink({
  compact = false,
  labelFrom = "sm",
}: {
  compact?: boolean;
  labelFrom?: HeaderActionLabelFrom;
}) {
  const settings = useCommunitySettings();
  const [open, setOpen] = useState(false);
  if (!settings.qqGroupEnabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829] ${
          compact ? getCompactButtonClassName(labelFrom, "sm:px-3", "2xl:px-3") : "h-10 gap-2 px-3.5"
        }`}
        aria-label={`查看 PriceAI QQ 交流群加入方式，群号 ${settings.qqGroupNumber}`}
        title={`QQ 群：${settings.qqGroupNumber}`}
      >
        <QQIcon className="h-5 w-5" />
        <span className={getLabelClassName(compact, labelFrom)}>QQ 群</span>
      </button>
      {open ? <QQGroupDialog settings={settings} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function QQGroupDialog({
  settings: providedSettings,
  onClose,
}: {
  settings?: CommunitySettingsSummary;
  onClose: () => void;
}) {
  const loadedSettings = useCommunitySettings();
  const settings = providedSettings || loadedSettings;
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const qrCodeUrl = communityAssetDisplayUrl(settings.qqGroupQrCodeUrl) || settings.qqGroupQrCodeUrl;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function copyGroupNumber() {
    try {
      await navigator.clipboard.writeText(settings.qqGroupNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (!settings.qqGroupEnabled) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[110] overflow-y-auto bg-[#202829]/35 px-3 py-4 backdrop-blur-sm sm:px-5 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-[520px] rounded-lg bg-[#f9f9f9] shadow-[0_30px_80px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/30">
          <div className="flex items-start justify-between gap-4 border-b border-[#adb3b4]/20 px-5 py-4">
            <div className="min-w-0">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-[0_8px_22px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25">
                <QQIcon className="h-6 w-6" />
              </div>
              <h2 id={titleId} className="mt-3 text-base font-bold text-[#202829]">
                加入 PriceAI QQ 交流群
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#5a6061]">
                反馈价格错误、缺货、渠道风险，或继续补充截图和链接。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5a6061] transition hover:bg-[#edf0f1] hover:text-[#202829]"
              aria-label="关闭 QQ 群加入方式"
            >
              <X size={17} />
            </button>
          </div>

          <div className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
            <div className="space-y-3">
              <div className="rounded-lg border border-[#dfe4e5] bg-white px-3 py-3">
                <p className="text-xs font-semibold text-[#5a6061]">QQ群号</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xl font-extrabold tracking-wide text-[#202829]">{settings.qqGroupNumber}</p>
                  <button
                    type="button"
                    onClick={copyGroupNumber}
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#eef3f8] px-3 text-xs font-bold text-[#47657a] transition hover:bg-[#e4edf5]"
                  >
                    {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    {copied ? "已复制" : "复制"}
                  </button>
                </div>
              </div>
              <p className="text-sm leading-6 text-[#5a6061]">
                手机用户可以直接点击按钮打开 QQ；桌面用户可以用手机 QQ 扫描右侧二维码。
              </p>
              <a
                href={settings.qqGroupUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-white transition hover:bg-[#202829] sm:w-auto"
              >
                打开 QQ 加群链接
                <ExternalLink size={15} />
              </a>
            </div>

            <div className="rounded-lg border border-[#dfe4e5] bg-white p-2">
              <Image
                src={qrCodeUrl}
                alt={`PriceAI QQ 交流群二维码，群号 ${settings.qqGroupNumber}`}
                width={1284}
                height={2289}
                className="mx-auto h-auto max-h-[280px] w-full rounded-md object-contain sm:max-h-[320px]"
                sizes="(max-width: 640px) 90vw, 180px"
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function QQIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/brand-icons/qq.svg"
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      className={`shrink-0 object-contain ${className ?? ""}`}
    />
  );
}

export function QQGroupPromptButton({
  settings: providedSettings,
}: {
  settings?: CommunitySettingsSummary;
} = {}) {
  const loadedSettings = useCommunitySettings();
  const settings = providedSettings || loadedSettings;
  const [open, setOpen] = useState(false);
  if (!settings.qqGroupEnabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829]"
        aria-label={`查看 PriceAI QQ 交流群加入方式，群号 ${settings.qqGroupNumber}`}
      >
        <QQIcon className="h-3.5 w-3.5" />
        QQ 群
      </button>
      {open ? <QQGroupDialog settings={settings} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function TelegramLink({
  compact = false,
  labelFrom = "sm",
}: {
  compact?: boolean;
  labelFrom?: HeaderActionLabelFrom;
}) {
  const settings = useCommunitySettings();
  if (!settings.telegramEnabled) return null;

  return (
    <a
      href={settings.telegramUrl}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.06)] ring-1 ring-[#adb3b4]/25 transition hover:-translate-y-0.5 hover:bg-[#f5f7f7] hover:text-[#202829] ${
        compact ? getCompactButtonClassName(labelFrom, "sm:px-3", "2xl:px-3") : "h-10 gap-2 px-3.5"
      }`}
      aria-label="加入 PriceAI Telegram 交流群"
    >
      <Image
        src="/brand-icons/telegram.svg"
        alt=""
        aria-hidden="true"
        width={20}
        height={20}
        className="h-5 w-5 shrink-0 object-contain"
      />
      <span className={getLabelClassName(compact, labelFrom)}>Telegram</span>
      <ExternalLink size={14} className={labelFrom === "never" ? "hidden" : labelFrom === "2xl" ? "hidden 2xl:block" : "hidden md:block"} />
    </a>
  );
}

export function CommunityPrompt({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const settings = useCommunitySettings();
  const hasCommunityActions = settings.qqGroupEnabled || settings.telegramEnabled;

  return (
    <div className={`rounded-lg border border-[#dfe4e5] bg-[#f7fafa] px-3 py-2 text-sm leading-6 text-[#4f5b5d] ${className}`}>
      <p>{children}</p>
      {hasCommunityActions ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <QQGroupPromptButton settings={settings} />
          {settings.telegramEnabled ? (
            <a
              href={settings.telegramUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-[#2d3435] ring-1 ring-[#adb3b4]/35 transition hover:bg-[#edf0f1]"
              aria-label="加入 PriceAI Telegram 交流群"
            >
              <Image
                src="/brand-icons/telegram.svg"
                alt=""
                aria-hidden="true"
                width={14}
                height={14}
                className="h-3.5 w-3.5 shrink-0 object-contain"
              />
              Telegram
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type FeedbackDialogProps = {
  onClose: () => void;
  initialType?: FeedbackType;
  title?: string;
  description?: string;
  placeholder?: string;
  submitLabel?: string;
  successMessage?: string;
  messagePrefix?: string;
  pageUrl?: string;
  typeOptions?: FeedbackTypeOption[];
};

export function FeedbackDialog({
  onClose,
  initialType = "feature",
  title = "意见反馈",
  description = "功能建议、页面体验、数据问题都可以发到这里。",
  placeholder = "比如某个页面不好用、希望增加某个能力、某类数据看起来不准...",
  submitLabel = "提交",
  successMessage = "已收到反馈，我会在后台查看处理。",
  messagePrefix,
  pageUrl,
  typeOptions = feedbackTypes,
}: FeedbackDialogProps) {
  const titleId = useId();
  const [type, setType] = useState<FeedbackType>(initialType);
  const [selectedTypeId, setSelectedTypeId] = useState(() => getInitialFeedbackOptionId(typeOptions, initialType));
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const selectedOption = typeOptions.find((option) => feedbackOptionKey(option) === selectedTypeId);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/site-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: [
            messagePrefix,
            selectedOption?.label ? `反馈类型：${selectedOption.label}` : null,
            message.trim(),
          ].filter(Boolean).join("\n\n"),
          contact: contact.trim() || null,
          pageUrl: pageUrl || window.location.href,
          website,
        }),
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));

      if (response.ok && json.ok) {
        setMessage("");
        setContact("");
        setResult({ type: "success", text: successMessage });
      } else {
        setResult({ type: "error", text: json.message || "提交失败，请稍后再试。" });
      }
    } catch {
      setResult({ type: "error", text: "网络异常，反馈没有提交成功。" });
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#202829]/35 px-3 py-4 backdrop-blur-sm sm:px-5 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center">
        <form
          onSubmit={submitFeedback}
          className="flex min-h-0 w-full max-w-lg flex-col rounded-lg bg-[#f9f9f9] shadow-[0_30px_80px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/30 sm:max-h-[calc(100vh-4rem)]"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#adb3b4]/20 px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold text-[#202829]">
                {title}
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#5a6061]">
                {description}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5a6061] transition hover:bg-[#edf0f1] hover:text-[#202829]"
              aria-label="关闭反馈窗口"
            >
              <X size={17} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {typeOptions.map((item) => (
                <button
                  key={`${item.value}-${item.label}`}
                  type="button"
                  onClick={() => {
                    setType(item.value);
                    setSelectedTypeId(feedbackOptionKey(item));
                  }}
                  aria-pressed={selectedTypeId === feedbackOptionKey(item)}
                  className={`h-9 rounded-full px-3 text-xs font-semibold transition ${
                    selectedTypeId === feedbackOptionKey(item)
                      ? "bg-[#dde4e5] text-[#202829]"
                      : "bg-white text-[#5a6061] ring-1 ring-[#adb3b4]/20 hover:bg-[#f2f4f4]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold text-[#5a6061]">反馈内容</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                minLength={3}
                maxLength={1000}
                rows={5}
                placeholder={placeholder}
                className="mt-2 max-h-40 min-h-28 w-full resize-y rounded-lg border border-[#adb3b4]/30 bg-white px-3 py-2 text-sm leading-6 text-[#2d3435] outline-none transition focus:border-[#45bf78]/60 focus:ring-2 focus:ring-[#45bf78]/15"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-xs font-semibold text-[#5a6061]">联系方式，可选</span>
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                maxLength={200}
                placeholder="QQ / 微信 / Telegram，任选一种，便于及时联系"
                className="mt-2 h-10 w-full rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm text-[#2d3435] outline-none transition focus:border-[#45bf78]/60 focus:ring-2 focus:ring-[#45bf78]/15"
              />
            </label>

            <label className="hidden">
              Website
              <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
            </label>

            {result ? (
              <div
                className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  result.type === "success"
                    ? "bg-[#e8f3ec] text-[#2f7a4b]"
                    : "bg-[#fbe9e7] text-[#9b3328]"
                }`}
              >
                {result.type === "success" ? <CheckCircle2 size={16} /> : <X size={16} />}
                {result.text}
              </div>
            ) : null}

            <CommunityPrompt className="mt-4">
              想更快反馈价格、库存、分类问题？也可以加入 PriceAI 交流群。
            </CommunityPrompt>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[#adb3b4]/20 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-[#5a6061] transition hover:bg-[#edf0f1] hover:text-[#202829]"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || message.trim().length < 3}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
