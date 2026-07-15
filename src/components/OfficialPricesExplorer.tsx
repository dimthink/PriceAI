"use client";

import {
  ChevronRight,
  Database,
  ExternalLink,
  Layers3,
  PackageCheck,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { BrandIcon } from "@/components/BrandIcon";
import { CategoryTabBar, CategoryTabStrip, type CategoryTabItem } from "@/components/CategoryTabBar";
import { SiteHeader } from "@/components/SiteHeader";
import { useDebouncedValue, useMediaQuery } from "@/lib/client-hooks";
import { listDetailHref, listDetailNavigationHref, shouldHandleListDetailClick } from "@/lib/list-return";
import { saveCurrentListScrollPosition, useListScrollRestoration } from "@/lib/list-scroll-restoration";
import {
  buildOfficialPriceOfferRows,
  buildOfficialPricePlanSummaries,
  type OfficialPriceAppSlug,
  type OfficialPriceOfferRow,
  type OfficialPricePlanSummary,
  type OfficialPriceScope,
  type OfficialPricesDataset,
} from "@/lib/official-prices";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

type ScopeMode = "products" | "offers";
type PlatformFilter = "all" | OfficialPriceAppSlug;

const officialScopeOptions = ["products", "offers"] as const;

export function OfficialPricesExplorer({ dataset }: { dataset: OfficialPricesDataset }) {
  useListScrollRestoration();
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("products");
  const [query, setQuery] = useState("");
  const [urlStateReady, setUrlStateReady] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const debouncedQuery = useDebouncedValue(query, 250);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const summaries = useMemo(
    () =>
      buildOfficialPricePlanSummaries(dataset, platform)
        .filter((summary) => matchesSummary(summary, normalizedQuery))
        .sort((a, b) => comparePrice(a.lowestRow?.cnyPrice, b.lowestRow?.cnyPrice)),
    [dataset, normalizedQuery, platform],
  );
  const offers = useMemo(
    () =>
      buildOfficialPriceOfferRows(dataset, platform)
        .filter((row) => matchesOffer(row, normalizedQuery))
        .sort((a, b) => a.cnyPrice - b.cnyPrice),
    [dataset, normalizedQuery, platform],
  );
  const resultCount = scopeMode === "products" ? summaries.length : offers.length;
  const title = buildTitle(dataset, platform, scopeMode);
  const totalPlanCount = useMemo(() => buildOfficialPricePlanSummaries(dataset, "all").length, [dataset]);
  const totalOfferCount = useMemo(() => buildOfficialPriceOfferRows(dataset, "all").length, [dataset]);
  const platformTabs = useMemo<CategoryTabItem[]>(
    () => [
      {
        id: "all",
        label: "全部",
        icon: <Layers3 size={17} className="text-[#5a6061]" />,
      },
      ...dataset.apps.map((app) => ({
        id: app.slug,
        label: app.displayName,
        icon: <BrandIcon platform={app.displayName} className="h-[18px] w-[18px]" />,
      })),
    ],
    [dataset.apps],
  );
  const explorerQueryString = useMemo(
    () => buildOfficialSearchParams({ platform, query, scopeMode }).toString(),
    [platform, query, scopeMode],
  );

  useEffect(() => {
    let readyFrameId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      const nextState = parseOfficialInitialState(new URLSearchParams(window.location.search), dataset);
      setPlatform(nextState.platform);
      setScopeMode(nextState.scopeMode);
      setQuery(nextState.query);
      readyFrameId = window.requestAnimationFrame(() => setUrlStateReady(true));
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (readyFrameId !== null) window.cancelAnimationFrame(readyFrameId);
    };
  }, [dataset]);

  useEffect(() => {
    if (!urlStateReady) return;
    if (window.location.pathname !== "/official-prices") return;

    const nextUrl = explorerQueryString ? `/official-prices?${explorerQueryString}` : "/official-prices";
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (currentUrl !== nextUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [explorerQueryString, urlStateReady]);

  return (
    <>
      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader activeSection="official" />
        <CategoryTabBar
          items={platformTabs}
          value={platform}
          onChange={(value) => setPlatform(value as PlatformFilter)}
          className="hidden md:block"
        />
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 md:py-10 lg:py-12">
      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl font-semibold tracking-normal text-[#202829] md:text-4xl">
            {title}
          </h1>
          <p className="mt-3 hidden max-w-[74ch] text-sm leading-7 text-[#5a6061] md:block">
            基于 Apple App Store 公开页面整理官方内购价格，外层先看每个标准套餐的最低地区价，点进详情再看所有地区报价。人民币为按公开汇率估算，实际支付价格、税费和汇率以官方页面与支付时显示为准。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.72rem] font-medium text-[#5a6061]">
            <span>数据样本：{formatRelativeTime(dataset.generatedAt)}</span>
            <span className="h-1 w-1 rounded-full bg-[#adb3b4]" />
            <span>当前显示：{resultCount} {scopeMode === "products" ? "个标准套餐" : "条地区报价"}</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] md:inline-block" />
            <span className="hidden md:inline">汇率日期：{dataset.fxSummary.date}</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] lg:inline-block" />
            <span className="hidden lg:inline">{dataset.source === "supabase" ? "数据源：Supabase" : "数据源：静态样本"}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 xl:w-[420px]">
          <Metric label="标准套餐" value={`${totalPlanCount}`} />
          <Metric label="地区报价" value={`${totalOfferCount}`} />
          <Metric label="平台" value={`${dataset.apps.length}`} />
        </div>
      </div>

      <section className="mb-6 space-y-3 md:hidden">
        <label className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-white px-4 shadow-[0_16px_45px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15">
          <Search size={16} className="shrink-0 text-[#5a6061]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={scopeMode === "products" ? "搜索套餐、平台、最低地区" : "搜索套餐、地区或币种"}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa2a3]"
          />
        </label>
        <div className="-mx-5 overflow-x-auto px-5">
          <CategoryTabStrip
            className="w-max pb-1"
            items={platformTabs}
            value={platform}
            onChange={(value) => setPlatform(value as PlatformFilter)}
          />
        </div>
        <div className="inline-flex h-11 max-w-full items-center overflow-x-auto rounded-full bg-[#e4e9ea] p-1">
          <ViewToggleButton
            active={scopeMode === "products"}
            icon={<PackageCheck size={16} />}
            label="标准"
            onClick={() => setScopeMode("products")}
          />
          <ViewToggleButton
            active={scopeMode === "offers"}
            icon={<Database size={16} />}
            label="报价"
            onClick={() => setScopeMode("offers")}
          />
        </div>
      </section>

      <section className="mb-6 hidden space-y-4 md:block">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <label className="flex h-11 min-w-0 items-center gap-2 rounded-full bg-white px-4 shadow-[0_16px_45px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15 md:w-[380px]">
            <Search size={16} className="shrink-0 text-[#5a6061]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={scopeMode === "products" ? "搜索套餐、平台、最低地区" : "搜索套餐、地区或币种"}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa2a3]"
            />
          </label>
          <div className="inline-flex h-12 shrink-0 items-center rounded-full bg-[#e4e9ea] p-1">
            <ViewToggleButton
              active={scopeMode === "products"}
              icon={<PackageCheck size={16} />}
              label="标准商品"
              onClick={() => setScopeMode("products")}
            />
            <ViewToggleButton
              active={scopeMode === "offers"}
              icon={<Database size={16} />}
              label="全部报价"
              onClick={() => setScopeMode("offers")}
            />
          </div>
        </div>
      </section>

      {scopeMode === "products" ? (
        summaries.length ? (
          isDesktop === false ? (
            <OfficialPlanMobileList summaries={summaries} returnQuery={explorerQueryString} />
          ) : (
            <div className="hidden md:block">
              <OfficialPlanTable summaries={summaries} returnQuery={explorerQueryString} />
            </div>
          )
        ) : (
          <EmptyState text="没有符合条件的标准套餐" />
        )
      ) : offers.length ? (
        isDesktop === false ? (
          <OfficialOfferMobileList rows={offers} returnQuery={explorerQueryString} />
        ) : (
          <div className="hidden md:block">
            <OfficialOfferTable rows={offers} returnQuery={explorerQueryString} />
          </div>
        )
      ) : (
        <EmptyState text="没有符合条件的地区报价" />
      )}

      <p className="mt-8 text-xs leading-6 text-[#5a6061]">
        免责声明：PriceAI 仅整理公开页面可见价格，不参与交易，不保证任何地区一定可开通。人民币估算价不包含税费、支付渠道汇率、银行手续费、礼品卡溢价或地区政策差异。
      </p>
    </main>
    </>
  );
}

function OfficialPlanMobileList({
  returnQuery,
  summaries,
}: {
  returnQuery: string;
  summaries: OfficialPricePlanSummary[];
}) {
  return (
    <section className="grid grid-cols-1 gap-3 md:hidden">
      {summaries.map((summary) => {
        const href = officialDetailHref(summary.id, returnQuery);

        return (
          <Link
            key={summary.id}
            href={href}
            prefetch={false}
            onClick={listDetailClickHandler(href, returnQuery)}
            className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 transition active:scale-[0.995]"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
                <BrandIcon platform={summary.platform} className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold leading-6 text-[#202829]">{summary.label}</p>
                    <p className="mt-0.5 truncate text-sm text-[#5a6061]">{summary.provider} · {billingPeriodLabel(summary.billingPeriod)}</p>
                  </div>
                  <p className="shrink-0 text-right text-lg font-bold tabular-nums text-[#202829]">
                    {summary.lowestRow ? formatCurrency(summary.lowestRow.cnyPrice, "CNY") : "待确认"}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[#5a6061]">
                  <span>最低地区：<strong className="font-semibold text-[#202829]">{summary.lowestRow?.countryLabel || "暂无"}</strong></span>
                  {summary.lowestRow ? <span>{summary.lowestRow.priceText}</span> : null}
                  <span>{summary.sampleCount} 个地区</span>
                  <span>{formatRelativeTime(summary.latestFetchedAt)}</span>
                </div>
              </div>
              <ChevronRight size={17} className="mt-3 shrink-0 text-[#adb3b4]" />
            </div>
          </Link>
        );
      })}
    </section>
  );
}

function OfficialPlanTable({
  returnQuery,
  summaries,
}: {
  returnQuery: string;
  summaries: OfficialPricePlanSummary[];
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>标准商品</TableHead>
              <TableHead>平台</TableHead>
              <TableHead>周期</TableHead>
              <TableHead>最低地区价</TableHead>
              <TableHead>最低地区</TableHead>
              <TableHead>地区样本</TableHead>
              <TableHead>最近更新</TableHead>
              <TableHead className="w-[120px] text-center">操作</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {summaries.map((summary) => {
              const href = officialDetailHref(summary.id, returnQuery);

              return (
                <tr key={summary.id} className="transition hover:bg-[#f7f9f9]">
                  <td className="max-w-[320px] px-5 py-4">
                    <Link href={href} prefetch={false} onClick={listDetailClickHandler(href, returnQuery)} className="group flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4]">
                        <BrandIcon platform={summary.platform} className="h-[18px] w-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[#202829] group-hover:text-[#5e5e5e]">{summary.label}</span>
                        <span className="mt-1 block truncate text-xs text-[#5a6061]">{summary.provider}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-[#2d3435]">{summary.platform}</td>
                  <td className="px-5 py-4 text-[#5a6061]">{billingPeriodLabel(summary.billingPeriod)}</td>
                  <td className="px-5 py-4">
                    <span className="text-lg font-bold text-[#202829]">
                      {summary.lowestRow ? formatCurrency(summary.lowestRow.cnyPrice, "CNY") : "待确认"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-semibold text-[#202829]">{summary.lowestRow?.countryLabel || "暂无"}</span>
                    {summary.lowestRow ? (
                      <span className="ml-2 text-xs text-[#5a6061]">{summary.lowestRow.priceText}</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-[#2d3435]">{summary.sampleCount}</td>
                  <td className="px-5 py-4 text-[#5a6061]">{formatRelativeTime(summary.latestFetchedAt)}</td>
                  <td className="w-[120px] px-5 py-4 text-center">
                    <Link
                      href={href}
                      prefetch={false}
                      onClick={listDetailClickHandler(href, returnQuery)}
                      className="inline-flex h-9 min-w-[76px] items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[#2d3435] px-3 text-xs font-semibold text-[#f8f8f8] transition hover:bg-[#1f2526]"
                    >
                      查看
                      <ChevronRight size={14} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OfficialOfferMobileList({
  returnQuery,
  rows,
}: {
  returnQuery: string;
  rows: OfficialPriceOfferRow[];
}) {
  return (
    <section className="grid grid-cols-1 gap-3 md:hidden">
      {rows.map((row) => (
        <OfficialOfferMobileCard key={row.id} row={row} returnQuery={returnQuery} />
      ))}
    </section>
  );
}

function OfficialOfferMobileCard({ row, returnQuery }: { row: OfficialPriceOfferRow; returnQuery: string }) {
  const href = officialDetailHref(`${row.appSlug}__${row.planSlug}`, returnQuery);

  return (
    <article className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] ring-1 ring-[#adb3b4]/15">
          <BrandIcon platform={row.app.displayName} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={href}
                prefetch={false}
                onClick={listDetailClickHandler(href, returnQuery)}
                className="block truncate text-base font-bold leading-6 text-[#202829]"
              >
                {row.plan.label}
              </Link>
              <p className="mt-0.5 truncate text-sm text-[#5a6061]">
                {row.app.displayName} · {billingPeriodLabel(row.plan.billingPeriod)}
              </p>
            </div>
            <p className="shrink-0 text-right text-lg font-bold tabular-nums text-[#202829]">
              {formatCurrency(row.cnyPrice, "CNY")}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[#5a6061]">
            <span>
              <strong className="font-semibold text-[#202829]">{row.countryLabel}</strong> {row.countryCode}
            </span>
            <span>{row.priceText} · {row.currencyCode}</span>
            <span>1 {row.currencyCode} ≈ {formatCurrency(row.fxRateToCny, "CNY")}</span>
            <span>{formatRelativeTime(row.fetchedAt)}</span>
          </div>
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
          >
            App Store
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </article>
  );
}

function OfficialOfferTable({
  returnQuery,
  rows,
}: {
  returnQuery: string;
  rows: OfficialPriceOfferRow[];
}) {
  return (
    <section className="overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
          <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
            <tr>
              <TableHead>平台</TableHead>
              <TableHead>标准商品</TableHead>
              <TableHead>地区</TableHead>
              <TableHead>原价</TableHead>
              <TableHead>约合人民币</TableHead>
              <TableHead>汇率</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead>数据源</TableHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0f1]">
            {rows.map((row) => {
              const href = officialDetailHref(`${row.appSlug}__${row.planSlug}`, returnQuery);

              return (
                <tr key={row.id} className="transition hover:bg-[#f7f9f9]">
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-2 font-semibold text-[#202829]">
                      <BrandIcon platform={row.app.displayName} className="h-[17px] w-[17px]" />
                      {row.app.displayName}
                    </span>
                  </td>
                  <td className="max-w-[260px] px-5 py-4">
                    <Link
                      href={href}
                      prefetch={false}
                      onClick={listDetailClickHandler(href, returnQuery)}
                      className="block truncate font-semibold text-[#202829] hover:text-[#2f7a4b]"
                    >
                      {row.plan.label}
                    </Link>
                    <span className="mt-1 block text-xs text-[#5a6061]">{billingPeriodLabel(row.plan.billingPeriod)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-semibold text-[#202829]">{row.countryLabel}</span>
                    <span className="ml-2 text-xs font-medium text-[#5a6061]">{row.countryCode}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-semibold text-[#202829]">{row.priceText}</span>
                    <span className="ml-2 text-xs text-[#5a6061]">{row.currencyCode}</span>
                  </td>
                  <td className="px-5 py-4 text-lg font-bold text-[#202829]">{formatCurrency(row.cnyPrice, "CNY")}</td>
                  <td className="px-5 py-4 text-[#5a6061]">
                    1 {row.currencyCode} ≈ {formatCurrency(row.fxRateToCny, "CNY")}
                  </td>
                  <td className="px-5 py-4 text-[#5a6061]">{formatRelativeTime(row.fetchedAt)}</td>
                  <td className="px-5 py-4">
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
                    >
                      App Store
                      <ExternalLink size={13} />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ViewToggleButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition ${
        active
          ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
          : "text-[#5a6061] hover:text-[#202829]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex h-10 min-w-0 items-center justify-between gap-2 rounded-full bg-white px-3 text-sm font-semibold text-[#2d3435] shadow-[0_10px_30px_rgba(45,52,53,0.04)] ring-1 ring-[#adb3b4]/15 md:block md:h-auto md:rounded-lg md:px-4 md:py-3">
      <p className="truncate text-xs font-medium text-[#5a6061] md:text-[0.68rem] md:uppercase md:tracking-[0.14em]">{label}</p>
      <p className="shrink-0 truncate text-sm font-bold tabular-nums text-[#202829] md:mt-1 md:text-xl">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg bg-white px-6 py-16 text-center shadow-[0_20px_60px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15">
      <p className="font-serif text-2xl font-semibold text-[#202829]">{text}</p>
      <p className="mt-3 text-sm text-[#5a6061]">可以切换平台，或清空搜索条件后再查看。</p>
    </div>
  );
}

function TableHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-5 py-3 font-semibold ${className}`}>{children}</th>;
}

function billingPeriodLabel(period: OfficialPricePlanSummary["billingPeriod"]) {
  return period === "annual" ? "年付" : "月付";
}

function buildTitle(dataset: Pick<OfficialPricesDataset, "apps">, platform: OfficialPriceScope, scopeMode: ScopeMode) {
  const label = platform === "all" ? "全平台" : dataset.apps.find((app) => app.slug === platform)?.displayName ?? platform;
  return `${label} ${scopeMode === "products" ? "官方标准商品" : "官方地区报价"}`;
}

function officialDetailHref(id: string, returnQuery: string): string {
  return listDetailHref(`/official-prices/${id}`, returnQuery);
}

function listDetailClickHandler(path: string, returnQuery: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (!shouldHandleListDetailClick(event)) return;
    event.preventDefault();
    saveCurrentListScrollPosition();
    window.location.assign(listDetailNavigationHref(path, returnQuery));
  };
}

function buildOfficialSearchParams({
  platform,
  query,
  scopeMode,
}: {
  platform: PlatformFilter;
  query: string;
  scopeMode: ScopeMode;
}): URLSearchParams {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();

  if (platform !== "all") params.set("platform", platform);
  if (scopeMode !== "products") params.set("scope", scopeMode);
  if (normalizedQuery) params.set("q", normalizedQuery);

  return params;
}

function parseOfficialInitialState(params: URLSearchParams, dataset: OfficialPricesDataset) {
  return {
    platform: pickOfficialPlatform(params.get("platform") || "", dataset),
    scopeMode: pickParam(params.get("scope") || "", officialScopeOptions, "products"),
    query: params.get("q") || "",
  };
}

function pickOfficialPlatform(value: string, dataset: OfficialPricesDataset): PlatformFilter {
  if (!value) return "all";
  if (value === "all") return "all";
  return dataset.apps.some((app) => app.slug === value) ? (value as OfficialPriceAppSlug) : "all";
}

function pickParam<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function matchesSummary(summary: OfficialPricePlanSummary, query: string) {
  if (!query) return true;

  return [
    summary.label,
    summary.platform,
    summary.provider,
    summary.lowestRow?.countryLabel,
    summary.lowestRow?.countryCode,
    summary.lowestRow?.priceText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function matchesOffer(row: OfficialPriceOfferRow, query: string) {
  if (!query) return true;

  return [
    row.app.displayName,
    row.app.provider,
    row.plan.label,
    row.countryLabel,
    row.countryCode,
    row.currencyCode,
    row.priceText,
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function comparePrice(a: number | null | undefined, b: number | null | undefined) {
  if (typeof a !== "number" && typeof b !== "number") return 0;
  if (typeof a !== "number") return 1;
  if (typeof b !== "number") return -1;
  return a - b;
}
