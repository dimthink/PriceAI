import "server-only";

import { infrastructureRuntimeProfile } from "@/lib/infrastructure-runtime-profile";
import { getSupabaseServerClient } from "@/lib/supabase";

export type InfrastructureTableSnapshot = {
  estimatedRows: number;
  totalBytes: number;
  retentionCandidates?: number;
  payloadRetentionCandidates?: number;
  payloadCandidateBytes?: number;
  runRetentionCandidates?: number;
  blockedRunCandidates?: number;
  oldestAt?: string | null;
  latestAt?: string | null;
  retentionDays?: number;
  payloadRetentionDays?: number;
  runRetentionDays?: number;
};

export type InfrastructureDatabaseSnapshot = {
  configured: boolean;
  available: boolean;
  message: string | null;
  generatedAt: string | null;
  databaseSizeBytes: number;
  tables: {
    availabilityRaw: InfrastructureTableSnapshot;
    availabilityHourly: InfrastructureTableSnapshot;
    availabilityDaily: InfrastructureTableSnapshot;
    detectionRuns: InfrastructureTableSnapshot;
    rawOffers: InfrastructureTableSnapshot;
    rawOfferConfirmations: InfrastructureTableSnapshot;
  };
  coveringIndex: {
    name: string;
    sizeBytes: number;
    scanCount: number;
    tupleReadCount: number;
    tupleFetchCount: number;
    decision: "keep";
    reason: string;
  };
  retention: {
    availabilityRawDays: number;
    availabilityHourlyDays: number;
    availabilityDailyDays: number;
    detectionPayloadDays: number;
    detectionRunDays: number;
    defaultDryRun: boolean;
    defaultBatchSize: number;
  };
};

export type InfrastructureTrafficSignal = {
  id: string;
  severity: "info" | "warning";
  title: string;
  detail: string;
  state: string;
};

export type InfrastructureOverview = {
  generatedAt: string;
  database: InfrastructureDatabaseSnapshot;
  cloudflare: {
    productionTarget: string;
    workerName: string;
    incrementalCache: string;
    revalidationQueue: string;
    regionalCacheMode: string;
    regionalCacheMaxAgeSeconds: number;
    cacheInterceptionEnabled: boolean;
    publicAssetCacheRoutes: readonly string[];
    observability: {
      enabled: boolean;
      successSamplingConfigured: boolean;
    };
    trafficAudit: {
      liveDataConnected: boolean;
      sourceLabel: string;
      observedDate: string;
      message: string;
      signals: InfrastructureTrafficSignal[];
    };
  };
};

const emptyTableSnapshot: InfrastructureTableSnapshot = {
  estimatedRows: 0,
  totalBytes: 0,
};

const emptyDatabaseSnapshot: InfrastructureDatabaseSnapshot = {
  configured: false,
  available: false,
  message: "Supabase 尚未配置。",
  generatedAt: null,
  databaseSizeBytes: 0,
  tables: {
    availabilityRaw: { ...emptyTableSnapshot },
    availabilityHourly: { ...emptyTableSnapshot },
    availabilityDaily: { ...emptyTableSnapshot },
    detectionRuns: { ...emptyTableSnapshot },
    rawOffers: { ...emptyTableSnapshot },
    rawOfferConfirmations: { ...emptyTableSnapshot },
  },
  coveringIndex: {
    name: "api_transit_availability_samples_checked_time_idx",
    sizeBytes: 0,
    scanCount: 0,
    tupleReadCount: 0,
    tupleFetchCount: 0,
    decision: "keep",
    reason: "近期样本查询仍依赖该索引，rollup 不能替代最近原始样本读取。",
  },
  retention: {
    availabilityRawDays: 8,
    availabilityHourlyDays: 90,
    availabilityDailyDays: 365,
    detectionPayloadDays: 14,
    detectionRunDays: 30,
    defaultDryRun: true,
    defaultBatchSize: 5000,
  },
};

export async function getInfrastructureOverview(): Promise<InfrastructureOverview> {
  const generatedAt = new Date().toISOString();
  const database = await readDatabaseSnapshot();

  return {
    generatedAt,
    database,
    cloudflare: {
      ...infrastructureRuntimeProfile,
      trafficAudit: {
        liveDataConnected: false,
        sourceLabel: "2026-07-14 Cloudflare 24h 只读审计基线",
        observedDate: "2026-07-14",
        message: "后台已承接异常流量工作流，但尚未向 Worker 注入 Cloudflare Analytics 读取凭据；下面是带日期的审计基线，不是实时数据。",
        signals: [
          {
            id: "rsc-request-amplification",
            severity: "warning",
            title: "RSC / 自动预取请求放大",
            detail: "审计窗口内带 _rsc 的请求约占八成。主导航意图预取和长列表关闭 viewport prefetch 已在本地完成，需发布后用新 24h 窗口复盘。",
            state: "待发布后复盘",
          },
          {
            id: "rate-limit-scope",
            severity: "warning",
            title: "现有 Rate Limiting 范围过宽",
            detail: "审计时规则表达式覆盖几乎所有非 /_next 业务路径，并非名称暗示的 RSC / offers 专项规则；调整前仍需先观察再挑战。",
            state: "只读观察",
          },
          {
            id: "single-ip-drift",
            severity: "warning",
            title: "单 IP Block 已发生漂移",
            detail: "审计时规则仍只拦截 67.159.48.149，但 Top IP 已漂移到 67.159.48.150，说明单 IP 封禁不能作为主要治理手段。",
            state: "不建议继续堆单 IP",
          },
          {
            id: "observability-sampling",
            severity: "info",
            title: "Workers Observability 仍是全量记录",
            detail: "wrangler 当前只启用 observability，没有配置普通成功请求采样；日志降采样仍保留为独立生产变更。",
            state: "待生产确认",
          },
        ],
      },
    },
  };
}

async function readDatabaseSnapshot(): Promise<InfrastructureDatabaseSnapshot> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { ...emptyDatabaseSnapshot };

  const { data, error } = await supabase.rpc("get_priceai_infrastructure_snapshot");
  if (error) {
    return {
      ...emptyDatabaseSnapshot,
      configured: true,
      message: isMissingInfrastructureSnapshotRpc(error)
        ? "基础设施快照 migration 尚未应用；代码发布前可继续查看 Cloudflare 审计基线。"
        : `读取 Supabase 容量快照失败：${error.message}`,
    };
  }

  const snapshot = asRecord(data);
  const tables = asRecord(snapshot.tables);
  const coveringIndex = asRecord(snapshot.coveringIndex);
  const retention = asRecord(snapshot.retention);

  return {
    configured: true,
    available: true,
    message: null,
    generatedAt: textValue(snapshot.generatedAt),
    databaseSizeBytes: numberValue(snapshot.databaseSizeBytes),
    tables: {
      availabilityRaw: normalizeTableSnapshot(tables.availabilityRaw),
      availabilityHourly: normalizeTableSnapshot(tables.availabilityHourly),
      availabilityDaily: normalizeTableSnapshot(tables.availabilityDaily),
      detectionRuns: normalizeTableSnapshot(tables.detectionRuns),
      rawOffers: normalizeTableSnapshot(tables.rawOffers),
      rawOfferConfirmations: normalizeTableSnapshot(tables.rawOfferConfirmations),
    },
    coveringIndex: {
      name: textValue(coveringIndex.name) || emptyDatabaseSnapshot.coveringIndex.name,
      sizeBytes: numberValue(coveringIndex.sizeBytes),
      scanCount: numberValue(coveringIndex.scanCount),
      tupleReadCount: numberValue(coveringIndex.tupleReadCount),
      tupleFetchCount: numberValue(coveringIndex.tupleFetchCount),
      decision: "keep",
      reason: "近期多站点样本查询已有实际命中，且前台仍需读最近原始样本；当前保留，不以 rollup 替代。",
    },
    retention: {
      availabilityRawDays: numberValue(retention.availabilityRawDays, 8),
      availabilityHourlyDays: numberValue(retention.availabilityHourlyDays, 90),
      availabilityDailyDays: numberValue(retention.availabilityDailyDays, 365),
      detectionPayloadDays: numberValue(retention.detectionPayloadDays, 14),
      detectionRunDays: numberValue(retention.detectionRunDays, 30),
      defaultDryRun: booleanValue(retention.defaultDryRun, true),
      defaultBatchSize: numberValue(retention.defaultBatchSize, 5000),
    },
  };
}

function normalizeTableSnapshot(value: unknown): InfrastructureTableSnapshot {
  const row = asRecord(value);
  return {
    estimatedRows: numberValue(row.estimatedRows),
    totalBytes: numberValue(row.totalBytes),
    retentionCandidates: optionalNumber(row.retentionCandidates),
    payloadRetentionCandidates: optionalNumber(row.payloadRetentionCandidates),
    payloadCandidateBytes: optionalNumber(row.payloadCandidateBytes),
    runRetentionCandidates: optionalNumber(row.runRetentionCandidates),
    blockedRunCandidates: optionalNumber(row.blockedRunCandidates),
    oldestAt: nullableTextValue(row.oldestAt),
    latestAt: nullableTextValue(row.latestAt),
    retentionDays: optionalNumber(row.retentionDays),
    payloadRetentionDays: optionalNumber(row.payloadRetentionDays),
    runRetentionDays: optionalNumber(row.runRetentionDays),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  return numberValue(value);
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableTextValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  const text = textValue(value);
  return text || undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isMissingInfrastructureSnapshotRpc(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || /get_priceai_infrastructure_snapshot/i.test(error.message || "");
}
