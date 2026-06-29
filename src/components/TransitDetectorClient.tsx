"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import {
  Clock3,
  FileJson,
  KeyRound,
  Link2,
  Network,
  Play,
  ShieldAlert,
} from "lucide-react";
import { buildDetectorReportAssetUrl, buildPriceAiDetectorReportHref } from "@/lib/transit-detector-report";

type DetectorProtocol = "openai_chat" | "openai_responses" | "claude" | "gemini";
type DetectorMode = "quick" | "standard" | "deep";
type UpstreamType =
  | "unknown"
  | "official_api"
  | "official_cloud"
  | "subscription_pool"
  | "kiro_claude_code"
  | "reverse_client"
  | "mixed_pool";
type StatusTone = "pending" | "ready" | "muted" | "warn";
type DetectionStatus = "queued" | "running" | "done" | "error";

interface DetectorStatusPayload {
  job_id?: string;
  status?: "queued" | "running" | "done" | "error";
  status_url?: string;
  result_url?: string;
  image_url?: string;
  json_url?: string;
  error?: string;
  detail?: string;
}

interface DetectorClientProps {
  serviceUrl?: string;
}

interface PresetModel {
  id: string;
  label: string;
  model: string;
  protocol: DetectorProtocol;
  badge?: string;
}

interface DetectionResult {
  localId: string;
  modelLabel: string;
  model: string;
  protocolLabel: string;
  modeLabel: string;
  upstreamLabel: string;
  status: DetectionStatus;
  message: string;
  submittedAt: string;
  jobId?: string;
  resultUrl?: string;
  jsonUrl?: string;
  imageUrl?: string;
}

const presetModels: PresetModel[] = [
  { id: "gpt-5-5", label: "GPT 5.5", model: "gpt-5.5", protocol: "openai_chat", badge: "常用" },
  { id: "gpt-5-4", label: "GPT 5.4", model: "gpt-5.4", protocol: "openai_chat" },
  { id: "gpt-5-codex", label: "Codex", model: "gpt-5.3-codex", protocol: "openai_responses", badge: "Responses" },
  { id: "claude-opus-4-8", label: "Opus 4.8", model: "claude-opus-4-8", protocol: "claude" },
  { id: "claude-opus-4-7", label: "Opus 4.7", model: "claude-opus-4-7", protocol: "claude" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", model: "claude-sonnet-4-6", protocol: "claude" },
  { id: "gemini-3-1-pro", label: "Gemini 3.1 Pro", model: "gemini-3.1-pro", protocol: "gemini" },
  { id: "custom", label: "自定义", model: "", protocol: "openai_chat" },
];

const protocolLabels: Record<DetectorProtocol, string> = {
  openai_chat: "OpenAI Chat Completions",
  openai_responses: "OpenAI Responses",
  claude: "Claude",
  gemini: "Gemini",
};

const protocolHints: Record<DetectorProtocol, string> = {
  openai_chat: "OpenAI /v1/chat/completions 格式接口",
  openai_responses: "OpenAI /v1/responses 格式接口，适合 Codex 等 Agent 工具链",
  claude: "Anthropic / Claude 格式接口",
  gemini: "Google Gemini 兼容接口",
};

const detectorProtocolEndpoints: Record<DetectorProtocol, string> = {
  openai_chat: "openai-chat",
  openai_responses: "openai-responses",
  claude: "claude",
  gemini: "gemini",
};

const modeOptions: Array<{ value: DetectorMode; label: string; hint: string }> = [
  { value: "quick", label: "快速", hint: "协议、模型名、基础响应" },
  { value: "standard", label: "标准", hint: "能力指纹和计费口径" },
  { value: "deep", label: "深度", hint: "多轮、长上下文、稳定性采样" },
];

const upstreamOptions: Array<{ value: UpstreamType; label: string; detail: string }> = [
  { value: "unknown", label: "暂不确定", detail: "先按未知来源处理，结论会更保守。" },
  { value: "official_api", label: "官方 API 转发", detail: "重点核验模型能力、Token 用量和响应特征。" },
  { value: "official_cloud", label: "Bedrock / Vertex 等官方云", detail: "区分云厂商网关特征，不简单判定为假模型。" },
  { value: "subscription_pool", label: "订阅账号池", detail: "关注上下文限制、并发限制和账号池波动。" },
  { value: "kiro_claude_code", label: "Kiro / Claude Code 账号转 API", detail: "关注账号通道限额、封禁和上下文差异。" },
  { value: "reverse_client", label: "客户端逆向", detail: "风险最高，需要加强异常、限流和稳定性检测。" },
  { value: "mixed_pool", label: "混合线路", detail: "需要多次采样，不同请求可能命中不同上游。" },
];

export function TransitDetectorClient({ serviceUrl = "" }: DetectorClientProps) {
  const runIdRef = useRef(0);
  const defaultPreset = presetModels[0];
  const [selectedModelId, setSelectedModelId] = useState(defaultPreset.id);
  const [protocol, setProtocol] = useState<DetectorProtocol>(defaultPreset.protocol);
  const [mode, setMode] = useState<DetectorMode>("standard");
  const [upstream, setUpstream] = useState<UpstreamType>("unknown");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(defaultPreset.model);
  const [apiKey, setApiKey] = useState("");
  const [longContext, setLongContext] = useState(false);
  const [taskStatus, setTaskStatus] = useState<DetectionStatus | "idle">("idle");
  const [results, setResults] = useState<DetectionResult[]>([]);

  const normalizedServiceUrl = serviceUrl.trim().replace(/\/$/, "");
  const serviceConnected = Boolean(normalizedServiceUrl);
  const selectedPreset = presetModels.find((item) => item.id === selectedModelId) ?? defaultPreset;
  const selectedMode = modeOptions.find((item) => item.value === mode) ?? modeOptions[1];
  const selectedUpstream = upstreamOptions.find((item) => item.value === upstream) ?? upstreamOptions[0];
  const activeDetection = taskStatus === "queued" || taskStatus === "running";
  const canSubmit = serviceConnected && Boolean(baseUrl.trim() && apiKey.trim() && model.trim()) && !activeDetection;

  const summaryText = useMemo(() => {
    if (!results.length) return "暂无检测记录";
    const done = results.filter((item) => item.status === "done").length;
    const failed = results.filter((item) => item.status === "error").length;
    return `${results.length} 次检测，${done} 次完成${failed ? `，${failed} 次失败` : ""}`;
  }, [results]);

  function handlePresetClick(preset: PresetModel) {
    setSelectedModelId(preset.id);
    setProtocol(preset.protocol);
    setModel(preset.model);
    if (preset.protocol === "gemini") {
      setLongContext(false);
    }
  }

  function handleModelInput(nextModel: string) {
    setModel(nextModel);
    if (selectedModelId !== "custom") {
      setSelectedModelId("custom");
    }
  }

  function updateResult(localId: string, patch: Partial<DetectionResult>) {
    setResults((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRunId = runIdRef.current + 1;
    const localId = `${nextRunId}-${selectedModelId}`;
    const submittedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    runIdRef.current = nextRunId;

    const nextResult: DetectionResult = {
      localId,
      modelLabel: selectedPreset.id === "custom" ? "自定义模型" : selectedPreset.label,
      model: model.trim(),
      protocolLabel: protocolLabels[protocol],
      modeLabel: selectedMode.label,
      upstreamLabel: selectedUpstream.label,
      status: "queued",
      message: "正在提交检测任务。",
      submittedAt,
    };
    setResults((current) => [nextResult, ...current].slice(0, 12));

    if (!normalizedServiceUrl) {
      setTaskStatus("error");
      updateResult(localId, { status: "error", message: "检测服务未连接。" });
      return;
    }

    setTaskStatus("queued");

    try {
      const payload = new FormData();
      payload.set("base_url", baseUrl.trim());
      payload.set("api_key", apiKey.trim());
      payload.set("model", model.trim());
      payload.set("mode", mode === "deep" ? "full" : mode);
      if (protocol !== "gemini") {
        payload.set("include_long_context", longContext ? "true" : "false");
        payload.set("include_long_context_extreme", "false");
      }

      const detectorProtocol = detectorProtocolEndpoints[protocol];
      const response = await fetch(`${normalizedServiceUrl}/api/detect/${detectorProtocol}`, {
        method: "POST",
        body: payload,
      });
      const data = (await response.json().catch(() => ({}))) as DetectorStatusPayload;
      if (!response.ok) {
        throw new Error(data.detail || data.error || "检测后端拒绝了这次请求。");
      }
      if (!data.job_id || !data.status_url) {
        throw new Error("检测后端没有返回任务编号。");
      }
      if (runIdRef.current !== nextRunId) return;

      setTaskStatus("running");
      updateResult(localId, {
        jobId: data.job_id,
        status: "running",
        message: "检测运行中，通常需要 30 到 90 秒。",
      });
      await pollDetectorJob(data.status_url, nextRunId, localId);
    } catch (error) {
      if (runIdRef.current !== nextRunId) return;
      const message = normalizeDetectorError(error);
      setTaskStatus("error");
      updateResult(localId, { status: "error", message });
    }
  }

  async function pollDetectorJob(statusUrl: string, runId: number, localId: string) {
    const statusEndpoint = statusUrl.startsWith("http") ? statusUrl : `${normalizedServiceUrl}${statusUrl}`;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      await sleep(attempt < 3 ? 1000 : 2500);
      if (runIdRef.current !== runId) return;

      const response = await fetch(statusEndpoint, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as DetectorStatusPayload;
      if (!response.ok) {
        throw new Error(data.detail || data.error || "读取检测状态失败。");
      }

      if (data.status === "done") {
        const nextResultUrl = data.job_id ? buildPriceAiDetectorReportHref(data.job_id) : "";
        const nextJsonUrl = data.json_url ? buildDetectorReportAssetUrl(normalizedServiceUrl, data.json_url) : "";
        const nextImageUrl = data.image_url ? buildDetectorReportAssetUrl(normalizedServiceUrl, data.image_url) : "";
        if (runIdRef.current !== runId) return;
        setTaskStatus("done");
        updateResult(localId, {
          resultUrl: nextResultUrl,
          jsonUrl: nextJsonUrl,
          imageUrl: nextImageUrl,
          status: "done",
          message: "检测完成，已生成报告。",
        });
        return;
      }

      if (data.status === "error") {
        throw new Error(data.error || "检测任务失败。");
      }

      if (runIdRef.current === runId) {
        const queued = data.status === "queued";
        setTaskStatus(queued ? "queued" : "running");
        updateResult(localId, {
          status: queued ? "queued" : "running",
          message: queued ? "任务排队中。" : "检测运行中。",
        });
      }
    }

    throw new Error("检测等待超时，稍后可用任务编号查询报告。");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-white ring-1 ring-[#adb3b4]/15">
        <div className="border-b border-[#edf0f1] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#202829]">接口配置</h2>
              <p className="mt-1 text-sm leading-6 text-[#5a6061]">
                填入中转站 API 地址和临时 Key，选择一个预置模型后开始检测。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={serviceConnected ? "ready" : "warn"}>
                {serviceConnected ? "检测服务已连接" : "检测服务未连接"}
              </StatusPill>
              <StatusPill tone={results.length ? "pending" : "muted"}>{summaryText}</StatusPill>
            </div>
          </div>
        </div>

        <form className="space-y-5 px-5 py-5" onSubmit={handleSubmit}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">API 接口地址</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="输入中转站接口地址"
                className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm text-[#202829] outline-none transition placeholder:text-[#7a8284] focus:border-[#45bf78]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">API Key</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a6061]" />
                <input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  type="password"
                  autoComplete="off"
                  placeholder="粘贴临时 Key"
                  className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white pl-9 pr-3 text-sm text-[#202829] outline-none transition placeholder:text-[#7a8284] focus:border-[#45bf78]"
                />
              </div>
            </label>
          </div>

          <div>
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <label className="text-sm font-semibold text-[#202829]">目标模型</label>
              <span className="text-xs leading-5 text-[#5a6061]">点击模型会自动匹配接口协议，仍可手动修改模型名。</span>
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
              {presetModels.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  className={`relative min-h-[66px] rounded-lg border px-3 py-2 text-left transition ${
                    selectedModelId === preset.id
                      ? "border-[#45bf78] bg-[#edf8f1] text-[#202829]"
                      : "border-[#dfe4e5] bg-[#f9f9f9] text-[#5a6061] hover:border-[#adb3b4]"
                  }`}
                >
                  {preset.badge ? (
                    <span className="absolute -top-2 left-3 rounded-full bg-[#45bf78] px-1.5 py-0.5 text-[0.62rem] font-semibold text-white">
                      {preset.badge}
                    </span>
                  ) : null}
                  <span className="block truncate text-sm font-semibold">{preset.label}</span>
                  <span className="mt-1 block truncate text-xs">{preset.model || "手动输入模型名"}</span>
                  <span className="mt-1 block text-[0.68rem] font-semibold text-[#5a6061]">{protocolLabels[preset.protocol]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_210px]">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">当前提交模型名</span>
              <input
                value={model}
                onChange={(event) => handleModelInput(event.target.value)}
                placeholder="输入要检测的模型名"
                className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm text-[#202829] outline-none transition placeholder:text-[#7a8284] focus:border-[#45bf78]"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">接口协议</span>
              <select
                value={protocol}
                onChange={(event) => {
                  const nextProtocol = event.target.value as DetectorProtocol;
                  setProtocol(nextProtocol);
                  if (nextProtocol === "gemini") setLongContext(false);
                }}
                className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm font-medium text-[#202829] outline-none transition focus:border-[#45bf78]"
              >
                {Object.entries(protocolLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">线路类型</span>
              <select
                value={upstream}
                onChange={(event) => setUpstream(event.target.value as UpstreamType)}
                className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm font-medium text-[#202829] outline-none transition focus:border-[#45bf78]"
              >
                {upstreamOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[#202829]">检测强度</label>
              <div className="grid gap-2 md:grid-cols-3">
                {modeOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setMode(item.value)}
                    className={`rounded-lg border px-3 py-3 text-left transition ${
                      mode === item.value
                        ? "border-[#45bf78]/60 bg-[#edf8f1] text-[#202829]"
                        : "border-[#dfe4e5] bg-[#f9f9f9] text-[#5a6061] hover:border-[#adb3b4]"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs leading-5">{item.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <label
              className={`flex min-h-[82px] items-center justify-between gap-3 rounded-lg border border-[#dfe4e5] bg-[#f9f9f9] px-3 py-3 text-sm text-[#202829] ${
                protocol === "gemini" ? "opacity-65" : "cursor-pointer"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-semibold">长上下文</span>
                <span className="mt-0.5 block text-xs leading-5 text-[#5a6061]">
                  {protocol === "gemini" ? "Gemini 暂不启用" : "确认上下文上限"}
                </span>
              </span>
              <input
                type="checkbox"
                checked={longContext}
                disabled={protocol === "gemini"}
                onChange={(event) => setLongContext(event.target.checked)}
                className="h-4 w-4 shrink-0 accent-[#45bf78]"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#edf0f1] pt-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-[720px] text-xs leading-5 text-[#5a6061]">
              当前选择：{protocolLabels[protocol]} · {protocolHints[protocol]} · {selectedUpstream.detail}
              Key 会随请求提交给独立检测服务，不会写入 PriceAI 数据库。
            </p>
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#202829] px-5 text-sm font-semibold text-white transition hover:bg-[#2d3435] disabled:cursor-not-allowed disabled:bg-[#adb3b4]"
              disabled={!canSubmit}
            >
              <Play className="h-4 w-4" />
              {submitLabel(taskStatus, serviceConnected)}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg bg-white ring-1 ring-[#adb3b4]/15">
        <div className="flex flex-col gap-2 border-b border-[#edf0f1] px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#202829]">检测结果</h2>
            <p className="mt-1 text-sm leading-6 text-[#5a6061]">每次检测会生成一行记录，完成后可打开独立报告查看完整证据。</p>
          </div>
          <StatusPill tone={taskTone(taskStatus)}>{statusLabel(taskStatus)}</StatusPill>
        </div>

        {results.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
                <tr>
                  <th className="px-5 py-3">模型</th>
                  <th className="px-5 py-3">协议</th>
                  <th className="px-5 py-3">检测强度</th>
                  <th className="px-5 py-3">线路类型</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">提交时间</th>
                  <th className="px-5 py-3 text-right">报告</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f1]">
                {results.map((item) => (
                  <tr key={item.localId} className={item.status === "done" ? "bg-[#f4fbf7]" : "bg-white"}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-[#202829]">{item.modelLabel}</p>
                      <p className="mt-1 break-all text-xs text-[#5a6061]">{item.model}</p>
                    </td>
                    <td className="px-5 py-4 text-[#2d3435]">{item.protocolLabel}</td>
                    <td className="px-5 py-4 text-[#2d3435]">{item.modeLabel}</td>
                    <td className="px-5 py-4 text-[#2d3435]">{item.upstreamLabel}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <StatusPill tone={resultTone(item.status)}>{resultStatusLabel(item.status)}</StatusPill>
                        <span className="max-w-[220px] text-xs leading-5 text-[#5a6061]">{item.message}</span>
                        {item.jobId ? <span className="max-w-[220px] break-all text-[0.68rem] text-[#7a8284]">任务：{item.jobId}</span> : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-[#5a6061]">{item.submittedAt}</td>
                    <td className="px-5 py-4 text-right">
                      {item.resultUrl ? (
                        <div className="flex items-center justify-end gap-2">
                          {item.jsonUrl ? (
                            <a
                              href={item.jsonUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#5a6061] ring-1 ring-[#adb3b4]/18 transition hover:bg-[#f5f7f7] hover:text-[#202829]"
                              aria-label="打开报告 JSON"
                              title="打开报告 JSON"
                            >
                              <FileJson className="h-4 w-4" />
                            </a>
                          ) : null}
                          <a
                            href={item.resultUrl}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-[#202829] px-4 text-xs font-semibold text-white transition hover:bg-[#2d3435]"
                          >
                            打开报告
                          </a>
                        </div>
                      ) : (
                        <span className="text-xs text-[#7a8284]">等待返回</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-10">
            <div className="flex flex-col gap-3 rounded-lg bg-[#f9f9f9] px-4 py-5 text-sm text-[#5a6061] ring-1 ring-[#adb3b4]/12 sm:flex-row sm:items-center">
              <Clock3 className="h-5 w-5 shrink-0 text-[#5a6061]" />
              <div>
                <p className="font-semibold text-[#202829]">还没有检测结果</p>
                <p className="mt-1 leading-6">选择上方预置模型并开始检测后，结果会按时间倒序显示在这里。</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <PrincipleItem icon={<Link2 className="h-4 w-4" />} title="同题基线" text="把官方或可信线路作为参照，不只看一次回答像不像。" />
        <PrincipleItem icon={<ShieldAlert className="h-4 w-4" />} title="来源风险" text="官方 API、云厂商、账号池、逆向线路会分开标注。" />
        <PrincipleItem icon={<Network className="h-4 w-4" />} title="多次采样" text="混合池和账号池需要重复请求，单次结果不能直接下结论。" />
      </section>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeDetectorError(error: unknown) {
  if (!(error instanceof Error)) return "检测提交失败，请稍后再试。";
  if (error.message === "Failed to fetch") {
    return "无法连接检测后端。请确认本地 8017 服务已启动，并允许来自当前页面的跨域请求。";
  }
  return error.message;
}

function StatusPill({ tone, children }: { tone: StatusTone; children: string }) {
  const className =
    tone === "ready"
      ? "bg-[#edf8f1] text-[#278a57] ring-[#45bf78]/20"
      : tone === "warn"
        ? "bg-[#fff6e8] text-[#8a4c00] ring-[#e7b65d]/30"
        : tone === "muted"
          ? "bg-[#f2f4f4] text-[#5a6061] ring-[#dfe4e5]"
          : "bg-[#eef3f4] text-[#41666b] ring-[#c9d8da]";

  return (
    <span className={`inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold ring-1 ${className}`}>
      {children}
    </span>
  );
}

function taskTone(status: DetectionStatus | "idle"): StatusTone {
  if (status === "done") return "ready";
  if (status === "error") return "warn";
  if (status === "idle") return "muted";
  return "pending";
}

function resultTone(status: DetectionStatus): StatusTone {
  if (status === "done") return "ready";
  if (status === "error") return "warn";
  return "pending";
}

function statusLabel(status: DetectionStatus | "idle") {
  if (status === "queued") return "排队中";
  if (status === "running") return "检测中";
  if (status === "done") return "已完成";
  if (status === "error") return "失败";
  return "未开始";
}

function resultStatusLabel(status: DetectionStatus) {
  if (status === "queued") return "排队中";
  if (status === "running") return "检测中";
  if (status === "done") return "已完成";
  return "失败";
}

function submitLabel(status: DetectionStatus | "idle", serviceConnected: boolean) {
  if (!serviceConnected) return "检测服务未连接";
  if (status === "queued") return "提交中";
  if (status === "running") return "检测中";
  return "开始检测";
}

function PrincipleItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-lg bg-white p-4 ring-1 ring-[#adb3b4]/15">
      <div className="flex gap-3">
        <div className="mt-0.5 text-[#45bf78]">{icon}</div>
        <div>
          <p className="text-sm font-semibold text-[#202829]">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-[#5a6061]">{text}</p>
        </div>
      </div>
    </div>
  );
}
