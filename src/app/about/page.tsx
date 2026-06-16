import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, FileText, HandCoins, ShieldCheck } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "PriceAI 边界与披露",
  description: "说明 PriceAI 的产品边界、数据来源、广告赞助披露原则，以及购买 AI 订阅或 API 前需要自行核验的内容。",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "PriceAI 边界与披露",
    description: "PriceAI 提供购买前信息，不卖货、不收款、不替任何渠道背书。",
    url: "https://priceai.cc/about",
    siteName: "PriceAI",
  },
};

const boundaries = [
  {
    title: "我们提供什么",
    body: "整理公开可回看的价格、来源、库存状态、原始标题、购买链接、更新时间、官方订阅信息和 API 调用成本。",
    icon: FileText,
  },
  {
    title: "我们不提供什么",
    body: "PriceAI 不卖货、不收款、不托管订单、不处理售后、不替渠道担保，也不承诺任何第三方服务可长期稳定交付。",
    icon: ShieldCheck,
  },
  {
    title: "你需要自己确认什么",
    body: "付款前请回到原平台确认最终价格、库存、交付方式、售后规则、账号风险、API 限制和服务条款。",
    icon: BadgeCheck,
  },
];

const sourcePrinciples = [
  ["原始来源优先", "尽量保留渠道名、原始商品标题和跳转链接，让信息可以回看。"],
  ["有货最低价优先", "外层比较优先展示有货报价；缺货报价可作为历史参考，但不作为可买最低价。"],
  ["更新时间必须可见", "价格和库存会变化，长期未更新的信息不能直接当成当前行情。"],
  ["官方与第三方分开", "官方订阅、卡网订阅、官方 API 和中转 API 分开承接，避免不同风险层级混在一起。"],
];

const disclosures = [
  {
    title: "广告与赞助",
    body: "当前首页不放赞助位。后续如果出现广告、赞助、入驻或返佣关系，会明确标识，不能伪装成自然推荐。",
  },
  {
    title: "排序与推荐",
    body: "默认比较逻辑应围绕可核验信息：价格、库存、来源、更新时间和官方限制。商业合作不能覆盖基础披露。",
  },
  {
    title: "联系合作",
    body: "合作与赞助只通过明确的联系入口沟通，不在内容中暗示渠道被 PriceAI 担保。",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-text-body)]">
      <JsonLd data={buildAboutJsonLd()} />
      <div className="sticky top-0 z-40 bg-[var(--color-page-translucent)] shadow-[var(--shadow-control)] backdrop-blur-xl">
        <SiteHeader />
      </div>

      <main>
        <section className="border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-16">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold text-[var(--color-success-text)]">边界与披露</p>
              <h1 className="mt-5 text-balance font-serif text-[2.18rem] font-semibold leading-tight tracking-normal text-[var(--color-text-primary)] sm:text-5xl md:text-6xl">
                PriceAI 提供购买前信息，不替任何渠道背书。
              </h1>
              <p className="mx-auto mt-5 max-w-[72ch] text-pretty text-base leading-8 text-[var(--color-text-muted)]">
                首页已经承担购买路径分流。这个页面只保留项目边界、数据来源和商业披露原则，方便你判断哪些信息可以参考，哪些事情必须回到原平台确认。
              </p>
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/#paths"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-[var(--color-text-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
                >
                  回到首页选路径
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/guides"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-panel)] px-6 text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)]"
                >
                  阅读购买指南
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-14">
            <div className="mx-auto grid max-w-6xl gap-3 md:grid-cols-3">
              {boundaries.map((item) => {
                const Icon = item.icon;

                return (
                  <article key={item.title} className="rounded-lg bg-[var(--color-surface)] p-5 ring-1 ring-[var(--color-border-soft)]">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-panel)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
                      <Icon size={18} />
                    </span>
                    <h2 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">{item.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">{item.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-14">
            <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.7fr_1fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold text-[var(--color-success-text)]">数据来源原则</p>
                <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-4xl">
                  可核验的信息，才适合放在前面。
                </h2>
                <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
                  PriceAI 的长期方向不是做卖家列表，也不是给渠道打分，而是把购买前能被用户复查的信息沉淀下来。
                </p>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-lg bg-[var(--color-panel)] ring-1 ring-[var(--color-border-soft)]">
                {sourcePrinciples.map(([title, body]) => (
                  <article key={title} className="grid gap-2 px-5 py-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
                    <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{title}</h3>
                    <p className="text-sm leading-7 text-[var(--color-text-muted)]">{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-14">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold text-[var(--color-success-text)]">商业披露</p>
              <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-4xl">
                盈利可以做，但必须标清楚。
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
                未来如果进入赞助、广告、入驻或返佣阶段，信息呈现必须和普通比较结果区分开。
              </p>
            </div>

            <div className="mx-auto mt-8 grid max-w-5xl gap-3 md:grid-cols-3">
              {disclosures.map((item) => (
                <article key={item.title} className="rounded-lg bg-[var(--color-surface)] p-5 ring-1 ring-[var(--color-border-soft)]">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-panel)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
                    <HandCoins size={18} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">{item.body}</p>
                </article>
              ))}
            </div>

            <div className="mx-auto mt-8 flex max-w-5xl flex-col items-center gap-3 rounded-lg bg-[var(--color-surface)] p-5 text-center ring-1 ring-[var(--color-border-soft)] sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">合作与赞助</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">只沟通合作，不代表 PriceAI 对任何渠道做担保。</p>
              </div>
              <a
                href="https://t.me/dimthink"
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-primary)] px-5 text-sm font-semibold text-[var(--color-text-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
              >
                Telegram @dimthink
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function buildAboutJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "PriceAI 边界与披露",
    url: "https://priceai.cc/about",
    inLanguage: "zh-CN",
    description: "说明 PriceAI 的产品边界、数据来源和商业披露原则。",
    isPartOf: {
      "@type": "WebSite",
      name: "PriceAI",
      url: "https://priceai.cc",
    },
  };
}
