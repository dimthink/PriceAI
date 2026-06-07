import type { Metadata } from "next";
import { ArrowRight, Clock3, ExternalLink, Layers3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandIcon } from "@/components/BrandIcon";
import { JsonLd } from "@/components/JsonLd";
import { ProductDetailHeader, ProductReturnLink } from "@/components/ProductDetailHeader";
import { ProductOffersPanel } from "@/components/ProductOffersPanel";
import { canonicalCatalog } from "@/lib/catalog";
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
import type { ExplorerProductSummary } from "@/lib/types";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";

export const revalidate = 300;
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
  const detailText = getOfficialPricePlanMapping(product)
    ? "有货最低价、渠道报价、官方参考价和最近更新时间"
    : "有货最低价、渠道报价和最近更新时间";

  return {
    title: `${product.displayName} 价格对比`,
    description: `查看 ${product.displayName} 的${detailText}。当前参考：${priceText}。`,
    alternates: {
      canonical: `/products/${product.slug}`,
    },
    openGraph: {
      title: `${product.displayName} 价格对比`,
      description: `对比 ${product.displayName} 的渠道报价、库存状态和更新时间。`,
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

export default async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, initialOffers, officialPricesDataset] = await Promise.all([
    getPublicProductSummary(id),
    listPublicProductOffers(id, { limit: 80, offset: 0 }),
    getOfficialPricesDataset(),
  ]);

  if (!product) notFound();

  const officialReference = buildOfficialPriceReference(product, officialPricesDataset);

  return (
    <>
    <JsonLd data={buildProductJsonLd(product, officialReference)} />
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
        />

        {product.platform === "ChatGPT" ? (
          <section className="mt-8 rounded-lg bg-[#f2f4f4] p-5 ring-1 ring-[#adb3b4]/15">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-2xl font-semibold tracking-normal text-[#202829]">
                  想先弄清 ChatGPT 各种获取方式？
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#5a6061]">
                  可以先看平台价格页和新手指南，再回到这里核验具体渠道报价。
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link
                  href="/platforms/chatgpt"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#dde4e5] px-4 text-sm font-semibold text-[#2d3435] transition hover:bg-[#d3dcdd]"
                >
                  平台页
                  <ArrowRight size={15} />
                </Link>
                <Link
                  href="/guides/chatgpt-subscription-options"
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#2d3435] px-4 text-sm font-semibold text-[#f8f8f8] transition hover:bg-[#202829]"
                >
                  指南
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <p className="mt-8 text-xs leading-6 text-[#5a6061]">
          免责声明：本站仅聚合公开采集或审核通过的报价信息，不参与交易，实际价格、库存、质保和售后规则以原平台为准。
        </p>
      </div>
    </main>
    </>
  );
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
  "gemini-pro-year": { appSlug: "gemini", planSlug: "ai-pro" },
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

function buildProductJsonLd(
  product: ExplorerProductSummary,
  officialReference: OfficialPriceReference | null,
) {
  const productUrl = `https://priceai.cc/products/${product.slug}`;
  const lowestOffer = product.lowestPrice !== null && product.lowestOffer
    ? {
        "@type": "AggregateOffer",
        lowPrice: product.lowestPrice,
        priceCurrency: product.lowestOffer.currency || "CNY",
        offerCount: Math.max(product.inStockCount, 1),
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
    description: product.summary,
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

  return [
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
}
