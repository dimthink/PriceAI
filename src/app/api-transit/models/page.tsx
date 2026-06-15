import type { Metadata } from "next";
import { Suspense } from "react";
import { getTransitStations } from "@/lib/api-transit-db";
import { SiteHeader } from "@/components/SiteHeader";
import TransitModelExplorer from "@/components/TransitModelExplorer";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "中转 API 模型对比",
  description: "按 Claude / GPT 标准模型对比各 API 中转站的充值系数、模型倍率、综合倍率和近 7 日稳定性。",
  alternates: {
    canonical: "/api-transit/models",
  },
  openGraph: {
    title: "PriceAI 中转 API 模型对比",
    description: "按 Claude / GPT 标准模型对比中转站价格与稳定性。",
    url: "https://priceai.cc/api-transit/models",
  },
};

export const revalidate = 300;

export default async function ApiTransitModelsPage() {
  const stations = await getTransitStations();

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "PriceAI 中转 API 模型对比",
          url: "https://priceai.cc/api-transit/models",
          inLanguage: "zh-CN",
          description: "按 Claude / GPT 标准模型对比 API 中转站价格与稳定性。",
        }}
      />

      <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 backdrop-blur-[18px]">
        <SiteHeader activeSection="transit" />
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-7 pb-20">
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#202829] tracking-tight">中转 API 模型对比</h1>
          <p className="mt-2 text-sm sm:text-base text-[#5a6061] max-w-3xl">
            按 Claude / GPT 标准模型横向对比各中转站的充值系数、模型倍率、综合倍率和近 7 日稳定性。站点榜仍是主入口，模型页用于快速查某个模型在哪些站点更便宜。
          </p>
        </div>

        <Suspense fallback={<div className="py-12 text-center text-[#5a6061]">加载中…</div>}>
          <TransitModelExplorer stations={stations} />
        </Suspense>
      </main>
    </div>
  );
}
