import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Network, ShieldCheck } from "lucide-react";
import { getTransitModelFamilyOptions } from "@/lib/api-transit";
import { getTransitStations } from "@/lib/api-transit-db";
import { TRANSIT_CHANNEL_TYPE_LABELS } from "@/data/api-transit/types";
import { SiteHeader } from "@/components/SiteHeader";
import { TransitFamilyTabs } from "@/components/TransitFamilyTabs";
import { TransitDetectorClient, type DetectorStationOption } from "@/components/TransitDetectorClient";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "API 中转模型检测",
  description:
    "PriceAI API 中转模型检测工作台 — 为 OpenAI Chat Completions、OpenAI Responses、Claude、Gemini 兼容接口整理协议、能力、来源和计费证据链。检测后端独立部署，PriceAI 主站不保存 API Key。",
  alternates: { canonical: "/api-transit/detector" },
  openGraph: {
    title: "API 中转模型检测 | PriceAI",
    description:
      "面向中转 API 的模型真假、来源线路和计费口径检测工作台，检测任务由独立服务执行。",
  },
};

export const revalidate = 300;

export default async function ApiTransitDetectorPage() {
  const familyOptions = getTransitModelFamilyOptions();
  const detectorServiceUrl = process.env.NEXT_PUBLIC_TRANSIT_DETECTOR_API_BASE_URL ?? "";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const stations = await getTransitStations();
  const stationOptions: DetectorStationOption[] = stations
    .filter((station) => station.status !== "unavailable")
    .map((station) => ({
      id: station.id,
      slug: station.slug,
      name: station.name,
      apiBaseUrl: station.apiBaseUrl ?? null,
      websiteUrl: station.websiteUrl,
      sourceLabel: station.channelTypes
        .slice(0, 2)
        .map((type) => TRANSIT_CHANNEL_TYPE_LABELS[type])
        .join(" / ") || "来源未披露",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, 120);

  return (
    <div className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: "API 中转模型检测",
            description:
              "PriceAI API 中转模型检测工作台，用于整理中转 API 的协议、能力、来源和计费证据链。",
            url: "https://priceai.cc/api-transit/detector",
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

      <main className="mx-auto max-w-[1500px] px-5 py-6 pb-20">
        <div className="mb-5 max-w-[940px]">
          <Link
            href="/api-transit"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5a6061] transition hover:text-[#202829]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 API 中转榜
          </Link>
          <h1 className="min-w-0 font-serif text-2xl font-semibold tracking-normal text-[#202829] md:text-4xl">
            API 中转模型检测
          </h1>
          <p className="mt-3 max-w-[860px] text-sm leading-[1.8] text-[#5a6061]">
            输入中转接口、模型名和临时 Key，PriceAI 会把请求交给独立检测后端执行。检测结果用于判断协议外观、模型能力、来源线路和计费口径，主站不保存你的 API Key。
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#5a6061]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#adb3b4]/15">
              <ShieldCheck className="h-3.5 w-3.5 text-[#45bf78]" />
              Chat Completions / Responses / Claude / Gemini
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#adb3b4]/15">
              <Network className="h-3.5 w-3.5 text-[#45bf78]" />
              Key 仅提交给检测服务
            </span>
          </div>
        </div>

        <TransitDetectorClient
          serviceUrl={detectorServiceUrl}
          stations={stationOptions}
          turnstileSiteKey={turnstileSiteKey}
          loginHref="/login?next=/api-transit/detector"
        />
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
