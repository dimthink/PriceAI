import type { Metadata } from "next";
import { getTransitStations } from "@/lib/api-transit-db";
import { compactTransitStationsForList, formatRate, getTransitModelFamilyOptions, getTransitModelSummaries } from "@/lib/api-transit";
import TransitModelExplorer from "@/components/TransitModelExplorer";
import { JsonLd } from "@/components/JsonLd";
import { ApiTransitPageShell } from "@/components/ApiTransitPageShell";
import { getSponsorSettingsSummary } from "@/lib/sponsor-settings";

export const metadata: Metadata = {
  title: "中转 API 模型对比",
  description: "按 ChatGPT、Claude、Gemini、Grok、GLM、DeepSeek、图片生成、视频生成等标准模型对比各 API 中转站的充值系数、模型倍率、综合倍率和近 7 日稳定性。",
  alternates: {
    canonical: "/api-transit/models",
  },
  openGraph: {
    title: "PriceAI 中转 API 模型对比",
    description: "按主流标准模型对比中转站价格与稳定性。",
    url: "https://priceai.cc/api-transit/models",
  },
};

export const revalidate = 300;

export default async function ApiTransitModelsPage() {
  const [stations, sponsorSettings] = await Promise.all([
    getTransitStations(),
    getSponsorSettingsSummary().catch(() => null),
  ]);
  const familyOptions = getTransitModelFamilyOptions();
  const listStations = compactTransitStationsForList(stations);
  const modelSummaries = getTransitModelSummaries(listStations, "all");
  const bestRate =
    modelSummaries
      .map((summary) => summary.bestCombinedRate)
      .filter((rate): rate is number => rate !== null)
      .sort((a, b) => a - b)[0] ?? null;
  const sampleCount = modelSummaries.reduce((total, summary) => total + summary.sampleCount, 0);

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "PriceAI 中转 API 模型对比",
          url: "https://priceai.cc/api-transit/models",
          inLanguage: "zh-CN",
          description: "按主流标准模型对比 API 中转站价格与稳定性。",
        }}
      />

      <ApiTransitPageShell
        familyOptions={familyOptions}
        title="中转 API 模型对比"
        meta={
          <>
            <span>标准模型 {modelSummaries.length}</span>
            <span className="h-1 w-1 rounded-full bg-[#adb3b4]" />
            <span>样本 {sampleCount}</span>
            <span className="hidden h-1 w-1 rounded-full bg-[#adb3b4] md:inline-block" />
            <span className="hidden md:inline">最低综合倍率 {formatRate(bestRate)}</span>
          </>
        }
        description="按标准模型横向对比各中转站的充值系数、模型倍率、综合倍率和近 7 日稳定性。站点榜仍是主入口，模型页用于快速查某个模型在哪些站点更便宜。"
        sponsorSettings={sponsorSettings}
      >
        <TransitModelExplorer stations={listStations} />
      </ApiTransitPageShell>
    </>
  );
}
