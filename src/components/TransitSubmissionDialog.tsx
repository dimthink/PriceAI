"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Send, X } from "lucide-react";

type DialogMode = "submit" | "merchant";

const modelOptions = [
  "Claude Sonnet 4.6",
  "Claude Opus 4.6",
  "Claude Opus 4.7",
  "Claude Opus 4.8",
  "GPT 5.5",
  "GPT 5.4",
];

export function TransitSubmissionActions({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<DialogMode | null>(null);

  return (
    <>
      <div className={`flex flex-wrap gap-2.5 ${className}`}>
        <button
          type="button"
          onClick={() => setMode("submit")}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#dde4e5] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#cfd8d9]"
        >
          <Send className="h-4 w-4" />
          提交渠道
        </button>
        <button
          type="button"
          onClick={() => setMode("merchant")}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
        >
          商家入驻
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
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const title = mode === "submit" ? "提交一个 API 中转站" : "商家 / 总渠道商入驻";
  const description =
    mode === "submit"
      ? "适合普通用户补充线索。PriceAI 会先做基础核验，再决定是否进入公开榜单或监控池。"
      : "适合希望进入展示、提供测试额度或补充一手证明的商家。商业关系会和客观数据分开展示。";

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
            <p className="mt-1 max-w-[58ch] text-sm leading-6 text-[#5a6061]">{description}</p>
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

        {submitted ? (
          <div className="mt-5 rounded-lg bg-[#e8f3ec] p-4 text-sm leading-7 text-[#2f7a4b]">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              已记录
            </p>
            <p className="mt-1">当前是本地 MVP 流程，正式接入后会进入待核验队列。</p>
          </div>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(true);
            }}
          >
            {mode === "submit" ? <SubmitFields /> : <MerchantFields />}
            <p className="rounded-lg bg-[#fff7e8] px-3 py-2 text-xs leading-5 text-[#7a541b]">
              请不要提交 API Key、账号密码、Cookie、支付账户或任何能直接调用模型的密钥。
            </p>
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
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
              >
                <Send className="h-4 w-4" />
                {mode === "submit" ? "提交到待核验" : "提交入驻意向"}
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
        <Field label="渠道名称">
          <input className={fieldClassName} placeholder="例如 MiCu API" />
        </Field>
        <Field label="站点或 API 地址">
          <input className={fieldClassName} placeholder="https://example.com" type="url" />
        </Field>
        <Field label="你判断的渠道类型">
          <select className={fieldClassName} defaultValue="不确定，交给平台核验">
            <option>不确定，交给平台核验</option>
            <option>一手自建号池</option>
            <option>官方 API</option>
            <option>混合渠道</option>
            <option>二级分销</option>
          </select>
        </Field>
        <Field label="看到的价格或倍率">
          <input className={fieldClassName} placeholder="例如 Opus 4.6 0.2x / GPT 5.4 0.08x" />
        </Field>
      </div>
      <OptionGroup label="支持模型" options={modelOptions} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="售后或联系入口">
          <input className={fieldClassName} placeholder="Telegram / QQ / 工单地址" />
        </Field>
        <Field label="你从哪里看到的">
          <input className={fieldClassName} placeholder="朋友推荐 / 群聊 / 商家官网" />
        </Field>
      </div>
      <Field label="补充说明">
        <textarea
          className={`${fieldClassName} min-h-24 resize-y py-2 leading-6`}
          placeholder="例如是否充值过、是否遇到限速、是否怀疑二级上游"
        />
      </Field>
    </>
  );
}

function MerchantFields() {
  return (
    <>
      <OptionGroup label="你的角色" type="radio" name="merchant-role" options={["总渠道商", "中转站商家", "个人渠道"]} />
      <OptionGroup label="希望合作什么" options={["公开展示", "提供测试额度", "补充渠道资料", "纠错 / 申诉", "批发合作", "其他"]} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="站点名称或域名">
          <input className={fieldClassName} placeholder="渠道名称 / 官网域名" />
        </Field>
        <Field label="可接受合作规则">
          <select className={fieldClassName} defaultValue="仅提交资料，不参与优选">
            <option>仅提交资料，不参与优选</option>
            <option>按月展示费</option>
            <option>一次性保证金</option>
            <option>合作规则待定</option>
          </select>
        </Field>
      </div>
      <OptionGroup
        label="准入资料准备情况"
        options={["可说明上游渠道", "可拆分 Pro / Plus / Max 池", "有固定售后入口", "接受异常下架机制", "可提供测试额度", "可提供历史稳定性证明"]}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="联系渠道">
          <input className={fieldClassName} placeholder="Telegram / 邮箱 / 企业微信" />
        </Field>
        <Field label="大概供给规模">
          <input className={fieldClassName} placeholder="例如日请求量、账号池数量、模型覆盖" />
        </Field>
      </div>
      <Field label="补充说明">
        <textarea
          className={`${fieldClassName} min-h-24 resize-y py-2 leading-6`}
          placeholder="例如是否一手、是否 sub to API、是否存在二级上游、售后 SLA"
        />
      </Field>
    </>
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
  type = "checkbox",
}: {
  label: string;
  name?: string;
  options: string[];
  type?: "checkbox" | "radio";
}) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold text-[#5a6061]">{label}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {options.map((option, index) => (
          <label
            key={option}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-[#adb3b4]/20 bg-white px-3 py-2 text-sm font-medium text-[#2d3435]"
          >
            <input
              type={type}
              name={name}
              defaultChecked={index === 0 || (type === "checkbox" && index === 1)}
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
  "h-11 w-full rounded-lg border border-[#adb3b4]/30 bg-white px-3 text-sm text-[#202829] outline-none transition placeholder:text-[#9aa2a3] focus:border-[#2d3435]";
