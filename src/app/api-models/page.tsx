import type { Metadata } from "next";
import { ApiModelsExplorer } from "@/components/ApiModelsExplorer";
import { JsonLd } from "@/components/JsonLd";
import { getApiModelDataset } from "@/lib/api-models-db";
import { getSponsorSettingsSummary } from "@/lib/sponsor-settings";

export const metadata: Metadata = {
  title: "官方模型成本基准",
  description: "对照 ChatGPT/OpenAI、Claude、Gemini、DeepSeek、Qwen 等官方 API 价格、官方订阅月费、Token Plan 额度和使用边界。",
  alternates: {
    canonical: "/api-models",
  },
  openGraph: {
    title: "PriceAI 官方模型成本基准",
    description: "一页对比官方 API 基准价、官方订阅月费、Token Plan 额度和免费测试入口。",
    url: "https://priceai.cc/api-models",
  },
};

export const revalidate = 300;

export default async function ApiModelsPage() {
  const [dataset, sponsorSettings] = await Promise.all([
    getApiModelDataset(),
    getSponsorSettingsSummary().catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <JsonLd data={buildApiModelsJsonLd(dataset.models.length, dataset.providers.length, dataset.offers.length)} />
      <ApiModelsExplorer dataset={dataset} sponsorSettings={sponsorSettings} />
    </div>
  );
}

function buildApiModelsJsonLd(modelCount: number, providerCount: number, offerCount: number) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "PriceAI API 模型雷达",
      url: "https://priceai.cc/api-models",
      inLanguage: "zh-CN",
      description:
        "整理官方 API、官方订阅、公开模型路由、免费 API、Token Plan、价格、额度和限制，帮助用户比较模型获取方式。",
      mainEntity: {
        "@type": "Dataset",
        name: "PriceAI API model access dataset",
        description:
          "A curated dataset of official model API prices, official subscription quotas, public model API providers, offers, free quotas, Token Plans, prices, and source links.",
        url: "https://priceai.cc/api-models",
        license: "https://github.com/physics-dimension/PriceAI/blob/main/LICENSE",
        creator: {
          "@type": "Organization",
          name: "PriceAI",
          url: "https://priceai.cc",
          sameAs: "https://github.com/physics-dimension/PriceAI",
        },
        variableMeasured: ["model", "provider", "api price", "official subscription quota", "free quota", "token plan", "limit", "source"],
        measurementTechnique: "Public documentation and reviewed public source pages",
        keywords: ["AI API", "ChatGPT API", "Claude API", "Gemini API", "DeepSeek API", "Qwen API", "Token Plan"],
        size: `${modelCount} models, ${providerCount} providers, ${offerCount} offers`,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "免费 API 能长期使用吗？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "不一定。免费 API 可能存在限流、排队、额度刷新、模型下线、地区限制或条款变化，最终以原平台公开页面为准。",
          },
        },
        {
          "@type": "Question",
          name: "ChatGPT、Claude、Gemini 订阅能抵扣 API 吗？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "通常不能。官方产品订阅主要覆盖 ChatGPT、Claude 或 Gemini App 内的使用额度；API key 调用一般需要在对应开发者平台单独按量计费。",
          },
        },
        {
          "@type": "Question",
          name: "官方 API 和模型路由有什么区别？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "官方 API 由模型或云厂商直接提供；模型路由通常聚合多个模型入口，可能提供统一接口、免费模型或套餐额度，但也需要关注限制和可用性。",
          },
        },
        {
          "@type": "Question",
          name: "PriceAI 会收录灰色中转 API 吗？",
          acceptedAnswer: {
            "@type": "Answer",
            text: "首版不收录无法从公开文档或公开页面核验的灰色中转 API 作为主线推荐。",
          },
        },
      ],
    },
  ];
}
