"use client";

import { Fragment, type KeyboardEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  DataTableHead,
  DataTableShell,
  SearchField,
  StatusChip,
} from "@/components/ComparisonUi";
import { TransitModelIcon } from "@/components/TransitModelIcon";
import { TransitPriceBreakdown } from "@/components/TransitPriceBreakdown";
import { TransitViewTabs } from "@/components/TransitViewTabs";
import { formatDateMinute } from "@/lib/utils";
import type { TransitModelFamily, TransitStation } from "@/data/api-transit/types";
import {
  TRANSIT_ACCOUNT_POOL_LABELS,
  TRANSIT_CHANNEL_TYPE_LABELS,
  TRANSIT_RISK_LABELS,
  TRANSIT_USAGE_ADVICE_LABELS,
  isTransitModelFamily,
} from "@/data/api-transit/types";
import {
  formatPercent,
  formatRate,
  formatTransitModelMultiplier,
  getRateBadgeClass,
  getTransitModelSummaries,
  getTransitStationSystemLabel,
  getUsageAdviceBadgeClass,
  type TransitModelPriceEntry,
  type TransitModelSummary,
} from "@/lib/api-transit";
import {
  TRANSIT_COMBINED_RATE_EXPLANATION,
  TRANSIT_MODEL_MULTIPLIER_EXPLANATION,
  TRANSIT_RECHARGE_COEFFICIENT_EXPLANATION,
} from "@/lib/api-transit-copy";

type FamilyFilter = "all" | TransitModelFamily;

function coerceFamily(value: string | null): FamilyFilter {
  return isTransitModelFamily(value) ? value : "all";
}

interface Props {
  stations: TransitStation[];
}

export default function TransitModelExplorer({ stations }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [urlReady, setUrlReady] = useState(false);
  const family = coerceFamily(searchParams.get("family") ?? searchParams.get("model"));
  const [query, setQuery] = useState(searchParams.get("q") || "");

  useEffect(() => {
    const timeout = window.setTimeout(() => setUrlReady(true), 60);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!urlReady) return;

    const params = new URLSearchParams();
    if (family !== "all") params.set("family", family);
    if (query) params.set("q", query);
    const qs = params.toString();

    router.replace(qs ? `/api-transit/models?${qs}` : "/api-transit/models", { scroll: false });
  }, [family, query, router, urlReady]);

  const modelSummaries = useMemo(() => {
    const summaries = getTransitModelSummaries(stations, family);
    if (!query) return summaries;

    const q = query.trim().toLowerCase();
    return summaries.filter(
      (summary) =>
        summary.standardModel.toLowerCase().includes(q) ||
        summary.familyLabel.toLowerCase().includes(q)
    );
  }, [family, query, stations]);

  return (
    <div>
      <div className="mb-5 space-y-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,460px)_auto] xl:items-center xl:justify-start">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="搜索标准模型名..."
            className="w-full"
          />
          <TransitViewTabs
            active="models"
            className="w-full bg-[#edf0f1] xl:w-fit xl:justify-self-start"
            itemClassName="flex-1 xl:flex-none"
          />
        </div>
      </div>

      {modelSummaries.length === 0 ? (
        <div className="rounded-lg bg-white px-6 py-16 text-center text-[#5a6061] ring-1 ring-[#adb3b4]/15">
          <p className="mb-2 text-lg font-semibold text-[#202829]">
            {stations.length === 0 ? "暂无已发布的真实模型数据" : "没有匹配的模型"}
          </p>
          <p className="mx-auto max-w-[560px] text-sm leading-6">
            {stations.length === 0
              ? "后台候选数据完成清洗、审核和发布后，模型页才会展示可对比的真实报价。"
              : "尝试调整模型族或搜索关键词。"}
          </p>
        </div>
      ) : (
        <>
          <ModelSummaryTable summaries={modelSummaries} />
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {modelSummaries.map((summary) => (
              <ModelSummaryCard key={`${summary.family}-${summary.standardModel}`} summary={summary} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ModelSummaryTable({ summaries }: { summaries: TransitModelSummary[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  function toggleModel(summary: TransitModelSummary) {
    const key = modelKey(summary);
    setExpandedKey((current) => current === key ? null : key);
  }

  return (
    <DataTableShell className="hidden md:block">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <DataTableHead>标准模型</DataTableHead>
              <DataTableHead explanation={TRANSIT_COMBINED_RATE_EXPLANATION}>最优综合倍率</DataTableHead>
              <DataTableHead>稳定性</DataTableHead>
              <DataTableHead>代表站点</DataTableHead>
              <DataTableHead>覆盖</DataTableHead>
              <DataTableHead className="w-[120px] text-center">操作</DataTableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {summaries.map((summary) => {
              const expanded = expandedKey === modelKey(summary);

              return (
                <Fragment key={`${summary.family}-${summary.standardModel}`}>
                  <ModelSummaryRow
                    summary={summary}
                    expanded={expanded}
                    onToggleModel={() => toggleModel(summary)}
                  />
                  {expanded ? <ModelExpandedRow summary={summary} stationId="all" /> : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
    </DataTableShell>
  );
}

function ModelSummaryRow({
  summary,
  expanded,
  onToggleModel,
}: {
  summary: TransitModelSummary;
  expanded: boolean;
  onToggleModel: () => void;
}) {
  const bestEntry = summary.prices[0] ?? null;
  const hasPrices = summary.prices.length > 0;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggleModel();
    }
  }

  return (
    <tr
      className="cursor-pointer align-top transition hover:bg-[#f7f9f9] focus-visible:bg-[#f7f9f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#45bf78]/40"
      onClick={onToggleModel}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-expanded={expanded}
      aria-label={`${expanded ? "收起" : "展开"} ${summary.standardModel} 站点倍率`}
    >
      <td className="max-w-[330px] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
            <TransitModelIcon family={summary.family} standardModel={summary.standardModel} className="h-7 w-7" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[#202829]">
              {summary.standardModel}
            </span>
            <span className="mt-1 block truncate text-xs text-[#5a6061]">
              {summary.familyLabel} · {summary.stationCount} 个站点 · 样本 {summary.sampleCount}
            </span>
          </span>
        </div>
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold leading-6 text-[#202829]">
          {hasPrices ? formatRate(summary.bestCombinedRate) : "暂无报价"}
        </p>
        {summary.worstCombinedRate !== null && summary.worstCombinedRate !== summary.bestCombinedRate ? (
          <p className="mt-1 text-xs text-[#5a6061]">最高 {formatRate(summary.worstCombinedRate)}</p>
        ) : (
          <p className="mt-1 text-xs text-[#5a6061]">{hasPrices ? "综合倍率" : "等待站点采集"}</p>
        )}
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold leading-6 text-[#202829]">{formatPercent(summary.averageAvailability)}</p>
        <p className="mt-1 text-xs text-[#5a6061]">样本 {summary.sampleCount}</p>
      </td>
      <td className="max-w-[260px] px-5 py-4">
        {bestEntry ? <RepresentativeStation entry={bestEntry} /> : <span className="text-sm text-[#5a6061]">暂无代表站点</span>}
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold text-[#202829]">{summary.stationCount} 个站点</p>
        <p className="mt-1 text-xs text-[#5a6061]">报价样本 {summary.sampleCount}</p>
      </td>
      <td className="w-[120px] px-5 py-4 text-center">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleModel();
          }}
          className="inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
          aria-expanded={expanded}
        >
          {expanded ? "收起" : hasPrices ? "展开" : "说明"}
          <ChevronDown size={14} className={`transition ${expanded ? "rotate-180" : ""}`} />
        </button>
      </td>
    </tr>
  );
}

function ModelSummaryCard({ summary }: { summary: TransitModelSummary }) {
  const bestEntry = summary.prices[0] ?? null;
  const hasPrices = summary.prices.length > 0;
  const [expanded, setExpanded] = useState(false);

  function toggleModel() {
    setExpanded((current) => !current);
  }

  return (
    <article
      className="rounded-lg bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 transition hover:bg-[#fbfcfc]"
    >
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
          <TransitModelIcon family={summary.family} standardModel={summary.standardModel} className="h-7 w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#202829]">{summary.standardModel}</span>
          <span className="mt-1 block truncate text-xs text-[#5a6061]">{summary.familyLabel} · {summary.stationCount} 个站点</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getRateBadgeClass(summary.bestCombinedRate)}`}>
          {hasPrices ? formatRate(summary.bestCombinedRate) : "暂无报价"}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-[#5a6061]">
        <div>
          稳定性 <span className="font-semibold text-[#2d3435]">{formatPercent(summary.averageAvailability)}</span>
        </div>
        <div>
          样本 <span className="font-semibold text-[#2d3435]">{summary.sampleCount}</span>
        </div>
      </div>
      {bestEntry ? <RepresentativeStation entry={bestEntry} /> : <NoPublishedPricesMessage compact />}
      {expanded ? <ModelMobileExpandedPanel summary={summary} stationId="all" /> : null}
      <button
        type="button"
        onClick={toggleModel}
        className="mt-3 inline-flex h-8 items-center gap-1 rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8]"
        aria-expanded={expanded}
      >
        {expanded ? "收起站点报价" : hasPrices ? "展开站点报价" : "查看说明"}
        <ChevronDown size={13} className={`transition ${expanded ? "rotate-180" : ""}`} />
      </button>
    </article>
  );
}

function ModelExpandedRow({ summary, stationId }: { summary: TransitModelSummary; stationId: string }) {
  return (
    <tr>
      <td colSpan={6} className="bg-[#fbfcfc] px-5 pb-5 pt-0">
        <ModelExpandedPanel summary={summary} stationId={stationId} />
      </td>
    </tr>
  );
}

function ModelExpandedPanel({ summary, stationId }: { summary: TransitModelSummary; stationId: string }) {
  const entries = getExpandedEntries(summary, stationId);
  const selectedStation = stationId === "all" ? null : entries[0]?.station ?? null;
  const hasEntries = entries.length > 0;

  return (
    <div className="rounded-lg border border-[#dfe4e5] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dfe4e5] bg-[#f2f4f4] px-4 py-3">
        <div>
          <p className="text-sm font-extrabold text-[#202829]">
            {selectedStation ? selectedStation.name : "全部站点"} · {summary.standardModel}
          </p>
          <p className="mt-1 text-xs text-[#5a6061]">展示该模型在对应站点/分组下的官方价、换算价、充值倍率、模型倍率和综合倍率。</p>
        </div>
        {selectedStation ? (
          <Link
            href={`/api-transit/${selectedStation.slug}`}
            className="inline-flex h-8 items-center gap-1 rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] hover:bg-[#202829]"
          >
            站点详情
            <ChevronRight size={13} />
          </Link>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] border-collapse text-left text-xs">
          <thead className="bg-[#f7f9f9] text-[#5a6061]">
            <tr>
              <DataTableHead>站点</DataTableHead>
              <DataTableHead>分组</DataTableHead>
              <DataTableHead explanation={TRANSIT_MODEL_MULTIPLIER_EXPLANATION}>模型倍率</DataTableHead>
              <DataTableHead explanation={TRANSIT_COMBINED_RATE_EXPLANATION}>综合倍率</DataTableHead>
              <DataTableHead>输入 / 输出</DataTableHead>
              <DataTableHead explanation={TRANSIT_RECHARGE_COEFFICIENT_EXPLANATION}>充值倍率</DataTableHead>
              <DataTableHead>渠道 / 号池</DataTableHead>
              <DataTableHead>确认时间</DataTableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {hasEntries ? (
              entries.map((entry) => (
                <ModelExpandedEntryRow key={`${entry.station.id}-${entry.price.groupName}`} entry={entry} />
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-8">
                  <NoPublishedPricesMessage />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelExpandedEntryRow({ entry }: { entry: TransitModelPriceEntry }) {
  const router = useRouter();
  const stationHref = `/api-transit/${entry.station.slug}`;

  function navigateToStation() {
    router.push(stationHref);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateToStation();
    }
  }

  return (
    <tr
      className="cursor-pointer transition hover:bg-[#f7f9f9] focus-visible:bg-[#f7f9f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#45bf78]/40"
      onClick={navigateToStation}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label={`查看 ${entry.station.name} 详情`}
    >
      <td className="px-4 py-3">
        <Link
          href={stationHref}
          onClick={(event) => event.stopPropagation()}
          className="font-semibold text-[#202829] transition-colors hover:text-[#2f7a4b]"
        >
          {entry.station.name}
        </Link>
        <div className="mt-1 text-[11px] text-[#5a6061]">{getTransitStationSystemLabel(entry.station)}</div>
      </td>
      <td className="px-4 py-3 text-[#2d3435]">{entry.price.groupName}</td>
      <td className="px-4 py-3 font-semibold text-[#202829]">{formatTransitModelMultiplier(entry.price)}</td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${getRateBadgeClass(entry.combinedRate)}`}>
          {formatRate(entry.combinedRate)}
        </span>
      </td>
      <td className="px-4 py-3">
        <TransitPriceBreakdown station={entry.station} price={entry.price} mode="compact" />
      </td>
      <td className="px-4 py-3 text-[#2d3435]">{formatRate(entry.rechargeCoefficient)}</td>
      <td className="px-4 py-3 text-[#5a6061]">
        {TRANSIT_CHANNEL_TYPE_LABELS[entry.price.channelType]} / {TRANSIT_ACCOUNT_POOL_LABELS[entry.price.accountPool]}
      </td>
      <td className="px-4 py-3 text-[#5a6061]">{formatDateMinute(entry.price.lastVerifiedAt)}</td>
    </tr>
  );
}

function ModelMobileExpandedPanel({ summary, stationId }: { summary: TransitModelSummary; stationId: string }) {
  const entries = getExpandedEntries(summary, stationId);
  const router = useRouter();

  function navigateToStation(slug: string) {
    router.push(`/api-transit/${slug}`);
  }

  return (
    <div className="mb-3 rounded-lg border border-[#dfe4e5] bg-[#fbfcfc] p-3">
      <div className="space-y-2">
        {entries.length > 0 ? (
          entries.slice(0, 8).map((entry) => (
            <button
              key={`${entry.station.id}-${entry.price.groupName}`}
              type="button"
              onClick={() => navigateToStation(entry.station.slug)}
              className="flex w-full items-start justify-between gap-3 border-b border-[#edf0f1] pb-2 text-left transition hover:bg-[#f7f9f9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#45bf78]/35 last:border-0 last:pb-0"
              aria-label={`查看 ${entry.station.name} 详情`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[#202829]">{entry.station.name}</p>
                <p className="mt-1 truncate text-[11px] text-[#5a6061]">{entry.price.groupName} · {TRANSIT_CHANNEL_TYPE_LABELS[entry.price.channelType]}</p>
                <div className="mt-2">
                  <TransitPriceBreakdown station={entry.station} price={entry.price} mode="compact" />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-[#202829]">{formatTransitModelMultiplier(entry.price)}</p>
                <p className={`mt-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${getRateBadgeClass(entry.combinedRate)}`}>
                  {formatRate(entry.combinedRate)}
                </p>
              </div>
            </button>
          ))
        ) : (
          <NoPublishedPricesMessage compact />
        )}
      </div>
    </div>
  );
}

function NoPublishedPricesMessage({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`text-[#5a6061] ${compact ? "text-xs leading-5" : "text-center text-sm leading-6"}`}>
      <p className="font-semibold text-[#202829]">暂无已发布报价</p>
      <p className="mt-1">这个标准模型已纳入中转 API 观察清单，等站点价格完成采集和审核后会补齐倍率与代表站点。</p>
    </div>
  );
}

function RepresentativeStation({ entry }: { entry: TransitModelPriceEntry }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold text-[#202829]">{entry.station.name}</p>
      <p className="mt-1 truncate text-xs text-[#5a6061]">
        {TRANSIT_ACCOUNT_POOL_LABELS[entry.price.accountPool]} · 充值 {formatRate(entry.rechargeCoefficient)} · 模型{" "}
        {formatTransitModelMultiplier(entry.price)}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getRateBadgeClass(entry.combinedRate)}`}>
          {formatRate(entry.combinedRate)}
        </span>
        <RiskPills station={entry.station} />
      </div>
    </div>
  );
}

function RiskPills({ station }: { station: TransitStation }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {station.riskLabels.slice(0, 1).map((risk) => (
        <StatusChip key={risk} tone="warning" className="px-2 py-0.5 text-[11px]">
          {TRANSIT_RISK_LABELS[risk]}
        </StatusChip>
      ))}
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${getUsageAdviceBadgeClass(station.usageAdvice)}`}>
        {TRANSIT_USAGE_ADVICE_LABELS[station.usageAdvice]}
      </span>
    </div>
  );
}

function modelKey(summary: TransitModelSummary): string {
  return `${summary.family}:${summary.standardModel}`;
}

function getExpandedEntries(summary: TransitModelSummary, stationId: string): TransitModelPriceEntry[] {
  if (stationId === "all") return summary.prices;
  return summary.prices.filter((entry) => entry.station.id === stationId);
}
