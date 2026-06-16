import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { PriceExplorer } from "@/components/PriceExplorer";
import { SubmissionFloater } from "@/components/SubmissionFloater";
import { getExplorerData } from "@/lib/data";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "卡网订阅比价",
  description:
    "查看 ChatGPT、Claude、Gemini、Grok、邮箱、API/CDK 等卡网订阅渠道报价，比较有货最低价、来源、库存和更新时间。",
  alternates: {
    canonical: "/channels",
  },
  openGraph: {
    title: "PriceAI 卡网订阅比价",
    description: "购买 AI 订阅前，先比较卡网订阅渠道的价格、库存、来源和更新时间。",
    url: "https://priceai.cc/channels",
    siteName: "PriceAI",
  },
};

export default async function ChannelsPage() {
  const data = await getExplorerData();

  return (
    <>
      <JsonLd data={buildChannelsJsonLd()} />
      <PriceExplorer data={data} restoreStateFromUrl />
      <SubmissionFloater />
    </>
  );
}

function buildChannelsJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "PriceAI 卡网订阅比价",
      alternateName: ["AI 订阅卡网比价", "AI 比价雷达卡网订阅"],
      url: "https://priceai.cc/channels",
      inLanguage: "zh-CN",
      description:
        "PriceAI 卡网订阅比价整理 AI 订阅、账号、卡密、CDK、邮箱和 API/CDK 等渠道报价，展示有货最低价、来源、库存和更新时间。",
      mainEntity: {
        "@type": "Dataset",
        name: "PriceAI channel subscription offers",
        description:
          "A curated dataset of AI subscription channel offers, source titles, stock states, prices, and collection timestamps.",
        url: "https://priceai.cc/channels",
        license: "https://github.com/physics-dimension/PriceAI/blob/main/LICENSE",
        creator: {
          "@type": "Organization",
          name: "PriceAI",
          url: "https://priceai.cc",
          sameAs: "https://github.com/physics-dimension/PriceAI",
        },
        variableMeasured: ["product", "source", "price", "stock", "updated time", "purchase link"],
        measurementTechnique: "Public channel pages and reviewed source submissions",
        keywords: ["AI subscription", "ChatGPT Plus", "Claude Pro", "Gemini Pro", "AI card shop"],
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "PriceAI 是卖 AI 订阅的吗？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "不是。PriceAI 不卖货、不收款、不参与交易，只整理公开或审核通过的价格和来源信息。",
          },
        },
        {
          "@type": "Question",
          name: "PriceAI 的最低价怎么计算？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "外层最低价优先使用当前有货报价的最低价。缺货、下架或隐藏的报价不应作为可购买最低价展示。",
          },
        },
      ],
    },
  ];
}
