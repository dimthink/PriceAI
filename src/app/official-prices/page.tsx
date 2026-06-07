import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { OfficialPricesExplorer } from "@/components/OfficialPricesExplorer";
import { getOfficialPricesDataset } from "@/lib/official-prices-db";

export const metadata: Metadata = {
  title: "官方订阅地区价",
  description: "查看 ChatGPT、Claude、Gemini、Grok 在 Apple App Store 公开页面中的官方订阅地区价和人民币估算价。",
  alternates: {
    canonical: "/official-prices",
  },
  openGraph: {
    title: "PriceAI 官方订阅地区价",
    description: "用 App Store 公开价格做 AI 订阅官方地区价基准。",
    url: "https://priceai.cc/official-prices",
  },
};

export default async function OfficialPricesPage() {
  const dataset = await getOfficialPricesDataset();
  const regionCount = new Set(dataset.rows.map((row) => row.countryCode)).size;

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <JsonLd data={buildOfficialPricesJsonLd(dataset.apps.length, regionCount, dataset.rows.length)} />
      <OfficialPricesExplorer dataset={dataset} />
    </div>
  );
}

function buildOfficialPricesJsonLd(appCount: number, regionCount: number, priceCount: number) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "PriceAI 官方订阅地区价",
      url: "https://priceai.cc/official-prices",
      inLanguage: "zh-CN",
      description:
        "基于公开价格页面整理 ChatGPT、Claude、Gemini、Grok 等 AI 订阅的官方地区价和人民币估算价。",
      mainEntity: {
        "@type": "Dataset",
        name: "PriceAI official regional subscription prices",
        description:
          "A curated dataset of official regional subscription prices, original prices, CNY estimates, exchange-rate dates, and source links.",
        url: "https://priceai.cc/official-prices",
        license: "https://github.com/physics-dimension/PriceAI/blob/main/LICENSE",
        creator: {
          "@type": "Organization",
          name: "PriceAI",
          url: "https://priceai.cc",
          sameAs: "https://github.com/physics-dimension/PriceAI",
        },
        variableMeasured: ["app", "plan", "region", "original price", "CNY estimate", "exchange rate", "source"],
        measurementTechnique: "Public App Store price pages and exchange-rate estimates",
        keywords: ["AI subscription", "regional price", "App Store", "ChatGPT", "Claude", "Gemini", "Grok"],
        size: `${appCount} apps, ${regionCount} regions, ${priceCount} prices`,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "官方地区价是什么意思？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "官方地区价是同一个 AI 订阅在不同公开地区价格页面中显示的官方价格，可作为价格基准参考。",
          },
        },
        {
          "@type": "Question",
          name: "地区价一定能开通吗？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "不一定。不同地区的开通条件、支付方式、税费、汇率和可用性可能不同，PriceAI 只整理公开价格，不承诺某地区一定能购买。",
          },
        },
        {
          "@type": "Question",
          name: "人民币估算价包含税费和手续费吗？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "不包含。人民币估算价通常不包含税费、支付渠道汇率、银行手续费、礼品卡溢价或地区政策差异。",
          },
        },
      ],
    },
  ];
}
