import type { Metadata } from "next";
import { ArrowRight, BookOpenText, Flag, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FeedbackLink } from "@/components/FeedbackLink";
import { GuideDocsLayout } from "@/components/GuideDocsLayout";
import { JsonLd } from "@/components/JsonLd";
import { getGuideCategory, guideEntries } from "@/lib/guides";

export const revalidate = 86400;

const pageUrl = "https://priceai.cc/guides";

export const metadata: Metadata = {
  title: "PriceAI 快速入门：如何比价、判断渠道、提交渠道和反馈问题",
  description:
    "PriceAI 快速入门，了解这个 AI 订阅比价工具能做什么，如何查卡网渠道、官方地区价、模型 API，以及如何提交渠道、举报商品和反馈建议。",
  alternates: {
    canonical: "/guides",
  },
  openGraph: {
    title: "PriceAI 快速入门：如何比价、判断渠道、提交渠道和反馈问题 | PriceAI",
    description: "了解 PriceAI 的定位、使用路径、渠道判断边界、提交渠道、举报商品和意见反馈入口。",
    url: pageUrl,
  },
};

const productEntrances = [
  {
    title: "查第三方订阅渠道",
    text: "适合想比较 ChatGPT、Claude、Gemini、Grok 等卡网渠道报价的人。选择平台或商品后，重点看价格、来源、库存、更新时间和原始商品标题。",
    href: "/channels?stock=available",
  },
  {
    title: "看官方订阅地区价",
    text: "适合想自己走官方订阅的人。先看官网价和地区价，再结合支付方式、税费、汇率、账户地区和续费风险判断是否适合自己。",
    href: "/official-prices",
  },
  {
    title: "找模型 API 渠道",
    text: "适合想比较模型 API、免费额度、官方或公开 API 渠道的人。先看供应商、模型、计价方式和额度，再决定是否深入了解。",
    href: "/api-models",
  },
];

const verificationSteps = [
  "点进商品详情，看原始渠道、原始标题、库存、更新时间和购买链接。",
  "跳转原渠道前，再看商品描述、售后入口、联系方式和平台投诉入口。",
  "金额较大时，建议先联系卖家沟通细节，再判断是否转到闲鱼或其他中介担保型平台交易。",
];

const communityActions = [
  {
    title: "提交新渠道",
    text: "如果你手里有更低价、更稳定的 AI 订阅渠道，可以提交给 PriceAI。每个人发现的渠道都有限，但大家把自己的低价渠道贡献出来，后面所有人都能少翻 Telegram、少刷闲鱼，直接在 PriceAI 里完成比价。好的平台需要大家一起共创。",
    href: "/channels#submit-channel",
    label: "提交渠道",
    icon: Send,
  },
  {
    title: "举报问题商品",
    text: "如果发现某个商品价格不对、链接下架、描述异常，或者疑似虚假渠道，可以在商品详情页反馈。我们会根据反馈判断是否下架商品或暂停渠道展示。",
    href: "/channels?stock=available",
    label: "查找商品",
    icon: Flag,
  },
];

const furtherReading = [
  {
    title: "AI 订阅价格为什么差很多",
    text: "先理解官网正价、地区价、资格价、代充价和第三方渠道价。",
    href: "/guides/why-ai-subscription-prices-differ",
  },
  {
    title: "卡网渠道靠谱吗",
    text: "把卡网理解成信息源和交易入口，学习购买前的核验清单。",
    href: "/guides/are-ai-subscription-card-shops-reliable",
  },
  {
    title: "如何自己完成官方订阅",
    text: "从官网、App Store、Google Play、支付方式和售后入口理解官方路径。",
    href: "/guides/how-to-subscribe-ai-officially",
  },
  {
    title: "ChatGPT 获取方式",
    text: "区分 Plus、Pro、Team、成品号、代充、CDK 和 API/CDK。",
    href: "/guides/chatgpt-subscription-options",
  },
];

export default function GuidesIndexPage() {
  return (
    <>
      <JsonLd data={buildGuidesJsonLd()} />
      <GuideDocsLayout currentHref="/guides">
        <article className="pb-14 text-[#2d3435]">
          <section className="border-b border-[#dfe4e5] pb-8">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#2f7a4b]">
              <BookOpenText size={15} />
              快速入门
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight tracking-normal text-[#202829] sm:text-5xl">
              第一次用 PriceAI，先看这份入门说明。
            </h1>
            <p className="mt-5 max-w-[72ch] text-base leading-8 text-[#5a6061]">
              PriceAI 是一个 AI 订阅和模型 API 的比价工具。它把分散在不同渠道里的价格、库存、来源、原始商品标题和更新时间整理到一起，帮助你少开几个网页，先完成比较，再决定是否跳转到原渠道购买。
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#use-priceai"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829]"
              >
                看怎么使用
                <ArrowRight size={15} />
              </a>
              <a
                href="#contribute"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#edf0f1] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#dde4e5]"
              >
                提交渠道或反馈
                <ArrowRight size={15} />
              </a>
              <Link
                href="/channels?stock=available"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold text-[#2d3435] transition hover:bg-[#edf0f1]"
              >
                回到比价工具
                <ArrowRight size={15} />
              </Link>
            </div>
          </section>

          <section id="use-priceai" className="mt-10 border-b border-[#dfe4e5] pb-10">
            <p className="text-xs font-semibold text-[#7a8182]">按目的选择入口</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[#202829]">你可以怎么用 PriceAI</h2>
            <div className="mt-6 divide-y divide-[#dfe4e5] border-y border-[#dfe4e5]">
              {productEntrances.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group grid gap-3 py-5 transition hover:bg-[#edf0f1]/60 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:px-2"
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#edf0f1] text-sm font-bold text-[#5a6061] group-hover:bg-[#dde4e5]">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#202829]">{item.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-[#5a6061]">{item.text}</span>
                  </span>
                  <span className="hidden items-center text-sm font-semibold text-[#2d3435] sm:inline-flex">
                    进入
                    <ArrowRight size={15} className="ml-1 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section id="verify" className="mt-10 border-b border-[#dfe4e5] pb-10">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#2f7a4b]">
              <ShieldCheck size={15} />
              购买前核验
            </div>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[#202829]">PriceAI 是信息聚合工具，不是卖家背书。</h2>
            <p className="mt-4 max-w-[72ch] text-sm leading-7 text-[#5a6061]">
              第三方渠道更像一个信息源和交易入口。PriceAI 会整理价格、库存、来源和更新时间，但不会替任何卖家承诺交付。真正购买前，仍然建议你回到原渠道做一次核验。
            </p>
            <ol className="mt-6 divide-y divide-[#dfe4e5] border-y border-[#dfe4e5]">
              {verificationSteps.map((step, index) => (
                <li key={step} className="grid gap-3 py-4 sm:grid-cols-[32px_minmax(0,1fr)]">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#e8f3ec] text-xs font-bold text-[#2f7a4b]">
                    {index + 1}
                  </span>
                  <span className="text-sm leading-7 text-[#5a6061]">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section id="contribute" className="mt-10 border-b border-[#dfe4e5] pb-10">
            <p className="text-xs font-semibold text-[#7a8182]">共建 PriceAI</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[#202829]">把你知道的低价渠道贡献出来。</h2>
            <p className="mt-4 max-w-[72ch] text-sm leading-7 text-[#5a6061]">
              PriceAI 想成为大家获取 AI 订阅和模型 API 前的首选比价处，而不是每个人都去 Telegram、闲鱼或群聊里重新翻一遍资料。众人拾柴火焰高，渠道越多人一起补充，后面每个人做选择都会更省力。
            </p>
            <div className="mt-6 divide-y divide-[#dfe4e5] border-y border-[#dfe4e5]">
              {communityActions.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="group grid gap-4 py-5 transition hover:bg-[#edf0f1]/60 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:px-2"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#edf0f1] text-[#5a6061] group-hover:bg-[#dde4e5] group-hover:text-[#202829]">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-[#202829]">{item.title}</span>
                      <span className="mt-1 block text-sm leading-7 text-[#5a6061]">{item.text}</span>
                      {item.title === "举报问题商品" ? <ReportOfferIllustration /> : null}
                    </span>
                    <span className="inline-flex items-center text-sm font-semibold text-[#2d3435]">
                      {item.label}
                      <ArrowRight size={15} className="ml-1 transition group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                );
              })}
              <div className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-2">
                <div>
                  <h3 className="font-semibold text-[#202829]">提交平台建议</h3>
                  <p className="mt-1 text-sm leading-7 text-[#5a6061]">
                    如果你对 PriceAI 这个平台本身有建议，比如希望增加哪些功能、哪些体验需要改进、哪些分类或运营规则不合理，或者功能侧、运营侧还有其他想法，都可以通过意见反馈告诉我们。这里收的是对平台的建议，不只是页面 Bug。
                  </p>
                </div>
                <FeedbackLink />
              </div>
            </div>
          </section>

          <section id="next-reading" className="mt-10">
            <p className="text-xs font-semibold text-[#7a8182]">继续了解</p>
            <h2 className="mt-3 font-serif text-3xl font-semibold tracking-normal text-[#202829]">需要细看时，再读这些指南。</h2>
            <div className="mt-6 divide-y divide-[#dfe4e5] border-y border-[#dfe4e5]">
              {furtherReading.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group grid gap-2 py-4 transition hover:bg-[#edf0f1]/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-2"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#202829]">{item.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-[#5a6061]">{item.text}</span>
                  </span>
                  <span className="inline-flex items-center text-sm font-semibold text-[#2d3435]">
                    阅读
                    <ArrowRight size={15} className="ml-1 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </article>
      </GuideDocsLayout>
    </>
  );
}

function ReportOfferIllustration() {
  const rows = [
    { price: "¥0.29", time: "53 分钟前", width: "w-[78%]" },
    { price: "¥0.40", time: "55 分钟前", width: "w-[72%]" },
    { price: "¥0.44", time: "59 分钟前", width: "w-[58%]" },
  ];

  return (
    <figure
      className="relative mt-4 max-w-[720px] overflow-hidden rounded-md border border-[#dfe4e5] bg-[#f8f8f8]"
      aria-label="商品详情页报价表中，右侧旗帜图标是举报入口"
    >
      <div className="border-b border-[#dfe4e5] bg-[#edf0f1]/70 px-4 py-3">
        <div className="h-3 w-32 rounded-full bg-[#d5dcdd]" />
      </div>
      <div className="grid grid-cols-[64px_minmax(84px,1fr)_64px_70px_44px] text-[11px] font-semibold text-[#7a8182] sm:grid-cols-[74px_minmax(130px,1fr)_74px_84px_52px]">
        <div className="px-4 py-3">状态</div>
        <div className="px-3 py-3">原始商品名</div>
        <div className="px-3 py-3">价格</div>
        <div className="px-3 py-3">更新时间</div>
        <div className="px-3 py-3">反馈</div>
      </div>
      <div className="divide-y divide-[#e7ebec]">
        {rows.map((row, index) => (
          <div
            key={`${row.price}-${row.time}`}
            className="grid grid-cols-[64px_minmax(84px,1fr)_64px_70px_44px] items-center text-sm sm:grid-cols-[74px_minmax(130px,1fr)_74px_84px_52px]"
          >
            <div className="px-4 py-3">
              <span className="inline-flex rounded-full bg-[#e8f3ec] px-2.5 py-1 text-xs font-semibold text-[#2f7a4b]">
                有货
              </span>
            </div>
            <div className="px-3 py-3">
              <div className={`h-3 rounded-full bg-[#cfd6d7] ${row.width}`} />
              <div className="mt-2 h-3 w-[44%] rounded-full bg-[#e0e5e6]" />
            </div>
            <div className="px-3 py-3 font-bold text-[#202829]">{row.price}</div>
            <div className="px-3 py-3 text-xs text-[#5a6061]">{row.time}</div>
            <div className="px-3 py-3">
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border bg-white text-[#5a6061] ${
                  index === 0 ? "border-[#ef4444] ring-2 ring-[#ef4444]/20" : "border-[#dfe4e5]"
                }`}
                aria-hidden="true"
              >
                <Flag size={15} />
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute right-2 top-[58px] h-[150px] w-[44px] rounded-md border-2 border-[#ef4444]" />
      <div className="pointer-events-none absolute right-10 top-4 hidden items-center gap-2 text-xs font-bold text-[#ef4444] sm:flex">
        举报入口
        <span className="h-0.5 w-20 rotate-[32deg] rounded-full bg-[#ef4444]" />
        <ArrowRight size={18} className="translate-x-[-8px] translate-y-6 rotate-[32deg]" />
      </div>
      <figcaption className="border-t border-[#dfe4e5] px-4 py-3 text-xs leading-5 text-[#5a6061]">
        在商品详情页的报价表里，点击右侧旗帜图标，可以反馈价格异常、链接下架、描述异常或疑似虚假商品。
      </figcaption>
    </figure>
  );
}

function buildGuidesJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "PriceAI 快速入门",
      inLanguage: "zh-CN",
      url: pageUrl,
      description: "PriceAI 快速入门，了解如何比价、判断渠道、提交渠道和反馈问题。",
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
        { "@type": "ListItem", position: 2, name: "快速入门", item: pageUrl },
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
