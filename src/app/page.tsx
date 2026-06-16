import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  CircleDollarSign,
  ClipboardCheck,
  DatabaseZap,
  FileQuestion,
  KeyRound,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HomeUrlCleaner } from "@/components/HomeUrlCleaner";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "PriceAI | AI 订阅与 API 购买前决策入口",
  description:
    "购买 AI 订阅或接入 API 前，先理解官方订阅、卡网订阅、官方 API 和中转 API 的价格差异、来源、库存与风险边界。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "PriceAI | AI 订阅与 API 购买前决策入口",
    description: "先看清 AI 订阅和 API 的购买路径，再进入卡网订阅、官方订阅、官方 API 或中转 API 比价。",
    url: "https://priceai.cc",
    siteName: "PriceAI",
  },
};

const heroModules = [
  {
    title: "卡网订阅",
    href: "/channels",
    description: "第三方渠道里的 AI 会员、账号、邮箱、卡密、CDK、Kiro 等，重点看有货价和交付方式。",
    icon: PackageCheck,
  },
  {
    title: "官方订阅",
    href: "/official-prices",
    description: "ChatGPT、Claude、Gemini、Grok 等会员的官网正价、地区价、资格价和支付门槛。",
    icon: BadgeCheck,
  },
  {
    title: "官方 API",
    href: "/api-models",
    description: "DeepSeek、千问、Kimi、GLM 等国产模型官方 API，包含免费额度、Token Plan 和限制。",
    icon: DatabaseZap,
  },
  {
    title: "中转 API",
    href: "/api-transit",
    description: "面向 GPT、Claude、Gemini 等模型的第三方中转站，重点看倍率、稳定性和披露信息。",
    icon: KeyRound,
  },
];

const ecosystemIcons = [
  { name: "ChatGPT", src: "/brand-icons/chatgpt.svg" },
  { name: "Claude", src: "/brand-icons/claude.svg" },
  { name: "Gemini", src: "/brand-icons/gemini.svg" },
  { name: "Grok", src: "/brand-icons/grok.svg" },
  { name: "DeepSeek", src: "/brand-icons/deepseek.png" },
  { name: "Qwen", src: "/brand-icons/qwen.png" },
  { name: "Kimi", src: "/brand-icons/kimi.png" },
  { name: "GLM", src: "/brand-icons/glm.png" },
];

const decisionPaths = [
  {
    label: "订阅新手",
    title: "我只是想买一个 AI 订阅",
    body: "先看官方价、地区价和支付门槛；如果需要现货、更低价或代开通，再去看卡网订阅。",
    primaryHref: "/official-prices",
    primaryLabel: "先看官方订阅",
    secondaryHref: "/channels",
    secondaryLabel: "再看卡网订阅",
    icon: ShieldCheck,
  },
  {
    label: "资深买家",
    title: "我想找更低价或更灵活的方案",
    body: "先看卡网订阅里的低价现货、渠道和更新时间；如果要接 GPT、Claude、Gemini 等模型，再看中转 API。",
    primaryHref: "/channels",
    primaryLabel: "看卡网订阅",
    secondaryHref: "/api-transit",
    secondaryLabel: "看中转 API",
    icon: CircleDollarSign,
  },
  {
    label: "开发接入",
    title: "我想接 API 做产品或工具",
    body: "先看 DeepSeek、千问、Kimi、GLM 等官方 API 的免费额度、Token Plan 和限制；再对比中转 API。",
    primaryHref: "/api-models",
    primaryLabel: "比较官方 API",
    secondaryHref: "/api-transit",
    secondaryLabel: "查看中转 API",
    icon: DatabaseZap,
  },
];

const verificationItems = [
  {
    title: "来源能不能回看？",
    body: "保留原始渠道名、商品标题和购买链接，方便你回到原平台核验。",
  },
  {
    title: "库存和时间是否可核验？",
    body: "重点看有货/缺货状态和最近更新时间，长期未更新的低价不应直接当成可买价。",
  },
  {
    title: "交付和售后谁负责？",
    body: "PriceAI 不参与交易。付款、交付、售后、退款和账号风险都按原平台规则判断。",
  },
];

const guideLinks = [
  {
    label: "卡网订阅渠道靠谱吗？",
    description: "把卡网当作信息源和交付入口，先看售后、投诉入口和商品描述。",
    href: "/guides/are-ai-subscription-card-shops-reliable",
  },
  {
    label: "为什么同一个 AI 订阅价格差这么多？",
    description: "分清官网正价、地区价、资格价、代充价和第三方渠道价。",
    href: "/guides/why-ai-subscription-prices-differ",
  },
  {
    label: "如何尽量走官方方式订阅 AI？",
    description: "理解官网、App Store、Google Play、支付方式和地区价。",
    href: "/guides/how-to-subscribe-ai-officially",
  },
  {
    label: "ChatGPT 有哪些获取方式？",
    description: "区分 Plus、Pro、Team、成品号、代充、CDK 和 API/CDK。",
    href: "/guides/chatgpt-subscription-options",
  },
];

const homeFaqs = [
  {
    question: "PriceAI 是卖 AI 订阅的吗？",
    answer: "不是。PriceAI 不卖货、不收款、不参与交易，只聚合购买前可以核验的价格、来源、库存、更新时间和原始链接。",
  },
  {
    question: "这些渠道靠谱吗？",
    answer: "渠道只是信息源。你可以在卡网完成交付，也可以联系店主转到闲鱼等第三方平台交易；无论哪种方式，都要回到原平台确认商品描述、售后规则和最终价格。",
  },
  {
    question: "如何买到适合自己的订阅？",
    answer: "先确定你要官方账号、自己账号开通、成品号还是团队席位。新手优先看官方订阅和指南，准备走第三方渠道时建议先小额试单，不要只看最低价。",
  },
  {
    question: "如何尽量避免被骗？",
    answer: "看店铺是否有联系方式、售后入口、Telegram 群或售后群，群是否活跃；再看商品数量、历史经营痕迹、描述是否清楚，金额较大时优先选择可投诉或可担保的平台。",
  },
  {
    question: "买到异常商品或疑似被骗怎么办？",
    answer: "先联系店铺售后；售后无响应时，去对应卡网平台投诉。之后可以回到 PriceAI，在商品右侧点击举报并补充证据，审核通过后会下架异常商品或渠道。",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-text-body)]">
      <HomeUrlCleaner />
      <JsonLd data={buildHomeJsonLd()} />
      <div className="sticky top-0 z-40 bg-[var(--color-page-translucent)] shadow-[var(--shadow-control)] backdrop-blur-xl">
        <SiteHeader activeSection="home" />
      </div>

      <main>
        <section className="overflow-hidden border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 pb-12 pt-10 sm:px-8 md:pb-16 md:pt-14">
            <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
              <p className="text-sm font-semibold text-[var(--color-success-text)]">为购买 AI 订阅与 API 前的判断而生</p>
              <h1 className="mt-5 max-w-4xl text-balance font-serif text-[2.18rem] font-semibold leading-tight tracking-normal text-[var(--color-text-primary)] sm:text-5xl md:text-6xl">
                <span className="block">先看清价格从哪里来，</span>
                <span className="block text-[var(--color-success-text)]">再决定怎么买。</span>
              </h1>
              <p className="mt-5 max-w-[72ch] text-pretty text-base leading-8 text-[var(--color-text-muted)]">
                PriceAI 把官方订阅、卡网订阅、官方 API 和中转 API 放在同一个入口里。你先选择购买路径，再进入对应页面比较价格、来源、库存和更新时间。
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="#paths"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-[var(--color-text-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
                >
                  先选购买路径
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/channels"
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-panel)] px-6 text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)]"
                >
                  直接看有货低价
                </Link>
              </div>

            </div>

            <div id="paths" className="mx-auto mt-10 max-w-6xl scroll-mt-28">
              <div className="mx-auto max-w-4xl text-center">
                <p className="text-sm font-semibold text-[var(--color-success-text)]">购买路径</p>
                <h2 className="mt-2 text-balance font-serif text-2xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-3xl">
                  先回答一个问题：你现在要买什么？
                </h2>
                <p className="mt-3 text-sm leading-7 text-[var(--color-text-muted)]">
                  首页只负责分流。具体价格、库存、来源和购买链接，回到对应工具页完成。
                </p>
              </div>

              <div className="mt-6 grid gap-3 lg:grid-cols-3">
                {decisionPaths.map((path) => {
                  const Icon = path.icon;

                  return (
                    <article key={path.title} className="rounded-lg bg-[var(--color-panel)] p-5 ring-1 ring-[var(--color-border-soft)]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
                          <Icon size={18} />
                        </span>
                        <span className="rounded-full bg-[var(--color-surface-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)]">
                          {path.label}
                        </span>
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-[var(--color-text-primary)]">{path.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{path.body}</p>
                      <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col">
                        <Link
                          href={path.primaryHref}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-4 text-sm font-semibold text-[var(--color-text-on-primary)] transition hover:bg-[var(--color-primary-hover)]"
                        >
                          {path.primaryLabel}
                          <ArrowRight size={15} />
                        </Link>
                        {"secondaryHref" in path && path.secondaryHref ? (
                          <Link
                            href={path.secondaryHref}
                            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-[var(--color-panel)] px-4 text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)]"
                          >
                            {path.secondaryLabel}
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section id="modules" className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-16">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold text-[var(--color-success-text)]">四个模块</p>
              <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-4xl">
                选完路径，再进入对应工具。
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
                新手按购买问题走，老用户可以直接进入熟悉的模块。
              </p>
            </div>

            <div className="mx-auto mt-8 grid max-w-6xl gap-3 md:grid-cols-2 xl:grid-cols-4">
              {heroModules.map((module) => {
                const Icon = module.icon;

                return (
                  <Link
                    key={module.href}
                    href={module.href}
                    className="group flex min-h-[154px] flex-col justify-between rounded-lg bg-[var(--color-surface)] p-5 ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)] hover:ring-[var(--color-border-muted)]"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-panel)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
                        <Icon size={18} />
                      </span>
                      <ArrowRight size={16} className="text-[var(--color-text-soft)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-text-primary)]" />
                    </span>
                    <span className="mt-4 block text-lg font-semibold text-[var(--color-text-primary)]">{module.title}</span>
                    <span className="mt-2 block text-sm leading-6 text-[var(--color-text-muted)]">{module.description}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mx-auto mt-10 max-w-6xl">
              <p className="text-center text-xs font-semibold text-[var(--color-text-soft)]">覆盖常见 AI 订阅、模型与开发者入口</p>
              <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-8">
                {ecosystemIcons.map((item) => (
                  <div
                    key={item.name}
                    className="flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-lg bg-[var(--color-panel)] px-2 ring-1 ring-[var(--color-border-soft)] sm:min-h-[76px] sm:gap-2 sm:px-3"
                  >
                    <Image src={item.src} alt="" aria-hidden="true" width={28} height={28} className="h-6 w-6 object-contain sm:h-7 sm:w-7" />
                    <span className="max-w-full truncate text-[0.68rem] font-semibold text-[var(--color-text-muted)] sm:text-xs">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-14">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold text-[var(--color-success-text)]">购买指南</p>
              <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-4xl">
                进工具前，先把规则看明白。
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
                指南负责解释购买路径、渠道风险和官方订阅边界；工具页负责展示当前价格、来源和库存。
              </p>
            </div>

            <div className="mx-auto mt-8 grid max-w-6xl gap-3 md:grid-cols-2">
              {guideLinks.map((guide) => (
                <Link
                  key={guide.href}
                  href={guide.href}
                  className="group rounded-lg bg-[var(--color-panel)] p-5 ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)] hover:ring-[var(--color-border-muted)]"
                >
                  <span className="flex items-start justify-between gap-4">
                    <span>
                      <span className="block text-base font-semibold text-[var(--color-text-primary)]">{guide.label}</span>
                      <span className="mt-2 block text-sm leading-6 text-[var(--color-text-muted)]">{guide.description}</span>
                    </span>
                    <ArrowRight size={16} className="mt-1 shrink-0 text-[var(--color-text-soft)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-text-primary)]" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="verify" className="border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-16">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold text-[var(--color-success-text)]">核验边界</p>
              <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-4xl">
                PriceAI 提供信息，不替任何渠道背书。
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
                我们保留能被回看的事实，最终交易仍然发生在原平台。
              </p>
            </div>

            <div className="mx-auto mt-9 grid max-w-5xl gap-3 md:grid-cols-3">
              {verificationItems.map((item) => (
                <div key={item.title} className="rounded-lg bg-[var(--color-surface)] p-5 ring-1 ring-[var(--color-border-soft)]">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-panel)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
                    <ClipboardCheck size={17} />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-[var(--color-text-primary)]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{item.body}</p>
                </div>
              ))}
            </div>

            <div className="mx-auto mt-9 flex max-w-5xl flex-col gap-4 rounded-lg bg-[var(--color-surface)] p-5 ring-1 ring-[var(--color-border-soft)] md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-panel)] text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)]">
                  <FileQuestion size={18} />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">购买前回到原平台确认</h3>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                    付款、交付、售后、退款和账号风险都要按原平台规则判断。
                  </p>
                </div>
              </div>
              <Link
                href="#faq"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-panel)] px-4 text-sm font-semibold text-[var(--color-text-primary)] ring-1 ring-[var(--color-border-soft)] transition hover:bg-[var(--color-surface-hover)]"
              >
                看常见问题
              </Link>
            </div>
          </div>
        </section>

        <section id="faq" className="border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-12 sm:px-8 md:py-14">
            <div className="mx-auto max-w-4xl text-center">
              <p className="text-sm font-semibold text-[var(--color-success-text)]">常见问题</p>
              <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-4xl">
                买之前，先看这几条。
              </h2>
              <p className="mt-4 text-sm leading-7 text-[var(--color-text-muted)]">
                首页只保留购买前最容易踩坑的问题。更细的背景说明放到指南里继续维护。
              </p>
            </div>

            <div className="mx-auto mt-8 divide-y divide-[var(--color-border-subtle)] overflow-hidden rounded-lg bg-[var(--color-panel)] ring-1 ring-[var(--color-border-soft)] md:max-w-5xl">
              {homeFaqs.map((item) => (
                <article key={item.question} className="grid gap-2 px-5 py-5 md:grid-cols-[280px_minmax(0,1fr)] md:gap-6">
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">{item.question}</h3>
                  <p className="text-sm leading-7 text-[var(--color-text-muted)]">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[var(--color-page)]">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center gap-3 border-x border-[var(--color-border-soft)] px-5 py-6 text-center text-sm text-[var(--color-text-muted)] sm:px-8">
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/guides" className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary-hover)]">
              指南
            </Link>
            <a
              href="https://t.me/dimthink"
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary-hover)]"
              aria-label="通过 Telegram 联系合作与赞助"
              title="Telegram @dimthink"
            >
              合作与赞助
            </a>
          </div>
          <p className="max-w-[72ch]">PriceAI 不参与交易。购买前请回到原平台核验价格、库存、交付方式和售后规则。</p>
        </div>
      </footer>
    </div>
  );
}

function buildHomeJsonLd() {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "PriceAI",
      alternateName: ["Price AI", "AI 订阅与 API 购买前决策入口", "AI 比价雷达"],
      url: "https://priceai.cc",
      inLanguage: "zh-CN",
      description:
        "PriceAI 帮助用户在购买 AI 订阅或接入 API 前，比较卡网订阅、官方订阅、官方 API 和中转 API 的价格、来源、库存、更新时间和风险边界。",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://priceai.cc/channels?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "PriceAI",
      alternateName: "Price AI",
      url: "https://priceai.cc",
      logo: "https://priceai.cc/icon.svg",
      sameAs: ["https://github.com/physics-dimension/PriceAI"],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: homeFaqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  ];
}
