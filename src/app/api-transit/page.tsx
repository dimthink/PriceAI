import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpenText, ShieldCheck } from "lucide-react";
import { getTransitStations } from "@/lib/api-transit-db";
import { getTransitModelFamilyOptions } from "@/lib/api-transit";
import { compactTransitStationsForList, formatRate, getSummaryStats } from "@/lib/api-transit";
import { GuidePromptStrip } from "@/components/GuidePromptStrip";
import { SiteHeader } from "@/components/SiteHeader";
import { TransitFamilyTabs } from "@/components/TransitFamilyTabs";
import TransitStationExplorer from "@/components/TransitStationExplorer";
import { TransitSubmissionActions } from "@/components/TransitSubmissionDialog";
import { JsonLd } from "@/components/JsonLd";
import { SponsoredPlacementPreview } from "@/components/SponsoredPlacementPreview";
import { getSponsorSettingsSummary } from "@/lib/sponsor-settings";
import { formatDateDay } from "@/lib/utils";

export const metadata: Metadata = {
  title: "API 中转站价格榜",
  description:
    "PriceAI API 中转站价格榜 — 对比 ChatGPT、Claude、Gemini、Grok、GLM、DeepSeek、图片生成、视频生成等中转站的充值系数、模型倍率、综合倍率、近 7 日稳定性和来源渠道。不售卖 API，不替商家担保。",
  alternates: { canonical: "/api-transit" },
  openGraph: {
    title: "API 中转站价格榜：倍率、稳定性、来源渠道 | PriceAI",
    description:
      "对比 API 中转站的主流文本、图片、视频模型综合倍率、站点稳定性和来源渠道，适合小额试用前筛选。",
  },
};

export const revalidate = 300;

export default async function ApiTransitPage() {
  const rankingReferenceAt = new Date().toISOString();
  const [stations, sponsorSettings] = await Promise.all([
    getTransitStations(),
    getSponsorSettingsSummary().catch(() => null),
  ]);
  const familyOptions = getTransitModelFamilyOptions();
  const listStations = compactTransitStationsForList(stations);
  const stats = getSummaryStats(listStations);
  const latestUpdatedAt = formatDateDay(
    stations
      .map((station) => station.lastUpdatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null,
  );

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: "API 中转站价格榜",
            description:
              "PriceAI API 中转站价格榜 — 整理已发布的第三方 API 中转站真实信息，包括充值系数、模型倍率、综合倍率和稳定性。",
            url: "https://priceai.cc/api-transit",
            isPartOf: {
              "@type": "WebSite",
              name: "PriceAI",
              url: "https://priceai.cc",
            },
          },
        ]}
      />

      <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-[18px]">
        <SiteHeader activeSection="transit" />
        <Suspense fallback={<TransitFamilyTabsFallback />}>
          <TransitFamilyTabs options={familyOptions} />
        </Suspense>
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-4 pb-20 sm:py-7">
        <div className="mb-4 flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[900px]">
            <h1 className="min-w-0 font-serif text-[1.4rem] font-semibold leading-8 tracking-normal text-[#202829] sm:text-2xl md:text-4xl">
              API 中转站价格榜
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.72rem] font-medium text-[#5a6061] md:gap-3">
              <span>最近更新：{latestUpdatedAt}</span>
              <span className="h-1 w-1 rounded-full bg-[#adb3b4]" />
              <span>样本 {stats.sevenDaySamples}</span>
              <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] md:inline-block" />
              <span className="hidden md:inline">Claude 最低 {formatRate(stats.bestByFamily.claude)}</span>
              <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] lg:inline-block" />
              <span className="hidden lg:inline">Gemini 最低 {formatRate(stats.bestByFamily.gemini)}</span>
            </div>
            <p className="mt-2 line-clamp-2 max-w-[860px] text-[0.82rem] leading-6 text-[#5a6061] sm:mt-2.5 sm:line-clamp-none sm:text-sm sm:leading-[1.8]">
              先把主流 API 中转站的价格和稳定性比清楚。这里展示充值系数、模型倍率、综合倍率、近 7 日可用性和来源渠道；不售卖 API，不替商家担保。
              没有完成审核发布的数据不会出现在榜单里，使用前仍建议小额试用并回原站核验。
            </p>
            <div className="mt-2.5 flex items-center gap-4 text-xs font-semibold text-[#47657a] sm:hidden">
              <Link href="/api-transit/detector" className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                模型检测
              </Link>
              <Link href="/guides/api-transit" className="inline-flex items-center gap-1.5">
                <BookOpenText className="h-3.5 w-3.5" />
                使用说明
              </Link>
              <Link href="/api-transit/submit" className="text-[#5a6061]">提交站点</Link>
            </div>
          </div>
          <div className="hidden w-full shrink-0 grid-cols-4 gap-1.5 sm:grid sm:w-auto sm:gap-2 lg:justify-end">
            <Link
              href="/api-transit/detector"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#202829] px-2 text-[0.78rem] font-semibold text-white shadow-[0_12px_30px_rgba(45,52,53,0.08)] transition hover:bg-[#2d3435] sm:h-11 sm:gap-2 sm:px-4 sm:text-sm"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">检测</span>
              <span className="hidden sm:inline">模型检测</span>
            </Link>
            <Link
              href="/guides/api-transit"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-white px-2 text-[0.78rem] font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/15 transition hover:bg-[#f5f7f7] hover:text-[#202829] sm:h-11 sm:gap-2 sm:px-4 sm:text-sm"
            >
              <BookOpenText className="h-4 w-4 shrink-0 text-[#5a6061]" />
              <span className="sm:hidden">百科</span>
              <span className="hidden sm:inline">使用前说明</span>
            </Link>
            <TransitSubmissionActions
              className="contents"
              buttonClassName="w-full"
              buttonSizeClassName="h-10 gap-1.5 px-2 text-[0.78rem] sm:h-11 sm:gap-2 sm:px-4 sm:text-sm"
              compactLabels
            />
          </div>
        </div>

        <GuidePromptStrip
          className="mb-5 hidden md:block"
          promptId="api-transit-usage-guides"
          label="使用前先看"
          links={[
            { label: "充值系数和综合倍率", href: "/guides/api-transit" },
            { label: "模型真假怎么判断", href: "/guides/api-transit" },
            { label: "为什么要小额试用", href: "/guides/api-transit" },
          ]}
          note="价格榜只做购买前参考，充值前仍要回原站确认余额、退款和售后规则。"
          ctaHref="/guides/api-transit"
          ctaLabel="中转指南"
        />

        <SponsoredPlacementPreview kind="apiTransit" settings={sponsorSettings} className="mb-5 hidden md:block" hideOnMobile />

        <Suspense fallback={<div className="text-center py-16 text-[#5a6061]">加载中...</div>}>
          <TransitStationExplorer stations={listStations} rankingReferenceAt={rankingReferenceAt} />
        </Suspense>

        <Link
          href="/guides/api-transit"
          className="mt-5 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[#202829] ring-1 ring-[#adb3b4]/15 transition hover:bg-[#f5f7f7] md:hidden"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <BookOpenText className="h-4 w-4 shrink-0 text-[#47657a]" />
            <span className="truncate">充值系数、倍率与小额试用说明</span>
          </span>
          <span className="shrink-0 text-xs text-[#5a6061]">查看</span>
        </Link>
      </main>
    </div>
  );
}

function TransitFamilyTabsFallback() {
  return (
    <section className="border-y border-[#dfe4e5] py-2">
      <div className="mx-auto max-w-[1500px] px-5 sm:px-8">
        <div className="h-10" />
      </div>
    </section>
  );
}
