import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Network, ShieldCheck } from "lucide-react";
import { getTransitStations } from "@/lib/api-transit-db";
import { getTransitModelFamilyOptions } from "@/lib/api-transit";
import { SiteHeader } from "@/components/SiteHeader";
import { TransitFamilyTabs } from "@/components/TransitFamilyTabs";
import { TransitViewTabs } from "@/components/TransitViewTabs";
import { TransitDetectorClient } from "@/components/TransitDetectorClient";
import { JsonLd } from "@/components/JsonLd";

export const metadata: Metadata = {
  title: "API 中转模型检测",
  description:
    "PriceAI API 中转模型检测工作台 — 为 OpenAI、Claude、Gemini 兼容接口整理协议、能力、来源和计费证据链。检测后端独立部署，PriceAI 主站不保存 API Key。",
  alternates: { canonical: "/api-transit/detector" },
  openGraph: {
    title: "API 中转模型检测 | PriceAI",
    description:
      "面向中转 API 的模型真假、来源线路和计费口径检测工作台，先展示前端任务结构，后端以独立服务接入。",
  },
};

export default async function ApiTransitDetectorPage() {
  const stations = await getTransitStations();
  const familyOptions = getTransitModelFamilyOptions(stations);
  const detectorServiceUrl = process.env.NEXT_PUBLIC_TRANSIT_DETECTOR_API_BASE_URL ?? "";

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

      <main className="mx-auto max-w-[1500px] px-5 py-7 pb-20">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-[940px]">
            <Link
              href="/api-transit"
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5a6061] transition hover:text-[#202829]"
            >
              <ArrowLeft className="h-4 w-4" />
              返回 API 中转榜
            </Link>
            <h1 className="min-w-0 font-serif text-2xl font-semibold tracking-normal text-[#202829] md:text-4xl">
              API 中转模型检测
            </h1>
            <p className="mt-3 max-w-[880px] text-sm leading-[1.8] text-[#5a6061]">
              这是给中转 API 做“模型真假、来源线路、计费口径”检测的工作台。前端先按 PriceAI 的公开证据口径组织任务，真实探测会交给独立后端执行；
              主站只展示报告摘要，不保存检测 Key。
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[#5a6061]">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#adb3b4]/15">
                <ShieldCheck className="h-3.5 w-3.5 text-[#45bf78]" />
                Claude / OpenAI / Gemini
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 ring-1 ring-[#adb3b4]/15">
                <Network className="h-3.5 w-3.5 text-[#45bf78]" />
                独立检测后端
              </span>
            </div>
          </div>
          <Suspense fallback={<div className="h-11 w-[260px] rounded-full bg-[#e4e9ea]" />}>
            <TransitViewTabs active="detector" className="shrink-0" />
          </Suspense>
        </div>

        <TransitDetectorClient serviceUrl={detectorServiceUrl} />
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
