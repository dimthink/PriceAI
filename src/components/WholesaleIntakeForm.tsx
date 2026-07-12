"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import {
  CheckCircle2,
  ClipboardEdit,
  FileCheck2,
  Loader2,
  PackageSearch,
  Send,
  Store,
} from "lucide-react";

type WholesaleRole = "buyer" | "seller";
type WholesaleDirection = "api_transit" | "subscription_channel" | "other";

type FormState = {
  role: WholesaleRole;
  direction: WholesaleDirection;
  title: string;
  contact: string;
  proofUrl: string;
  details: string;
  website: string;
};

type SubmitState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

const BUYER_TEMPLATE = `采购身份：
想要什么：
预计量：
预算/结算方式：
可接受的来源：
验真/测试要求：
联系方式：
补充说明：`;

const SELLER_TEMPLATE = `源头类型：
可供给内容：
稳定供给量：
起批门槛：
批发价格/结算方式：
可提供的证明：
测试方式：
售后/风险边界：
联系方式：
补充说明：`;

const DIRECTION_OPTIONS: Array<{ value: WholesaleDirection; label: string }> = [
  { value: "api_transit", label: "API 中转" },
  { value: "subscription_channel", label: "卡网/订阅渠道" },
  { value: "other", label: "其他源头" },
];

const ROLE_COPY: Record<
  WholesaleRole,
  {
    title: string;
    description: string;
    titleLabel: string;
    titlePlaceholder: string;
    detailsLabel: string;
    icon: typeof PackageSearch;
  }
> = {
  buyer: {
    title: "我有批量需求",
    description: "一级代理、二级代理、企业采购或稳定需求方。",
    titleLabel: "需求标题",
    titlePlaceholder: "例如：企业 API 中转月付采购",
    detailsLabel: "需求内容",
    icon: PackageSearch,
  },
  seller: {
    title: "我有源头供给",
    description: "中转站、卡网商家、订阅渠道或其他可验证供给方。",
    titleLabel: "供给标题",
    titlePlaceholder: "例如：OpenAI 中转站稳定批发线",
    detailsLabel: "供给内容",
    icon: Store,
  },
};

const INITIAL_FORM: FormState = {
  role: "buyer",
  direction: "api_transit",
  title: "",
  contact: "",
  proofUrl: "",
  details: BUYER_TEMPLATE,
  website: "",
};

export function WholesaleIntakeForm() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = ROLE_COPY[form.role];

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectRole(role: WholesaleRole) {
    setForm((current) => ({
      ...current,
      role,
      details: shouldReplaceTemplate(current.details)
        ? role === "buyer"
          ? BUYER_TEMPLATE
          : SELLER_TEMPLATE
        : current.details,
    }));
    setSubmitState(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitState(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/wholesale-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          target: form.details,
          notes: form.details,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || "提交失败，请稍后再试。");
      }

      setSubmitState({
        type: "success",
        message: "已收到，线索会进入后台记录。",
      });
      setForm((current) => ({
        ...INITIAL_FORM,
        role: current.role,
        direction: current.direction,
        details: current.role === "buyer" ? BUYER_TEMPLATE : SELLER_TEMPLATE,
      }));
    } catch (error) {
      setSubmitState({
        type: "error",
        message: error instanceof Error ? error.message : "提交失败，请稍后再试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="rounded-lg border border-[#dfe4e5] bg-white p-4 sm:p-5"
      onSubmit={handleSubmit}
    >
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[#202829]">提交线索</h2>
        <p className="mt-1 text-sm leading-6 text-[#5a6061]">
          选择一类，按模板补全信息后提交。
        </p>
      </div>

      <fieldset>
        <legend className="sr-only">选择提交类型</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["buyer", "seller"] as const).map((role) => {
            const roleCopy = ROLE_COPY[role];
            const Icon = roleCopy.icon;
            const active = form.role === role;
            return (
              <button
                aria-pressed={active}
                className={`flex min-h-24 items-start gap-3 rounded-lg border p-4 text-left transition ${
                  active
                    ? "border-[#2d3435] bg-[#2d3435] text-[#f8f8f8]"
                    : "border-[#dfe4e5] bg-white text-[#202829] hover:border-[#adb3b4]"
                }`}
                key={role}
                type="button"
                onClick={() => selectRole(role)}
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block text-base font-semibold">{roleCopy.title}</span>
                  <span className={`mt-1 block text-sm leading-6 ${active ? "text-[#e7ecec]" : "text-[#5a6061]"}`}>
                    {roleCopy.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
        <TextField
          label={copy.titleLabel}
          name="title"
          onChange={(value) => updateField("title", value)}
          placeholder={copy.titlePlaceholder}
          required
          value={form.title}
        />
        <label className="block text-sm font-medium text-[#202829]">
          方向
          <select
            className="mt-1 block min-h-11 w-full rounded-lg border border-[#c8d0d1] bg-white px-3 py-2 text-sm text-[#202829] outline-none transition focus:border-[#2d3435] focus:ring-2 focus:ring-[#dfe4e5]"
            name="direction"
            onChange={(event) => updateField("direction", event.target.value as WholesaleDirection)}
            value={form.direction}
          >
            {DIRECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-[#202829]">
          {copy.detailsLabel}
          <span className="ml-1 text-[#9b3328]">*</span>
          <textarea
            className="mt-1 block min-h-[280px] w-full rounded-lg border border-[#c8d0d1] bg-white px-3 py-3 font-mono text-sm leading-6 text-[#202829] outline-none transition placeholder:text-[#5a6061] focus:border-[#2d3435] focus:ring-2 focus:ring-[#dfe4e5]"
            name="details"
            onChange={(event) => updateField("details", event.target.value)}
            required
            value={form.details}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label="联系方式"
          name="contact"
          onChange={(value) => updateField("contact", value)}
          placeholder="微信、Telegram、邮箱或企业微信"
          required
          value={form.contact}
        />
        <TextField
          label="证明链接（可选）"
          name="proofUrl"
          onChange={(value) => updateField("proofUrl", value)}
          placeholder="https://..."
          type="url"
          value={form.proofUrl}
        />
      </div>

      <input
        autoComplete="off"
        className="hidden"
        name="website"
        tabIndex={-1}
        value={form.website}
        onChange={(event) => updateField("website", event.target.value)}
      />

      {submitState ? (
        <div
          className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
            submitState.type === "success"
              ? "border-[#cbe7d4] bg-[#e8f3ec] text-[#2f7a4b]"
              : "border-[#f3c8c1] bg-[#fbe9e7] text-[#9b3328]"
          }`}
          role="status"
        >
          {submitState.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{submitState.message}</span>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 border-t border-[#dfe4e5] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-xs leading-5 text-[#5a6061]">
          <ClipboardEdit className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          提交仅用于线索记录，不代表担保或撮合承诺。
        </p>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#2d3435] px-4 py-2 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829] disabled:cursor-not-allowed disabled:bg-[#adb3b4]"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          {isSubmitting ? "提交中" : "提交线索"}
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  name,
  onChange,
  placeholder,
  required,
  type = "text",
  value,
}: {
  label: string;
  name: keyof FormState;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block text-sm font-medium text-[#202829]">
      {label}
      {required ? <span className="ml-1 text-[#9b3328]">*</span> : null}
      <input
        className="mt-1 block min-h-11 w-full rounded-lg border border-[#c8d0d1] bg-white px-3 py-2 text-sm text-[#202829] outline-none transition placeholder:text-[#5a6061] focus:border-[#2d3435] focus:ring-2 focus:ring-[#dfe4e5]"
        name={name}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function shouldReplaceTemplate(value: string) {
  const normalized = value.trim();
  return !normalized || normalized === BUYER_TEMPLATE || normalized === SELLER_TEMPLATE;
}
