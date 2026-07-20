import type { Metadata } from "next";
import { getTransitStations } from "@/lib/api-transit-db";
import { getTransitModelFamilyOptions } from "@/lib/api-transit";
import { compactTransitStationsForList, formatRate, getSummaryStats } from "@/lib/api-transit";
import TransitStationExplorer from "@/components/TransitStationExplorer";
import { JsonLd } from "@/components/JsonLd";
import { ApiTransitPageShell } from "@/components/ApiTransitPageShell";
import { getSponsorSettingsSummary } from "@/lib/sponsor-settings";
import { formatDateDay } from "@/lib/utils";

export const metadata: Metadata = {
  title: "API 中转站价格榜",
  description:
    "PriceAI API 中转站价格榜 — 对比 ChatGPT、Claude、Gemini、Grok、GLM、DeepSeek、Kimi、千问、图片生成、视频生成等中转站的充值系数、模型倍率、综合倍率、近 7 日稳定性和来源渠道。不售卖 API，不替商家担保。",
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
    <>
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

      <ApiTransitPageShell
        familyOptions={familyOptions}
        title="API 中转站价格榜"
        meta={
          <>
            <span>最近更新：{latestUpdatedAt}</span>
            <span className="h-1 w-1 rounded-full bg-[#adb3b4]" />
            <span>样本 {stats.sevenDaySamples}</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] md:inline-block" />
            <span className="hidden md:inline">Claude 最低 {formatRate(stats.bestByFamily.claude)}</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] lg:inline-block" />
            <span className="hidden lg:inline">Gemini 最低 {formatRate(stats.bestByFamily.gemini)}</span>
          </>
        }
        description="先把主流 API 中转站的价格和稳定性比清楚。这里展示充值系数、模型倍率、综合倍率、近 7 日可用性和来源渠道；不售卖 API，不替商家担保。没有完成审核发布的数据不会出现在榜单里，使用前仍建议小额试用并回原站核验。"
        sponsorSettings={sponsorSettings}
      >
        <TransitStationExplorer stations={listStations} rankingReferenceAt={rankingReferenceAt} />
      </ApiTransitPageShell>
    </>
  );
}
