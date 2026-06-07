import type { Metadata } from "next";
import { ArrowRight, BookOpenText, Layers3, Search } from "lucide-react";
import Link from "next/link";
import { GuidesDirectory } from "@/components/GuidesDirectory";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import {
  getGuideCategory,
  getGuidePathStepEntry,
  guideCategories,
  guideEntries,
  guideReadingPaths,
} from "@/lib/guides";

export const revalidate = 86400;

const pageUrl = "https://priceai.cc/guides";

export const metadata: Metadata = {
  title: "AI 订阅指南目录：价格、官方订阅、支付方式和渠道判断",
  description:
    "PriceAI 指南总目录，集中收录 AI 订阅价格分层、官方自助订阅、Apple ID、Google Play、支付卡、礼品卡、地区价风险和卡网渠道判断。",
  alternates: {
    canonical: "/guides",
  },
  openGraph: {
    title: "AI 订阅指南目录：价格、官方订阅、支付方式和渠道判断 | PriceAI",
    description: "集中检索 PriceAI 的所有 AI 订阅指南文档，按主题、标签和关键词快速找到需要的内容。",
    url: pageUrl,
  },
};

export default function GuidesIndexPage() {
  return (
    <>
      <JsonLd data={buildGuidesJsonLd()} />
      <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
        <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
          <SiteHeader activeSection="guides" />
        </div>

        <article className="mx-auto max-w-[1180px] px-5 pb-14 pt-8 sm:px-8 lg:pt-12">
          <section className="grid gap-6 lg:grid-cols-[minmax(0,0.76fr)_320px] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ec] px-3 py-1.5 text-xs font-semibold text-[#2f7a4b] ring-1 ring-[#45bf78]/15">
                <BookOpenText size={15} />
                指南总目录
              </div>
              <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight tracking-normal text-[#202829] sm:text-5xl">
                所有 AI 订阅指南都在这里。
              </h1>
              <p className="mt-5 max-w-[72ch] text-base leading-8 text-[#5a6061]">
                这里是 PriceAI 的知识库入口，用来集中检索价格分层、官方订阅、支付方式、礼品卡、地区价和渠道判断相关指南。
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="#all-guides"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:-translate-y-0.5 hover:bg-[#202829]"
                >
                  查看全部指南
                  <ArrowRight size={16} />
                </a>
                <Link
                  href="/?stock=available"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/20 transition hover:bg-[#f5f7f7]"
                >
                  回到比价工具
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            <aside className="rounded-lg bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">目录概览</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Metric label="指南" value={`${guideEntries.length}`} />
                <Metric label="分类" value={`${guideCategories.length}`} />
              </div>
              <div className="mt-5 rounded-lg bg-[#f2f4f4] px-4 py-3 text-sm leading-6 text-[#5a6061]">
                <div className="flex gap-2">
                  <Search size={16} className="mt-1 shrink-0 text-[#2f7a4b]" />
                  <p>可以直接搜索 ChatGPT、Google Play、礼品卡、虚拟卡、地区价、卡网等关键词。</p>
                </div>
              </div>
            </aside>
          </section>

          <section className="mt-8 rounded-lg bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15 sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">按问题阅读</p>
                <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[#202829]">先选一条路径</h2>
                <p className="mt-2 max-w-[72ch] text-sm leading-7 text-[#5a6061]">
                  如果你还不确定该读哪篇，可以先按当前问题走一条短路径。每条路径会把基础解释、风险判断和回到比价工具串起来。
                </p>
              </div>
              <a
                href="#all-guides"
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#f2f4f4] px-4 text-sm font-semibold text-[#2d3435] ring-1 ring-[#adb3b4]/15 transition hover:bg-[#dde4e5]"
              >
                直接看全部目录
                <ArrowRight size={15} />
              </a>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {guideReadingPaths.map((path) => (
                <div key={path.id} className="rounded-lg bg-[#f9f9f9] p-4 ring-1 ring-[#adb3b4]/15">
                  <span className="inline-flex h-7 items-center rounded-full bg-[#e8f3ec] px-3 text-xs font-semibold text-[#2f7a4b]">
                    {path.audience}
                  </span>
                  <h3 className="mt-3 font-semibold text-[#202829]">{path.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5a6061]">{path.description}</p>
                  <div className="mt-4 space-y-2">
                    {path.steps.map((step, index) => {
                      const guide = getGuidePathStepEntry(step);

                      return (
                        <Link
                          key={step.href}
                          href={step.href}
                          className="group flex gap-3 rounded-lg bg-white px-3 py-3 ring-1 ring-[#adb3b4]/10 transition hover:-translate-y-0.5 hover:ring-[#45bf78]/30"
                        >
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4] text-xs font-bold text-[#5a6061]">
                            {index + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-[#202829]">{guide?.title ?? step.label}</span>
                            <span className="mt-1 block text-xs leading-5 text-[#5a6061]">{step.description}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {guideCategories.map((category) => (
              <a
                key={category.id}
                href="#all-guides"
                className="rounded-lg bg-white p-4 shadow-[0_16px_40px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15 transition hover:-translate-y-0.5 hover:bg-[#fbfcfc]"
              >
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f3ec] text-[#2f7a4b]">
                  <Layers3 size={17} />
                </div>
                <h2 className="mt-4 font-semibold text-[#202829]">{category.label}</h2>
                <p className="mt-2 text-sm leading-6 text-[#5a6061]">{category.description}</p>
              </a>
            ))}
          </section>

          <GuidesDirectory />
        </article>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f2f4f4] px-4 py-3">
      <p className="text-xs font-semibold text-[#5a6061]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[#202829]">{value}</p>
    </div>
  );
}

function buildGuidesJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "AI 订阅指南目录",
      inLanguage: "zh-CN",
      url: pageUrl,
      description: "PriceAI 指南总目录，集中收录 AI 订阅价格、官方订阅、支付方式和渠道判断相关内容。",
      isPartOf: {
        "@type": "WebSite",
        name: "PriceAI",
        url: "https://priceai.cc",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "PriceAI", item: "https://priceai.cc" },
        { "@type": "ListItem", position: 2, name: "指南目录", item: pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "PriceAI 指南列表",
      itemListElement: guideEntries.map((guide, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: guide.title,
        description: `${getGuideCategory(guide.categoryId)?.label ?? "指南"}：${guide.description}`,
        url: `https://priceai.cc${guide.href}`,
      })),
    },
  ];
}
