"use client";

import { CheckCircle2, ExternalLink, Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { emitSubmissionFloaterState } from "@/lib/site-notice-events";

type Status = "idle" | "submitting" | "success" | "error";

const MAX_BATCH_SIZE = 10;
const TELEGRAM_COMMUNITY_URL = "https://t.me/priceaicc";
const fieldControlClassName =
  "w-full rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-text-body)] outline-none transition placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[#45bf78]/15";

export function SubmissionFloater() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [urlsText, setUrlsText] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);

  const parsed = useMemo(() => parseUrls(urlsText), [urlsText]);

  useEffect(() => {
    emitSubmissionFloaterState(open);
    return () => emitSubmissionFloaterState(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("open-submission-floater", onOpen);
    return () => window.removeEventListener("open-submission-floater", onOpen);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    function openFromLocation() {
      const queryWantsSubmit = new URLSearchParams(window.location.search).get("submit") === "channel";
      if (queryWantsSubmit || window.location.hash === "#submit-channel") {
        setOpen(true);
      }
    }

    const timer = window.setTimeout(openFromLocation, 0);
    window.addEventListener("hashchange", openFromLocation);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", openFromLocation);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage(null);
    const form = new FormData(event.currentTarget);
    if (!parsed.urls.length) {
      setStatus("error");
      setMessage("请至少填写一个有效链接。");
      return;
    }
    if (parsed.urls.length > MAX_BATCH_SIZE) {
      setStatus("error");
      setMessage(`单次最多提交 ${MAX_BATCH_SIZE} 个链接，请分批提交。`);
      return;
    }
    const body = {
      urls: parsed.urls,
      name: String(form.get("name") || "").trim() || null,
      contact: String(form.get("contact") || "").trim() || null,
      notes: String(form.get("notes") || "").trim() || null,
      website: String(form.get("website") || ""),
    };

    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({ ok: false, message: response.statusText }));
      if (!response.ok || !json.ok) {
        setStatus("error");
        setMessage(json.message || "提交失败，请稍后再试。");
        return;
      }
      setStatus("success");
      const summary = json.summary as { accepted?: number; failed?: number } | undefined;
      const accepted = summary?.accepted ?? parsed.urls.length;
      const failed = summary?.failed ?? 0;
      trackAnalyticsEvent("submit_source_success", {
        accepted,
        failed,
      });
      setMessage(
        failed > 0
          ? `已收到 ${accepted} 条，${failed} 条未提交成功。系统会先解析链接，采集成功并审核后进入比价。`
          : `已收到 ${accepted} 条。系统会先解析链接，采集成功并审核后进入比价。`,
      );
      setUrlsText("");
      formRef.current?.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "网络错误，请稍后再试。");
    }
  }

  function close() {
    setOpen(false);
    setStatus("idle");
    setMessage(null);
    setUrlsText("");
  }

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] px-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--color-panel)] p-6 shadow-[var(--shadow-floating)] ring-1 ring-[var(--color-border-soft)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[#2d3435]">提交渠道</h2>
                <p className="mt-1 text-sm text-[#5a6061]">
                  推荐你知道的卡网/镜像/代充链接，系统会先解析和试采集，再决定是否加入比价。
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-1 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="关闭提交渠道窗口"
              >
                <X size={18} />
              </button>
            </div>

            {status === "success" ? (
              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-2 rounded-xl border border-[var(--color-border-muted)] bg-[var(--color-success-bg)] px-4 py-3 text-sm text-[var(--color-success-text)]">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>{message}</span>
                </div>
                <a
                  href={TELEGRAM_COMMUNITY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#2AABEE]/20 bg-[#eef8fe] px-4 py-3 text-sm text-[#23658a] transition hover:border-[#2AABEE]/35 hover:bg-[#e3f4fd]"
                >
                  <span>也欢迎加入 PriceAI 交流群，一起补充低价渠道、反馈价格变化。</span>
                  <ExternalLink size={14} className="shrink-0" />
                </a>
              </div>
            ) : null}

            {status !== "success" ? (
              <form ref={formRef} onSubmit={submit} className="mt-4 space-y-3">
                <Field label="渠道链接" required>
                  <p className="mb-2 text-xs leading-5 text-[#5a6061]">
                    请优先提交店铺首页或渠道入口，不建议提交单个商品链接；如果只找到了商品链接，也可以提交，我们会尽量识别对应店铺入口。
                  </p>
                  <textarea
                    name="urlsText"
                    rows={5}
                    required
                    value={urlsText}
                    onChange={(event) => setUrlsText(event.target.value)}
                    placeholder={"每行一个店铺入口链接，也可以直接粘贴一整段文字\nhttps://example.com/\nhttps://example.com/shop/demo"}
                    className={`${fieldControlClassName} resize-y py-2`}
                  />
                </Field>
                {urlsText.trim() ? (
                  <div className="rounded-lg border border-[var(--color-border-soft)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
                    已识别 {parsed.urls.length} 个链接
                    {parsed.duplicateCount > 0 ? `，已去重 ${parsed.duplicateCount} 个重复链接` : ""}
                    {parsed.urls.length > MAX_BATCH_SIZE ? `。单次最多 ${MAX_BATCH_SIZE} 个，请分批提交。` : "。"}
                  </div>
                ) : null}
                <Field label="渠道名称（可选）">
                  <input
                    name="name"
                    type="text"
                    maxLength={200}
                    placeholder="如未填写会从域名生成"
                    className={`${fieldControlClassName} h-10`}
                  />
                </Field>
                <Field label="联系方式（可选）">
                  <input
                    name="contact"
                    type="text"
                    maxLength={200}
                    placeholder="邮箱 / TG / 其它"
                    className={`${fieldControlClassName} h-10`}
                  />
                </Field>
                <Field label="备注（可选）">
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={500}
                    placeholder="价格特点、库存稳定度、注意事项..."
                    className={`${fieldControlClassName} resize-y py-2`}
                  />
                </Field>

                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  aria-hidden="true"
                />

                {status === "error" && message ? (
                  <p className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger-text)]">
                    {message}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] text-sm font-semibold text-[var(--color-text-on-primary)] transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
                >
                  {status === "submitting" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Plus size={16} />
                  )}
                  提交
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function parseUrls(text: string): { urls: string[]; duplicateCount: number } {
  const matches = text.match(/https?:\/\/[^\s"'<>，,；;]+/gi) || [];
  const seen = new Set<string>();
  const urls: string[] = [];
  let duplicateCount = 0;

  for (const raw of matches) {
    const candidate = raw.replace(/[)。）\].!?！？]+$/g, "");
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      const normalized = parsed.toString();
      if (seen.has(normalized)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(normalized);
      urls.push(normalized);
    } catch {
      /* ignore invalid pasted text */
    }
  }

  return { urls, duplicateCount };
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5a6061]">
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}
