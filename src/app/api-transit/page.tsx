import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getTransitStations } from "@/lib/api-transit-db";
import { SiteHeader } from "@/components/SiteHeader";
import TransitStationExplorer from "@/components/TransitStationExplorer";
import { TransitSubmissionActions } from "@/components/TransitSubmissionDialog";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "API 中转站价格榜",
  description:
    "PriceAI API 中转站价格榜 — 对比 Claude 和 GPT 中转站的充值系数、模型倍率、综合倍率、近 7 日稳定性和来源渠道。不售卖 API，不替商家担保。",
  alternates: { canonical: "/api-transit" },
  openGraph: {
    title: "API 中转站价格榜：倍率、稳定性、来源渠道 | PriceAI",
    description:
      "对比 API 中转站的 Claude / GPT 综合倍率、站点稳定性和来源渠道，适合小额试用前筛选。",
  },
};

export const revalidate = 300;

export default async function ApiTransitPage() {
  const stations = await getTransitStations();

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

      <div className="sticky top-0 z-40 border-b border-[#dfe4e5] bg-[#f9f9f9]/95 backdrop-blur-[18px]">
        <SiteHeader activeSection="transit" />
      </div>

      <main className="mx-auto max-w-[1500px] px-5 py-7 pb-20">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-[900px]">
            <h1 className="text-[32px] font-semibold leading-[1.18] text-[#202829] sm:text-[36px]">
              API 中转站价格榜
            </h1>
            <p className="mt-2.5 max-w-[860px] text-sm leading-[1.8] text-[#5a6061]">
              先把 Claude / GPT 中转站的价格和稳定性比清楚。这里展示充值系数、模型倍率、综合倍率、近 7 日可用性和来源渠道；不售卖 API，不替商家担保。
              没有完成审核发布的数据不会出现在榜单里，使用前仍建议小额试用并回原站核验。
            </p>
            <Link
              href="/guides/api-transit"
              className="mt-2.5 inline-flex text-sm font-semibold text-[#2f7a4b] underline-offset-4 transition hover:text-[#24633c] hover:underline"
            >
              查看中转站百科
            </Link>
          </div>
          <TransitSubmissionActions className="shrink-0 lg:justify-end" />
        </div>

        <Suspense fallback={<div className="text-center py-16 text-[#5a6061]">加载中...</div>}>
          <TransitStationExplorer stations={stations} />
        </Suspense>
      </main>
    </div>
  );
}
