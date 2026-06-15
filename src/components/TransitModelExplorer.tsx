"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { CategoryTabStrip, type CategoryTabItem } from "@/components/CategoryTabBar";
import { TransitModelIcon } from "@/components/TransitModelIcon";
import type { TransitModelFamily, TransitStation } from "@/data/api-transit/types";
import {
  TRANSIT_ACCOUNT_POOL_LABELS,
  TRANSIT_MODEL_FAMILY_LABELS,
  TRANSIT_RISK_LABELS,
  TRANSIT_USAGE_ADVICE_LABELS,
} from "@/data/api-transit/types";
import {
  formatPercent,
  formatRate,
  getRateBadgeClass,
  getTransitModelFamilyOptions,
  getTransitModelSummaries,
  getUsageAdviceBadgeClass,
  type TransitModelPriceEntry,
  type TransitModelSummary,
} from "@/lib/api-transit";

type FamilyFilter = "all" | TransitModelFamily;

function coerceFamily(value: string | null): FamilyFilter {
  return value === "claude" || value === "gpt" ? value : "all";
}

interface Props {
  stations: TransitStation[];
}

export default function TransitModelExplorer({ stations }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [urlReady, setUrlReady] = useState(false);
  const [family, setFamily] = useState<FamilyFilter>(coerceFamily(searchParams.get("family")));
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

  const familyOptions = useMemo(() => getTransitModelFamilyOptions(stations), [stations]);
  const familyTabs = useMemo<CategoryTabItem[]>(() => {
    const tabs: CategoryTabItem[] = [
      {
        id: "all",
        label: "全部",
        icon: <TransitModelIcon family="all" className="h-[18px] w-[18px]" />,
      },
    ];

    familyOptions.forEach((option) => {
      tabs.push({
        id: option.id,
        label: option.label,
        icon: <TransitModelIcon family={option.id} className="h-[18px] w-[18px]" />,
      });
    });

    return tabs;
  }, [familyOptions]);

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

  const allSummaries = useMemo(() => getTransitModelSummaries(stations, "all"), [stations]);
  const bestRate =
    modelSummaries
      .map((summary) => summary.bestCombinedRate)
      .filter((rate): rate is number => rate !== null)
      .sort((a, b) => a - b)[0] ?? null;
  const sampleCount = modelSummaries.reduce((total, summary) => total + summary.sampleCount, 0);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="站点" value={String(stations.length)} helper="站点榜为主入口" />
        <MetricCard label="标准模型" value={String(allSummaries.length)} helper="Claude / GPT" />
        <MetricCard
          label="当前模型族"
          value={family === "all" ? "全部" : TRANSIT_MODEL_FAMILY_LABELS[family]}
          helper={`${modelSummaries.length} 个模型`}
        />
        <MetricCard label="最低综合倍率" value={formatRate(bestRate)} helper={`样本 ${sampleCount}`} />
      </div>

      <div className="sticky top-[66px] z-20 mb-5 rounded-lg bg-[#f2f4f4] p-3 ring-1 ring-[#adb3b4]/15">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative min-w-[200px] flex-1 xl:max-w-[440px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7a8182]" />
            <input
              className="h-[38px] w-full rounded-lg border border-[#dfe4e5] bg-white pl-9 pr-3 text-sm text-[#2d3435] outline-none placeholder:text-[#5f6869] transition focus:border-[#45bf78]/65 focus:shadow-[0_0_0_3px_rgba(69,191,120,0.16)]"
              placeholder="搜索标准模型名..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <CategoryTabStrip
            items={familyTabs}
            value={family}
            onChange={(value) => setFamily(value as FamilyFilter)}
            className="py-0"
          />
        </div>
      </div>

      {modelSummaries.length === 0 ? (
        <div className="py-16 text-center text-[#5a6061]">
          <p className="mb-2 text-lg font-semibold">没有匹配的模型</p>
          <p className="text-sm">尝试调整模型族或搜索关键词。</p>
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
  return (
    <section className="hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>标准模型</TableHead>
              <TableHead>模型类型</TableHead>
              <TableHead>覆盖站点</TableHead>
              <TableHead>最优综合倍率</TableHead>
              <TableHead>稳定性</TableHead>
              <TableHead>代表站点</TableHead>
              <TableHead className="w-[120px] text-center">操作</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {summaries.map((summary) => (
              <ModelSummaryRow key={`${summary.family}-${summary.standardModel}`} summary={summary} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelSummaryRow({ summary }: { summary: TransitModelSummary }) {
  const bestEntry = summary.prices[0] ?? null;
  const href = stationListHref(summary);

  return (
    <tr className="align-top transition hover:bg-[#f7f9f9]">
      <td className="max-w-[330px] px-5 py-4">
        <Link href={href} className="group flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
            <TransitModelIcon family={summary.family} className="h-7 w-7" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[#202829] group-hover:text-[#2f7a4b]">
              {summary.standardModel}
            </span>
            <span className="mt-1 block truncate text-xs text-[#5a6061]">
              {summary.stationCount} 个站点 · 样本 {summary.sampleCount}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-5 py-4">
        <CountBadge tone="neutral">{summary.familyLabel}</CountBadge>
      </td>
      <td className="px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          <CountBadge tone="neutral">站点 {summary.stationCount}</CountBadge>
          {summary.prices.slice(0, 2).map((entry) => (
            <CountBadge key={`${entry.station.id}-${entry.price.groupName}`} tone="good">
              {entry.station.name}
            </CountBadge>
          ))}
          {summary.prices.length > 2 ? <CountBadge tone="neutral">+{summary.prices.length - 2}</CountBadge> : null}
        </div>
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold leading-6 text-[#202829]">{formatRate(summary.bestCombinedRate)}</p>
        {summary.worstCombinedRate !== null && summary.worstCombinedRate !== summary.bestCombinedRate ? (
          <p className="mt-1 text-xs text-[#5a6061]">最高 {formatRate(summary.worstCombinedRate)}</p>
        ) : (
          <p className="mt-1 text-xs text-[#5a6061]">综合倍率</p>
        )}
      </td>
      <td className="px-5 py-4">
        <p className="font-semibold leading-6 text-[#202829]">{formatPercent(summary.averageAvailability)}</p>
        <p className="mt-1 text-xs text-[#5a6061]">样本 {summary.sampleCount}</p>
      </td>
      <td className="max-w-[260px] px-5 py-4">
        {bestEntry ? <RepresentativeStation entry={bestEntry} /> : <span className="text-sm text-[#5a6061]">暂无代表站点</span>}
      </td>
      <td className="w-[120px] px-5 py-4 text-center">
        <Link
          href={href}
          className="inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
        >
          查看
          <ChevronRight size={14} />
        </Link>
      </td>
    </tr>
  );
}

function ModelSummaryCard({ summary }: { summary: TransitModelSummary }) {
  const bestEntry = summary.prices[0] ?? null;
  const href = stationListHref(summary);

  return (
    <Link
      href={href}
      className="rounded-lg bg-white p-4 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 transition hover:bg-[#fbfcfc]"
    >
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
          <TransitModelIcon family={summary.family} className="h-7 w-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-[#202829]">{summary.standardModel}</span>
          <span className="mt-1 block truncate text-xs text-[#5a6061]">{summary.familyLabel} · {summary.stationCount} 个站点</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getRateBadgeClass(summary.bestCombinedRate)}`}>
          {formatRate(summary.bestCombinedRate)}
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
      {bestEntry ? <RepresentativeStation entry={bestEntry} /> : null}
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2d3435]">
        查看站点 <ChevronRight size={13} />
      </div>
    </Link>
  );
}

function RepresentativeStation({ entry }: { entry: TransitModelPriceEntry }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold text-[#202829]">{entry.station.name}</p>
      <p className="mt-1 truncate text-xs text-[#5a6061]">
        {TRANSIT_ACCOUNT_POOL_LABELS[entry.price.accountPool]} · 充值 {formatRate(entry.rechargeCoefficient)} · 模型{" "}
        {entry.price.modelMultiplier !== null ? `${entry.price.modelMultiplier.toFixed(2)}x` : "—"}
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

function TableHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3 font-semibold ${className}`} scope="col">
      {children}
    </th>
  );
}

function CountBadge({ children, tone }: { children: ReactNode; tone: "good" | "warn" | "neutral" }) {
  const className = {
    good: "bg-[#e8f3ec] text-[#2f7a4b]",
    warn: "bg-[#fff7e8] text-[#7a541b]",
    neutral: "bg-[#e4e9ea] text-[#2d3435]",
  }[tone];

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>;
}

function stationListHref(summary: TransitModelSummary): string {
  const params = new URLSearchParams({ model: summary.family });
  return `/api-transit?${params.toString()}`;
}
