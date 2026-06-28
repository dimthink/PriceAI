"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowUpDown, ChevronRight, Filter } from "lucide-react";
import {
  DataTableHead,
  DataTableShell,
  MobileFilterSheet,
  SearchField,
  SelectFilter,
  StatusChip,
} from "@/components/ComparisonUi";
import {
  TransitAffPreferenceToggle,
} from "@/components/TransitAffPreference";
import { TransitAvailabilityStrip } from "@/components/TransitAvailabilityStrip";
import { TransitStationSystemIcon } from "@/components/TransitStationSystemIcon";
import { TransitViewTabs } from "@/components/TransitViewTabs";
import { listDetailNavigationHref } from "@/lib/list-return";
import { formatDateMinute, formatDateShortMinute } from "@/lib/utils";
import type {
  TransitAccountPool,
  TransitChannelType,
  TransitModelFamily,
  TransitStation,
} from "@/data/api-transit/types";
import {
  TRANSIT_ACCOUNT_POOL_LABELS,
  TRANSIT_CHANNEL_TYPE_LABELS,
  TRANSIT_DATA_STATUS_LABELS,
  TRANSIT_MODEL_FAMILY_LABELS,
  TRANSIT_MODEL_FAMILY_ORDER,
} from "@/data/api-transit/types";
import {
  compareStations,
  formatAvailability,
  formatMultiplierRange,
  formatRate,
  getRateBadgeClass,
  getEffectiveTransitChannelTypes,
  getNormalizedSourceTags,
  getPrimaryTransitCommercialOffer,
  getStationComparisonSummary,
  getStationRechargeCoefficient,
  getTransitReviewTags,
  getTransitStationSystemLabel,
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

const SORT_OPTIONS: { value: TransitSortKey; label: string }[] = [
  { value: "overall", label: "综合排序" },
  { value: "rate", label: "最低倍率" },
  { value: "stability", label: "稳定性优先" },
];

function sortLabel(value: TransitSortKey) {
  return SORT_OPTIONS.find((option) => option.value === value)?.label ?? "综合排序";
}

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
  const familyFilter = coerceParam(
    searchParams.get("family") ?? searchParams.get("model"),
    ["all", ...TRANSIT_MODEL_FAMILY_ORDER] as const,
    "all"
  );
  const [channelFilter, setChannelFilter] = useState<TransitChannelType | "all">(
    coerceParam(searchParams.get("channel"), CHANNEL_OPTIONS.map((item) => item.value), "all")
  );
  const [poolFilter, setPoolFilter] = useState<TransitAccountPool | "all">(
    coerceParam(searchParams.get("pool"), POOL_OPTIONS.map((item) => item.value), "all")
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
    if (familyFilter !== "all") params.set("family", familyFilter);
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (poolFilter !== "all") params.set("pool", poolFilter);
    if (sortBy !== "overall") params.set("sort", sortBy);

    const query = params.toString();
    router.replace(query ? `/api-transit?${query}` : "/api-transit", { scroll: false });
  }, [channelFilter, familyFilter, poolFilter, router, search, sortBy, urlReady]);

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

    if (familyFilter !== "all") {
      result = result.filter((station) =>
        station.prices.some((price) => price.family === familyFilter)
      );
    }

    if (channelFilter !== "all") {
      result = result.filter((station) => getEffectiveTransitChannelTypes(station).includes(channelFilter));
    }

    if (poolFilter !== "all") {
      result = result.filter((station) => station.accountPools.includes(poolFilter));
    }

    return compareStations(result, sortBy);
  }, [channelFilter, familyFilter, poolFilter, search, sortBy, stations]);

  const activeFilterCount =
    [channelFilter, poolFilter].filter((value) => value !== "all").length +
    (search ? 1 : 0) +
    (sortBy !== "overall" ? 1 : 0);

  const returnQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (familyFilter !== "all") params.set("family", familyFilter);
    if (channelFilter !== "all") params.set("channel", channelFilter);
    if (poolFilter !== "all") params.set("pool", poolFilter);
    if (sortBy !== "overall") params.set("sort", sortBy);
    return params.toString();
  }, [channelFilter, familyFilter, poolFilter, search, sortBy]);

  const stationDetailHref = useCallback(
    (slug: string) => listDetailNavigationHref(`/api-transit/${slug}`, returnQuery),
    [returnQuery]
  );

  const navigateToStation = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router]
  );

  const prefetchStation = useCallback(
    (slug: string) => {
      router.prefetch(`/api-transit/${slug}`);
    },
    [router]
  );

  return (
    <div>
      <div className="mb-5 space-y-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="搜索站点名称、描述..."
            className="flex-1 xl:max-w-[460px]"
          />
          <TransitViewTabs active="stations" className="shrink-0" />
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-none">
            <label className="relative inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[#e4e9ea] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]">
              <ArrowUpDown className="h-4 w-4 shrink-0" />
              <span className="pointer-events-none min-w-[5.25em]">{sortLabel(sortBy)}</span>
              <select
                aria-label="排序"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as TransitSortKey)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                showFilters || activeFilterCount > 0
                  ? "bg-[#2d3435] text-[#f8f8f8]"
                  : "bg-white text-[#5a6061] ring-1 ring-[#adb3b4]/15 hover:bg-[#fbfcfc]"
              }`}
            >
              <Filter className="h-3.5 w-3.5" />
              筛选{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
            </button>
            <TransitAffPreferenceToggle />
          </div>
        </div>
        {showFilters ? (
          <div className="mt-3 hidden grid-cols-1 gap-3 rounded-lg bg-[#f2f4f4] p-3 ring-1 ring-[#adb3b4]/10 md:grid md:grid-cols-2">
            <SelectFilter
              label="渠道类型"
              value={channelFilter}
              onChange={(value) => setChannelFilter(value as TransitChannelType | "all")}
              options={CHANNEL_OPTIONS}
            />
            <SelectFilter
              label="号池"
              value={poolFilter}
              onChange={(value) => setPoolFilter(value as TransitAccountPool | "all")}
              options={POOL_OPTIONS}
            />
          </div>
        ) : null}
      </div>

      <MobileFilterSheet
        open={showFilters}
        title="筛选中转站"
        description="按渠道类型和号池来源缩小列表。模型族请使用顶部分类。"
        resultCount={filtered.length}
        onClose={() => setShowFilters(false)}
        onReset={() => {
          setSearch("");
          setChannelFilter("all");
          setPoolFilter("all");
          setSortBy("overall");
        }}
      >
        <SelectFilter
          label="渠道类型"
          value={channelFilter}
          onChange={(value) => setChannelFilter(value as TransitChannelType | "all")}
          options={CHANNEL_OPTIONS}
        />
        <SelectFilter
          label="号池"
          value={poolFilter}
          onChange={(value) => setPoolFilter(value as TransitAccountPool | "all")}
          options={POOL_OPTIONS}
        />
      </MobileFilterSheet>

      {filtered.length === 0 ? (
        <div className="rounded-lg bg-white px-6 py-16 text-center text-[#5a6061] ring-1 ring-[#adb3b4]/15">
          <p className="mb-2 text-lg font-semibold text-[#202829]">
            {stations.length === 0 ? "暂无已发布的真实中转站数据" : "没有匹配的中转站"}
          </p>
          <p className="mx-auto max-w-[560px] text-sm leading-6">
            {stations.length === 0
              ? "后台候选数据需要完成清洗、审核和发布后才会出现在这里；没有真实发布数据时不会展示样例榜单。"
              : "尝试调整模型、渠道或号池筛选。"}
          </p>
        </div>
      ) : (
        <>
          <DataTableShell className="hidden md:block">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm" role="table">
                <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
                  <tr role="row">
                    <DataTableHead>站点</DataTableHead>
                    <DataTableHead>{familyFilter === "all" ? "最低综合" : `${TRANSIT_MODEL_FAMILY_LABELS[familyFilter]} 综合`}</DataTableHead>
                    <DataTableHead>覆盖模型</DataTableHead>
                    <DataTableHead>充值倍率</DataTableHead>
                    <DataTableHead>稳定性</DataTableHead>
                    <DataTableHead>来源渠道</DataTableHead>
                    <DataTableHead>更新时间</DataTableHead>
                    <DataTableHead className="w-[120px] text-center">操作</DataTableHead>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f1]" role="rowgroup">
                  {filtered.map((station) => (
                    <StationRow
                      key={station.id}
                      station={station}
                      href={stationDetailHref(station.slug)}
                      activeFamily={familyFilter}
                      onClick={navigateToStation}
                      onWarm={() => prefetchStation(station.slug)}
                    />
                  ))}
                </tbody>
            </table>
          </DataTableShell>

          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filtered.map((station) => (
              <StationCard
                key={station.id}
                station={station}
                href={stationDetailHref(station.slug)}
                activeFamily={familyFilter}
                onClick={navigateToStation}
                onWarm={() => prefetchStation(station.slug)}
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

function RechargeRatioDisplay({ station }: { station: TransitStation }) {
  const ratioText = station.prices[0]?.rechargeRatio ?? null;
  const coefficient = getStationRechargeCoefficient(station);

  if (!ratioText || coefficient === null) {
    return <span className="text-xs text-[#7f8889]">未公开</span>;
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`原始比例：${ratioText}，1 元约等于 ${(parseRechargeRatio(ratioText) ?? 0).toFixed(2)} 站内美元额度`}
    >
      <span className="font-bold text-[#2d3435]">{formatRate(coefficient)}</span>
      <span className="rounded-full bg-[#eef3f8] px-1.5 py-0.5 text-[10px] font-bold text-[#47657a]">{ratioText}</span>
    </span>
  );
}

function CombinedRateCell({
  station,
  family,
  compact = false,
}: {
  station: TransitStation;
  family: "all" | TransitModelFamily;
  compact?: boolean;
}) {
  const comparison = getStationComparisonSummary(station);
  const summary = family === "all" ? null : comparison.families[family];
  const rate = summary ? summary.combinedRateMin : comparison.bestCombinedRate;

  if (summary && summary.priceCount === 0) {
    return <span className="text-xs text-[#7f8889]">未收录</span>;
  }

  if (!summary && rate === null) {
    return <span className="text-xs text-[#7f8889]">暂无倍率</span>;
  }

  return (
    <div className={compact ? "" : "min-w-[108px]"}>
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${getRateBadgeClass(rate)}`}>
        {formatRate(rate)}
      </span>
      <div className="mt-1 text-[10px] font-semibold text-[#7f8889]">
        {summary ? formatMultiplierRange(summary) : bestFamilyLabel(comparison)}
      </div>
    </div>
  );
}

function PriceBreakdownCell({
  station,
  activeFamily,
  compact = false,
}: {
  station: TransitStation;
  activeFamily: "all" | TransitModelFamily;
  compact?: boolean;
}) {
  const summary = getStationComparisonSummary(station);
  const visibleSummaries = TRANSIT_MODEL_FAMILY_ORDER
    .map((family) => summary.families[family])
    .filter((item) => item.priceCount > 0 && (activeFamily === "all" || item.family === activeFamily))
    .slice(0, compact ? 3 : 4);

  return (
    <div className={compact ? "space-y-1" : "min-w-[166px] space-y-1"}>
      <div className="flex items-center justify-between gap-2 rounded-md bg-[#f2f4f4] px-2 py-1 text-[11px]">
        <span className="font-semibold text-[#5a6061]">充值</span>
        <RechargeRatioDisplay station={station} />
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
        {visibleSummaries.length ? (
          visibleSummaries.map((item) => (
            <CompactRateTag
              key={item.family}
              label={TRANSIT_MODEL_FAMILY_LABELS[item.family]}
              value={formatMultiplierRange(item)}
              missing={false}
            />
          ))
        ) : (
          <CompactRateTag label="模型" value="—" missing />
        )}
      </div>
    </div>
  );
}

function bestFamilyLabel(summary: ReturnType<typeof getStationComparisonSummary>): string {
  const best = TRANSIT_MODEL_FAMILY_ORDER
    .map((family) => summary.families[family])
    .filter((item) => item.combinedRateMin !== null)
    .sort((left, right) => (left.combinedRateMin ?? Infinity) - (right.combinedRateMin ?? Infinity))[0];
  return best ? `${TRANSIT_MODEL_FAMILY_LABELS[best.family]} 最低` : "全模型";
}

function CompactRateTag({ label, value, missing }: { label: string; value: string; missing: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${missing ? "bg-[#f2f4f4] text-[#7f8889]" : "bg-[#fff7e8] text-[#7a541b]"}`}>
      {label} {missing ? "未收录" : value}
    </span>
  );
}

function StationRow({
  station,
  href,
  activeFamily,
  onClick,
  onWarm,
}: {
  station: TransitStation;
  href: string;
  activeFamily: "all" | TransitModelFamily;
  onClick: (href: string) => void;
  onWarm: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(href);
    }
  };

  return (
    <tr
      className="cursor-pointer align-top transition hover:bg-[#f7f9f9] focus-visible:bg-[#f7f9f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#45bf78]/40"
      onClick={() => onClick(href)}
      onFocus={onWarm}
      onKeyDown={handleKeyDown}
      onMouseEnter={onWarm}
      tabIndex={0}
      role="row"
      aria-label={`查看 ${station.name} 详情`}
    >
      <td className="max-w-[320px] px-5 py-4">
        <StationIdentity station={station} />
      </td>
      <td className="px-5 py-4">
        <CombinedRateCell station={station} family={activeFamily} />
      </td>
      <td className="px-5 py-4">
        <FamilyCoverage station={station} activeFamily={activeFamily} />
      </td>
      <td className="px-5 py-4">
        <PriceBreakdownCell station={station} activeFamily={activeFamily} />
      </td>
      <td className="px-5 py-4">
        <AvailabilityCell station={station} />
      </td>
      <td className="max-w-[220px] px-5 py-4">
        <SourceChannelCell station={station} />
      </td>
      <td className="px-5 py-4">
        <UpdatedAtCell station={station} />
      </td>
      <td className="px-5 py-4 text-center">
        <Link
          href={href}
          onClick={(event) => event.stopPropagation()}
          onFocus={onWarm}
          onMouseEnter={onWarm}
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
  href,
  activeFamily,
  onClick,
  onWarm,
}: {
  station: TransitStation;
  href: string;
  activeFamily: "all" | TransitModelFamily;
  onClick: (href: string) => void;
  onWarm: () => void;
}) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(href);
    }
  };

  return (
    <div
      className="cursor-pointer rounded-lg bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 transition-colors hover:bg-[#fbfcfc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/40"
      onClick={() => onClick(href)}
      onFocus={onWarm}
      onKeyDown={handleKeyDown}
      onMouseEnter={onWarm}
      tabIndex={0}
      role="button"
      aria-label={`查看 ${station.name} 详情`}
    >
      <div className="mb-3 flex items-center gap-3">
        <StationIdentity station={station} compact />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <InfoTile label={activeFamily === "all" ? "最低综合" : `${TRANSIT_MODEL_FAMILY_LABELS[activeFamily]} 综合`} value={<CombinedRateCell station={station} family={activeFamily} compact />} />
        <InfoTile label="覆盖模型" value={<FamilyCoverage station={station} activeFamily={activeFamily} compact />} />
      </div>
      <div className="mb-3">
        <PriceBreakdownCell station={station} activeFamily={activeFamily} compact />
      </div>

      <div className="mb-3">
        <AvailabilityCell station={station} compact />
      </div>
      <SourceChannelCell station={station} />
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[#5a6061]">
        <span>更新于 {formatDateShortMinute(station.lastUpdatedAt)} · {TRANSIT_DATA_STATUS_LABELS[station.dataStatus]}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[#2d3435]">
          查看 <ChevronRight size={13} />
        </span>
      </div>
    </div>
  );
}

function AvailabilityCell({ station, compact = false }: { station: TransitStation; compact?: boolean }) {
  return (
    <div className={compact ? "" : "min-w-[118px]"}>
      {compact ? (
        <div className="mb-1 text-xs font-semibold text-[#5a6061]">
          稳定性 <span className="text-[#202829]">{formatAvailability(station.availability)}</span>
        </div>
      ) : (
        <div className="text-xs font-semibold text-[#202829]">{formatAvailability(station.availability)}</div>
      )}
      <TransitAvailabilityStrip
        rate={station.availability.sevenDayRate}
        samples={station.availability.sevenDaySamples}
        lastCheckedAt={station.availability.lastCheckedAt}
        className="mt-1"
      />
      <div className="mt-1 whitespace-nowrap text-[10px] text-[#7f8889]">
        {formatDateShortMinute(station.availability.lastCheckedAt)}
      </div>
    </div>
  );
}

function UpdatedAtCell({ station }: { station: TransitStation }) {
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full bg-[#f2f4f4] px-2.5 py-1 text-[11px] font-semibold text-[#5a6061]"
      title={`${formatDateMinute(station.lastUpdatedAt)} · ${TRANSIT_DATA_STATUS_LABELS[station.dataStatus]}`}
    >
      {formatDateShortMinute(station.lastUpdatedAt)}
    </span>
  );
}

function StationIdentity({
  station,
  compact = false,
}: {
  station: TransitStation;
  compact?: boolean;
}) {
  const offer = getPrimaryTransitCommercialOffer(station);
  const offerLabel = offer ? formatListOfferLabel(offer) : null;
  const offerTitle = offer ? offer.title : "";

  return (
    <div className="flex min-w-0 items-center gap-3">
      <TransitStationSystemIcon station={station} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#202829]">{station.name}</div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="inline-flex h-5 w-[72px] shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] px-2 text-[10px] font-bold text-[#5a6061]">
            <span className="truncate">{getTransitStationSystemLabel(station)}</span>
          </span>
          {offerLabel ? (
            <span
              className="inline-flex h-5 max-w-[116px] shrink-0 items-center justify-center rounded-full bg-[#fff7e8] px-2 text-[10px] font-bold text-[#7a541b]"
              title={offerTitle}
            >
              <span className="truncate">{offerLabel}</span>
            </span>
          ) : null}
          <ModelCoverage station={station} compact={compact} />
        </div>
      </div>
    </div>
  );
}

function formatListOfferLabel(offer: NonNullable<TransitStation["commercialOffers"]>[number]): string {
  if (offer.listLabel) return offer.listLabel;
  if (/首充/.test(offer.title)) return "首充优惠";
  if (/充值/.test(offer.title)) return "充值优惠";

  const amount = extractRegistrationBonusAmount([
    offer.title,
    offer.description,
  ].filter(Boolean).join(" "));
  if (amount) return `注册赠送 $${amount}`;
  return offer.title;
}

function extractRegistrationBonusAmount(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ");
  const registrationMatch = normalized.match(/注册[^0-9$¥￥]*(?:赠送|赠|送)[^0-9$¥￥]*(?:[$¥￥]\s*)?(\d+(?:\.\d+)?)(?:\s*(?:刀|美元|美金|余额|额度))?/);
  if (registrationMatch?.[1]) return registrationMatch[1];

  const dollarMatch = normalized.match(/(?:[$]\s*)(\d+(?:\.\d+)?)(?:\s*(?:余额|额度))?/);
  if (dollarMatch?.[1]) return dollarMatch[1];

  return null;
}

function ModelCoverage({ station, compact = false }: { station: TransitStation; compact?: boolean }) {
  return <FamilyCoverage station={station} activeFamily="all" compact={compact} />;
}

function FamilyCoverage({
  station,
  activeFamily,
  compact = false,
}: {
  station: TransitStation;
  activeFamily: "all" | TransitModelFamily;
  compact?: boolean;
}) {
  const families = TRANSIT_MODEL_FAMILY_ORDER.filter((family) =>
    station.prices.some((price) => price.family === family)
  );
  const visibleFamilies = activeFamily === "all"
    ? families.slice(0, compact ? 3 : 4)
    : families.filter((family) => family === activeFamily);

  if (!visibleFamilies.length) {
    return (
      <div className="flex min-w-0 shrink-0 gap-1.5">
        <CoverageBadge label={activeFamily === "all" ? "模型" : TRANSIT_MODEL_FAMILY_LABELS[activeFamily]} covered={false} compact={compact} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 shrink-0 flex-wrap gap-1.5">
      {visibleFamilies.map((family) => (
        <CoverageBadge
          key={family}
          label={TRANSIT_MODEL_FAMILY_LABELS[family]}
          covered
          compact={compact}
        />
      ))}
      {activeFamily === "all" && families.length > visibleFamilies.length ? (
        <StatusChip tone="muted" className="h-5 justify-center px-2 py-0 text-[10px]">
          +{families.length - visibleFamilies.length}
        </StatusChip>
      ) : null}
    </div>
  );
}

function CoverageBadge({ covered, label, compact }: { covered: boolean; label: string; compact: boolean }) {
  return (
    <StatusChip tone={covered ? "success" : "muted"} className={compact ? "h-5 min-w-[64px] justify-center px-1.5 py-0 text-[10px]" : "h-5 min-w-[64px] justify-center px-1.5 py-0 text-[10px]"}>
      {label}{covered ? "" : " 未收录"}
    </StatusChip>
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
      {items.length > max ? <StatusChip tone="muted" className="px-2 py-0.5 text-[11px]">+{items.length - max}</StatusChip> : null}
    </div>
  );
}

function SourceChannelCell({ station }: { station: TransitStation }) {
  const channelItems = getNormalizedSourceTags(station);
  const reviewHints = getTransitReviewTags(station);

  return (
    <div className="space-y-1.5">
      <PillList items={channelItems} max={3} />
      {reviewHints.length ? (
        <div className="flex flex-wrap gap-1.5">
          {reviewHints.slice(0, 2).map((hint) => (
            <span key={hint.id} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${hint.tone === "neutral" ? "bg-[#f2f4f4] text-[#5a6061]" : "bg-[#fff7e8] text-[#7a541b]"}`}>
              {hint.label}
            </span>
          ))}
        </div>
      ) : null}
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
