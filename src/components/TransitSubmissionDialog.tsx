"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, Copy, Mail, MessageCircle, Send, X } from "lucide-react";

type DialogMode = "submit" | "merchant";

const mainModelOptions = ["Claude", "GPT", "Gemini", "Grok", "DeepSeek", "GLM", "Kimi", "千问 / Qwen", "图片 / 视频模型", "不确定"];
const merchantEmail = "dimthink@qq.com";
const merchantMailSubject = "PriceAI 中转站入驻 - 站点名称";
const merchantMailTemplate = `站点名称：
官网链接：
公开价格页：
公开监测页：
站点上线时间 / 已运营时长：
当前使用规模（近 7/30 日请求量、用户量或订单量）：
截图证明（运营时长 / 使用规模 / 监测或后台统计）：
充值倍率：
主流模型倍率：
模型来源说明：
售后入口 / 退款规则：
主体类型（个人 / 个体工商户 / 公司 / 海外主体）：
是否支持发票 / Invoice：
可开票类型、税点和周期：
联系人：
补充说明：`;

export function TransitSubmissionActions({
  className = "flex flex-wrap gap-2.5",
  buttonClassName = "",
  buttonSizeClassName = "h-10 gap-2 px-4 text-sm",
  compactLabels = false,
}: {
  className?: string;
  buttonClassName?: string;
  buttonSizeClassName?: string;
  compactLabels?: boolean;
}) {
  const [mode, setMode] = useState<DialogMode | null>(null);

  return (
    <>
      <div className={className}>
        <button
          type="button"
          onClick={() => setMode("submit")}
          className={`inline-flex items-center justify-center rounded-full bg-[#dde4e5] font-semibold text-[#2d3435] transition hover:bg-[#cfd8d9] ${buttonSizeClassName} ${buttonClassName}`}
        >
          <Send className="h-4 w-4" />
          {compactLabels ? (
            <>
              <span className="sm:hidden">提交</span>
              <span className="hidden sm:inline">提交渠道</span>
            </>
          ) : (
            "提交渠道"
          )}
        </button>
        <button
          type="button"
          onClick={() => setMode("merchant")}
          className={`inline-flex items-center justify-center rounded-full bg-[#2d3435] font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526] ${buttonSizeClassName} ${buttonClassName}`}
        >
          {compactLabels ? (
            <>
              <span className="sm:hidden">合作</span>
              <span className="hidden sm:inline">合作入驻</span>
            </>
          ) : (
            "合作入驻"
          )}
        </button>
      </div>
      {mode ? <TransitSubmissionModal mode={mode} onClose={() => setMode(null)} /> : null}
    </>
  );
}

function TransitSubmissionModal({
  mode,
  onClose,
}: {
  mode: DialogMode;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const title = mode === "submit" ? "提交一个 API 中转站" : "合作入驻 / 补充站点资料";
  const description =
    mode === "submit"
      ? "适合普通用户补充线索。填站点、看到的倍率和少量主流模型即可，PriceAI 会先做基础核验。"
      : "基础收录不收费。请把站点资料发到 PriceAI 邮箱，我们会先核验公开价格、倍率、来源和稳定性信息。";

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#202829]/35 px-4 py-6 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="transit-submission-title"
        className="max-h-[min(780px,calc(100vh-48px))] w-full max-w-[680px] overflow-y-auto rounded-lg bg-[#fbfcfc] p-5 shadow-[0_30px_80px_rgba(45,52,53,0.18)] ring-1 ring-[#adb3b4]/20 md:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="transit-submission-title" className="text-lg font-bold text-[#202829]">
              {title}
            </h2>
            <p className="mt-1 max-w-[62ch] text-sm leading-6 text-[#5a6061]">{description}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e9ea] text-[#5a6061] transition hover:bg-[#dde4e5] hover:text-[#202829]"
          >
            <X size={17} />
          </button>
        </div>

        {mode === "merchant" ? (
          <MerchantContactPanel />
        ) : submitted ? (
          <div className="mt-5 rounded-lg bg-[#e8f3ec] p-4 text-sm leading-7 text-[#2f7a4b]">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              已记录
            </p>
            <p className="mt-1">线索已进入 API 中转站待核验队列，审核通过后再进入公开榜单或监控池。</p>
          </div>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              setError(null);

              const form = event.currentTarget;
              const formData = new FormData(form);
              const payload = buildSubmissionPayload(formData);

              try {
                const response = await fetch("/api/api-transit-submissions", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(payload),
                });
                const json = await response.json().catch(() => null);
                if (!response.ok || !json?.ok) {
                  throw new Error(json?.message || "提交失败，请稍后再试。");
                }
                setSubmitted(true);
                form.reset();
              } catch (err) {
                setError(err instanceof Error ? err.message : "提交失败，请稍后再试。");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <SubmitFields />
            {error ? (
              <p className="rounded-lg bg-[#fbe9e7] px-3 py-2 text-xs leading-5 text-[#9b3328]">
                {error}
              </p>
            ) : null}
            <SubmissionSafetyNote />
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#e4e9ea] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {submitting ? "提交中..." : "提交到待核验"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function SubmitFields() {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="渠道名称（可选）">
          <input className={fieldClassName} name="name" placeholder="例如 MiCu API" />
        </Field>
        <Field label="站点或 API 地址">
          <input className={fieldClassName} name="url" placeholder="https://example.com" type="url" required />
        </Field>
        <Field label="看到的价格或倍率">
          <input className={fieldClassName} name="priceHint" placeholder="例如 Claude 0.3x / GPT 0.5x" />
        </Field>
        <Field label="你从哪里看到的（可选）">
          <input className={fieldClassName} name="sourceHint" placeholder="商家官网 / 群聊 / 朋友推荐" />
        </Field>
      </div>
      <OptionGroup label="涉及的主流模型（可选）" name="models" options={mainModelOptions} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="联系入口（可选）">
          <input className={fieldClassName} name="contact" placeholder="售后页 / QQ / 微信 / Telegram" />
        </Field>
        <Field label="补充说明（可选）">
          <input className={fieldClassName} name="notes" placeholder="例如是否充值过、是否遇到限速" />
        </Field>
      </div>
    </>
  );
}

function MerchantContactPanel() {
  const [copied, setCopied] = useState(false);

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(merchantMailTemplate);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <section className="rounded-lg border border-[#dfe4e5] bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f3ec] text-[#2f7a4b]">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-[#202829]">把资料发到邮箱，先进入人工核验</h3>
            <p className="mt-1 text-sm leading-6 text-[#5a6061]">
              邮件标题建议写成 <span className="font-semibold text-[#2d3435]">{merchantMailSubject}</span>。请按下方清单补充公开资料、运营情况、主体和发票情况，PriceAI 会先做人工核验。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyTemplate}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#dde4e5] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#cfd8d9]"
              >
                <Copy className="h-4 w-4" />
                {copied ? "已复制" : "复制资料清单"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#dfe4e5] bg-[#f8fafa] p-4">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-[#202829]">
          <ClipboardList className="h-4 w-4" />
          邮件里建议包含
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-2 text-sm leading-6 text-[#2d3435] sm:grid-cols-2">
          {[
            "站点名称与官网",
            "公开价格页或监测页",
            "站点上线时间 / 运营时长",
            "当前使用规模或运营体量",
            "相关截图证明",
            "充值倍率与主流模型倍率",
            "模型来源或号池说明",
            "最低充值、余额和退款规则",
            "主体类型：个人或公司",
            "是否支持发票或 Invoice",
            "开票类型、税点和周期",
            "售后入口与联系人",
          ].map((item) => (
            <div key={item} className="flex gap-2">
              <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-[#2f7a4b]" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2 text-xs leading-5 text-[#5a6061]">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#eef3f8] px-3 py-1 text-[#47657a]">
          <MessageCircle className="h-3.5 w-3.5" />
          Telegram: @dimthink
        </span>
        <span className="inline-flex items-center rounded-full bg-[#eef3f8] px-3 py-1 text-[#47657a]">
          微信: dimthink
        </span>
        <span className="inline-flex items-center rounded-full bg-[#eef3f8] px-3 py-1 text-[#47657a]">
          邮箱: {merchantEmail}
        </span>
      </div>
    </div>
  );
}

function SubmissionSafetyNote() {
  return (
    <p className="rounded-lg bg-[#fff7e8] px-3 py-2 text-xs leading-5 text-[#7a541b]">
      普通用户推荐请不要提交 API Key、账号密码、Cookie、支付账户或任何能直接调用模型的密钥。
    </p>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[#5a6061]">{label}</span>
      {children}
    </label>
  );
}

function OptionGroup({
  label,
  name,
  options,
}: {
  label: string;
  name?: string;
  options: string[];
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-[#5a6061]">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
        {options.map((option) => (
          <label
            key={option}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-[#adb3b4]/20 bg-white px-3 py-2 text-sm font-medium text-[#2d3435]"
          >
            <input
              type="checkbox"
              name={name}
              value={option}
              className="h-4 w-4 accent-[#2d3435]"
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

const fieldClassName =
  "h-11 w-full rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm text-[#202829] outline-none transition placeholder:text-[#6f7778] focus:border-[#2d3435]";

function buildSubmissionPayload(formData: FormData) {
  const get = (name: string) => String(formData.get(name) || "").trim();
  const getAll = (name: string) => formData.getAll(name).map((value) => String(value).trim()).filter(Boolean);
  const notes = [
    get("priceHint") ? `价格/倍率线索：${get("priceHint")}` : "",
    get("sourceHint") ? `来源：${get("sourceHint")}` : "",
    get("notes"),
  ].filter(Boolean).join("\n");

  return {
    type: "user",
    name: get("name"),
    url: get("url"),
    contact: get("contact"),
    notes,
    models: getAll("models"),
    accessMode: "public_only",
    meta: {
      priceHint: get("priceHint") || null,
      sourceHint: get("sourceHint") || null,
      accessMode: "public_only",
    },
  };
}
