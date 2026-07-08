import type { Metadata } from "next";
import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { afdianSupportUrl, githubRepoUrl, kofiSupportUrl, paypalSupportUrl } from "@/lib/support";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "支持 PriceAI",
  description: "如果 PriceAI 对你有帮助，可以通过 GitHub Star、爱发电、Ko-fi / PayPal 或反馈线索支持项目继续维护。",
  alternates: {
    canonical: "/support",
  },
  openGraph: {
    title: "支持 PriceAI",
    description: "支持 PriceAI 继续维护 AI 订阅、官方 API 和中转 API 的公开价格信息。",
    url: "https://priceai.cc/support",
    siteName: "PriceAI",
  },
};

export default function SupportPage() {
  const supportCards = [
    {
      title: "GitHub Star",
      body: "给项目点个 Star，让更多人看见 PriceAI。",
      actionLabel: "去 GitHub 点 Star",
      href: githubRepoUrl,
      iconSrc: "/brand-icons/github.svg",
      iconClassName: "h-6 w-6",
      active: true,
      rel: "noreferrer",
    },
    {
      title: "爱发电",
      body: "给作者买杯咖啡，支持持续维护。",
      actionLabel: afdianSupportUrl ? "打开爱发电" : "爱发电入口开通中",
      href: afdianSupportUrl,
      iconSrc: "/brand-icons/afdian.png",
      iconClassName: "h-8 w-8",
      active: Boolean(afdianSupportUrl),
      rel: "nofollow noopener noreferrer",
    },
    {
      title: "Ko-fi / PayPal",
      body: "海外用户可以通过 Ko-fi / PayPal 买杯咖啡支持。",
      actionLabel: kofiSupportUrl || paypalSupportUrl ? "打开 Ko-fi" : "国际入口开通中",
      href: kofiSupportUrl || paypalSupportUrl,
      iconSrc: "/brand-icons/kofi.png",
      iconClassName: "h-8 w-8 rounded-md",
      active: Boolean(kofiSupportUrl || paypalSupportUrl),
      rel: "nofollow noopener noreferrer",
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-text-body)]">
      <JsonLd data={buildSupportJsonLd()} />
      <div className="sticky top-0 z-40 bg-[var(--color-page-translucent)] shadow-[var(--shadow-control)] backdrop-blur-xl">
        <SiteHeader />
      </div>

      <main>
        <section className="border-b border-[var(--color-border)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-10 sm:px-8 md:py-14">
            <div className="mx-auto max-w-4xl text-center">
              <h1 className="text-balance text-[2rem] font-semibold leading-tight tracking-normal text-[var(--color-success-text)] sm:text-4xl md:text-5xl">
                支持 PriceAI 继续维护。
              </h1>
              <p className="mx-auto mt-5 max-w-[72ch] text-pretty text-base leading-8 text-[var(--color-text-muted)]">
                给项目点个 Star，让更多人看见；或者给作者买杯咖啡，支持持续维护。
              </p>
              <p className="mx-auto mt-3 max-w-[72ch] text-pretty text-sm leading-7 text-[var(--color-text-soft)]">
                个人支持不会影响排序、价格、库存或风险提示；商业合作会单独标注。
              </p>
            </div>
          </div>
        </section>

        <section id="ways" className="border-b border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="mx-auto max-w-[1500px] border-x border-[var(--color-border-soft)] px-5 py-10 sm:px-8 md:py-12">
            <div className="mx-auto max-w-6xl">
              <h2 className="max-w-3xl text-balance text-2xl font-semibold tracking-normal text-[var(--color-text-primary)] sm:text-3xl">
                选一个顺手的方式。
              </h2>

              <div className="mt-8 grid gap-3 lg:grid-cols-3">
                {supportCards.map((card) => {
                  const content = (
                    <>
                      <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--color-surface)] ring-1 ring-[var(--color-border-soft)]">
                        <Image
                          src={card.iconSrc}
                          alt=""
                          aria-hidden="true"
                          width={32}
                          height={32}
                          className={`shrink-0 object-contain ${card.iconClassName}`}
                        />
                      </span>
                      <h3 className="mt-5 text-lg font-semibold text-[var(--color-text-primary)]">{card.title}</h3>
                      <p className="mt-2 min-h-12 text-sm leading-6 text-[var(--color-text-muted)]">{card.body}</p>
                      <span
                        className={`mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                          card.active
                            ? "bg-[var(--color-primary)] text-[var(--color-text-on-primary)] hover:bg-[var(--color-primary-hover)]"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border-soft)]"
                        }`}
                      >
                        {card.actionLabel}
                        {card.active ? <ExternalLink size={15} /> : null}
                      </span>
                    </>
                  );

                  return card.href ? (
                    <a
                      key={card.title}
                      href={card.href}
                      target="_blank"
                      rel={card.rel}
                      className="rounded-lg bg-[var(--color-surface-raised)] p-5 ring-1 ring-[var(--color-border-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-control)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-primary)]"
                    >
                      {content}
                    </a>
                  ) : (
                    <article key={card.title} className="rounded-lg bg-[var(--color-surface-raised)] p-5 ring-1 ring-[var(--color-border-soft)]">
                      {content}
                    </article>
                  );
                })}
              </div>

            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function buildSupportJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "支持 PriceAI",
    url: "https://priceai.cc/support",
    inLanguage: "zh-CN",
    description: "说明如何通过 GitHub Star、中文打赏入口和国际打赏入口支持 PriceAI。",
    isPartOf: {
      "@type": "WebSite",
      name: "PriceAI",
      url: "https://priceai.cc",
    },
  };
}
