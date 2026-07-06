"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Globe2, KeyRound, Send, ShieldCheck, UserRound, X } from "lucide-react";
import {
  TRANSIT_MODEL_FAMILY_OPTIONS,
  TRANSIT_STANDARD_MODELS,
} from "@/data/api-transit/types";

type DialogMode = "submit" | "merchant";
type AccessMode = "public_only" | "test_key" | "test_account";

const modelOptions = [...TRANSIT_STANDARD_MODELS];

const systemTypeOptions = ["不确定", "Sub2API", "New API", "One API", "自研系统"];
const channelClaimOptions = ["官方 API", "云厂商", "一手自建号池", "一手批发", "二级分销", "混合渠道", "未披露"];
const accessModeOptions: Array<{
  id: AccessMode;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "public_only",
    title: "公开资料接入",
    description: "提供价格页或监测页，PriceAI 自动抓取公开信息。",
    icon: <Globe2 className="h-4 w-4" />,
  },
  {
    id: "test_key",
    title: "测试 Key 接入",
    description: "提交低额度专用 Key，用于模型列表和可用性抽样。",
    icon: <KeyRound className="h-4 w-4" />,
  },
  {
    id: "test_account",
    title: "测试账号接入",
    description: "提交专用测试账号，适合必须登录后台读取分组的站点。",
    icon: <UserRound className="h-4 w-4" />,
  },
];

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
              <span className="sm:hidden">入驻</span>
              <span className="hidden sm:inline">商家入驻</span>
            </>
          ) : (
            "商家入驻"
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
            <p className="mt-1">已进入 API 中转站待核验队列，审核通过后再进入公开榜单或监控池。</p>
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
              const payload = buildSubmissionPayload(mode, formData);

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
            {mode === "submit" ? <SubmitFields /> : <MerchantFields />}
            {error ? (
              <p className="rounded-lg bg-[#fbe9e7] px-3 py-2 text-xs leading-5 text-[#9b3328]">
                {error}
              </p>
            ) : null}
            <SubmissionSafetyNote mode={mode} />
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
                {submitting ? "提交中..." : mode === "submit" ? "提交到待核验" : "提交入驻意向"}
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
          <input className={fieldClassName} name="name" placeholder="例如 MiCu API" />
        </Field>
        <Field label="站点或 API 地址">
          <input className={fieldClassName} name="url" placeholder="https://example.com" type="url" required />
        </Field>
        <Field label="你判断的渠道类型">
          <select className={fieldClassName} name="channelType" defaultValue="不确定，交给平台核验">
            <option>不确定，交给平台核验</option>
            <option>一手自建号池</option>
            <option>官方 API</option>
            <option>混合渠道</option>
            <option>二级分销</option>
          </select>
        </Field>
        <Field label="看到的价格或倍率">
          <input className={fieldClassName} name="priceHint" placeholder="例如 GPT Image 2 0.3x / Sora 2 Pro 1.2x" />
        </Field>
      </div>
      <OptionGroup label="支持模型" name="models" options={modelOptions} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="售后或联系入口">
          <input className={fieldClassName} name="contact" placeholder="QQ / 微信 / Telegram / 工单地址" />
        </Field>
        <Field label="你从哪里看到的">
          <input className={fieldClassName} name="sourceHint" placeholder="朋友推荐 / 群聊 / 商家官网" />
        </Field>
      </div>
      <Field label="补充说明">
        <textarea
          name="notes"
          className={`${fieldClassName} min-h-24 resize-y py-2 leading-6`}
          placeholder="例如是否充值过、是否遇到限速、是否怀疑二级上游"
        />
      </Field>
    </>
  );
}

function MerchantFields() {
  const [accessMode, setAccessMode] = useState<AccessMode>("public_only");

  return (
    <>
      <OptionGroup
        label="你的角色"
        type="radio"
        name="merchant-role"
        options={["总渠道商", "中转站商家", "个人渠道"]}
        defaultSelected={["中转站商家"]}
      />
      <OptionGroup label="希望合作什么" name="cooperation" options={["公开展示", "提供测试额度", "补充渠道资料", "纠错 / 申诉", "批发合作", "其他"]} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="站点名称或域名">
          <input className={fieldClassName} name="name" placeholder="渠道名称 / 官网域名" required />
        </Field>
        <Field label="站点或 API 地址">
          <input className={fieldClassName} name="url" placeholder="https://example.com" type="url" required />
        </Field>
        <Field label="系统类型">
          <select className={fieldClassName} name="systemType" defaultValue="不确定">
            {systemTypeOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="API Base URL">
          <input className={fieldClassName} name="apiBaseUrl" placeholder="https://example.com/v1" type="url" />
        </Field>
        <Field label="公开价格页">
          <input className={fieldClassName} name="pricingUrl" placeholder="https://example.com/pricing" type="url" />
        </Field>
        <Field label="公开监测页">
          <input className={fieldClassName} name="monitorUrl" placeholder="https://example.com/status" type="url" />
        </Field>
        <Field label="用户优惠码">
          <input className={fieldClassName} name="couponCode" placeholder="例如 PRICEAI / 首充折扣码" />
        </Field>
        <Field label="优惠 / AFF 链接">
          <input className={fieldClassName} name="commercialUrl" placeholder="https://example.com/register?aff=..." type="url" />
        </Field>
      </div>
      <AccessModeSection accessMode={accessMode} onChange={setAccessMode} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="可接受合作规则">
          <select className={fieldClassName} name="commercialRule" defaultValue="仅提交资料，不参与优选">
            <option>仅提交资料，不参与优选</option>
            <option>按月展示费</option>
            <option>一次性保证金</option>
            <option>合作规则待定</option>
          </select>
        </Field>
        <Field label="监测预算或频率限制">
          <input className={fieldClassName} name="monitorBudgetLimit" placeholder="例如每天 50 次 / 每小时 1 次 / 仅入驻验真" />
        </Field>
      </div>
      <OptionGroup label="渠道来源声明" name="channelClaims" options={channelClaimOptions} />
      <OptionGroup
        label="准入资料准备情况"
        name="admission"
        options={["可说明上游渠道", "可拆分 Pro / Plus / Max 池", "有固定售后入口", "接受异常下架机制", "可提供测试额度", "可提供历史稳定性证明"]}
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="联系渠道">
          <input className={fieldClassName} name="contact" placeholder="QQ / 微信 / Telegram，任选一种，便于及时联系" />
        </Field>
        <Field label="大概供给规模">
          <input className={fieldClassName} name="supplyScale" placeholder="例如日请求量、账号池数量、模型覆盖" />
        </Field>
      </div>
      <Field label="分组和倍率说明">
        <textarea
          name="groupPricingNotes"
          className={`${fieldClassName} min-h-24 resize-y py-2 leading-6`}
          placeholder="例如充值 1:1；GPT 0.30x，Gemini 0.50x，DeepSeek 0.80x；官方池和自建池分别是什么倍率"
        />
      </Field>
      <Field label="优惠和商业关系说明">
        <textarea
          name="commercialNotes"
          className={`${fieldClassName} min-h-20 resize-y py-2 leading-6`}
          placeholder="例如首充 9 折、AFF 比例、是否愿意公开标注赞助 / AFF"
        />
      </Field>
      <Field label="补充说明">
        <textarea
          name="notes"
          className={`${fieldClassName} min-h-24 resize-y py-2 leading-6`}
          placeholder="例如是否一手、是否 sub to API、是否存在二级上游、售后 SLA"
        />
      </Field>
    </>
  );
}

function AccessModeSection({
  accessMode,
  onChange,
}: {
  accessMode: AccessMode;
  onChange: (value: AccessMode) => void;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-[#dfe4e5] bg-[#f8fafa] p-3">
      <div>
        <p className="text-xs font-semibold text-[#5a6061]">数据接入方式</p>
        <p className="mt-1 text-xs leading-5 text-[#5a6061]">
          默认走公开资料。没有公开页时，可以提交低额度测试 Key 或专用测试账号，后台只显示凭据状态，不展示明文。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {accessModeOptions.map((option) => {
          const active = accessMode === option.id;
          return (
            <label
              key={option.id}
              className={`flex min-h-[92px] cursor-pointer flex-col gap-2 rounded-lg border px-3 py-3 transition ${
                active
                  ? "border-[#2d3435] bg-[#eef3f8] text-[#202829]"
                  : "border-[#adb3b4]/20 bg-white/70 text-[#5a6061] hover:bg-white"
              }`}
            >
              <input
                type="radio"
                name="accessMode"
                value={option.id}
                checked={active}
                onChange={() => onChange(option.id)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 text-sm font-bold">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${active ? "bg-[#2d3435] text-white" : "bg-[#edf0f1] text-[#5a6061]"}`}>
                  {option.icon}
                </span>
                {option.title}
              </span>
              <span className="text-xs leading-5">{option.description}</span>
            </label>
          );
        })}
      </div>

      {accessMode === "public_only" ? <PublicAccessFields /> : null}
      {accessMode === "test_key" ? <TestKeyFields /> : null}
      {accessMode === "test_account" ? <TestAccountFields /> : null}
    </section>
  );
}

function PublicAccessFields() {
  return (
    <div className="rounded-lg bg-[#eef3f8] px-3 py-2 text-xs leading-5 text-[#47657a]">
      选择公开资料接入时，请至少填写上方的公开价格页或公开监测页。系统会优先尝试抓取价格接口、状态页和模型分组。
    </div>
  );
}

function TestKeyFields() {
  return (
    <div className="space-y-3 rounded-lg border border-[#dfe4e5] bg-white p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="低额度测试 API Key">
          <input
            className={fieldClassName}
            name="credentialApiKey"
            placeholder="sk-..."
            type="password"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="额度 / 频率边界">
          <input className={fieldClassName} name="credentialBudgetLimit" placeholder="例如 10 美元以内 / 每小时 1 次" required />
        </Field>
        <Field label="凭据过期时间">
          <input className={fieldClassName} name="credentialExpiresAt" type="date" />
        </Field>
        <Field label="允许测试的模型">
          <input className={fieldClassName} name="credentialAllowedModelsText" placeholder="例如 GPT 5.5, Nano Banana Pro, Sora 2" />
        </Field>
      </div>
      <CredentialScopeFields />
      <CredentialSafetyConfirm label="我确认这是低额度专用测试 Key，不是主账号或长期高额度 Key。" />
    </div>
  );
}

function TestAccountFields() {
  return (
    <div className="space-y-3 rounded-lg border border-[#dfe4e5] bg-white p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="登录地址">
          <input className={fieldClassName} name="credentialLoginUrl" placeholder="https://example.com/login" type="url" required />
        </Field>
        <Field label="测试账号">
          <input className={fieldClassName} name="credentialUsername" placeholder="专用测试账号 / 邮箱" autoComplete="off" required />
        </Field>
        <Field label="测试账号密码">
          <input className={fieldClassName} name="credentialPassword" type="password" autoComplete="off" required />
        </Field>
        <Field label="额度 / 频率边界">
          <input className={fieldClassName} name="credentialBudgetLimit" placeholder="例如账户内仅放 10 美元以内额度" required />
        </Field>
        <Field label="凭据过期时间">
          <input className={fieldClassName} name="credentialExpiresAt" type="date" />
        </Field>
        <Field label="允许测试的模型">
          <input className={fieldClassName} name="credentialAllowedModelsText" placeholder="例如只测 Gemini / DeepSeek / 图片生成分组" />
        </Field>
      </div>
      <CredentialScopeFields />
      <Field label="登录或创建 Key 说明">
        <textarea
          name="credentialNotes"
          className={`${fieldClassName} min-h-20 resize-y py-2 leading-6`}
          placeholder="例如登录后在哪个菜单创建临时 Key、哪些分组不要测试"
        />
      </Field>
      <CredentialSafetyConfirm label="我确认这是专用测试账号，不是主账号；账号内只保留低额度测试余额。" />
    </div>
  );
}

function CredentialScopeFields() {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg bg-[#f8fafa] p-3 md:grid-cols-2">
      <Field label="Key 所属分组">
        <input className={fieldClassName} name="credentialGroupName" placeholder="例如 gpt-pro号池 / kiro / Plus-经济通道" />
      </Field>
      <Field label="分组 ID（可选）">
        <input className={fieldClassName} name="credentialGroupId" placeholder="例如 8 / 4" />
      </Field>
      <Field label="监测模型族">
        <select className={fieldClassName} name="credentialFamily" defaultValue="">
          <option value="">自动判断</option>
          {TRANSIT_MODEL_FAMILY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </Field>
      <Field label="号池标签">
        <input className={fieldClassName} name="credentialAccountPool" placeholder="例如 Plus / Pro / Max / Kiro" />
      </Field>
    </div>
  );
}

function CredentialSafetyConfirm({ label }: { label: string }) {
  return (
    <label className="flex items-start gap-2 rounded-lg bg-[#fff7e8] px-3 py-2 text-xs leading-5 text-[#7a541b]">
      <input name="credentialSafetyConfirmed" value="yes" type="checkbox" required className="mt-0.5 h-4 w-4 accent-[#2d3435]" />
      <span>{label} PriceAI 仅用于价格解析、模型可用性抽样和监测，可要求删除。</span>
    </label>
  );
}

function SubmissionSafetyNote({ mode }: { mode: DialogMode }) {
  if (mode === "merchant") {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-[#eef3f8] px-3 py-2 text-xs leading-5 text-[#47657a]">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>测试 Key / 测试账号会单独加密保存，后台列表只显示是否已提供和额度说明，不显示明文。</span>
      </p>
    );
  }

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
  type = "checkbox",
  defaultSelected,
}: {
  label: string;
  name?: string;
  options: string[];
  type?: "checkbox" | "radio";
  defaultSelected?: string[];
}) {
  const selected = new Set(defaultSelected || []);
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
              value={option}
              defaultChecked={selected.has(option) || (type === "radio" && !selected.size && index === 0)}
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

function buildSubmissionPayload(mode: DialogMode, formData: FormData) {
  const get = (name: string) => String(formData.get(name) || "").trim();
  const getAll = (name: string) => formData.getAll(name).map((value) => String(value).trim()).filter(Boolean);
  const accessMode = normalizeAccessMode(get("accessMode"));
  const credentialAllowedModels = [
    ...splitLooseList(get("credentialAllowedModelsText")),
    ...getAll("models"),
  ];
  const credentialGroupName = get("credentialGroupName");
  const credentialAllowedGroups = [
    credentialGroupName,
    ...splitLooseList(get("credentialAllowedGroupsText")),
  ].filter(Boolean);
  const notes = [
    get("notes"),
    get("priceHint") ? `价格线索：${get("priceHint")}` : "",
    get("sourceHint") ? `来源：${get("sourceHint")}` : "",
    get("supplyScale") ? `供给规模：${get("supplyScale")}` : "",
    get("groupPricingNotes") ? `分组倍率说明：${get("groupPricingNotes")}` : "",
    get("commercialNotes") ? `优惠/商业说明：${get("commercialNotes")}` : "",
  ].filter(Boolean).join("\n");

  return {
    type: mode === "merchant" ? "merchant" : "user",
    name: get("name"),
    url: get("url"),
    apiBaseUrl: get("apiBaseUrl") || undefined,
    pricingUrl: get("pricingUrl") || undefined,
    contact: get("contact"),
    notes,
    models: getAll("models"),
    accessMode: mode === "merchant" ? accessMode : "public_only",
    credentials: mode === "merchant" ? buildCredentialPayload(accessMode, formData, credentialAllowedModels) : undefined,
    meta: {
      channelType: get("channelType") || null,
      merchantRole: get("merchant-role") || null,
      cooperation: getAll("cooperation"),
      admission: getAll("admission"),
      commercialRule: get("commercialRule") || null,
      systemType: get("systemType") || null,
      monitorUrl: get("monitorUrl") || null,
      couponCode: get("couponCode") || null,
      commercialUrl: get("commercialUrl") || null,
      commercialNotes: get("commercialNotes") || null,
      channelClaims: getAll("channelClaims"),
      groupPricingNotes: get("groupPricingNotes") || null,
      accessMode: mode === "merchant" ? accessMode : "public_only",
      credentialBudgetLimit: get("credentialBudgetLimit") || null,
      credentialExpiresAt: get("credentialExpiresAt") || null,
      credentialAllowedModels,
      credentialAllowedGroups,
      credentialGroupName: credentialGroupName || null,
      credentialGroupId: get("credentialGroupId") || null,
      credentialAccountPool: get("credentialAccountPool") || null,
      credentialFamily: get("credentialFamily") || null,
      monitorBudgetLimit: get("monitorBudgetLimit") || null,
    },
  };
}

function buildCredentialPayload(accessMode: AccessMode, formData: FormData, allowedModels: string[]) {
  const get = (name: string) => String(formData.get(name) || "").trim();
  const groupName = get("credentialGroupName");
  if (accessMode === "public_only") return { accessMode };

  return {
    accessMode,
    safetyConfirmed: formData.get("credentialSafetyConfirmed") === "yes",
    apiKey: accessMode === "test_key" ? get("credentialApiKey") : undefined,
    loginUrl: accessMode === "test_account" ? get("credentialLoginUrl") : undefined,
    username: accessMode === "test_account" ? get("credentialUsername") : undefined,
    password: accessMode === "test_account" ? get("credentialPassword") : undefined,
    budgetLimit: get("credentialBudgetLimit") || undefined,
    expiresAt: get("credentialExpiresAt") || undefined,
    allowedModels,
    allowedGroups: [groupName, ...splitLooseList(get("credentialAllowedGroupsText"))].filter(Boolean),
    groupName: groupName || undefined,
    groupId: get("credentialGroupId") || undefined,
    accountPool: get("credentialAccountPool") || undefined,
    family: get("credentialFamily") || undefined,
    notes: get("credentialNotes") || undefined,
  };
}

function normalizeAccessMode(value: string): AccessMode {
  if (value === "test_key" || value === "test_account" || value === "public_only") return value;
  return "public_only";
}

function splitLooseList(value: string): string[] {
  return value
    .split(/[,，、\n|｜]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);
}
