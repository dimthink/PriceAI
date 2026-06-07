import { ArrowRight, CheckCircle2, Clock3, Database, ExternalLink, Info, Layers3, Search, ShieldAlert, Sparkles, Zap } from "lucide-react";
import { BrandIcon } from "@/components/BrandIcon";
import { JsonLd } from "@/components/JsonLd";
import { SiteHeader } from "@/components/SiteHeader";
import { TrackedLink } from "@/components/TrackedLink";
import type { PlatformIconKey, PlatformPageConfig } from "@/lib/platform-pages";
import type { ExplorerProductSummary } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export function PlatformLandingPage({
  config,
  products,
}: {
  config: PlatformPageConfig;
  products: ExplorerProductSummary[];
}) {
  const availableProducts = products.filter((product) => product.inStockCount > 0);
  const lowestProduct = availableProducts
    .filter((product) => product.lowestPrice !== null)
    .sort((a, b) => (a.lowestPrice ?? Number.POSITIVE_INFINITY) - (b.lowestPrice ?? Number.POSITIVE_INFINITY))[0] || null;
  const totalOffers = products.reduce((sum, product) => sum + product.offerCount, 0);
  const availableOffers = products.reduce((sum, product) => sum + product.inStockCount, 0);
  const latestSeenAt = latestDate(products.map((product) => product.latestSeenAt));

  return (
    <>
      <JsonLd data={buildPlatformJsonLd(config, products)} />
      <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
        <div className="sticky top-0 z-40 bg-[#f9f9f9]/95 shadow-[0_10px_24px_rgba(45,52,53,0.035)] backdrop-blur-xl">
          <SiteHeader />
        </div>

        <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-8 sm:px-8 lg:pt-12">
          <section className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(360px,0.58fr)] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#e8f3ec] px-3 py-1.5 text-xs font-semibold text-[#2f7a4b] ring-1 ring-[#45bf78]/15">
                <BrandIcon platform={config.iconPlatform} className="h-4 w-4" />
                {config.badge}
              </div>
              <h1 className="mt-5 font-serif text-4xl font-semibold leading-tight tracking-normal text-[#202829] sm:text-5xl">
                {config.title}
              </h1>
              <p className="mt-5 max-w-[68ch] text-base leading-8 text-[#5a6061]">{config.intro}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <TrackedLink
                  href={config.primaryHref}
                  eventName="platform_landing_cta_click"
                  eventParams={{ platform: config.platform, action: "primary" }}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#2d3435] px-5 text-sm font-semibold text-[#f8f8f8] transition hover:-translate-y-0.5 hover:bg-[#202829]"
                >
                  {config.primaryLabel}
                  <ArrowRight size={16} />
                </TrackedLink>
                <TrackedLink
                  href={config.secondaryHref}
                  eventName="platform_landing_cta_click"
                  eventParams={{ platform: config.platform, action: "secondary" }}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[#dde4e5] px-5 text-sm font-semibold text-[#2d3435] transition hover:-translate-y-0.5 hover:bg-[#d3dcdd]"
                >
                  {config.secondaryLabel}
                  <Search size={16} />
                </TrackedLink>
              </div>
            </div>

            <aside className="rounded-lg bg-white p-5 shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">Live snapshot</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <Metric label="标准商品" value={`${products.length}`} />
                <Metric label="有货报价" value={`${availableOffers}`} tone="good" />
                <Metric label="总报价" value={`${totalOffers}`} />
                <Metric label="最近更新" value={formatRelativeTime(latestSeenAt)} />
              </div>
              <div className="mt-4 rounded-lg bg-[#f2f4f4] p-4">
                <p className="text-xs font-semibold text-[#5a6061]">当前有货最低</p>
                <p className="mt-2 text-2xl font-bold text-[#202829]">
                  {lowestProduct ? formatCurrency(lowestProduct.lowestPrice, lowestProduct.lowestOffer?.currency) : "暂无有货"}
                </p>
                <p className="mt-1 text-sm text-[#5a6061]">
                  {lowestProduct ? `${lowestProduct.displayName} · ${lowestProduct.inStockCount} 条有货` : "可稍后再看或提交新渠道"}
                </p>
              </div>
              <p className="mt-4 text-xs leading-6 text-[#5a6061]">
                PriceAI 不卖货、不收款、不担保渠道。实际价格、库存、交付和售后规则以原平台为准。
              </p>
            </aside>
          </section>

          <section className="mt-10 overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
            <div className="border-b border-[#edf0f1] px-5 py-4 sm:px-6">
              <h2 className="font-serif text-2xl font-semibold tracking-normal text-[#202829]">{config.tableTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5a6061]">{config.tableDescription}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f2f4f4] text-xs font-semibold uppercase tracking-[0.12em] text-[#5a6061]">
                  <tr>
                    <th className="px-5 py-3">商品</th>
                    <th className="px-5 py-3">类型</th>
                    <th className="px-5 py-3">有货最低</th>
                    <th className="px-5 py-3">报价</th>
                    <th className="px-5 py-3">更新</th>
                    <th className="px-5 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f1]">
                  {products.map((product) => (
                    <tr key={product.id} className="align-top transition hover:bg-[#fbfcfc]">
                      <td className="px-5 py-4">
                        <div className="flex min-w-[220px] items-start gap-3">
                          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f4f4]">
                            <BrandIcon platform={product.platform} productId={product.id} className="h-5 w-5" />
                          </span>
                          <div>
                            <TrackedLink
                              href={`/products/${product.slug}`}
                              eventName="platform_product_detail_open"
                              eventParams={{ platform: config.platform, product_id: product.id }}
                              className="font-semibold text-[#202829] hover:underline"
                            >
                              {product.displayName}
                            </TrackedLink>
                            <p className="mt-1 max-w-[36ch] text-xs leading-5 text-[#5a6061]">{product.summary}</p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-[#5a6061]">{product.spec}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <span className={product.inStockCount > 0 ? "font-bold text-[#2f7a4b]" : "font-semibold text-[#9b3328]"}>
                          {product.inStockCount > 0 ? formatCurrency(product.lowestPrice, product.lowestOffer?.currency) : "缺货"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-[#5a6061]">
                        {product.inStockCount} 有货 / {product.outOfStockCount} 缺货
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-[#5a6061]">{formatRelativeTime(product.latestSeenAt)}</td>
                      <td className="whitespace-nowrap px-5 py-4">
                        <TrackedLink
                          href={`/products/${product.slug}`}
                          eventName="platform_product_detail_open"
                          eventParams={{ platform: config.platform, product_id: product.id }}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829]"
                        >
                          详情
                          <ExternalLink size={14} />
                        </TrackedLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-12 grid gap-5 lg:grid-cols-[0.78fr_1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#5a6061]">{config.optionsEyebrow}</p>
              <h2 className="mt-3 font-serif text-3xl font-semibold leading-tight tracking-normal text-[#202829]">
                {config.optionsTitle}
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#5a6061]">{config.optionsIntro}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {config.optionCards.map((item) => (
                <InfoCard key={item.title} title={item.title} text={item.text} icon={item.icon} />
              ))}
            </div>
          </section>

          <section className="mt-12 rounded-lg bg-[#202829] p-6 text-[#f8f8f8] md:p-8">
            <div className="grid gap-6 md:grid-cols-[0.68fr_1fr] md:items-start">
              <div>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f8f8f8]/10 text-[#45bf78]">
                  <ShieldAlert size={19} />
                </div>
                <h2 className="mt-5 font-serif text-3xl font-semibold leading-tight tracking-normal">{config.darkTitle}</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {config.darkCards.map((item) => (
                  <DarkCard key={item.title} title={item.title} text={item.text} />
                ))}
              </div>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">常见问题</h2>
            <div className="mt-6 divide-y divide-[#edf0f1] overflow-hidden rounded-lg bg-white shadow-[0_20px_55px_rgba(45,52,53,0.045)] ring-1 ring-[#adb3b4]/15">
              {config.faqs.map(([question, answer]) => (
                <div key={question} className="px-5 py-5 sm:px-6">
                  <h3 className="font-semibold text-[#202829]">{question}</h3>
                  <p className="mt-2 text-sm leading-7 text-[#5a6061]">{answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12 flex flex-col gap-4 rounded-lg bg-[#f2f4f4] p-6 ring-1 ring-[#adb3b4]/15 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-serif text-2xl font-semibold tracking-normal text-[#202829]">{config.relatedTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5a6061]">{config.relatedDescription}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              {config.relatedLinks.map((item, index) => (
                <TrackedLink
                  key={item.href}
                  href={item.href}
                  eventName="platform_related_link_click"
                  eventParams={{ platform: config.platform, target: item.href }}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition ${
                    index === config.relatedLinks.length - 1
                      ? "bg-[#2d3435] text-[#f8f8f8] hover:bg-[#202829]"
                      : index === 0
                        ? "bg-white text-[#2d3435] ring-1 ring-[#adb3b4]/20 hover:bg-[#f5f7f7]"
                        : "bg-[#dde4e5] text-[#2d3435] hover:bg-[#d3dcdd]"
                  }`}
                >
                  {item.label}
                  <ArrowRight size={16} />
                </TrackedLink>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function latestDate(values: Array<string | null | undefined>): string | null {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" }) {
  return (
    <div className="rounded-lg bg-[#f2f4f4] px-4 py-3">
      <p className="text-xs font-semibold text-[#5a6061]">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone === "good" ? "text-[#2f7a4b]" : "text-[#202829]"}`}>{value}</p>
    </div>
  );
}

function InfoCard({ title, text, icon }: { title: string; text: string; icon: PlatformIconKey }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-[0_18px_45px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f3ec] text-[#2f7a4b]">{iconNode(icon)}</div>
      <h3 className="mt-4 font-semibold text-[#202829]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#5a6061]">{text}</p>
    </div>
  );
}

function DarkCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg bg-[#f8f8f8]/8 p-4 ring-1 ring-[#f8f8f8]/12">
      <h3 className="font-semibold text-[#f8f8f8]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#d7dddd]">{text}</p>
    </div>
  );
}

function iconNode(icon: PlatformIconKey) {
  const size = 17;
  if (icon === "check") return <CheckCircle2 size={size} />;
  if (icon === "clock") return <Clock3 size={size} />;
  if (icon === "database") return <Database size={size} />;
  if (icon === "layers") return <Layers3 size={size} />;
  if (icon === "shield") return <ShieldAlert size={size} />;
  if (icon === "sparkles") return <Sparkles size={size} />;
  if (icon === "zap") return <Zap size={size} />;
  return <Info size={size} />;
}

function buildPlatformJsonLd(config: PlatformPageConfig, products: ExplorerProductSummary[]) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: config.title,
      url: config.pageUrl,
      inLanguage: "zh-CN",
      description: config.intro,
      hasPart: products.map((product) => ({
        "@type": "Product",
        name: product.displayName,
        url: `https://priceai.cc/products/${product.slug}`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "PriceAI", item: "https://priceai.cc" },
        { "@type": "ListItem", position: 2, name: config.platform, item: config.pageUrl },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: config.faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    },
  ];
}
