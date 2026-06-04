"use client";

import { ArrowUpDown, ExternalLink, Info, Search } from "lucide-react";
import { useState } from "react";
import { BrandIcon } from "@/components/BrandIcon";
import {
  getOfficialPricePlans,
  getOfficialPriceRows,
  officialPriceApps,
  officialPriceFxSummary,
  officialPriceGeneratedAt,
  type OfficialPriceAppSlug,
} from "@/lib/official-prices";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export function OfficialPricesExplorer() {
  const [appSlug, setAppSlug] = useState<OfficialPriceAppSlug>("chatgpt");
  const [planSlug, setPlanSlug] = useState("plus-monthly");
  const [query, setQuery] = useState("");

  const activeApp = officialPriceApps.find((app) => app.slug === appSlug) ?? officialPriceApps[0];
  const plans = getOfficialPricePlans(appSlug);
  const activePlan = plans.find((plan) => plan.slug === planSlug) ?? plans[0];
  const sourceRows = getOfficialPriceRows(appSlug, activePlan.slug);
  const normalizedQuery = query.trim().toLowerCase();
  const rows = normalizedQuery
    ? sourceRows.filter((row) =>
        [row.countryLabel, row.countryCode, row.currencyCode, row.priceText].join(" ").toLowerCase().includes(normalizedQuery),
      )
    : sourceRows;
  const cheapest = rows[0];

  function changeApp(nextApp: OfficialPriceAppSlug) {
    setAppSlug(nextApp);
    setPlanSlug(getOfficialPricePlans(nextApp)[0]?.slug ?? "");
    setQuery("");
  }

  return (
    <main className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 md:py-10 lg:py-12">
      <div className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-normal text-[#202829] md:text-4xl">
            官方订阅地区价
          </h1>
          <p className="mt-3 max-w-[74ch] text-sm leading-7 text-[#5a6061]">
            基于 Apple App Store 公开页面整理官方内购价格，用作第三方渠道报价的价格基准。人民币为按公开汇率估算，实际支付价格、税费和汇率以官方页面与支付时显示为准。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.72rem] font-medium text-[#5a6061]">
            <span>数据样本：{formatRelativeTime(officialPriceGeneratedAt)}</span>
            <span className="h-1 w-1 rounded-full bg-[#adb3b4]" />
            <span>汇率日期：{officialPriceFxSummary.date}</span>
            <span className="h-1 w-1 rounded-full bg-[#adb3b4]" />
            <span>来源：Apple App Store 公开页面</span>
          </div>
        </div>

        <div className="rounded-lg bg-[#fff7e8] p-4 text-sm leading-6 text-[#7a541b] ring-1 ring-[#efdfbd]">
          <div className="flex items-start gap-2">
            <Info size={17} className="mt-0.5 shrink-0" />
            <p>本页只展示已在项目文档和公开页面中确认的 P0 样本。未确认地区不会补价格，后续可由采集脚本扩展。</p>
          </div>
        </div>
      </div>

      <section className="mb-6 space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {officialPriceApps.map((app) => (
            <button
              key={app.slug}
              type="button"
              onClick={() => changeApp(app.slug)}
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                app.slug === appSlug
                  ? "bg-[#2d3435] text-[#f8f8f8] shadow-[0_14px_40px_rgba(45,52,53,0.12)]"
                  : "bg-[#e4e9ea] text-[#2d3435] hover:bg-[#dde4e5]"
              }`}
            >
              <BrandIcon platform={app.displayName} className="h-[17px] w-[17px]" />
              {app.displayName}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex gap-2 overflow-x-auto rounded-lg bg-[#edf0f1] p-2">
            {plans.map((plan) => (
              <button
                key={plan.slug}
                type="button"
                onClick={() => setPlanSlug(plan.slug)}
                className={`inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition ${
                  plan.slug === activePlan.slug
                    ? "bg-white text-[#202829] shadow-[0_8px_24px_rgba(45,52,53,0.08)]"
                    : "text-[#5a6061] hover:text-[#202829]"
                }`}
              >
                {plan.label}
              </button>
            ))}
          </div>

          <label className="flex h-12 min-w-0 items-center gap-2 rounded-full bg-white px-4 shadow-[0_16px_45px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15">
            <Search size={16} className="shrink-0 text-[#5a6061]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索地区或币种"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aa2a3]"
            />
          </label>
        </div>
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-3">
        <Metric label="当前平台" value={activeApp.displayName} helper={activeApp.provider} />
        <Metric label="当前套餐" value={activePlan.label} helper={activePlan.billingPeriod === "annual" ? "年付" : "月付"} />
        <Metric
          label="最低地区价"
          value={cheapest ? formatCurrency(cheapest.cnyPrice, "CNY") : "待确认"}
          helper={cheapest ? `${cheapest.countryLabel} · ${cheapest.priceText}` : "暂无已确认地区样本"}
        />
      </section>

      <section className="overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-left text-sm">
            <thead className="bg-[#f2f4f4] text-[0.68rem] font-semibold text-[#5a6061]">
              <tr>
                <TableHead>地区</TableHead>
                <TableHead>原价</TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    <ArrowUpDown size={13} />
                    约合人民币
                  </span>
                </TableHead>
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
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#e4e9ea] px-3 text-xs font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
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

      {!rows.length ? (
        <div className="mt-4 rounded-lg bg-white px-6 py-12 text-center text-sm text-[#5a6061] shadow-[0_20px_60px_rgba(45,52,53,0.05)] ring-1 ring-[#adb3b4]/15">
          当前筛选没有已确认地区价样本。
        </div>
      ) : null}

      <p className="mt-8 text-xs leading-6 text-[#5a6061]">
        免责声明：PriceAI 仅整理公开页面可见价格，不参与交易，不保证任何地区一定可开通。人民币估算价不包含税费、支付渠道汇率、银行手续费、礼品卡溢价或地区政策差异。
      </p>
    </main>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-lg bg-white px-5 py-4 shadow-[0_14px_40px_rgba(45,52,53,0.04)] ring-1 ring-[#adb3b4]/15">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#5a6061]">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold text-[#202829]">{value}</p>
      <p className="mt-1 truncate text-xs text-[#5a6061]">{helper}</p>
    </div>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return <th className="px-5 py-3 font-semibold">{children}</th>;
}
