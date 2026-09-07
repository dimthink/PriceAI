"use client";

import { CheckCircle2, Loader2, Store, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CommunityPrompt } from "@/components/FeedbackLink";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { emitSubmissionFloaterState } from "@/lib/site-notice-events";

type Status = "idle" | "submitting" | "success" | "error";

const fieldControlClassName =
  "w-full rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-text-body)] outline-none transition placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-brand)] focus:ring-2 focus:ring-[#45bf78]/15";

export function SubmissionFloater() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState("");
  const formRef = useRef<HTMLFormElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    emitSubmissionFloaterState(open);
    return () => emitSubmissionFloaterState(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousActiveElement?.focus();
    };
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
    if (!storeUrl.trim()) {
      setStatus("error");
      setMessage("请填写有效的店铺入口。");
      return;
    }
    const body = {
      url: storeUrl.trim(),
      name: String(form.get("name") || "").trim() || null,
      contact: String(form.get("contact") || "").trim(),
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
      const accepted = summary?.accepted ?? 1;
      const failed = summary?.failed ?? 0;
      trackAnalyticsEvent("submit_source_success", {
        accepted,
        failed,
      });
      setMessage(failed > 0
        ? "申请未完整提交，请检查店铺入口后重试。"
        : "申请已收到。请通过 QQ 或 Telegram 提供脱敏的店铺后台运营截图，核验通过后再进入试采集和收录。");
      setStoreUrl("");
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
    setStoreUrl("");
  }

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)] px-4 backdrop-blur-sm"
          onClick={close}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="channel-admission-title"
            className="max-h-[calc(100vh-32px)] w-full max-w-md overflow-y-auto rounded-lg bg-[var(--color-panel)] p-5 shadow-[var(--shadow-floating)] ring-1 ring-[var(--color-border-soft)] sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 id="channel-admission-title" className="text-lg font-semibold text-[#2d3435]">申请收录自营店铺</h2>
                <p className="mt-1 text-sm leading-6 text-[#5a6061]">
                  PriceAI 目前仅接受自营店铺申请。店内 AI 相关在售商品原则上不超过 25 个，并需要具备有价格优势的商品；代理铺货、重复渠道或大量同质商品暂不收录。
                </p>
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                onClick={close}
                className="rounded-full p-1 text-[var(--color-text-muted)] transition hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="关闭申请收录窗口"
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
                <CommunityPrompt>
                  可通过 QQ 或 Telegram 发送申请信息和脱敏运营截图。
                </CommunityPrompt>
              </div>
            ) : null}

            {status !== "success" ? (
              <form ref={formRef} onSubmit={submit} className="mt-4 space-y-3">
                <Field label="店铺入口" required>
                  <p className="mb-2 text-xs leading-5 text-[#5a6061]">
                    一次只申请一个店铺。请填写店铺首页或店铺入口，不要填写单个商品链接。
                  </p>
                  <input
                    name="url"
                    type="url"
                    required
                    value={storeUrl}
                    onChange={(event) => setStoreUrl(event.target.value)}
                    placeholder="https://example.com/shop/demo"
                    className={`${fieldControlClassName} h-11`}
                  />
                </Field>
                <Field label="店铺名称（可选）">
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
                    placeholder="QQ / Telegram，任选一种"
                    className={`${fieldControlClassName} h-10`}
                  />
                </Field>
                <Field label="主营商品与价格优势（可选）">
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={500}
                    placeholder="请填写主营商品、最低价商品及其他价格优势"
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
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#e8f3ec] text-sm font-semibold text-[#2f7a4b] ring-1 ring-[#2f7a4b]/20 transition hover:bg-[#ddefe4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f7a4b]/45 disabled:opacity-60"
                >
                  {status === "submitting" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Store size={16} />
                  )}
                  提交申请
                </button>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
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
