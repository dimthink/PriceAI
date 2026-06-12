import type { Metadata } from "next";
import { ArrowRight, Clock3, ExternalLink, Layers3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/BrandIcon";
import { JsonLd } from "@/components/JsonLd";
import { ProductDetailHeader, ProductReturnLink } from "@/components/ProductDetailHeader";
import { ProductOffersPanel } from "@/components/ProductOffersPanel";
import { canonicalCatalog, isAvailable } from "@/lib/catalog";
import { getPublicProductSummary, listPublicProductOffers } from "@/lib/data";
import {
  getOfficialPricePlanSummaryFromDataset,
  getOfficialPriceRowsByIdFromDataset,
  officialPricePlanId,
  type OfficialPricePlanSummary,
  type OfficialPriceRow,
  type OfficialPricesDataset,
} from "@/lib/official-prices";
import { getOfficialPricesDataset } from "@/lib/official-prices-db";
import { parseOfferFilterTags } from "@/lib/offer-filter-tags";
import { getProductSeoProfile, shouldNoIndexProduct, type ProductSeoProfile } from "@/lib/product-seo";
import type { ExplorerProductSummary, RawOffer } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export const revalidate = 1800;
export const dynamicParams = true;

export function generateStaticParams() {
  return canonicalCatalog.map((product) => ({ id: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getPublicProductSummary(id);

  if (!product) {
    return {
      title: "商品详情",
    };
  }

  const priceText = product.lowestPrice !== null
    ? `${formatCurrency(product.lowestPrice, product.lowestOffer?.currency)} 起`
    : "暂无有货报价";
  const seoProfile = getProductSeoProfile(product);
  const detailText = getOfficialPricePlanMapping(product)
    ? "有货最低价、渠道报价、官方参考价和最近更新时间"
    : "有货最低价、渠道报价和最近更新时间";
  const title = seoProfile?.metadataTitle || `${product.displayName} 价格对比`;
  const description = seoProfile
    ? `${seoProfile.metadataDescription} 当前参考：${priceText}。`
    : `查看 ${product.displayName} 的${detailText}。当前参考：${priceText}。`;

  return {
    title,
    description,
    robots: shouldNoIndexProduct(product)
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    alternates: {
      canonical: `/products/${product.slug}`,
    },
    openGraph: {
      title,
      description: seoProfile?.metadataDescription || `对比 ${product.displayName} 的渠道报价、库存状态和更新时间。`,
      url: `https://priceai.cc/products/${product.slug}`,
    },
  };
}

const productTypeLabels: Record<string, string> = {
  "订阅/会员": "订阅/会员",
  会员充值: "订阅/会员",
  成品账号: "成品账号",
  成品号: "成品账号",
  "邮箱/账号": "邮箱/账号",
  API额度: "API额度",
  "接码/验证": "接码/验证",
  虚拟卡: "虚拟卡",
  工具账号: "工具账号",
  其他: "其他",
};
const STRUCTURED_DATA_OFFER_LIMIT = 1200;

export default async function ProductDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialFilterTags = parseOfferFilterTags(resolvedSearchParams.tags);
  const initialOfferQuery = searchParamText(resolvedSearchParams.q);
  const initialExcludeQuery = searchParamText(resolvedSearchParams.exclude, 160);
  const [product, initialOffers, structuredDataOffers, officialPricesDataset] = await Promise.all([
    getPublicProductSummary(id),
    listPublicProductOffers(id, {
      limit: 80,
      offset: 0,
      filterTags: initialFilterTags,
      query: initialOfferQuery,
      excludeQuery: initialExcludeQuery,
    }),
    listPublicProductOffers(id, { limit: STRUCTURED_DATA_OFFER_LIMIT, offset: 0 }),
    getOfficialPricesDataset(),
  ]);

  if (!product) notFound();

  const officialReference = buildOfficialPriceReference(product, officialPricesDataset);
  const seoProfile = getProductSeoProfile(product);

  return (
    <>
    <JsonLd data={buildProductJsonLd(product, structuredDataOffers.offers, officialReference, seoProfile)} />
    <main className="min-h-screen bg-[#f9f9f9] text-[#2d3435]">
      <ProductDetailHeader />

      <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="mb-5">
          <ProductReturnLink />
        </div>

        <section className="rounded-lg bg-[#f2f4f4] p-5 shadow-[0_20px_60px_rgba(45,52,53,0.04)] lg:p-6">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{platformIcon(product.platform, product.id)} {product.platform}</Badge>
              <Badge>{productTypeLabel(product.productType)}</Badge>
              <Badge>{product.spec}</Badge>
            </div>
            <h1 className="mt-4 font-serif text-3xl font-bold tracking-normal text-[#202829] sm:text-4xl">
              {product.displayName}
            </h1>
            <p className="mt-3 text-sm leading-7 text-[#5a6061]">{product.summary}</p>
          </div>
        </section>

        {officialReference ? (
          <OfficialPriceReferenceStrip reference={officialReference} product={product} />
        ) : null}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-serif text-3xl font-semibold tracking-normal text-[#202829]">渠道报价表</h2>
            <p className="mt-2 text-sm text-[#5a6061]">
              {product.offerCount} 条报价 · {product.inStockCount} 有货 · 按有货优先和低价排序
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-[#5a6061]">
            <Clock3 size={16} />
            最近记录 {formatRelativeTime(product.latestSeenAt)}
          </div>
        </div>

        <ProductOffersPanel
          productId={product.id}
          productSlug={product.slug}
          productName={product.displayName}
          initialCount={product.offerCount}
          initialData={initialOffers}
          initialFilterTags={initialFilterTags}
          initialQuery={initialOfferQuery}
          initialExcludeQuery={initialExcludeQuery}
        />

        <ProductRelatedCta product={product} />

        <p className="mt-8 text-xs leading-6 text-[#5a6061]">
          免责声明：本站仅聚合公开采集或审核通过的报价信息，不参与交易，实际价格、库存、质保和售后规则以原平台为准。
        </p>
      </div>
    </main>
    </>
  );
}

function searchParamText(value: string | string[] | undefined, limit = 80): string {
  return String(Array.isArray(value) ? value[0] || "" : value || "").trim().slice(0, limit);
}

type OfficialPriceReference = {
  summary: OfficialPricePlanSummary;
  rows: OfficialPriceRow[];
  usRow: OfficialPriceRow | null;
};

const officialPlanByProductId: Record<string, { appSlug: "chatgpt" | "claude" | "gemini" | "grok"; planSlug: string }> = {
  "chatgpt-plus-recharge": { appSlug: "chatgpt", planSlug: "plus-monthly" },
  "chatgpt-pro-5x": { appSlug: "chatgpt", planSlug: "pro-5x" },
  "chatgpt-pro-20x": { appSlug: "chatgpt", planSlug: "pro-20x" },
  "claude-pro-month": { appSlug: "claude", planSlug: "pro-monthly" },
  "claude-max-5x": { appSlug: "claude", planSlug: "max-5x-monthly" },
  "claude-max-20x": { appSlug: "claude", planSlug: "max-20x-monthly" },
  "gemini-pro-recharge": { appSlug: "gemini", planSlug: "ai-pro" },
  "gemini-ultra": { appSlug: "gemini", planSlug: "ai-ultra" },
  "super-grok": { appSlug: "grok", planSlug: "supergrok" },
};

function buildOfficialPriceReference(
  product: ExplorerProductSummary,
  dataset: OfficialPricesDataset,
): OfficialPriceReference | null {
  const mapping = getOfficialPricePlanMapping(product);
  if (!mapping) return null;

  const id = officialPricePlanId(mapping.appSlug, mapping.planSlug);
  const summary = getOfficialPricePlanSummaryFromDataset(dataset, id);
  if (!summary?.lowestRow) return null;

  const rows = getOfficialPriceRowsByIdFromDataset(dataset, id);
  return {
    summary,
    rows,
    usRow: rows.find((row) => row.countryCode === "US") || null,
  };
}

function getOfficialPricePlanMapping(product: Pick<ExplorerProductSummary, "id" | "slug">) {
  return officialPlanByProductId[product.id] || officialPlanByProductId[product.slug] || null;
}

function OfficialPriceReferenceStrip({
  reference,
  product,
}: {
  reference: OfficialPriceReference;
  product: ExplorerProductSummary;
}) {
  const { summary, rows, usRow } = reference;
  const lowest = summary.lowestRow;
  if (!lowest) return null;

  return (
    <section className="mt-4 rounded-lg bg-white px-4 py-3 shadow-[0_14px_42px_rgba(45,52,53,0.035)] ring-1 ring-[#adb3b4]/15">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#5a6061]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eef3f8] px-3 py-1 text-xs font-semibold text-[#47657a]">
            <BrandIcon platform={summary.platform} className="h-[15px] w-[15px]" />
            官方参考
          </span>
          <ReferenceText label="第三方有货最低" value={formatCurrency(product.lowestPrice, product.lowestOffer?.currency)} />
          <ReferenceText label="官方最低" value={formatCurrency(lowest.cnyPrice, "CNY")} detail={`${lowest.countryLabel} ${lowest.priceText}`} />
          <ReferenceText
            label="美国公开价"
            value={usRow ? formatCurrency(usRow.cnyPrice, "CNY") : "暂无"}
            detail={usRow ? `${usRow.priceText} · ${usRow.currencyCode}` : undefined}
          />
          <span className="text-xs text-[#adb3b4]">{rows.length} 个地区 · 汇率 {lowest.fxDate}</span>
        </div>
        <Link
          href={`/official-prices/${summary.id}`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829]"
        >
          查看地区价
          <ExternalLink size={15} />
        </Link>
      </div>
    </section>
  );
}

function ReferenceText({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5">
      <span className="text-xs text-[#5a6061]">{label}</span>
      <span className="font-semibold text-[#202829]">{value}</span>
      {detail ? <span className="hidden max-w-[180px] truncate text-xs text-[#adb3b4] sm:inline">{detail}</span> : null}
    </span>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#5a6061] ring-1 ring-[#adb3b4]/15">
      {children}
    </span>
  );
}

function platformIcon(platform: string, productId?: string) {
  const className = "h-[15px] w-[15px]";

  if (productId) return <BrandIcon platform={platform} productId={productId} className={className} />;
  if (platform !== "其他") return <BrandIcon platform={platform} className={className} />;
  return <Layers3 className={`${className} text-[#5a6061]`} />;
}

function productTypeLabel(productType: string): string {
  return productTypeLabels[productType] || productType;
}

type RelatedCta = {
  title: string;
  description: string;
  links: Array<{
    label: string;
    href: string;
    tone?: "primary" | "secondary";
  }>;
};

function ProductRelatedCta({ product }: { product: ExplorerProductSummary }) {
  const cta = getRelatedCta(product);
  if (!cta) return null;

  return (
    <section className="mt-8 rounded-lg bg-[#f2f4f4] p-5 ring-1 ring-[#adb3b4]/15">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-normal text-[#202829]">{cta.title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#5a6061]">{cta.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {cta.links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
                link.tone === "primary"
                  ? "bg-[#2d3435] text-[#f8f8f8] hover:bg-[#202829]"
                  : "bg-[#dde4e5] text-[#2d3435] hover:bg-[#d3dcdd]"
              }`}
            >
              {link.label}
              <ArrowRight size={15} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function getRelatedCta(product: ExplorerProductSummary): RelatedCta | null {
  if (product.platform === "ChatGPT") {
    return {
      title: "想先弄清 ChatGPT 各种获取方式？",
      description: "可以先看平台价格页和新手指南，再回到这里核验具体渠道报价。",
      links: [
        { label: "平台页", href: "/platforms/chatgpt" },
        { label: "指南", href: "/guides/chatgpt-subscription-options", tone: "primary" },
      ],
    };
  }

  if (product.platform === "Gemini") {
    return {
      title: "想先弄清 Gemini 和 Google AI 的价格路径？",
      description: "可以先看 Gemini 平台页、Google Play 指南和地区价风险，再核验具体渠道报价。",
      links: [
        { label: "Gemini 平台页", href: "/platforms/gemini" },
        { label: "Google Play 指南", href: "/guides/google-play-ai-subscription" },
        { label: "地区价风险", href: "/guides/ai-subscription-region-price-risks", tone: "primary" },
      ],
    };
  }

  if (product.platform === "Claude") {
    return {
      title: "想先分清 Claude Pro、Max 和账号类商品？",
      description: "可以先看 Claude 平台页和官方参考价，再回到这里比较渠道报价和库存状态。",
      links: [
        { label: "Claude 平台页", href: "/platforms/claude" },
        { label: "官方地区价", href: "/official-prices" },
        { label: "渠道判断", href: "/guides/are-ai-subscription-card-shops-reliable", tone: "primary" },
      ],
    };
  }

  if (product.platform === "API/CDK" || product.id === "openai-api-cdk") {
    return {
      title: "想接入 Codex、Cursor 或自建工具？",
      description: "可以先看 API 平台页和模型 API 雷达，分清官方 API、免费 API、Token Plan 和渠道额度。",
      links: [
        { label: "API 平台页", href: "/platforms/api" },
        { label: "模型 API 雷达", href: "/api-models", tone: "primary" },
      ],
    };
  }

  return null;
}

function buildProductJsonLd(
  product: ExplorerProductSummary,
  offers: RawOffer[],
  officialReference: OfficialPriceReference | null,
  seoProfile: ProductSeoProfile | null,
) {
  const productUrl = `https://priceai.cc/products/${product.slug}`;
  const availablePrices = offers
    .filter((offer) => isAvailable(offer) && offer.currency === (product.lowestOffer?.currency || offer.currency))
    .map((offer) => offer.price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
  const priceCurrency = product.lowestOffer?.currency || offers.find((offer) => offer.currency)?.currency || "CNY";
  const lowestOffer = product.lowestPrice !== null && product.lowestOffer && availablePrices.length
    ? {
        "@type": "AggregateOffer",
        lowPrice: Math.min(...availablePrices),
        highPrice: Math.max(...availablePrices),
        priceCurrency,
        offerCount: availablePrices.length,
        availability: "https://schema.org/InStock",
        url: productUrl,
      }
    : {
        "@type": "AggregateOffer",
        offerCount: 0,
        availability: "https://schema.org/OutOfStock",
        url: productUrl,
      };

  const productSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.displayName,
    description: seoProfile?.metadataDescription || product.summary,
    category: `${product.platform} / ${product.productType}`,
    brand: {
      "@type": "Brand",
      name: product.platform,
    },
    url: productUrl,
    offers: lowestOffer,
  };

  if (officialReference?.summary.lowestRow) {
    productSchema.additionalProperty = [
      {
        "@type": "PropertyValue",
        name: "官方最低地区价参考",
        value: formatCurrency(officialReference.summary.lowestRow.cnyPrice, "CNY"),
      },
      {
        "@type": "PropertyValue",
        name: "官方最低地区",
        value: officialReference.summary.lowestRow.countryLabel,
      },
    ];
  }

  const schemas: Record<string, unknown>[] = [
    productSchema,
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "PriceAI",
          item: "https://priceai.cc",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: product.platform,
          item: `https://priceai.cc/?platform=${encodeURIComponent(product.platform)}`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: product.displayName,
          item: productUrl,
        },
      ],
    },
  ];

  if (seoProfile?.faq.length) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: seoProfile.faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return schemas;
}
