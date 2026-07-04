"use client";

import Script from "next/script";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock3,
  Eye,
  EyeOff,
  FileJson,
  KeyRound,
  Link2,
  Network,
  Play,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { TransitStandardModel } from "@/data/api-transit/types";
import { getOfficialTransitModelPrice } from "@/lib/api-transit";
import { buildDetectorReportAssetUrl, buildPriceAiDetectorReportHref } from "@/lib/transit-detector-report";

type DetectorProtocol = "openai_chat" | "openai_responses" | "claude" | "gemini";
type DetectorIntensity = "quick" | "standard" | "deep";
type BackendMode = "quick" | "standard" | "full";
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
  ok?: boolean;
  code?: string;
  message?: string;
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
  stations?: DetectorStationOption[];
  turnstileSiteKey?: string;
  loginHref?: string;
}

interface PresetModel {
  id: string;
  label: string;
  model: string;
  protocol: DetectorProtocol;
  badge?: string;
  standardModel?: TransitStandardModel;
  priceNote?: string;
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
  costEstimateLabel: string;
  jobId?: string;
  resultUrl?: string;
  jsonUrl?: string;
  imageUrl?: string;
}

export interface DetectorStationOption {
  id: string;
  slug: string;
  name: string;
  apiBaseUrl: string | null;
  websiteUrl: string;
  sourceLabel: string;
}

interface IntensityOption {
  value: DetectorIntensity;
  label: string;
  hint: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

interface CostProfile {
  label: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

interface CostEstimate {
  inputLabel: string;
  outputLabel: string;
  totalLabel: string;
  detailLabel: string;
  sourceLabel: string;
  priceNote: string;
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "light";
      size: "normal";
    },
  ) => string;
  reset: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const presetModels: PresetModel[] = [
  { id: "gpt-5-5", label: "GPT 5.5", model: "gpt-5.5", protocol: "openai_chat", badge: "常用", standardModel: "GPT 5.5" },
  { id: "gpt-5-4", label: "GPT 5.4", model: "gpt-5.4", protocol: "openai_chat", standardModel: "GPT 5.4" },
  {
    id: "gpt-5-codex",
    label: "Codex",
    model: "gpt-5.3-codex",
    protocol: "openai_responses",
    badge: "Responses",
    standardModel: "GPT 5.4",
    priceNote: "按 GPT 5.4 文本价估算",
  },
  { id: "claude-fable-5", label: "Fable 5", model: "claude-fable-5", protocol: "claude", badge: "新", standardModel: "Claude Fable 5" },
  { id: "claude-sonnet-5", label: "Sonnet 5", model: "claude-sonnet-5", protocol: "claude", badge: "新", standardModel: "Claude Sonnet 5" },
  { id: "claude-opus-4-8", label: "Opus 4.8", model: "claude-opus-4-8", protocol: "claude", standardModel: "Claude Opus 4.8" },
  { id: "claude-opus-4-7", label: "Opus 4.7", model: "claude-opus-4-7", protocol: "claude", standardModel: "Claude Opus 4.7" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", model: "claude-sonnet-4-6", protocol: "claude", standardModel: "Claude Sonnet 4.6" },
  { id: "gemini-3-1-pro", label: "Gemini 3.1 Pro", model: "gemini-3.1-pro", protocol: "gemini", standardModel: "Gemini 3.1 Pro" },
  { id: "custom", label: "自定义", model: "", protocol: "openai_chat" },
];

const protocolLabels: Record<DetectorProtocol, string> = {
  openai_chat: "Chat Completions",
  openai_responses: "OpenAI Responses",
  claude: "Claude Messages",
  gemini: "Gemini",
};

const protocolHints: Record<DetectorProtocol, string> = {
  openai_chat: "/v1/chat/completions，适合多数 OpenAI 兼容中转",
  openai_responses: "/v1/responses，适合 Codex 等 Agent 工具链",
  claude: "/v1/messages 或 Claude 兼容接口",
  gemini: "generateContent 或 Gemini 兼容接口",
};

const intensityOptions: IntensityOption[] = [
  { value: "quick", label: "快速", hint: "协议、模型名、基础响应", inputTokens: 2000, outputTokens: 700, requests: 2 },
  { value: "standard", label: "标准", hint: "能力指纹和计费口径", inputTokens: 9000, outputTokens: 3500, requests: 5 },
  { value: "deep", label: "深度", hint: "多轮、工具和稳定性采样", inputTokens: 26000, outputTokens: 9000, requests: 10 },
];

const longContextAddon: CostProfile = {
  label: "长上下文",
  inputTokens: 180000,
  outputTokens: 6000,
  requests: 4,
};

const upstreamOptions: Array<{ value: UpstreamType; label: string; detail: string }> = [
  { value: "unknown", label: "暂不确定", detail: "先按未知来源处理，结论会更保守。" },
  { value: "official_api", label: "官方 API 转发", detail: "重点核验模型能力、Token 用量和响应特征。" },
  { value: "official_cloud", label: "Bedrock / Vertex 等官方云", detail: "区分云厂商网关特征，不简单判定为假模型。" },
  { value: "subscription_pool", label: "订阅账号池", detail: "关注上下文限制、并发限制和账号池波动。" },
  { value: "kiro_claude_code", label: "Kiro / Claude Code 账号转 API", detail: "关注账号通道限额、封禁和上下文差异。" },
  { value: "reverse_client", label: "客户端逆向", detail: "风险最高，需要加强异常、限流和稳定性检测。" },
  { value: "mixed_pool", label: "混合线路", detail: "需要多次采样，不同请求可能命中不同上游。" },
];

export function TransitDetectorClient({ serviceUrl = "", stations = [], turnstileSiteKey = "", loginHref = "/auth/google?next=%2Fapi-transit%2Fdetector" }: DetectorClientProps) {
  const runIdRef = useRef(0);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetIdRef = useRef<string | null>(null);
  const turnstilePollTimerRef = useRef<number | null>(null);
  const defaultPreset = presetModels[0];
  const [selectedModelId, setSelectedModelId] = useState(defaultPreset.id);
  const [protocol, setProtocol] = useState<DetectorProtocol>(defaultPreset.protocol);
  const [intensity, setIntensity] = useState<DetectorIntensity>("standard");
  const [includeLongContext, setIncludeLongContext] = useState(false);
  const [upstream, setUpstream] = useState<UpstreamType>("unknown");
  const [selectedStationId, setSelectedStationId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(defaultPreset.model);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [taskStatus, setTaskStatus] = useState<DetectionStatus | "idle">("idle");
  const [results, setResults] = useState<DetectionResult[]>([]);
  const [turnstileScriptReady, setTurnstileScriptReady] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);

  const normalizedServiceUrl = serviceUrl.trim().replace(/\/$/, "");
  const normalizedTurnstileSiteKey = turnstileSiteKey.trim();
  const serviceConnected = Boolean(normalizedServiceUrl);
  const turnstileEnabled = Boolean(normalizedTurnstileSiteKey);
  const selectedPreset = presetModels.find((item) => item.id === selectedModelId) ?? defaultPreset;
  const selectedIntensity = intensityOptions.find((item) => item.value === intensity) ?? intensityOptions[1];
  const effectiveIncludeLongContext = protocol !== "gemini" && includeLongContext;
  const selectedUpstream = upstreamOptions.find((item) => item.value === upstream) ?? upstreamOptions[0];
  const selectedStation = stations.find((station) => station.id === selectedStationId);
  const effectiveStandardModel = selectedPreset.standardModel ?? guessStandardModel(model, protocol);
  const activeCostProfile = buildCostProfile(selectedIntensity, effectiveIncludeLongContext);
  const costEstimate = buildCostEstimate(activeCostProfile, effectiveStandardModel, selectedPreset.priceNote);
  const activeDetection = taskStatus === "queued" || taskStatus === "running";
  const canSubmit =
    isAuthenticated &&
    serviceConnected &&
    Boolean(baseUrl.trim() && apiKey.trim() && model.trim()) &&
    (!turnstileEnabled || Boolean(turnstileToken)) &&
    !activeDetection;
  const apiKeyPreview = apiKey ? maskSecretPreview(apiKey) : "未填入";

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) setIsAuthenticated(Boolean(payload?.user));
      })
      .catch(() => {
        if (!cancelled) setIsAuthenticated(false);
      })
      .finally(() => {
        if (!cancelled) setAuthLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (preset.protocol === "gemini") setIncludeLongContext(false);
  }

  function handleModelInput(nextModel: string) {
    setModel(nextModel);
    if (selectedModelId !== "custom") {
      setSelectedModelId("custom");
    }
  }

  function handleStationChange(stationId: string) {
    setSelectedStationId(stationId);
    const station = stations.find((item) => item.id === stationId);
    if (station?.apiBaseUrl) setBaseUrl(station.apiBaseUrl);
  }

  function handleClearApiKey() {
    setApiKey("");
    setShowApiKey(false);
  }

  const handleTurnstileReady = useCallback(() => {
    if (!normalizedTurnstileSiteKey || !turnstileRef.current || !window.turnstile) return;
    if (turnstileWidgetIdRef.current) return;

    if (turnstilePollTimerRef.current) {
      window.clearInterval(turnstilePollTimerRef.current);
      turnstilePollTimerRef.current = null;
    }

    setTurnstileError("");
    turnstileWidgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: normalizedTurnstileSiteKey,
      theme: "light",
      size: "normal",
      callback: (token) => {
        setTurnstileToken(token);
        setTurnstileError("");
      },
      "expired-callback": () => {
        setTurnstileToken("");
        setTurnstileError("人机校验已过期，请重新验证。");
      },
      "error-callback": () => {
        setTurnstileToken("");
        setTurnstileError("人机校验加载失败，请刷新或稍后再试。");
      },
    });
  }, [normalizedTurnstileSiteKey]);

  useEffect(() => {
    if (!turnstileEnabled || turnstileScriptReady) return;

    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      if (window.turnstile) {
        window.clearInterval(timerId);
        setTurnstileScriptReady(true);
        return;
      }

      if (Date.now() - startedAt > 10_000) {
        window.clearInterval(timerId);
        setTurnstileError("人机校验脚本加载超时，请刷新后重试。");
      }
    }, 200);

    return () => window.clearInterval(timerId);
  }, [turnstileEnabled, turnstileScriptReady]);

  useEffect(() => {
    if (!turnstileEnabled || !turnstileScriptReady) return;
    if (turnstileWidgetIdRef.current) return;

    const startedAt = Date.now();
    handleTurnstileReady();

    if (turnstileWidgetIdRef.current) return;
    turnstilePollTimerRef.current = window.setInterval(() => {
      if (window.turnstile) {
        handleTurnstileReady();
        return;
      }
      if (Date.now() - startedAt > 10_000) {
        if (turnstilePollTimerRef.current) {
          window.clearInterval(turnstilePollTimerRef.current);
          turnstilePollTimerRef.current = null;
        }
        setTurnstileError("人机校验脚本加载超时，请刷新后重试。");
      }
    }, 200);

    return () => {
      if (turnstilePollTimerRef.current) {
        window.clearInterval(turnstilePollTimerRef.current);
        turnstilePollTimerRef.current = null;
      }
    };
  }, [handleTurnstileReady, turnstileEnabled, turnstileScriptReady]);

  function resetTurnstile() {
    if (!turnstileEnabled) return;
    setTurnstileToken("");
    const widgetId = turnstileWidgetIdRef.current;
    if (widgetId && window.turnstile) {
      window.turnstile.reset(widgetId);
    }
  }

  function updateResult(localId: string, patch: Partial<DetectionResult>) {
    setResults((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAuthenticated) {
      setTaskStatus("error");
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setTurnstileError("请先完成人机校验。");
      return;
    }

    const nextRunId = runIdRef.current + 1;
    const localId = `${nextRunId}-${selectedModelId}`;
    const submittedAt = new Date().toLocaleString("zh-CN", { hour12: false });
    runIdRef.current = nextRunId;

    const nextResult: DetectionResult = {
      localId,
      modelLabel: selectedPreset.id === "custom" ? "自定义模型" : selectedPreset.label,
      model: model.trim(),
      protocolLabel: protocolLabels[protocol],
      modeLabel: activeCostProfile.label,
      upstreamLabel: selectedUpstream.label,
      status: "queued",
      message: "正在提交检测任务。",
      submittedAt,
      costEstimateLabel: costEstimate.totalLabel,
    };
    setResults((current) => [nextResult, ...current].slice(0, 12));

    if (!normalizedServiceUrl) {
      setTaskStatus("error");
      updateResult(localId, { status: "error", message: "检测服务未连接。" });
      return;
    }

    setTaskStatus("queued");

    try {
      const response = await fetch("/api/api-transit/detector/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol,
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
          mode: backendModeForIntensity(intensity),
          includeLongContext: effectiveIncludeLongContext,
          turnstileToken: turnstileEnabled ? turnstileToken : undefined,
          upstreamType: upstream,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as DetectorStatusPayload;
      if (!response.ok) {
        throw new Error(data.message || data.detail || data.error || "检测后端拒绝了这次请求。");
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
    } finally {
      resetTurnstile();
    }
  }

  async function pollDetectorJob(statusUrl: string, runId: number, localId: string) {
    const statusEndpoint = statusUrl.startsWith("http") ? statusUrl : statusUrl;

    for (let attempt = 0; attempt < 90; attempt += 1) {
      await sleep(attempt < 3 ? 1000 : 2500);
      if (runIdRef.current !== runId) return;

      const response = await fetch(statusEndpoint, { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as DetectorStatusPayload;
      if (!response.ok) {
        throw new Error(data.message || data.detail || data.error || "读取检测状态失败。");
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
      {turnstileEnabled ? (
        <Script
          id="priceai-turnstile"
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setTurnstileScriptReady(true)}
          onReady={() => setTurnstileScriptReady(true)}
          onError={() => {
            setTurnstileScriptReady(false);
            setTurnstileToken("");
            setTurnstileError("人机校验脚本加载失败，请刷新后重试。");
          }}
        />
      ) : null}
      <section className="rounded-lg bg-white ring-1 ring-[#adb3b4]/15">
        <div className="border-b border-[#edf0f1] px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-[#202829]">接口配置</h2>
              <p className="mt-1 text-sm leading-6 text-[#5a6061]">
                填入中转站 API 地址和临时 Key，选择一个预置模型后开始检测。提交检测需要登录。
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
          <div className="grid gap-3 xl:grid-cols-[minmax(170px,0.62fr)_minmax(280px,0.95fr)_minmax(300px,0.9fr)]">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">已收录站点</span>
              <select
                value={selectedStationId}
                onChange={(event) => handleStationChange(event.target.value)}
                className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm font-medium text-[#202829] outline-none transition focus:border-[#45bf78]"
              >
                <option value="">手动填写接口</option>
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}{station.apiBaseUrl ? "" : "（未公开接口）"}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block truncate text-xs text-[#5a6061]">
                {selectedStation ? selectedStation.sourceLabel : "只使用公开站点信息"}
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">API 接口地址</span>
              <input
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={selectedStation && !selectedStation.apiBaseUrl ? "该站点未公开接口地址，请手动填写" : "输入中转站接口地址"}
                className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm text-[#202829] outline-none transition placeholder:text-[#7a8284] focus:border-[#45bf78]"
              />
              <span className="mt-1.5 block text-xs leading-5 text-[#5a6061]">可从中转榜公开字段带出，也可以直接粘贴 Base URL。</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#202829]">API Key</span>
              <div className="flex h-11 items-center gap-2 rounded-lg border border-[#dfe4e5] bg-white px-3 transition focus-within:border-[#45bf78]">
                <KeyRound className="h-4 w-4 shrink-0 text-[#5a6061]" />
                <input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  type={showApiKey ? "text" : "password"}
                  autoComplete="off"
                  placeholder="粘贴临时测试 Key"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[#202829] outline-none placeholder:text-[#7a8284]"
                />
                {apiKey ? (
                  <button
                    type="button"
                    onClick={() => setShowApiKey((current) => !current)}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5a6061] transition hover:bg-[#f2f4f4] hover:text-[#202829]"
                    aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                    title={showApiKey ? "隐藏 API Key" : "显示 API Key"}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                ) : null}
                {apiKey ? (
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] px-3 text-xs font-semibold text-[#5a6061] transition hover:text-[#202829]"
                  >
                    清空
                  </button>
                ) : null}
              </div>
              <span className="mt-1.5 block truncate text-xs leading-5 text-[#5a6061]">
                {apiKey ? `当前：${apiKeyPreview}` : "手动输入或直接粘贴临时测试 Key。"}
              </span>
            </label>
          </div>

          <div className="rounded-lg bg-[#fff7e8] px-4 py-3 text-xs leading-5 text-[#7a541b] ring-1 ring-[#e7b65d]/25">
            请使用单独创建的低额度测试 Key，不要使用主账号或长期高额度 Key；检测完成后建议到原中转站删除或撤销该 Key。
            原始 Key 只会提交给独立检测服务，报告和 PriceAI 主站不会保存原始 Key。
          </div>
          {authLoaded && !isAuthenticated ? (
            <div className="rounded-lg bg-[#eef3f8] px-4 py-3 text-xs leading-5 text-[#47657a] ring-1 ring-[#b7ccdc]/30">
              模型检测会消耗 Key 和检测服务资源，需要登录后发起。公开检测说明和已公开报告仍可直接查看。
            </div>
          ) : null}

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

          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_minmax(290px,0.68fr)_minmax(220px,0.5fr)]">
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
                  if (nextProtocol === "gemini") setIncludeLongContext(false);
                }}
                className="h-11 w-full rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm font-medium text-[#202829] outline-none transition focus:border-[#45bf78]"
              >
                {Object.entries(protocolLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="mt-1.5 block truncate text-xs text-[#5a6061]">{protocolHints[protocol]}</span>
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

          <div>
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <label className="text-sm font-semibold text-[#202829]">检测强度与预计消耗</label>
              <span className="text-xs leading-5 text-[#5a6061]">按当前模型官方标准价估算，实际以中转站扣费为准。</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(240px,0.78fr)]">
              {intensityOptions.map((item) => {
                const itemProfile = buildCostProfile(item, effectiveIncludeLongContext);
                const itemEstimate = buildCostEstimate(itemProfile, effectiveStandardModel, selectedPreset.priceNote);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setIntensity(item.value)}
                    className={`min-h-[118px] rounded-lg border px-3 py-3 text-left transition ${
                      intensity === item.value
                        ? "border-[#45bf78]/60 bg-[#edf8f1] text-[#202829]"
                        : "border-[#dfe4e5] bg-[#f9f9f9] text-[#5a6061] hover:border-[#adb3b4]"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{item.label}</span>
                        <span className="mt-1 block text-xs leading-5">{item.hint}</span>
                      </span>
                      {intensity === item.value ? <ShieldCheck className="h-4 w-4 shrink-0 text-[#45bf78]" /> : null}
                    </span>
                    <span className="mt-3 block text-xs leading-5 text-[#5a6061]">
                      约 {itemEstimate.inputLabel} 输入 / {itemEstimate.outputLabel} 输出
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-[#202829]">{itemEstimate.totalLabel}</span>
                  </button>
                );
              })}
              <label
                className={`min-h-[118px] rounded-lg border px-3 py-3 transition ${
                  effectiveIncludeLongContext
                    ? "border-[#45bf78]/60 bg-[#edf8f1] text-[#202829]"
                    : "border-[#dfe4e5] bg-[#f9f9f9] text-[#5a6061]"
                } ${protocol === "gemini" ? "opacity-55" : ""}`}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#202829]">长上下文</span>
                    <span className="mt-1 block text-xs leading-5">
                      {protocol === "gemini" ? "当前协议暂不启用" : "在当前强度上额外验证上下文上限"}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={effectiveIncludeLongContext}
                    disabled={protocol === "gemini"}
                    onChange={(event) => setIncludeLongContext(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[#adb3b4] accent-[#45bf78]"
                  />
                </span>
                <span className="mt-3 block text-xs leading-5 text-[#5a6061]">
                  额外约 {formatTokenCount(longContextAddon.inputTokens)} 输入 / {formatTokenCount(longContextAddon.outputTokens)} 输出
                </span>
                <span className="mt-1 block text-sm font-semibold text-[#202829]">+ {longContextAddon.requests} 次请求</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#edf0f1] pt-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-[860px] space-y-1 text-xs leading-5 text-[#5a6061]">
              <p>
                当前选择：{protocolLabels[protocol]} · {protocolHints[protocol]} · {selectedUpstream.detail}
              </p>
              <p>
                预计消耗：{costEstimate.detailLabel}，{costEstimate.totalLabel}；{costEstimate.sourceLabel}
                {costEstimate.priceNote ? `，${costEstimate.priceNote}` : ""}。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              {turnstileEnabled ? (
                <div className="min-w-[300px]">
                  <div ref={turnstileRef} className="min-h-[65px]" />
                  {turnstileError ? (
                    <p className="mt-1 text-xs font-medium text-[#8a4c00]">{turnstileError}</p>
                  ) : (
                    <p className="mt-1 text-xs text-[#5a6061]">用于防止检测接口被批量滥用。</p>
                  )}
                </div>
              ) : null}
              {isAuthenticated ? (
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#202829] px-5 text-sm font-semibold text-white transition hover:bg-[#2d3435] disabled:cursor-not-allowed disabled:bg-[#adb3b4]"
                  disabled={!canSubmit}
                >
                  <Play className="h-4 w-4" />
                  {submitLabel(taskStatus, serviceConnected, turnstileEnabled && !turnstileToken)}
                </button>
              ) : authLoaded ? (
                <Link
                  href={loginHref}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#202829] px-5 text-sm font-semibold text-white transition hover:bg-[#2d3435]"
                >
                  <Play className="h-4 w-4" />
                  登录后开始检测
                </Link>
              ) : (
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#adb3b4] px-5 text-sm font-semibold text-white"
                  disabled
                >
                  <Play className="h-4 w-4" />
                  读取登录状态
                </button>
              )}
            </div>
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
                  <th className="px-5 py-3">预计消耗</th>
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
                    <td className="px-5 py-4 text-[#2d3435]">{item.costEstimateLabel}</td>
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

function backendModeForIntensity(intensity: DetectorIntensity): BackendMode {
  if (intensity === "quick") return "quick";
  if (intensity === "standard") return "standard";
  return "full";
}

function guessStandardModel(model: string, protocol: DetectorProtocol): TransitStandardModel {
  const value = model.toLowerCase();
  if (value.includes("fable-5") || value.includes("fable_5") || value.includes("fable 5")) return "Claude Fable 5";
  if (value.includes("sonnet-5") || value.includes("sonnet_5") || value.includes("sonnet 5")) return "Claude Sonnet 5";
  if (value.includes("opus-4-8")) return "Claude Opus 4.8";
  if (value.includes("opus-4-7")) return "Claude Opus 4.7";
  if (value.includes("opus")) return "Claude Opus 4.8";
  if (value.includes("sonnet")) return "Claude Sonnet 4.6";
  if (value.includes("gemini")) return "Gemini 3.1 Pro";
  if (value.includes("5.5")) return "GPT 5.5";
  if (value.includes("5.4") || value.includes("codex")) return "GPT 5.4";
  if (protocol === "claude") return "Claude Sonnet 4.6";
  if (protocol === "gemini") return "Gemini 3.1 Pro";
  return "GPT 5.4";
}

function buildCostProfile(intensity: IntensityOption, includeLongContext: boolean): CostProfile {
  if (!includeLongContext) return intensity;
  return {
    label: `${intensity.label} + 长上下文`,
    inputTokens: intensity.inputTokens + longContextAddon.inputTokens,
    outputTokens: intensity.outputTokens + longContextAddon.outputTokens,
    requests: intensity.requests + longContextAddon.requests,
  };
}

function buildCostEstimate(
  intensity: CostProfile,
  standardModel: TransitStandardModel,
  priceNote = ""
): CostEstimate {
  const price = getOfficialTransitModelPrice(standardModel);
  const inputCost = ((price.input ?? 0) * intensity.inputTokens) / 1_000_000;
  const outputCost = ((price.output ?? 0) * intensity.outputTokens) / 1_000_000;
  const totalCost = inputCost + outputCost;
  const currencyPrefix = price.currency === "CNY" ? "¥" : "$";
  const currencySuffix = price.currency === "CNY" ? " CNY" : " USD";

  return {
    inputLabel: formatTokenCount(intensity.inputTokens),
    outputLabel: formatTokenCount(intensity.outputTokens),
    totalLabel: `约 ${currencyPrefix}${formatCost(totalCost)}${currencySuffix}`,
    detailLabel: `${formatTokenCount(intensity.inputTokens)} 输入 / ${formatTokenCount(intensity.outputTokens)} 输出 / ${intensity.requests} 次请求`,
    sourceLabel: `${price.sourceLabel} ${standardModel} 标准价`,
    priceNote,
  };
}

function formatTokenCount(value: number): string {
  if (value >= 10_000) return `${trimNumber(value / 10_000)} 万 token`;
  if (value >= 1000) return `${trimNumber(value / 1000)}k token`;
  return `${value} token`;
}

function formatCost(value: number): string {
  if (value === 0) return "0";
  if (value < 0.01) return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return value.toFixed(2);
}

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function maskSecretPreview(value: string): string {
  const text = value.trim();
  if (!text) return "未填入";
  if (text.length <= 10) return "已填入";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
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

function submitLabel(
  status: DetectionStatus | "idle",
  serviceConnected: boolean,
  waitingForVerification = false,
) {
  if (!serviceConnected) return "检测服务未连接";
  if (waitingForVerification) return "等待校验";
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
