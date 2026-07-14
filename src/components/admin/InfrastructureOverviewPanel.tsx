"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  HardDrive,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  InfrastructureOverview,
  InfrastructureTableSnapshot,
  InfrastructureTrafficSignal,
} from "@/lib/infrastructure-overview";

type InfrastructureApiResponse = {
  ok?: boolean;
  overview?: InfrastructureOverview;
  message?: string;
};

type CapacityRow = {
  id: string;
  label: string;
  purpose: string;
  snapshot: InfrastructureTableSnapshot;
  retention: string;
  candidates: string;
  candidateCount: number;
};

export function InfrastructureOverviewPanel() {
  const [overview, setOverview] = useState<InfrastructureOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/infrastructure", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({})) as InfrastructureApiResponse;
      if (!response.ok || !payload.ok || !payload.overview) {
        throw new Error(payload.message || "读取基础设施总览失败。");
      }
      setOverview(payload.overview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取基础设施总览失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOverview();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadOverview]);

  const capacityRows = useMemo(
    () => overview ? buildCapacityRows(overview) : [],
    [overview],
  );

  if (loading && !overview) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-lg border border-[#adb3b4]/25 bg-white text-sm text-[#5a6061] dark:border-white/10 dark:bg-[#202829] dark:text-[#c8cecf]">
        <Loader2 size={18} className="mr-2 animate-spin" />
        正在读取容量与缓存状态…
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        <div className="flex items-start gap-2">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">基础设施总览暂时不可用</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{error || "请稍后重试。"}</p>
            <button
              type="button"
              onClick={() => void loadOverview()}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-current/20 px-3 text-xs font-medium"
            >
              <RefreshCcw size={13} />
              重新读取
            </button>
          </div>
        </div>
      </div>
    );
  }

  const database = overview.database;
  const cloudflare = overview.cloudflare;

  return (
    <div className="space-y-5 text-[#2d3435] dark:text-[#edf1f1]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} />
            <h2 className="text-base font-semibold text-[#202829] dark:text-white">基础设施与异常流量</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#5a6061] dark:text-[#aeb8ba]">
            只读汇总 Supabase 容量、留存候选、核心索引和 Cloudflare 缓存状态。这里没有删除、封禁或修改配置按钮。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#7a8384] dark:text-[#aeb8ba]">
            更新于 {formatDateTime(overview.generatedAt)}
          </span>
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#adb3b4]/35 bg-white px-3 text-xs font-medium text-[#2d3435] transition-colors hover:bg-[#f2f4f4] disabled:opacity-60 dark:border-white/15 dark:bg-[#202829] dark:text-[#edf1f1] dark:hover:bg-[#2b3536]"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            刷新
          </button>
        </div>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}。当前仍展示上一次成功读取的结果。
        </div>
      ) : null}

      <dl className="grid overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white sm:grid-cols-2 xl:grid-cols-4 dark:border-white/10 dark:bg-[#202829]">
        <SummaryItem
          icon={<HardDrive size={15} />}
          label="数据库总占用"
          value={database.available ? formatBytes(database.databaseSizeBytes) : "待 migration"}
          hint={database.available ? "当前实时快照" : database.message || "暂不可用"}
        />
        <SummaryItem
          icon={<Database size={15} />}
          label="统一留存入口"
          value={database.retention.defaultDryRun ? "默认 Dry-run" : "需复核"}
          hint={`每批最多 ${formatInteger(database.retention.defaultBatchSize)} 行`}
        />
        <SummaryItem
          icon={<Cloud size={15} />}
          label="OpenNext 热缓存"
          value={`${cloudflare.regionalCacheMode} 区域缓存`}
          hint={`最多 ${cloudflare.regionalCacheMaxAgeSeconds} 秒，R2 仍为持久层`}
        />
        <SummaryItem
          icon={<Activity size={15} />}
          label="Cloudflare 24h 流量"
          value={cloudflare.trafficAudit.liveDataConnected ? "实时已接入" : "审计基线"}
          hint={cloudflare.trafficAudit.liveDataConnected ? "可实时刷新" : "尚未接入 Analytics 凭据"}
        />
      </dl>

      <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white dark:border-white/10 dark:bg-[#202829]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#adb3b4]/20 px-4 py-3 dark:border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-[#202829] dark:text-white">Supabase 容量与留存候选</h3>
            <p className="mt-0.5 text-xs text-[#7a8384] dark:text-[#aeb8ba]">
              行数来自 PostgreSQL 统计估算；候选数来自 retention 条件的只读计算。
            </p>
          </div>
          <a
            href="https://supabase.com/dashboard/projects"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#47657a] hover:underline dark:text-[#9ec6df]"
          >
            打开 Supabase Reports <ExternalLink size={12} />
          </a>
        </div>

        {!database.available ? (
          <div className="flex items-start gap-2 px-4 py-4 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{database.message || "数据库快照不可用。"}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[780px] w-full border-collapse text-left text-xs">
              <thead className="bg-[#f2f4f4] text-[#5a6061] dark:bg-[#273132] dark:text-[#b8c1c2]">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">数据集</th>
                  <th className="px-3 py-2.5 text-right font-semibold">估算行数</th>
                  <th className="px-3 py-2.5 text-right font-semibold">占用</th>
                  <th className="px-3 py-2.5 font-semibold">保留口径</th>
                  <th className="px-3 py-2.5 font-semibold">待处理</th>
                  <th className="px-4 py-2.5 font-semibold">时间范围</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#adb3b4]/15 dark:divide-white/10">
                {capacityRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#202829] dark:text-white">{row.label}</div>
                      <div className="mt-0.5 text-[11px] leading-4 text-[#7a8384] dark:text-[#9eaaac]">{row.purpose}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{formatInteger(row.snapshot.estimatedRows)}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{formatBytes(row.snapshot.totalBytes)}</td>
                    <td className="px-3 py-3 text-[#5a6061] dark:text-[#b8c1c2]">{row.retention}</td>
                    <td className="px-3 py-3">
                      <StatusText active={row.candidateCount > 0} text={row.candidates} />
                    </td>
                    <td className="px-4 py-3 text-[#5a6061] dark:text-[#b8c1c2]">
                      {formatRange(row.snapshot.oldestAt, row.snapshot.latestAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white dark:border-white/10 dark:bg-[#202829]">
        <div className="border-b border-[#adb3b4]/20 px-4 py-3 dark:border-white/10">
          <h3 className="text-sm font-semibold text-[#202829] dark:text-white">Availability covering index 审查</h3>
          <p className="mt-0.5 text-xs text-[#7a8384] dark:text-[#aeb8ba]">P2 结论：保留，不删除，也不在 rollup 上线后立即替换。</p>
        </div>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div>
            <div className="break-all font-mono text-xs font-medium text-[#202829] dark:text-white">{database.coveringIndex.name}</div>
            <p className="mt-2 text-xs leading-5 text-[#5a6061] dark:text-[#b8c1c2]">{database.coveringIndex.reason}</p>
          </div>
          <dl className="grid grid-cols-3 gap-x-5 gap-y-2 text-right text-xs">
            <div>
              <dt className="text-[#7a8384] dark:text-[#9eaaac]">大小</dt>
              <dd className="mt-1 font-mono font-semibold">{formatBytes(database.coveringIndex.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-[#7a8384] dark:text-[#9eaaac]">扫描</dt>
              <dd className="mt-1 font-mono font-semibold">{formatInteger(database.coveringIndex.scanCount)}</dd>
            </div>
            <div>
              <dt className="text-[#7a8384] dark:text-[#9eaaac]">读取元组</dt>
              <dd className="mt-1 font-mono font-semibold">{formatCompact(database.coveringIndex.tupleReadCount)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-[#adb3b4]/25 bg-white dark:border-white/10 dark:bg-[#202829]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#adb3b4]/20 px-4 py-3 dark:border-white/10">
          <div>
            <h3 className="text-sm font-semibold text-[#202829] dark:text-white">Cloudflare 缓存与异常流量</h3>
            <p className="mt-0.5 text-xs text-[#7a8384] dark:text-[#aeb8ba]">{cloudflare.trafficAudit.sourceLabel} · 非实时</p>
          </div>
          <a
            href="https://dash.cloudflare.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#47657a] hover:underline dark:text-[#9ec6df]"
          >
            打开 Cloudflare Analytics <ExternalLink size={12} />
          </a>
        </div>
        <div className="grid divide-y divide-[#adb3b4]/15 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)] lg:divide-x lg:divide-y-0 dark:divide-white/10">
          <dl className="divide-y divide-[#adb3b4]/15 text-xs dark:divide-white/10">
            <ConfigRow label="生产入口" value={cloudflare.productionTarget} state="已配置" />
            <ConfigRow label="增量缓存" value={cloudflare.incrementalCache} state="保持 Standard" />
            <ConfigRow label="Revalidation Queue" value={cloudflare.revalidationQueue} state="已配置" />
            <ConfigRow label="Regional Cache" value={`${cloudflare.regionalCacheMode} / ${cloudflare.regionalCacheMaxAgeSeconds}s`} state="本地待发布" />
            <ConfigRow label="Cache interception" value="未启用" state="本轮不叠加" />
            <ConfigRow
              label="成功日志采样"
              value={cloudflare.observability.successSamplingConfigured ? "已配置" : "未配置"}
              state="待单独确认"
            />
          </dl>
          <div>
            <div className="border-b border-[#adb3b4]/15 px-4 py-3 text-xs leading-5 text-[#5a6061] dark:border-white/10 dark:text-[#b8c1c2]">
              {cloudflare.trafficAudit.message}
            </div>
            <div className="divide-y divide-[#adb3b4]/15 dark:divide-white/10">
              {cloudflare.trafficAudit.signals.map((signal) => (
                <TrafficSignalRow key={signal.id} signal={signal} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-[#adb3b4]/25 bg-[#f7f8f8] px-4 py-3 text-xs leading-5 text-[#5a6061] dark:border-white/10 dark:bg-[#273132] dark:text-[#b8c1c2]">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#2f7a4b] dark:text-[#79c89b]" />
        当前工作台只提供证据与候选，不会自动执行 `DELETE`、修改 WAF / Rate Limiting、切换 R2 Storage Class 或保存日志采样。
      </div>
    </div>
  );
}

function SummaryItem({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="border-b border-[#adb3b4]/15 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 dark:border-white/10">
      <dt className="flex items-center gap-1.5 text-xs text-[#7a8384] dark:text-[#9eaaac]">{icon}{label}</dt>
      <dd className="mt-1.5 text-sm font-semibold text-[#202829] dark:text-white">{value}</dd>
      <dd className="mt-0.5 truncate text-[11px] text-[#8b9495] dark:text-[#aeb8ba]" title={hint}>{hint}</dd>
    </div>
  );
}

function StatusText({ active, text }: { active: boolean; text: string }) {
  return (
    <span className={active
      ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/35 dark:text-amber-200"
      : "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"}
    >
      {text}
    </span>
  );
}

function ConfigRow({ label, value, state }: { label: string; value: string; state: string }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-3">
      <dt className="text-[#7a8384] dark:text-[#9eaaac]">{label}</dt>
      <dd>
        <div className="font-medium text-[#202829] dark:text-white">{value}</div>
        <div className="mt-0.5 text-[11px] text-[#8b9495] dark:text-[#aeb8ba]">{state}</div>
      </dd>
    </div>
  );
}

function TrafficSignalRow({ signal }: { signal: InfrastructureTrafficSignal }) {
  const warning = signal.severity === "warning";
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
      <div className="flex items-start gap-2">
        {warning
          ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
          : <Activity size={15} className="mt-0.5 shrink-0 text-[#47657a] dark:text-[#9ec6df]" />}
        <div>
          <div className="text-xs font-medium text-[#202829] dark:text-white">{signal.title}</div>
          <p className="mt-1 text-[11px] leading-5 text-[#5a6061] dark:text-[#b8c1c2]">{signal.detail}</p>
        </div>
      </div>
      <span className="ml-6 whitespace-nowrap text-[11px] font-medium text-[#7a8384] dark:text-[#aeb8ba] sm:ml-0">{signal.state}</span>
    </div>
  );
}

function buildCapacityRows(overview: InfrastructureOverview): CapacityRow[] {
  const tables = overview.database.tables;
  const retention = overview.database.retention;
  const detectionCandidates = (tables.detectionRuns.payloadRetentionCandidates || 0) + (tables.detectionRuns.runRetentionCandidates || 0);
  return [
    {
      id: "availability-raw",
      label: "Availability 原始样本",
      purpose: "前台近期可用率与最近样本",
      snapshot: tables.availabilityRaw,
      retention: `${retention.availabilityRawDays} 天原始`,
      candidates: `${formatInteger(tables.availabilityRaw.retentionCandidates || 0)} 条候选`,
      candidateCount: tables.availabilityRaw.retentionCandidates || 0,
    },
    {
      id: "availability-hourly",
      label: "Availability 小时汇总",
      purpose: "中期趋势与清理安全覆盖",
      snapshot: tables.availabilityHourly,
      retention: `${retention.availabilityHourlyDays} 天`,
      candidates: "按批次维护",
      candidateCount: 0,
    },
    {
      id: "availability-daily",
      label: "Availability 日汇总",
      purpose: "长期趋势与容量压缩",
      snapshot: tables.availabilityDaily,
      retention: `${retention.availabilityDailyDays} 天`,
      candidates: "按批次维护",
      candidateCount: 0,
    },
    {
      id: "detection-runs",
      label: "Detection Runs",
      purpose: "运行元数据与诊断明细",
      snapshot: tables.detectionRuns,
      retention: `明细 ${retention.detectionPayloadDays} 天 / 运行 ${retention.detectionRunDays} 天`,
      candidates: `${formatInteger(tables.detectionRuns.payloadRetentionCandidates || 0)} 明细 · ${formatInteger(tables.detectionRuns.runRetentionCandidates || 0)} 运行`,
      candidateCount: detectionCandidates,
    },
    {
      id: "raw-offers",
      label: "raw_offers",
      purpose: "变化内容主表",
      snapshot: tables.rawOffers,
      retention: "内容变化才写",
      candidates: "已降写放大",
      candidateCount: 0,
    },
    {
      id: "raw-offer-confirmations",
      label: "raw_offer_confirmations",
      purpose: "无变化采集确认时间",
      snapshot: tables.rawOfferConfirmations,
      retention: "轻量 upsert",
      candidates: "正常",
      candidateCount: 0,
    },
  ];
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const amount = value / 1024 ** index;
  return `${amount >= 100 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function formatRange(oldest?: string | null, latest?: string | null): string {
  if (!oldest && !latest) return "暂无数据";
  if (!oldest || oldest === latest) return formatDate(oldest || latest || "");
  return `${formatDate(oldest)} → ${formatDate(latest || "")}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
