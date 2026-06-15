"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ExternalLink, Filter, Search } from "lucide-react";
import type {
  TransitAccountPool,
  TransitChannelType,
  TransitModelFamily,
  TransitRiskLabel,
  TransitStation,
} from "@/data/api-transit/types";
import {
  TRANSIT_ACCOUNT_POOL_LABELS,
  TRANSIT_CHANNEL_TYPE_LABELS,
  TRANSIT_DATA_STATUS_LABELS,
  TRANSIT_MODEL_FAMILY_OPTIONS,
  TRANSIT_RISK_LABELS,
  TRANSIT_USAGE_ADVICE_LABELS,
} from "@/data/api-transit/types";
import {
  compareStations,
  formatAvailability,
  formatMultiplierRange,
  formatRate,
  getRateBadgeClass,
  getStationComparisonSummary,
  getStationRechargeCoefficient,
  getSummaryStats,
  getUsageAdviceBadgeClass,
  parseRechargeRatio,
  type TransitSortKey,
} from "@/lib/api-transit";

const CHANNEL_OPTIONS: { value: TransitChannelType | "all"; label: string }[] = [
  { value: "all", label: "全部渠道" },
  ...Object.entries(TRANSIT_CHANNEL_TYPE_LABELS).map(([value, label]) => ({
    value: value as TransitChannelType,
    label,
  })),
];

const POOL_OPTIONS: { value: TransitAccountPool | "all"; label: string }[] = [
  { value: "all", label: "全部号池" },
  ...Object.entries(TRANSIT_ACCOUNT_POOL_LABELS).map(([value, label]) => ({
    value: value as TransitAccountPool,
    label,
  })),
];

const RISK_OPTIONS: { value: TransitRiskLabel | "all"; label: string }[] = [
  { value: "all", label: "全部风险" },
  ...Object.entries(TRANSIT_RISK_LABELS).map(([value, label]) => ({
    value: value as TransitRiskLabel,
    label,
  })),
];

const SORT_OPTIONS: { value: TransitSortKey; label: string }[] = [
  { value: "overall", label: "综合排序" },
  { value: "rate", label: "按倍率" },
  { value: "stability", label: "按稳定性" },
];

function coerceParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return value && allowed.includes(value as T) ? (value as T) : fallback;
}

interface Props {
  stations: TransitStation[];
}

export default function TransitStationExplorer({ stations }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [urlReady, setUrlReady] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [modelFilter, setModelFilter] = useState<TransitModelFamily | "all">(
    coerceParam(searchParams.get("model"), ["all", "claude", "gpt"] as const, "all")
  );
  const [channelFilter, setChannelFilter] = useState<TransitChannelType | "all">(
    coerceParam(searchParams.get("channel"), CHANNEL_OPTIONS.map((item) => item.value), "all")
  );
  const [poolFilter, setPoolFilter] = useState<TransitAccountPool | "all">(
    coerceParam(searchParams.get("pool"), POOL_OPTIONS.map((item) => item.value), "all")
  );
  const [riskFilter, setRiskFilter] = useState<TransitRiskLabel | "all">(
    coerceParam(searchParams.get("risk"), RISK_OPTIONS.map((item) => item.value), "all")
  );
  const [sortBy, setSortBy] = useState<TransitSortKey>(
    coerceParam(searchParams.get("sort"), ["overall", "rate", "stability"] as const, "overall")
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setUrlReady(true), 60);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!urlReady) return;

    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (modelFilter !== "all") params.set("model", modelFilter);
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (poolFilter !== "all") params.set("pool", poolFilter);
    if (riskFilter !== "all") params.set("risk", riskFilter);
    if (sortBy !== "overall") params.set("sort", sortBy);

    const query = params.toString();
    router.replace(query ? `/api-transit?${query}` : "/api-transit", { scroll: false });
  }, [channelFilter, modelFilter, poolFilter, riskFilter, router, search, sortBy, urlReady]);

  const filtered = useMemo(() => {
    let result = [...stations];

    if (search) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (station) =>
          station.name.toLowerCase().includes(q) ||
          station.slug.toLowerCase().includes(q) ||
          station.summary.toLowerCase().includes(q)
      );
    }

    if (modelFilter !== "all") {
      result = result.filter((station) =>
        station.prices.some((price) => price.family === modelFilter)
      );
    }

    if (channelFilter !== "all") {
      result = result.filter((station) => station.channelTypes.includes(channelFilter));
    }

    if (poolFilter !== "all") {
      result = result.filter((station) => station.accountPools.includes(poolFilter));
    }

    if (riskFilter !== "all") {
      result = result.filter((station) => station.riskLabels.includes(riskFilter));
    }

    return compareStations(result, sortBy);
  }, [channelFilter, modelFilter, poolFilter, riskFilter, search, sortBy, stations]);

  const stats = useMemo(() => getSummaryStats(stations), [stations]);
  const activeFilterCount =
    [modelFilter, channelFilter, poolFilter, riskFilter].filter((value) => value !== "all").length +
    (search ? 1 : 0) +
    (sortBy !== "overall" ? 1 : 0);

  const navigateToStation = useCallback(
    (slug: string) => {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (modelFilter !== "all") params.set("model", modelFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (poolFilter !== "all") params.set("pool", poolFilter);
      if (riskFilter !== "all") params.set("risk", riskFilter);
      if (sortBy !== "overall") params.set("sort", sortBy);
      const query = params.toString();

      router.push(`/api-transit/${slug}${query ? `?back=${encodeURIComponent(query)}` : ""}`);
    },
    [channelFilter, modelFilter, poolFilter, riskFilter, router, search, sortBy]
  );

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="站点" value={String(stats.total)} helper="静态样例" />
        <MetricCard label="Claude 最低" value={formatRate(stats.bestClaude)} helper="综合倍率" />
        <MetricCard label="GPT 最低" value={formatRate(stats.bestGpt)} helper="综合倍率" />
        <MetricCard label="近 7 日样本" value={String(stats.sevenDaySamples)} helper={`${stats.withRisk} 个有提示`} />
      </div>

      <div className="sticky top-[66px] z-20 mb-5 rounded-lg bg-[#f2f4f4] p-3 ring-1 ring-[#adb3b4]/15">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-[210px] flex-1 lg:max-w-[460px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a8182]" />
            <input
              className="h-[38px] w-full rounded-lg border border-[#dfe4e5] bg-white pl-9 pr-3 text-sm text-[#2d3435] outline-none placeholder:text-[#5f6869] transition focus:border-[#45bf78]/65 focus:shadow-[0_0_0_3px_rgba(69,191,120,0.16)]"
              placeholder="搜索站点名称、描述..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <SegmentedControl
              options={SORT_OPTIONS}
              value={sortBy}
              onChange={(value) => setSortBy(value as TransitSortKey)}
              ariaLabel="排序方式"
            />
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className={`inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
                showFilters || activeFilterCount > 0
                  ? "bg-[#2d3435] text-[#f8f8f8]"
                  : "bg-white text-[#5a6061] ring-1 ring-[#dfe4e5] hover:bg-[#fbfcfc]"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#dfe4e5] pt-3 sm:grid-cols-4">
            <FilterSelect
              label="模型"
              value={modelFilter}
              onChange={(value) => setModelFilter(value as TransitModelFamily | "all")}
              options={[
                { value: "all", label: "全部模型" },
                ...TRANSIT_MODEL_FAMILY_OPTIONS.map((item) => ({ value: item.id, label: item.label })),
              ]}
            />
            <FilterSelect
              label="渠道类型"
              value={channelFilter}
              onChange={(value) => setChannelFilter(value as TransitChannelType | "all")}
              options={CHANNEL_OPTIONS}
            />
            <FilterSelect
              label="号池"
              value={poolFilter}
              onChange={(value) => setPoolFilter(value as TransitAccountPool | "all")}
              options={POOL_OPTIONS}
            />
            <FilterSelect
              label="风险"
              value={riskFilter}
              onChange={(value) => setRiskFilter(value as TransitRiskLabel | "all")}
              options={RISK_OPTIONS}
            />
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-[#5a6061]">
          <p className="mb-2 text-lg font-semibold">没有匹配的中转站</p>
          <p className="text-sm">尝试调整模型、渠道或风险筛选。</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse text-left text-sm" role="table">
                <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
                  <tr role="row">
                    <TableHead>站点</TableHead>
                    <TableHead>模型覆盖</TableHead>
                    <TableHead>价格倍率</TableHead>
                    <TableHead>稳定性</TableHead>
                    <TableHead>号池 / 渠道</TableHead>
                    <TableHead>风险</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="w-[120px] text-center">操作</TableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f1]" role="rowgroup">
                  {filtered.map((station) => (
                    <StationRow
                      key={station.id}
                      station={station}
                      onClick={() => navigateToStation(station.slug)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                onClick={() => navigateToStation(station.slug)}
              />
            ))}
          </div>

          <div className="mt-4 text-center text-xs text-[#5a6061]">
            共 {filtered.length} 个站点
            {filtered.length !== stations.length ? `（总收录 ${stations.length} 个）` : ""}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-3 ring-1 ring-[#adb3b4]/15">
      <div className="text-[11px] font-semibold text-[#5a6061]">{label}</div>
      <div className="mt-1 text-[20px] font-bold leading-tight text-[#202829]">{value}</div>
      <div className="mt-0.5 truncate text-xs text-[#7a8182]">{helper}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  ariaLabel,
  onChange,
  options,
  value,
}: {
  ariaLabel: string;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  value: T;
}) {
  return (
    <div aria-label={ariaLabel} className="inline-flex h-[38px] shrink-0 rounded-lg bg-white p-1 ring-1 ring-[#dfe4e5]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 text-sm font-semibold transition-colors ${
            value === option.value
              ? "bg-[#2d3435] text-[#f8f8f8]"
              : "text-[#5a6061] hover:bg-[#f2f4f4] hover:text-[#202829]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-bold text-[#5a6061]">{label}</span>
      <select
        className="h-[38px] w-full truncate rounded-lg border border-[#dfe4e5] bg-white px-3 text-sm text-[#2d3435] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TableHead({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap px-5 py-3 text-left ${className}`}
      scope="col"
    >
      {children}
    </th>
  );
}

function RechargeRatioDisplay({ station, compact = false }: { station: TransitStation; compact?: boolean }) {
  const ratioText = station.prices[0]?.rechargeRatio ?? null;
  const coefficient = getStationRechargeCoefficient(station);

  if (!ratioText || coefficient === null) {
    return <span className="text-xs text-[#7f8889]">未公开</span>;
  }

  return (
    <span
      className="inline-flex flex-col"
      title={`原始比例：${ratioText}，1 元约等于 ${(parseRechargeRatio(ratioText) ?? 0).toFixed(2)} 站内美元额度`}
    >
      <span className={`${compact ? "text-[11px]" : "text-sm"} font-bold text-[#2d3435]`}>{formatRate(coefficient)}</span>
      <span className="text-[11px] text-[#7f8889]">{ratioText}</span>
    </span>
  );
}

function FamilySummaryCell({
  station,
  family,
  compact = false,
}: {
  station: TransitStation;
  family: TransitModelFamily;
  compact?: boolean;
}) {
  const summary = getStationComparisonSummary(station)[family];

  if (summary.priceCount === 0) {
    return <span className="text-xs text-[#7f8889]">未收录</span>;
  }

  return (
    <div className={compact ? "" : "min-w-[118px]"}>
      <div className="text-xs font-semibold text-[#202829]">{formatMultiplierRange(summary)}</div>
      <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${getRateBadgeClass(summary.combinedRateMin)}`}>
        {formatRate(summary.combinedRateMin)}
      </span>
    </div>
  );
}

function PriceSummaryCell({ station }: { station: TransitStation }) {
  return (
    <div className="min-w-[210px]">
      <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2">
        <span className="text-xs font-semibold text-[#5a6061]">充值</span>
        <RechargeRatioDisplay station={station} />
        <span className="text-xs font-semibold text-[#5a6061]">Claude</span>
        <FamilySummaryCell station={station} family="claude" />
        <span className="text-xs font-semibold text-[#5a6061]">GPT</span>
        <FamilySummaryCell station={station} family="gpt" />
      </div>
    </div>
  );
}

function StationRow({
  station,
  onClick,
}: {
  station: TransitStation;
  onClick: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <tr
      className="cursor-pointer align-top transition hover:bg-[#f7f9f9] focus-visible:bg-[#f7f9f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#45bf78]/40"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="row"
      aria-label={`查看 ${station.name} 详情`}
    >
      <td className="max-w-[320px] px-5 py-4">
        <StationIdentity station={station} />
      </td>
      <td className="max-w-[260px] px-5 py-4">
        <ModelCoverage station={station} />
      </td>
      <td className="px-5 py-4">
        <PriceSummaryCell station={station} />
      </td>
      <td className="px-5 py-4">
        <div className="text-xs font-semibold text-[#202829]">{formatAvailability(station.availability)}</div>
        <div className="mt-0.5 text-[10px] text-[#7f8889]">
          {station.availability.lastCheckedAt ?? "暂无检查时间"}
        </div>
      </td>
      <td className="max-w-[220px] px-5 py-4">
        <PillList
          items={[
            ...station.accountPools.map((pool) => ({
              id: `pool-${pool}`,
              label: TRANSIT_ACCOUNT_POOL_LABELS[pool],
            })),
            ...station.channelTypes.map((type) => ({
              id: `channel-${type}`,
              label: TRANSIT_CHANNEL_TYPE_LABELS[type],
            })),
          ]}
          max={3}
        />
      </td>
      <td className="min-w-[160px] px-5 py-4">
        <RiskBlock station={station} />
      </td>
      <td className="px-5 py-4">
        <div className="text-xs text-[#5a6061]">{station.lastUpdatedAt}</div>
        <div className="mt-1 text-[10px] font-bold text-[#7f8889]">
          {TRANSIT_DATA_STATUS_LABELS[station.dataStatus]}
        </div>
      </td>
      <td className="px-5 py-4 text-center">
        <Link
          href={`/api-transit/${station.slug}`}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
        >
          查看
          <ChevronRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function StationCard({
  station,
  onClick,
}: {
  station: TransitStation;
  onClick: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="cursor-pointer rounded-lg bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 transition-colors hover:bg-[#fbfcfc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/40"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`查看 ${station.name} 详情`}
    >
      <div className="mb-3 flex items-center gap-3">
        <StationIdentity station={station} compact />
      </div>

      <div className="mb-3">
        <ModelCoverage station={station} />
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <InfoTile label="充值" value={<RechargeRatioDisplay station={station} compact />} />
        <InfoTile label="Claude" value={<FamilySummaryCell station={station} family="claude" compact />} />
        <InfoTile label="GPT" value={<FamilySummaryCell station={station} family="gpt" compact />} />
      </div>

      <div className="mb-3 text-xs text-[#5a6061]">
        稳定性 <span className="font-semibold text-[#202829]">{formatAvailability(station.availability)}</span>
      </div>
      <RiskBlock station={station} />
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#5a6061]">
        <span>更新于 {station.lastUpdatedAt} · {TRANSIT_DATA_STATUS_LABELS[station.dataStatus]}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[#2d3435]">
          查看 <ChevronRight size={13} />
        </span>
      </div>
    </div>
  );
}

function StationIdentity({ station, compact = false }: { station: TransitStation; compact?: boolean }) {
  const iconSizeClassName = compact ? "h-10 w-10" : "h-10 w-10";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className={`${iconSizeClassName} grid shrink-0 place-items-center rounded-full bg-[#f2f4f4] text-sm font-bold text-[#202829] ring-1 ring-[#adb3b4]/15`}>
        {station.name[0]}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[#202829]">{station.name}</div>
        <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[#5a6061]">
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">{station.websiteUrl.replace(/^https?:\/\//, "")}</span>
        </div>
      </div>
    </div>
  );
}

function ModelCoverage({ station }: { station: TransitStation }) {
  const names = Array.from(new Set(station.prices.map((price) => price.standardModel)));

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {names.slice(0, 3).map((name) => (
          <span key={name} className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-[11px] font-semibold text-[#2d3435]">
            {name}
          </span>
        ))}
        {names.length > 3 ? <CountBadge tone="neutral">+{names.length - 3}</CountBadge> : null}
      </div>
      <p className="text-xs leading-5 text-[#5a6061]">{station.summary}</p>
    </div>
  );
}

function PillList({ items, max = items.length }: { items: { id: string; label: string }[]; max?: number }) {
  const visible = items.slice(0, max);

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((item) => (
        <span
          key={item.id}
          className="rounded-full bg-[#f2f4f4] px-2 py-0.5 text-[11px] font-semibold text-[#2d3435]"
        >
          {item.label}
        </span>
      ))}
      {items.length > max ? <CountBadge tone="neutral">+{items.length - max}</CountBadge> : null}
    </div>
  );
}

function RiskBlock({ station }: { station: TransitStation }) {
  const visibleRisks = station.riskLabels.slice(0, 3);

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleRisks.map((risk) => (
        <span key={risk} className="rounded-full bg-[#fff7e8] px-2 py-0.5 text-[11px] font-semibold text-[#7a541b]">
          {TRANSIT_RISK_LABELS[risk]}
        </span>
      ))}
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getUsageAdviceBadgeClass(station.usageAdvice)}`}>
        {TRANSIT_USAGE_ADVICE_LABELS[station.usageAdvice]}
      </span>
    </div>
  );
}

function InfoTile({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-[#f2f4f4] p-2">
      <div className="mb-1 text-[10px] font-bold text-[#5a6061]">{label}</div>
      {value}
    </div>
  );
}

function CountBadge({ children, tone }: { children: React.ReactNode; tone: "good" | "warn" | "neutral" }) {
  const toneClass =
    tone === "good"
      ? "bg-[#e8f3ec] text-[#2f7a4b]"
      : tone === "warn"
        ? "bg-[#fff7e8] text-[#7a541b]"
        : "bg-[#f2f4f4] text-[#5a6061]";

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${toneClass}`}>{children}</span>;
}
