import type { Metadata } from "next";
import { Clock3, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/BrandIcon";
import { ReturnToListLink } from "@/components/ReturnToListLink";
import { SiteHeader } from "@/components/SiteHeader";
import { OFFICIAL_PRICE_RETURN_INTENT_KEY } from "@/lib/list-return";
import {
  buildOfficialPricePlanSummaries,
  getOfficialPricePlanSummaryFromDataset,
  getOfficialPriceRowsByIdFromDataset,
  type OfficialPriceRow,
} from "@/lib/official-prices";
import { getOfficialPricesDataset } from "@/lib/official-prices-db";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export const revalidate = 1800;
export const dynamicParams = true;

const OFFICIAL_RETURN_KEYS = ["platform", "scope", "q"] as const;

export async function generateStaticParams() {
  const dataset = await getOfficialPricesDataset();
  return buildOfficialPricePlanSummaries(dataset, "all").map((summary) => ({
    id: summary.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dataset = await getOfficialPricesDataset();
  const summary = getOfficialPricePlanSummaryFromDataset(dataset, id);

  if (!summary) {
    return {
      title: "官方地区价详情",
    };
  }

  return {
    title: `${summary.label} 官方地区价`,
    description: `查看 ${summary.label} 在 Apple App Store 公开页面中的地区价格、原价、人民币估算和来源链接。`,
    alternates: {
      canonical: `/official-prices/${id}`,
    },
    openGraph: {
      title: `${summary.label} 官方地区价`,
      description: `查看 ${summary.label} 的公开地区价格对比。`,
      url: `https://priceai.cc/official-prices/${id}`,
    },
  };
}

export default async function OfficialPriceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const dataset = await getOfficialPricesDataset();
  const summary = getOfficialPricePlanSummaryFromDataset(dataset, id);
  const rows = getOfficialPriceRowsByIdFromDataset(dataset, id);

  if (!summary) notFound();

  const cheapest = summary.lowestRow;

  return (
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
        <SiteHeader logoCompact activeSection="official" />
      </div>

      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-5">
          <ReturnToListLink
            allowedKeys={OFFICIAL_RETURN_KEYS}
            basePath="/official-prices"
            intentKey={OFFICIAL_PRICE_RETURN_INTENT_KEY}
            label="返回官方地区价"
          />
        </div>

        <section className="rounded-lg bg-[#f2f4f4] p-6 shadow-[0_20px_60px_rgba(45,52,53,0.04)] lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)] lg:items-end">
            <div className="min-w-0 max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>
                  <BrandIcon platform={summary.platform} className="h-[15px] w-[15px]" />
                  {summary.platform}
                </Badge>
                <Badge>{summary.provider}</Badge>
                <Badge>{billingPeriodLabel(summary.billingPeriod)}</Badge>
              </div>
              <h1 className="mt-5 font-serif text-3xl font-bold tracking-normal text-[#202829] sm:text-4xl md:text-5xl">
                {summary.label}
              </h1>
              <p className="mt-4 text-sm leading-7 text-[#5a6061]">
                这里展示同一个官方订阅标准商品在不同 App Store 地区的公开价格。外层最低价只作为地区价格基准，实际开通条件、税费和支付汇率以官方页面与支付时显示为准。
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="最低地区价" value={cheapest ? formatCurrency(cheapest.cnyPrice, "CNY") : "待确认"} />
              <Metric label="最低地区" value={cheapest?.countryLabel || "暂无"} />
              <Metric label="地区报价" value={`${summary.sampleCount}`} />
              <Metric label="汇率日期" value={dataset.fxSummary.date} />
            </div>
          </div>
        </section>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">地区报价表</h2>
            <p className="mt-2 text-sm text-[#5a6061]">
              {rows.length} 条公开地区价格 · 按折算人民币从低到高排序
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-[#5a6061]">
            <Clock3 size={16} />
            最近记录 {formatRelativeTime(summary.latestFetchedAt)}
          </div>
        </div>

        <OfficialPriceMobileList rows={rows} />

        <section className="mt-5 hidden overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 md:block">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-left text-sm">
              <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
                <tr>
                  <TableHead>地区</TableHead>
                  <TableHead>原价</TableHead>
                  <TableHead>约合人民币</TableHead>
                  <TableHead>汇率</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead>数据源</TableHead>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f1]">
                {rows.map((row) => (
                  <tr key={`${row.appSlug}-${row.planSlug}-${row.countryCode}`} className="transition hover:bg-[#f7f9f9]">
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
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-8 text-xs leading-6 text-[#5a6061]">
          免责声明：PriceAI 仅整理公开页面可见价格，不参与交易，不保证任何地区一定可开通。人民币估算价不包含税费、支付渠道汇率、银行手续费、礼品卡溢价或地区政策差异。
        </p>
      </div>
    </main>
  );
}

function OfficialPriceMobileList({ rows }: { rows: OfficialPriceRow[] }) {
  return (
    <section className="mt-5 grid gap-3 md:hidden">
      {rows.map((row) => (
        <article
          key={`${row.appSlug}-${row.planSlug}-${row.countryCode}`}
          className="rounded-lg bg-white p-4 shadow-[0_16px_45px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-base font-bold text-[#202829]">
                {row.countryLabel}
                <span className="ml-1.5 text-xs font-semibold text-[#5a6061]">{row.countryCode}</span>
              </p>
              <p className="mt-1 text-sm font-semibold text-[#202829]">
                {row.priceText}
                <span className="ml-1.5 text-xs font-medium text-[#5a6061]">{row.currencyCode}</span>
              </p>
            </div>
            <p className="shrink-0 text-right text-lg font-bold tabular-nums text-[#202829]">
              {formatCurrency(row.cnyPrice, "CNY")}
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-[#5a6061]">
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
        </article>
      ))}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-4 py-3 shadow-[0_12px_35px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[#5a6061]">{label}</p>
      <p className="mt-1 truncate text-xl font-bold text-[#202829]">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5a6061] ring-1 ring-[#adb3b4]/15">
      {children}
    </span>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}

function billingPeriodLabel(period: "monthly" | "annual") {
  return period === "annual" ? "年付" : "月付";
}
